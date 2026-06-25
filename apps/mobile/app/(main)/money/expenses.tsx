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
import { formatINR } from '../../../src/utils/calculations';
import type { ExpenseEntry, FamilyMember, ExpenseCategory } from '@kutumbkosh/shared';
import { EXPENSE_SUBCATEGORIES } from '@kutumbkosh/shared';

const CATEGORIES = Object.keys(EXPENSE_SUBCATEGORIES) as ExpenseCategory[];
const METHODS = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Cheque'];

export default function ExpensesScreen() {
  const { cryptoKey } = useAuthStore();
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form inputs
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Food');
  const [subcategory, setSubcategory] = useState('Groceries');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Debit Card' | 'Credit Card' | 'Net Banking' | 'Cheque'>('UPI');
  const [paidByMemberId, setPaidByMemberId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Budget calculations
  const [monthlyLimit, setMonthlyLimit] = useState(25000); // Default or load from app_settings
  const [monthlySpent, setMonthlySpent] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [cryptoKey])
  );

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allExpenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      allExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(allExpenses);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setPaidByMemberId(allMembers[0].localId);
      }

      // Calculate monthly spent
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const thisMonthSpent = allExpenses
        .filter((e) => {
          const d = new Date(e.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      setMonthlySpent(thisMonthSpent);

    } catch (err) {
      Alert.alert('Error', 'Failed to load expense records');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    if (!cryptoKey) return;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!paidByMemberId) {
      Alert.alert('Member Required', 'Please select or add a family member first.');
      return;
    }

    setLoading(true);
    try {
      await insertRecord('expense_entries', {
        date,
        category,
        subcategory,
        amount: Number(amount),
        paymentMethod,
        paidByMemberId,
        isRecurring,
        notes,
      }, cryptoKey, {
        entry_date: date,
        category_idx: category,
      });

      setModalVisible(false);
      // Reset form
      setAmount('');
      setNotes('');
      setIsRecurring(false);
      
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save expense entry');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string) => {
    Alert.alert('Delete Record', 'Are you sure you want to delete this expense record?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('expense_entries', localId);
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

  const getGroupedExpenses = () => {
    const groups: { [key: string]: ExpenseEntry[] } = {};
    expenses.forEach((exp) => {
      const month = new Date(exp.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!groups[month]) groups[month] = [];
      groups[month].push(exp);
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

  const getCategoryColor = (cat: ExpenseCategory) => {
    const colors: Record<string, string> = {
      Food: '#ffc091', // Peach
      Healthcare: '#ffd11a', // Warning yellow
      Education: '#38c8ff', // Cyan
      Insurance: '#cdffad', // Pale green
      EMI: '#d03238', // Negative red
    };
    return colors[cat] || '#868685';
  };

  const budgetProgress = Math.min(1, monthlySpent / monthlyLimit);
  const isBudgetWarning = budgetProgress > 0.85;

  return (
    <View style={styles.container}>
      {/* Wise Custom Header Toggle */}
      <View style={styles.header}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            style={styles.toggleBtn} 
            onPress={() => router.replace('/money/income')}
          >
            <Text style={styles.toggleTextInactive}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, styles.toggleActive]}>
            <Text style={styles.toggleTextActive}>Expenses</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {/* Monthly Budget Bar */}
      <View style={styles.budgetCard}>
        <View style={styles.budgetHeader}>
          <Text style={styles.budgetTitle}>Monthly Budget</Text>
          <Text style={[styles.budgetText, isBudgetWarning && styles.warningText]}>
            {formatINR(monthlySpent)} / {formatINR(monthlyLimit)} spent
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[
            styles.progressBarFill, 
            { 
              width: `${budgetProgress * 100}%`,
              backgroundColor: isBudgetWarning ? '#d03238' : '#2ead4b' 
            }
          ]} />
        </View>
      </View>

      {loading && expenses.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0e0f0c" />
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cart-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Expenses Logged</Text>
          <Text style={styles.emptySubtitle}>Tap the + icon to register your household expenses.</Text>
        </View>
      ) : (
        <FlatList
          data={getGroupedExpenses()}
          keyExtractor={(item) => item.month}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View>
              <Text style={styles.monthHeader}>{item.month}</Text>
              {item.data.map((exp) => (
                <TouchableOpacity 
                  key={exp.localId} 
                  style={styles.card}
                  onLongPress={() => handleDelete(exp.localId)}
                >
                  <View style={styles.cardLeft}>
                    <View style={[styles.categoryIndicator, { backgroundColor: getCategoryColor(exp.category) }]} />
                    <View>
                      <Text style={styles.categoryText}>{exp.category} — {exp.subcategory}</Text>
                      <Text style={styles.memberText}>
                        Paid by {getMemberName(exp.paidByMemberId)} via {exp.paymentMethod}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <AmountDisplay amount={exp.amount} color="#0e0f0c" size={16} />
                    <Text style={styles.dateText}>{exp.date.split('-').reverse().join('/')}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      )}

      {/* Add Expense Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Expense</Text>
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

              <Text style={styles.label}>Paid By Member</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[
                      styles.pickerChip,
                      paidByMemberId === m.localId && styles.pickerChipActive
                    ]}
                    onPress={() => setPaidByMemberId(m.localId)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      paidByMemberId === m.localId && styles.pickerChipTextActive
                    ]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.pickerContainer}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.pickerChip,
                      category === cat && styles.pickerChipActive
                    ]}
                    onPress={() => {
                      setCategory(cat);
                      // Set default subcategory for selected category
                      if (EXPENSE_SUBCATEGORIES[cat]) {
                        setSubcategory(EXPENSE_SUBCATEGORIES[cat][0]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      category === cat && styles.pickerChipTextActive
                    ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Subcategory</Text>
              <View style={styles.pickerContainer}>
                {(EXPENSE_SUBCATEGORIES[category] || []).map((sub) => (
                  <TouchableOpacity
                    key={sub}
                    style={[
                      styles.pickerChip,
                      subcategory === sub && styles.pickerChipActive
                    ]}
                    onPress={() => setSubcategory(sub)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      subcategory === sub && styles.pickerChipTextActive
                    ]}>
                      {sub}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.pickerContainer}>
                {METHODS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.pickerChip,
                      paymentMethod === m && styles.pickerChipActive
                    ]}
                    onPress={() => setPaymentMethod(m as any)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      paymentMethod === m && styles.pickerChipTextActive
                    ]}>
                      {m}
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
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddExpense} disabled={loading}>
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
    marginBottom: 16,
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
  budgetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    marginBottom: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  budgetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  budgetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#454745',
  },
  warningText: {
    color: '#d03238',
  },
  progressBarBg: {
    height: 10,
    backgroundColor: '#e8ebe6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
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
    flex: 1,
  },
  categoryIndicator: {
    width: 8,
    height: 40,
    borderRadius: 4,
    marginRight: 12,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  memberText: {
    fontSize: 11,
    color: '#868685',
    marginTop: 4,
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
