import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ScrollView, 
  Alert, 
  ActivityIndicator 
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { formatINR, isValidDate } from '../../../src/utils/calculations';
import type { IncomeEntry, FamilyMember } from '@kutumbkosh/shared';

const SOURCES = ['Salary', 'Business', 'Farming', 'Rent', 'Interest/FD', 'Pension', 'Other'];

export default function IncomeScreen() {
  const { cryptoKey } = useAuthStore();
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form inputs
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('Salary');
  const [memberId, setMemberId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [cryptoKey])
  );

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allIncomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      // Sort by date descending
      allIncomes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setIncomes(allIncomes);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setMemberId(allMembers[0].localId);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load income records');
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async () => {
    if (!cryptoKey) return;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!memberId) {
      Alert.alert('Member Required', 'Please select or add a family member first.');
      return;
    }
    if (!isValidDate(date)) {
      Alert.alert('Invalid Date', 'Date must be in YYYY-MM-DD format (e.g., 2026-06-20).');
      return;
    }

    setLoading(true);
    try {
      const localId = await insertRecord('income_entries', {
        date,
        memberId,
        source: source as any,
        amount: Number(amount),
        isRecurring,
        notes,
      }, cryptoKey, {
        entry_date: date,
        member_idx: memberId,
      });

      setModalVisible(false);
      // Reset form
      setAmount('');
      setNotes('');
      setIsRecurring(false);
      
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save income entry');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string) => {
    Alert.alert('Delete Record', 'Are you sure you want to delete this income record?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('income_entries', localId);
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

  // Group incomes by month
  const getGroupedIncomes = () => {
    const groups: { [key: string]: IncomeEntry[] } = {};
    incomes.forEach((inc) => {
      const month = new Date(inc.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!groups[month]) groups[month] = [];
      groups[month].push(inc);
    });
    return Object.keys(groups).map((month) => ({
      month,
      data: groups[month],
    }));
  };

  const getMemberName = (id: string) => {
    const member = members.find((m) => m.localId === id);
    return member ? member.name : 'Unknown Member';
  };

  return (
    <View style={styles.container}>
      {/* Wise Custom Header Toggle */}
      <View style={styles.header}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, styles.toggleActive]}>
            <Text style={styles.toggleTextActive}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.toggleBtn} 
            onPress={() => router.replace('/money/expenses')}
          >
            <Text style={styles.toggleTextInactive}>Expenses</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {loading && incomes.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0e0f0c" />
        </View>
      ) : incomes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cash-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Income Added Yet</Text>
          <Text style={styles.emptySubtitle}>Tap the + icon in the top right to log your family income.</Text>
        </View>
      ) : (
        <FlatList
          data={getGroupedIncomes()}
          keyExtractor={(item) => item.month}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View>
              <Text style={styles.monthHeader}>{item.month}</Text>
              {item.data.map((inc) => (
                <TouchableOpacity 
                  key={inc.localId} 
                  style={styles.card}
                  onLongPress={() => handleDelete(inc.localId)}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {getMemberName(inc.memberId).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.sourceText}>{inc.source}</Text>
                      <Text style={styles.memberText}>{getMemberName(inc.memberId)}</Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <AmountDisplay amount={inc.amount} color="#2ead4b" size={16} />
                    <Text style={styles.dateText}>{inc.date.split('-').reverse().join('/')}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      )}

      {/* Add Income Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Income</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 0"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.label}>Earner / Family Member</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      memberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => setMemberId(m.localId)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      memberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Source</Text>
              <View style={styles.pickerContainer}>
                {SOURCES.map((src) => (
                  <TouchableOpacity
                    key={src}
                    style={[
                      styles.pickerChip,
                      source === src && styles.pickerChipActive
                    ]}
                    onPress={() => setSource(src)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      source === src && styles.pickerChipTextActive
                    ]}>
                      {src}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-06-20"
                placeholderTextColor="#868685"
                value={date}
                onChangeText={setDate}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Additional notes..."
                placeholderTextColor="#868685"
                multiline
                value={notes}
                onChangeText={setNotes}
              />

              <View style={styles.recurringRow}>
                <Text style={styles.label}>Is Recurring?</Text>
                <TouchableOpacity 
                  style={[styles.checkbox, isRecurring && styles.checkboxChecked]}
                  onPress={() => setIsRecurring(!isRecurring)}
                >
                  {isRecurring && <Ionicons name="checkmark" size={18} color="#0e0f0c" />}
                </TouchableOpacity>
              </View>

              <View style={styles.spacer} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddIncome} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Entry</Text>
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
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    padding: 4,
    flex: 1,
    marginRight: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9999,
  },
  toggleActive: {
    backgroundColor: '#9fe870',
  },
  toggleTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  toggleTextInactive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#868685',
  },
  addBtn: {
    backgroundColor: '#9fe870',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    padding: 8,
  },
  centerContainer: {
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
  monthHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#454745',
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2f6d5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2ead4b',
  },
  sourceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  memberText: {
    fontSize: 12,
    color: '#454745',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 11,
    color: '#868685',
    marginTop: 4,
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
  recurringRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
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
