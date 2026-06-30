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
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord, updateRecord } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { formatINR } from '../../../src/utils/calculations';
import { SkeletonCard } from '../../../src/components/Skeleton';
import type { Property, FamilyMember, Loan } from '@kutumbkosh/shared';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useFormDraftStore } from '../../../src/store/formDraftStore';

const TYPES = ['House', 'Agricultural Land', 'Plot', 'Commercial', 'Other'];

export default function PropertyScreen() {
  const { cryptoKey } = useAuthStore();
  const params = useLocalSearchParams<{ editId?: string }>();
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<Property['type']>('House');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [location, setLocation] = useState('');
  const [area, setArea] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [linkedLoanLocalId, setLinkedLoanLocalId] = useState('');
  const [notes, setNotes] = useState('');

  const { updateDraftField } = useFormDraft('property', {
    name: setName,
    type: setType,
    ownerMemberId: setOwnerMemberId,
    location: setLocation,
    area: setArea,
    purchaseDate: setPurchaseDate,
    purchasePrice: setPurchasePrice,
    currentValue: setCurrentValue,
    linkedLoanLocalId: setLinkedLoanLocalId,
    notes: setNotes,
  }, !editingId);

  // Total valuation
  const [totalValue, setTotalValue] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.editId && properties.length > 0) {
      const item = properties.find(p => p.localId === params.editId);
      if (item) {
        handleOpenEdit(item);
      }
    }
  }, [params.editId, properties]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [cryptoKey]);

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const allProps = await getAllRecords<Property>('property', cryptoKey);
      setProperties(allProps);
      
      const total = allProps.reduce((sum, p) => sum + (p.currentValue || p.purchasePrice || 0), 0);
      setTotalValue(total);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        const draft = useFormDraftStore.getState().drafts['property'];
        if (!draft || !draft.ownerMemberId) {
          setOwnerMemberId(allMembers[0].localId);
        }
      }

      const allLoans = await getAllRecords<Loan>('loans', cryptoKey);
      setLoans(allLoans);
    } catch (err) {
      Alert.alert('Error', 'Failed to load property register');
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setType('House');
    setOwnerMemberId(members[0]?.localId || '');
    setLocation('');
    setArea('');
    setPurchaseDate('');
    setPurchasePrice('');
    setCurrentValue('');
    setLinkedLoanLocalId('');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: Property) => {
    setName(item.name);
    setType(item.type);
    setOwnerMemberId(item.ownerMemberId);
    setLocation(item.location);
    setArea(item.area || '');
    setPurchaseDate(item.purchaseDate || '');
    setPurchasePrice(String(item.purchasePrice));
    setCurrentValue(String(item.currentValue || item.purchasePrice || ''));
    setLinkedLoanLocalId(item.linkedLoanLocalId || '');
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!name.trim() || !location.trim() || !purchasePrice.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    const payload = {
      name,
      type,
      ownerMemberId,
      location,
      area,
      purchaseDate: purchaseDate || undefined,
      purchasePrice: Number(purchasePrice),
      currentValue: currentValue ? Number(currentValue) : Number(purchasePrice),
      linkedLoanLocalId: linkedLoanLocalId || undefined,
      notes,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('property', editingId, payload, cryptoKey);
      } else {
        await insertRecord('property', payload, cryptoKey);
        useFormDraftStore.getState().clearDraft('property');
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update property record' : 'Failed to save property record');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Property', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('property', localId);
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

  const getLoanText = (id: string) => {
    const loan = loans.find(l => l.localId === id);
    return loan ? `${loan.lender} O/S: ${formatINR(loan.outstandingAmount)}` : 'No loan linked';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Property Register</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {/* Total Valuation Card */}
      <View style={styles.valueCard}>
        <Text style={styles.valueLabel}>Total Estimated Holdings Value</Text>
        <AmountDisplay amount={totalValue} color="#2ead4b" size={24} />
      </View>

      {loading && properties.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : properties.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="home-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Property Tracked</Text>
          <Text style={styles.emptySubtitle}>Log details of family houses, agricultural lands, plots and commercials.</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0e0f0c']}
              tintColor="#0e0f0c"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.card}
              onPress={() => handleOpenEdit(item)}
              onLongPress={() => handleDelete(item.localId, item.name)}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.propName}>{item.name}</Text>
                  <Text style={styles.typeText}>{item.type} — Owner: {getMemberName(item.ownerMemberId)}</Text>
                </View>
                <AmountDisplay amount={item.currentValue || item.purchasePrice || 0} color="#0e0f0c" size={16} />
              </View>

              <View style={styles.detailsRow}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Location</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{item.location}</Text>
                </View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Area</Text>
                  <Text style={styles.detailValue}>{item.area || '—'}</Text>
                </View>
              </View>

              {item.linkedLoanLocalId && (
                <View style={styles.loanBadge}>
                  <Ionicons name="card-outline" size={14} color="#7b2cbf" style={{ marginRight: 6 }} />
                  <Text style={styles.loanText} numberOfLines={1}>{getLoanText(item.linkedLoanLocalId)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Property Details' : 'Register Property'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Property Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Village House"
                placeholderTextColor="#868685"
                value={name}
                onChangeText={(val) => { setName(val); updateDraftField('name', val); }}
              />

              <Text style={styles.label}>Property Type</Text>
              <View style={styles.pickerContainer}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.pickerChip,
                      type === t && styles.pickerChipActive
                    ]}
                    onPress={() => { setType(t as any); updateDraftField('type', t); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      type === t && styles.pickerChipTextActive
                    ]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Owner</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      ownerMemberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => { setOwnerMemberId(m.localId); updateDraftField('ownerMemberId', m.localId); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      ownerMemberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Location / Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Location details"
                placeholderTextColor="#868685"
                value={location}
                onChangeText={(val) => { setLocation(val); updateDraftField('location', val); }}
              />

              <Text style={styles.label}>Area / Size</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1500 sq ft or 2 Bigha"
                placeholderTextColor="#868685"
                value={area}
                onChangeText={(val) => { setArea(val); updateDraftField('area', val); }}
              />

              <Text style={styles.label}>Purchase Price (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 25,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={purchasePrice}
                onChangeText={(val) => { setPurchasePrice(val); updateDraftField('purchasePrice', val); }}
              />

              <Text style={styles.label}>Estimated Current Value (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 30,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={currentValue}
                onChangeText={(val) => { setCurrentValue(val); updateDraftField('currentValue', val); }}
              />

              <Text style={styles.label}>Linked Home Loan (Optional)</Text>
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[
                    styles.pickerChip,
                    !linkedLoanLocalId && styles.pickerChipActive
                  ]}
                  onPress={() => { setLinkedLoanLocalId(''); updateDraftField('linkedLoanLocalId', ''); }}
                >
                  <Text style={[
                    styles.pickerChipText,
                    !linkedLoanLocalId && styles.pickerChipTextActive
                  ]}>
                    None
                  </Text>
                </TouchableOpacity>
                {loans.map((l) => (
                  <TouchableOpacity
                    key={l.localId}
                    style={[
                      styles.pickerChip,
                      linkedLoanLocalId === l.localId && styles.pickerChipActive
                    ]}
                    onPress={() => { setLinkedLoanLocalId(l.localId); updateDraftField('linkedLoanLocalId', l.localId); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      linkedLoanLocalId === l.localId && styles.pickerChipTextActive
                    ]}>
                      {l.lender} ({l.loanType})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Registry number, boundary details, etc."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Details' : 'Save Property'}</Text>
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
    marginBottom: 16,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  hintText: {
    fontSize: 12,
    color: '#868685',
    textAlign: 'center',
    marginBottom: 12,
  },
  addBtn: {
    backgroundColor: '#9fe870',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    padding: 8,
  },
  valueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    alignItems: 'center',
    marginBottom: 16,
  },
  valueLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 6,
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
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 8,
  },
  propName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  typeText: {
    fontSize: 12,
    color: '#868685',
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingBottom: 4,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  loanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 12,
  },
  loanText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7b2cbf',
    flex: 1,
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
