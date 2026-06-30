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
import { DaysChip } from '../../../src/components/DaysChip';
import { calcDaysRemaining, formatINR, isValidDate } from '../../../src/utils/calculations';
import { SkeletonCard } from '../../../src/components/Skeleton';
import type { LICPolicy, FamilyMember } from '@kutumbkosh/shared';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useFormDraftStore } from '../../../src/store/formDraftStore';

const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
const STATUSES = ['Active', 'Paid-Up', 'Lapsed', 'Matured'];

export default function LICScreen() {
  const { cryptoKey } = useAuthStore();
  const params = useLocalSearchParams<{ editId?: string }>();
  const [policies, setPolicies] = useState<LICPolicy[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [policyHolderMemberId, setPolicyHolderMemberId] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [planName, setPlanName] = useState('');
  const [sumAssured, setSumAssured] = useState('');
  const [premiumAmount, setPremiumAmount] = useState('');
  const [frequency, setFrequency] = useState<LICPolicy['frequency']>('Yearly');
  const [nextDueDate, setNextDueDate] = useState('2026-06-20');
  const [maturityDate, setMaturityDate] = useState('2040-06-20');
  const [status, setStatus] = useState<LICPolicy['status']>('Active');
  const [notes, setNotes] = useState('');

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  const { updateDraftField } = useFormDraft('lic', {
    policyHolderMemberId: setPolicyHolderMemberId,
    policyNumber: setPolicyNumber,
    planName: setPlanName,
    sumAssured: setSumAssured,
    premiumAmount: setPremiumAmount,
    frequency: setFrequency,
    nextDueDate: setNextDueDate,
    maturityDate: setMaturityDate,
    status: setStatus,
    notes: setNotes,
  }, !editingId);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.editId && policies.length > 0) {
      const item = policies.find(p => p.localId === params.editId);
      if (item) {
        handleOpenEdit(item);
      }
    }
  }, [params.editId, policies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [cryptoKey]);

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const allPolicies = await getAllRecords<LICPolicy>('lic_policies', cryptoKey);
      // Sort by next due date ascending
      allPolicies.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
      setPolicies(allPolicies);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        const draft = useFormDraftStore.getState().drafts['lic'];
        if (!draft || !draft.policyHolderMemberId) {
          setPolicyHolderMemberId(allMembers[0].localId);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load LIC policies');
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const resetForm = () => {
    setPolicyHolderMemberId(members[0]?.localId || '');
    setPolicyNumber('');
    setPlanName('');
    setSumAssured('');
    setPremiumAmount('');
    setFrequency('Yearly');
    setNextDueDate('2026-06-20');
    setMaturityDate('2040-06-20');
    setStatus('Active');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => { resetForm(); setModalVisible(true); };

  const handleOpenEdit = (item: LICPolicy) => {
    setPolicyHolderMemberId(item.policyHolderMemberId);
    setPolicyNumber(item.policyNumber);
    setPlanName(item.planName);
    setSumAssured(String(item.sumAssured));
    setPremiumAmount(String(item.premiumAmount));
    setFrequency(item.frequency);
    setNextDueDate(item.nextDueDate);
    setMaturityDate(item.maturityDate);
    setStatus(item.status);
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!policyNumber.trim() || !planName.trim() || !premiumAmount.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (!isValidDate(nextDueDate) || !isValidDate(maturityDate)) {
      Alert.alert('Invalid Date', 'Dates must be in YYYY-MM-DD format (e.g., 2026-06-20).');
      return;
    }

    const payload = {
      policyHolderMemberId,
      policyNumber,
      planName,
      sumAssured: Number(sumAssured),
      premiumAmount: Number(premiumAmount),
      frequency,
      nextDueDate,
      maturityDate,
      status,
      notes,
    };
    const indexFields = { due_date: nextDueDate };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('lic_policies', editingId, payload, cryptoKey, indexFields);
      } else {
        await insertRecord('lic_policies', payload, cryptoKey, indexFields);
        useFormDraftStore.getState().clearDraft('lic');
      }
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update LIC policy' : 'Failed to save LIC policy');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Policy', `Are you sure you want to delete policy ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('lic_policies', localId);
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

  const getUrgencyColor = (dueDate: string) => {
    const days = calcDaysRemaining(dueDate);
    if (days < 0) return '#d03238'; // red (overdue)
    if (days <= 7) return '#ffc091'; // orange
    if (days <= 30) return '#ffd11a'; // yellow
    return '#2ead4b'; // green
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>LIC Policies</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {loading && policies.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : policies.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Policies Vaulted</Text>
          <Text style={styles.emptySubtitle}>Track life insurance policies, sum assured and premiums.</Text>
        </View>
      ) : (
        <FlatList
          data={policies}
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
          renderItem={({ item }) => {
            const urgencyColor = getUrgencyColor(item.nextDueDate);
            const daysLeft = calcDaysRemaining(item.nextDueDate);
            return (
              <TouchableOpacity 
                style={styles.card}
                onLongPress={() => handleDelete(item.localId, item.planName)}
              >
                {/* Left urgency colored strip */}
                <View style={[styles.urgencyBar, { backgroundColor: urgencyColor }]} />
                
                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.planName}>{item.planName}</Text>
                      <Text style={styles.holderText}>Holder: {getMemberName(item.policyHolderMemberId)}</Text>
                    </View>
                    <DaysChip daysRemaining={daysLeft} />
                  </View>

                  <View style={styles.detailsRow}>
                    <View>
                      <Text style={styles.detailLabel}>Policy No</Text>
                      <Text style={styles.detailValue}>{item.policyNumber}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.detailLabel}>Premium ({item.frequency})</Text>
                      <AmountDisplay amount={item.premiumAmount} color="#0e0f0c" size={15} />
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Text style={styles.footerText}>Next Due: {item.nextDueDate.split('-').reverse().join('/')}</Text>
                    <Text style={[styles.footerText, styles.sumText]}>Sum Assured: {formatINR(item.sumAssured)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Policy Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vault LIC Policy</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Plan Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Jeevan Anand"
                placeholderTextColor="#868685"
                value={planName}
                onChangeText={(val) => { setPlanName(val); updateDraftField('planName', val); }}
              />

              <Text style={styles.label}>Policy Holder</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      policyHolderMemberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => { setPolicyHolderMemberId(m.localId); updateDraftField('policyHolderMemberId', m.localId); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      policyHolderMemberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Policy Number</Text>
              <TextInput
                style={styles.input}
                placeholder="9-digit Policy Number"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={policyNumber}
                onChangeText={(val) => { setPolicyNumber(val); updateDraftField('policyNumber', val); }}
              />

              <Text style={styles.label}>Sum Assured (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 5,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={sumAssured}
                onChangeText={(val) => { setSumAssured(val); updateDraftField('sumAssured', val); }}
              />

              <Text style={styles.label}>Premium Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 15,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={premiumAmount}
                onChangeText={(val) => { setPremiumAmount(val); updateDraftField('premiumAmount', val); }}
              />

              <Text style={styles.label}>Premium Frequency</Text>
              <View style={styles.pickerContainer}>
                {FREQUENCIES.map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.pickerChip,
                      frequency === freq && styles.pickerChipActive
                    ]}
                    onPress={() => { setFrequency(freq as any); updateDraftField('frequency', freq); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      frequency === freq && styles.pickerChipTextActive
                    ]}>
                      {freq}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Next Due Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-06-20"
                placeholderTextColor="#868685"
                value={nextDueDate}
                onChangeText={(val) => { setNextDueDate(val); updateDraftField('nextDueDate', val); }}
              />

              <Text style={styles.label}>Maturity Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2040-06-20"
                placeholderTextColor="#868685"
                value={maturityDate}
                onChangeText={(val) => { setMaturityDate(val); updateDraftField('maturityDate', val); }}
              />

              <Text style={styles.label}>Status</Text>
              <View style={styles.pickerContainer}>
                {STATUSES.map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.pickerChip,
                      status === st && styles.pickerChipActive
                    ]}
                    onPress={() => { setStatus(st as any); updateDraftField('status', st); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      status === st && styles.pickerChipTextActive
                    ]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Nominee name, broker details..."
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
                  <Text style={styles.saveBtnText}>Save Policy</Text>
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
    marginBottom: 20,
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
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  urgencyBar: {
    width: 6,
    height: '100%',
  },
  cardContent: {
    padding: 16,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 8,
  },
  planName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  holderText: {
    fontSize: 12,
    color: '#868685',
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 11,
    color: '#868685',
  },
  sumText: {
    fontWeight: '700',
    color: '#454745',
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
