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
import { calcDaysRemaining, formatINR } from '../../../src/utils/calculations';
import type { FDRDEntry, FamilyMember } from '@kutumbkosh/shared';

const STATUSES = ['Active', 'Matured', 'Broken'];

export default function FDRDScreen() {
  const { cryptoKey } = useAuthStore();
  const [fdrds, setFdrds] = useState<FDRDEntry[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [type, setType] = useState<'FD' | 'RD'>('FD');
  const [bank, setBank] = useState('');
  const [holderMemberId, setHolderMemberId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [maturityDate, setMaturityDate] = useState('2031-01-01');
  const [maturityAmount, setMaturityAmount] = useState('');
  const [status, setStatus] = useState<FDRDEntry['status']>('Active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allEntries = await getAllRecords<FDRDEntry>('fdrd_entries', cryptoKey);
      setFdrds(allEntries);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setHolderMemberId(allMembers[0].localId);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load FD/RD tracker data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!bank.trim() || !principal.trim() || !interestRate.trim() || !maturityAmount.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      await insertRecord('fdrd_entries', {
        type,
        bank,
        holderMemberId,
        principal: Number(principal),
        monthlyAmount: type === 'RD' ? Number(monthlyAmount) : undefined,
        interestRate: Number(interestRate),
        startDate,
        maturityDate,
        maturityAmount: Number(maturityAmount),
        status,
        notes,
      }, cryptoKey, {
        maturity_date: maturityDate,
      });

      setModalVisible(false);
      // Reset form
      setBank('');
      setPrincipal('');
      setMonthlyAmount('');
      setInterestRate('');
      setMaturityAmount('');
      setNotes('');
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save FD/RD record');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Record', `Are you sure you want to delete this ${name} record?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('fdrd_entries', localId);
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
        <Text style={styles.title}>FD & RD Tracker</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {loading && fdrds.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : fdrds.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-up-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Deposits Logged</Text>
          <Text style={styles.emptySubtitle}>Track Fixed Deposits and Recurring Deposits maturities here.</Text>
        </View>
      ) : (
        <FlatList
          data={fdrds}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const daysLeft = calcDaysRemaining(item.maturityDate);
            const totalDuration = new Date(item.maturityDate).getTime() - new Date(item.startDate).getTime();
            const elapsed = Date.now() - new Date(item.startDate).getTime();
            const progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

            return (
              <TouchableOpacity 
                style={styles.card}
                onLongPress={() => handleDelete(item.localId, item.type)}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.bankText}>{item.bank} ({item.type})</Text>
                    <Text style={styles.holderText}>Holder: {getMemberName(item.holderMemberId)}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                {/* Progress toward maturity */}
                {item.status === 'Active' && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressText}>Matures in {daysLeft} days</Text>
                      <Text style={styles.progressText}>Maturity Amount</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
                    </View>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.detailLabel}>Principal</Text>
                    <AmountDisplay amount={item.principal} color="#454745" size={14} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.detailLabel}>Rate</Text>
                    <Text style={styles.detailValue}>{item.interestRate}%</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailLabel}>Maturity Value</Text>
                    <AmountDisplay amount={item.maturityAmount} color="#2ead4b" size={15} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vault Deposit Record</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Deposit Type</Text>
              <View style={styles.pickerContainer}>
                {['FD', 'RD'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.pickerChip,
                      type === t && styles.pickerChipActive
                    ]}
                    onPress={() => setType(t as any)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      type === t && styles.pickerChipTextActive
                    ]}>
                      {t === 'FD' ? 'Fixed Deposit (FD)' : 'Recurring Deposit (RD)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Bank / Post Office</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ICICI Bank"
                placeholderTextColor="#868685"
                value={bank}
                onChangeText={setBank}
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

              <Text style={styles.label}>Principal Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 1,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={principal}
                onChangeText={setPrincipal}
              />

              {type === 'RD' && (
                <View>
                  <Text style={styles.label}>Monthly Installment (INR)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="₹ 5,000"
                    placeholderTextColor="#868685"
                    keyboardType="numeric"
                    value={monthlyAmount}
                    onChangeText={setMonthlyAmount}
                  />
                </View>
              )}

              <Text style={styles.label}>Interest Rate (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="7.2"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={interestRate}
                onChangeText={setInterestRate}
              />

              <Text style={styles.label}>Maturity Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="Maturity Value"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={maturityAmount}
                onChangeText={setMaturityAmount}
              />

              <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-01-01"
                placeholderTextColor="#868685"
                value={startDate}
                onChangeText={setStartDate}
              />

              <Text style={styles.label}>Maturity Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2031-01-01"
                placeholderTextColor="#868685"
                value={maturityDate}
                onChangeText={setMaturityDate}
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
                placeholder="Certificates location, auto-renewal settings..."
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
                  <Text style={styles.saveBtnText}>Save Record</Text>
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
  bankText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  holderText: {
    fontSize: 12,
    color: '#868685',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#e2f6d5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0e0f0c',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2ead4b',
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
    color: '#868685',
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
