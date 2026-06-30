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
import { calcLoanRemainingMonths, calcLoanProgress, formatINR } from '../../../src/utils/calculations';
import { SkeletonCard } from '../../../src/components/Skeleton';
import type { Loan, FamilyMember } from '@kutumbkosh/shared';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useFormDraftStore } from '../../../src/store/formDraftStore';

const TYPES = ['Home Loan', 'Car Loan', 'Personal Loan', 'Gold Loan', 'Kisan Credit Card', 'Business Loan', 'Education Loan', 'Other'];
const STATUSES = ['Active', 'Closed', 'Restructured'];

export default function LoansScreen() {
  const { cryptoKey } = useAuthStore();
  const params = useLocalSearchParams<{ editId?: string }>();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [loanType, setLoanType] = useState<Loan['loanType']>('Home Loan');
  const [lender, setLender] = useState('');
  const [borrowerMemberId, setBorrowerMemberId] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [outstandingAmount, setOutstandingAmount] = useState('');
  const [emi, setEmi] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2036-01-01');
  const [status, setStatus] = useState<Loan['status']>('Active');
  const [notes, setNotes] = useState('');

  const { updateDraftField } = useFormDraft('loan', {
    loanType: setLoanType,
    lender: setLender,
    borrowerMemberId: setBorrowerMemberId,
    originalAmount: setOriginalAmount,
    outstandingAmount: setOutstandingAmount,
    emi: setEmi,
    interestRate: setInterestRate,
    startDate: setStartDate,
    endDate: setEndDate,
    status: setStatus,
    notes: setNotes,
  }, !editingId);

  // Total burden
  const [monthlyEmiBurden, setMonthlyEmiBurden] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.editId && loans.length > 0) {
      const item = loans.find(l => l.localId === params.editId);
      if (item) {
        handleOpenEdit(item);
      }
    }
  }, [params.editId, loans]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [cryptoKey]);

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const allLoans = await getAllRecords<Loan>('loans', cryptoKey);
      setLoans(allLoans);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        const draft = useFormDraftStore.getState().drafts['loan'];
        if (!draft || !draft.borrowerMemberId) {
          setBorrowerMemberId(allMembers[0].localId);
        }
      }

      // Calculate total EMI burden for Active loans
      const activeEMIs = allLoans
        .filter(l => l.status === 'Active')
        .reduce((sum, l) => sum + l.emi, 0);
      setMonthlyEmiBurden(activeEMIs);

    } catch (err) {
      Alert.alert('Error', 'Failed to load loan records');
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const resetForm = () => {
    setLoanType('Home Loan');
    setLender('');
    setBorrowerMemberId(members[0]?.localId || '');
    setOriginalAmount('');
    setOutstandingAmount('');
    setEmi('');
    setInterestRate('');
    setStartDate('2026-01-01');
    setEndDate('2036-01-01');
    setStatus('Active');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: Loan) => {
    setLoanType(item.loanType);
    setLender(item.lender);
    setBorrowerMemberId(item.borrowerMemberId);
    setOriginalAmount(String(item.originalAmount));
    setOutstandingAmount(String(item.outstandingAmount));
    setEmi(String(item.emi));
    setInterestRate(String(item.interestRate));
    setStartDate(item.startDate);
    setEndDate(item.endDate);
    setStatus(item.status);
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!lender.trim() || !originalAmount.trim() || !outstandingAmount.trim() || !emi.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    const payload = {
      loanType,
      lender,
      borrowerMemberId,
      originalAmount: Number(originalAmount),
      outstandingAmount: Number(outstandingAmount),
      emi: Number(emi),
      interestRate: Number(interestRate) || 0,
      startDate,
      endDate,
      status,
      notes,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('loans', editingId, payload, cryptoKey);
      } else {
        await insertRecord('loans', payload, cryptoKey);
        useFormDraftStore.getState().clearDraft('loan');
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update loan profile' : 'Failed to save loan profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Loan', `Are you sure you want to delete loan from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('loans', localId);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Loans & EMIs</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {/* EMI Burden Card */}
      <View style={styles.burdenCard}>
        <Text style={styles.burdenLabel}>Total EMI Burden This Month</Text>
        <AmountDisplay amount={monthlyEmiBurden} color="#d03238" size={24} />
      </View>

      {loading && loans.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loans.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Loans Tracked</Text>
          <Text style={styles.emptySubtitle}>Log family home loans, gold loans or KCC here.</Text>
        </View>
      ) : (
        <FlatList
          data={loans}
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
            const repaidAmount = item.originalAmount - item.outstandingAmount;
            const progress = (repaidAmount / item.originalAmount) * 100;
            const remainingMonths = calcLoanRemainingMonths(item.endDate);
            return (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => handleDelete(item.localId, item.lender)}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.lenderText}>{item.lender}</Text>
                    <Text style={styles.typeText}>{item.loanType} — Borrower: {getMemberName(item.borrowerMemberId)}</Text>
                  </View>
                  <View style={styles.emiBadge}>
                    <Text style={styles.emiText}>EMI: {formatINR(item.emi)}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressText}>Repaid: {progress.toFixed(0)}%</Text>
                    <Text style={styles.progressText}>O/S: {formatINR(item.outstandingAmount)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>Rate: {item.interestRate}%</Text>
                  <Text style={styles.footerText}>Remaining: {remainingMonths} months</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Loan Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Loan Profile' : 'Vault Loan & EMI'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Lender / Bank</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor="#868685"
                value={lender}
                onChangeText={(val) => { setLender(val); updateDraftField('lender', val); }}
              />

              <Text style={styles.label}>Borrower Member</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      borrowerMemberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => { setBorrowerMemberId(m.localId); updateDraftField('borrowerMemberId', m.localId); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      borrowerMemberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Loan Type</Text>
              <View style={styles.pickerContainer}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.pickerChip,
                      loanType === t && styles.pickerChipActive
                    ]}
                    onPress={() => { setLoanType(t as any); updateDraftField('loanType', t); }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      loanType === t && styles.pickerChipTextActive
                    ]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Original Principal (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 15,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={originalAmount}
                onChangeText={(val) => { setOriginalAmount(val); updateDraftField('originalAmount', val); }}
              />

              <Text style={styles.label}>Outstanding Principal (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 12,50,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={outstandingAmount}
                onChangeText={(val) => { setOutstandingAmount(val); updateDraftField('outstandingAmount', val); }}
              />

              <Text style={styles.label}>Monthly EMI (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 15,500"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={emi}
                onChangeText={(val) => { setEmi(val); updateDraftField('emi', val); }}
              />

              <Text style={styles.label}>Interest Rate (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="8.5"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={interestRate}
                onChangeText={(val) => { setInterestRate(val); updateDraftField('interestRate', val); }}
              />

              <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-01-01"
                placeholderTextColor="#868685"
                value={startDate}
                onChangeText={(val) => { setStartDate(val); updateDraftField('startDate', val); }}
              />

              <Text style={styles.label}>End Date / Closure (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2036-01-01"
                placeholderTextColor="#868685"
                value={endDate}
                onChangeText={(val) => { setEndDate(val); updateDraftField('endDate', val); }}
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
                placeholder="Security checks, guarantors, etc."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Loan' : 'Save Loan'}</Text>
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
  burdenCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    alignItems: 'center',
    marginBottom: 16,
  },
  burdenLabel: {
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
    paddingTop: 60,
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
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 8,
  },
  lenderText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  typeText: {
    fontSize: 12,
    color: '#868685',
    marginTop: 2,
  },
  emiBadge: {
    backgroundColor: '#ffd11a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0e0f0c',
  },
  emiText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  progressSection: {
    marginVertical: 12,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#454745',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e8ebe6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2ead4b',
    borderRadius: 4,
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
    fontWeight: '600',
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
