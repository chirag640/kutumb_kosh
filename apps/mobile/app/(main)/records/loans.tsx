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
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { calcLoanRemainingMonths, calcLoanProgress, formatINR } from '../../../src/utils/calculations';
import type { Loan, FamilyMember } from '@kutumbkosh/shared';

const TYPES = ['Home Loan', 'Car Loan', 'Personal Loan', 'Gold Loan', 'Kisan Credit Card', 'Business Loan', 'Education Loan', 'Other'];
const STATUSES = ['Active', 'Closed', 'Restructured'];

export default function LoansScreen() {
  const { cryptoKey } = useAuthStore();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

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

  // Total burden
  const [monthlyEmiBurden, setMonthlyEmiBurden] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allLoans = await getAllRecords<Loan>('loans', cryptoKey);
      setLoans(allLoans);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setBorrowerMemberId(allMembers[0].localId);
      }

      // Calculate total EMI burden for Active loans
      const activeEMIs = allLoans
        .filter(l => l.status === 'Active')
        .reduce((sum, l) => sum + l.emi, 0);
      setMonthlyEmiBurden(activeEMIs);

    } catch (err) {
      Alert.alert('Error', 'Failed to load loan records');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!lender.trim() || !originalAmount.trim() || !outstandingAmount.trim() || !emi.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      await insertRecord('loans', {
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
      }, cryptoKey);

      setModalVisible(false);
      // Reset form
      setLender('');
      setOriginalAmount('');
      setOutstandingAmount('');
      setEmi('');
      setInterestRate('');
      setNotes('');
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save loan profile');
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
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {/* EMI Burden Card */}
      <View style={styles.burdenCard}>
        <Text style={styles.burdenLabel}>Total EMI Burden This Month</Text>
        <AmountDisplay amount={monthlyEmiBurden} color="#d03238" size={24} />
      </View>

      {loading && loans.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
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
          renderItem={({ item }) => {
            const repaidAmount = item.originalAmount - item.outstandingAmount;
            const progress = (repaidAmount / item.originalAmount) * 100;
            const remainingMonths = calcLoanRemainingMonths(item.endDate);
            return (
              <TouchableOpacity 
                style={styles.card}
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
              <Text style={styles.modalTitle}>Vault Loan & EMI</Text>
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
                onChangeText={setLender}
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
                    onPress={() => setBorrowerMemberId(m.localId)}
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
                    onPress={() => setLoanType(t as any)}
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
                onChangeText={setOriginalAmount}
              />

              <Text style={styles.label}>Outstanding Principal (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 12,50,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={outstandingAmount}
                onChangeText={setOutstandingAmount}
              />

              <Text style={styles.label}>Monthly EMI (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 15,500"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={emi}
                onChangeText={setEmi}
              />

              <Text style={styles.label}>Interest Rate (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="8.5"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={interestRate}
                onChangeText={setInterestRate}
              />

              <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-01-01"
                placeholderTextColor="#868685"
                value={startDate}
                onChangeText={setStartDate}
              />

              <Text style={styles.label}>End Date / Closure (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2036-01-01"
                placeholderTextColor="#868685"
                value={endDate}
                onChangeText={setEndDate}
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
                    onPress={() => setStatus(st as any)}
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
                onChangeText={setNotes}
              />

              <View style={styles.spacer} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Loan</Text>
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
