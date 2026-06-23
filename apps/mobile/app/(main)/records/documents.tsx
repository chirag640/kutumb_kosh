import React, { useState, useEffect } from 'react';
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
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from '../../../src/utils/secureStore';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord } from '../../../src/db/crud';
import { calcDaysRemaining, maskDocNumber } from '../../../src/utils/calculations';
import type { ImportantDocument, FamilyMember } from '@kutumbkosh/shared';

const TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Vehicle RC', 'Ration Card', 'Voter ID', 'Birth Certificate', 'Marriage Certificate', 'Other'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DocumentsScreen() {
  const { cryptoKey } = useAuthStore();
  const [documents, setDocuments] = useState<ImportantDocument[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Reveal state
  const [revealedDocId, setRevealedDocId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allDocs = await getAllRecords<ImportantDocument>('documents', cryptoKey);
      setDocuments(allDocs);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setHolderMemberId(allMembers[0].localId);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!documentNumber.trim()) {
      Alert.alert('Error', 'Document number is required.');
      return;
    }

    setLoading(true);
    try {
      await insertRecord('documents', {
        holderMemberId,
        documentType,
        documentNumber,
        issueDate: issueDate || undefined,
        expiryDate: neverExpires ? undefined : expiryDate,
        neverExpires,
        physicalLocation,
        notes,
      }, cryptoKey, {
        expiry_date: neverExpires ? null : expiryDate,
      });

      setModalVisible(false);
      // Reset form
      setDocumentNumber('');
      setIssueDate('');
      setExpiryDate('');
      setPhysicalLocation('');
      setNotes('');
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async (doc: ImportantDocument) => {
    const hasBiometrics = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasBiometrics || !isEnrolled) {
      // Prompt for PIN instead
      Alert.prompt(
        'Enter Lock PIN',
        'Enter your 6-digit lock PIN to reveal the document number.',
        async (pinText) => {
          const storedPin = await SecureStore.getItemAsync('kk_pin');
          if (pinText === storedPin) {
            Alert.alert(`Document Details`, `Number: ${doc.documentNumber}`);
          } else {
            Alert.alert('Invalid PIN', 'Authentication failed.');
          }
        },
        'secure-text'
      );
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Authenticate to reveal ${doc.documentType}`,
      });

      if (result.success) {
        Alert.alert(
          `${doc.documentType} Number`,
          `Owner: ${getMemberName(doc.holderMemberId)}\nNumber: ${doc.documentNumber}`,
          [
            { text: 'Copy', onPress: () => Clipboard.setStringAsync(doc.documentNumber) },
            { text: 'Close', style: 'cancel' }
          ]
        );
      }
    } catch (e) {
      Alert.alert('Error', 'Authentication failed');
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
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.infoBar}>Long press a card to authenticate and reveal/copy document numbers.</Text>

      {loading && documents.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
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
          renderItem={({ item }) => {
            const status = getDocStatus(item);
            return (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => handleReveal(item)}
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
                <Text style={styles.maskedNum}>{maskDocNumber(item.documentType, item.documentNumber)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Document Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vault Document</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
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
                    onPress={() => setDocumentType(t as any)}
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
                onChangeText={setDocumentNumber}
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
                    onPress={() => setHolderMemberId(m.localId)}
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
                onChangeText={setPhysicalLocation}
              />

              <View style={styles.expiryToggleRow}>
                <Text style={styles.label}>Never Expires?</Text>
                <TouchableOpacity 
                  style={[styles.checkbox, neverExpires && styles.checkboxChecked]}
                  onPress={() => setNeverExpires(!neverExpires)}
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
                    onChangeText={setExpiryDate}
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
                onChangeText={setNotes}
              />

              <View style={styles.spacer} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Document</Text>
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
});
