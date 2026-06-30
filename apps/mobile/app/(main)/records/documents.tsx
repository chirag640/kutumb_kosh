import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  Alert, 
  ActivityIndicator,
  ScrollView,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord, updateRecord } from '../../../src/db/crud';
import { calcDaysRemaining, isValidDate } from '../../../src/utils/calculations';
import { SkeletonCard } from '../../../src/components/Skeleton';
import type { ImportantDocument, FamilyMember } from '@kutumbkosh/shared';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useFormDraftStore } from '../../../src/store/formDraftStore';

const TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Vehicle RC', 'Vehicle Insurance', 'LIC Policy', 'Health Insurance', 'Term Insurance', 'Property Documents', 'Bank Passbook', 'Ration Card', 'Voter ID', 'Birth Certificate', 'Marriage Certificate', 'Other'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DocumentsScreen() {
  const { cryptoKey } = useAuthStore();
  const params = useLocalSearchParams<{ editId?: string }>();
  const [documents, setDocuments] = useState<ImportantDocument[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [holderMemberId, setHolderMemberId] = useState('');
  const [documentType, setDocumentType] = useState<ImportantDocument['documentType']>('Aadhaar');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [neverExpires, setNeverExpires] = useState(true);
  const [physicalLocation, setPhysicalLocation] = useState('');
  const [notes, setNotes] = useState('');

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  const { updateDraftField } = useFormDraft('document', {
    holderMemberId: setHolderMemberId,
    documentType: setDocumentType,
    documentNumber: setDocumentNumber,
    issueDate: setIssueDate,
    expiryDate: setExpiryDate,
    neverExpires: setNeverExpires,
    physicalLocation: setPhysicalLocation,
    notes: setNotes,
  }, !editingId);

  // Reveal state
  const [revealedDocId, setRevealedDocId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.editId && documents.length > 0) {
      const item = documents.find(d => d.localId === params.editId);
      if (item) {
        handleOpenEdit(item);
      }
    }
  }, [params.editId, documents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [cryptoKey]);

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const allDocs = await getAllRecords<ImportantDocument>('documents', cryptoKey);
      setDocuments(allDocs);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        const draft = useFormDraftStore.getState().drafts['document'];
        if (!draft || !draft.holderMemberId) {
          setHolderMemberId(allMembers[0].localId);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load documents');
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const resetForm = (firstMemberId?: string) => {
    setHolderMemberId(firstMemberId || members[0]?.localId || '');
    setDocumentType('Aadhaar');
    setDocumentNumber('');
    setIssueDate('');
    setExpiryDate('');
    setNeverExpires(true);
    setPhysicalLocation('');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: ImportantDocument) => {
    setHolderMemberId(item.holderMemberId);
    setDocumentType(item.documentType);
    setDocumentNumber(item.documentNumber);
    setIssueDate(item.issueDate || '');
    setExpiryDate(item.expiryDate || '');
    setNeverExpires(item.neverExpires);
    setPhysicalLocation(item.physicalLocation || '');
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!documentNumber.trim()) {
      Alert.alert('Error', 'Document number is required.');
      return;
    }
    if (!neverExpires && !isValidDate(expiryDate)) {
      Alert.alert('Invalid Date', 'Expiry date must be in YYYY-MM-DD format (e.g., 2035-12-31).');
      return;
    }

    const payload = {
      holderMemberId,
      documentType,
      documentNumber,
      issueDate: issueDate || undefined,
      expiryDate: neverExpires ? undefined : expiryDate,
      neverExpires,
      physicalLocation,
      notes,
    };
    const indexFields = { expiry_date: neverExpires ? null : expiryDate };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('documents', editingId, payload, cryptoKey, indexFields);
      } else {
        await insertRecord('documents', payload, cryptoKey, indexFields);
        useFormDraftStore.getState().clearDraft('document');
      }
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update document' : 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async (doc: ImportantDocument) => {
    try {
      await Clipboard.setStringAsync(doc.documentNumber);
      Alert.alert('Copied', `${doc.documentType} number copied to clipboard!`);
    } catch (e) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Document', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('documents', localId);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete record');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const getMemberName = (id: string) => {
    const member = members.find((m) => m.localId === id);
    return member ? member.name : 'Unknown';
  };

  const getDocStatus = (doc: ImportantDocument) => {
    if (doc.neverExpires || !doc.expiryDate) return { label: 'Lifetime', bg: '#DCFCE7', text: '#166534' };
    const days = calcDaysRemaining(doc.expiryDate);
    if (days < 0) return { label: 'Expired', bg: '#FEE2E2', text: '#991B1B' };
    if (days <= 30) return { label: 'Expiring', bg: '#FFEDD5', text: '#B91C1C' };
    return { label: 'Valid', bg: '#DCFCE7', text: '#166534' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Important Documents</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.infoBar}>Tap to edit · Long press to delete · Tap number to copy</Text>

      {loading && documents.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Documents Vaulted</Text>
          <Text style={styles.emptySubtitle}>Securely store Aadhaar, PAN, Passport and physical locations of documents.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.localId}
          numColumns={2}
          contentContainerStyle={{ paddingBottom: 100 }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0e0f0c']}
              tintColor="#0e0f0c"
            />
          }
          renderItem={({ item }) => {
            const status = getDocStatus(item);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => handleDelete(item.localId, item.documentType)}
              >
                <View style={styles.cardTop}>
                  <Ionicons name="document-lock-outline" size={24} color="#0e0f0c" />
                  <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                <Text style={styles.docType} numberOfLines={1}>{item.documentType}</Text>
                <Text style={styles.holder} numberOfLines={1}>Holder: {getMemberName(item.holderMemberId)}</Text>
                <Text style={styles.maskedNum}>{item.documentNumber}</Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => handleReveal(item)}
                >
                  <Ionicons name="copy-outline" size={14} color="#868685" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Document Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Document' : 'Vault Document'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Document Type</Text>
              <View style={styles.pickerContainer}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.pickerChip,
                      documentType === t && styles.pickerChipActive
                    ]}
                    onPress={() => { setDocumentType(t as any); updateDraftField('documentType', t); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      documentType === t && styles.pickerChipTextActive
                    ]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Document Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Unmasked number (will be encrypted)"
                placeholderTextColor="#868685"
                value={documentNumber}
                onChangeText={(val) => { setDocumentNumber(val); updateDraftField('documentNumber', val); }}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Holder</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      holderMemberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => { setHolderMemberId(m.localId); updateDraftField('holderMemberId', m.localId); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      holderMemberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Physical Location</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Almirah 2 Drawer 1"
                placeholderTextColor="#868685"
                value={physicalLocation}
                onChangeText={(val) => { setPhysicalLocation(val); updateDraftField('physicalLocation', val); }}
              />

              <View style={styles.expiryToggleRow}>
                <Text style={styles.label}>Never Expires?</Text>
                <TouchableOpacity 
                  style={[styles.checkbox, neverExpires && styles.checkboxChecked]}
                  onPress={() => { const next = !neverExpires; setNeverExpires(next); updateDraftField('neverExpires', next); }}
                >
                  {neverExpires && <Ionicons name="checkmark" size={18} color="#0e0f0c" />}
                </TouchableOpacity>
              </View>

              {!neverExpires && (
                <View>
                  <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2035-12-31"
                    placeholderTextColor="#868685"
                    value={expiryDate}
                    onChangeText={(val) => { setExpiryDate(val); updateDraftField('expiryDate', val); }}
                  />
                </View>
              )}

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Issue date, links, broker, etc."
                placeholderTextColor="#868685"
                multiline
                value={notes}
                onChangeText={(val) => { setNotes(val); updateDraftField('notes', val); }}
              />

              <View style={styles.spacer} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Document' : 'Save Document'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 10,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  addBtn: {
    backgroundColor: '#9fe870',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    padding: 8,
  },
  infoBar: {
    fontSize: 11,
    color: '#868685',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#454745',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
    width: (SCREEN_WIDTH - 44) / 2, // 2-columns grid calculations
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  docType: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  holder: {
    fontSize: 11,
    color: '#868685',
    marginTop: 4,
  },
  maskedNum: {
    fontSize: 12,
    fontFamily: 'System',
    fontWeight: 'bold',
    color: '#454745',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  modalScroll: {
    paddingBottom: 40,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 4,
  },
  pickerChip: {
    backgroundColor: '#e8ebe6',
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  pickerChipActive: {
    backgroundColor: '#9fe870',
    borderWidth: 1,
    borderColor: '#0e0f0c',
  },
  pickerChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#454745',
  },
  pickerChipTextActive: {
    color: '#0e0f0c',
    fontWeight: '700',
  },
  expiryToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#9fe870',
  },
  saveBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  spacer: {
    height: 12,
  },
  copyBtn: {
    padding: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
});
