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
import { insertRecord, getAllRecords, deleteRecord, updateRecord } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { calcDaysRemaining, formatINR } from '../../../src/utils/calculations';
import type { SavingsGoal } from '@kutumbkosh/shared';

const STATUSES = ['Active', 'Achieved', 'Paused'];

export default function SavingsGoalsScreen() {
  const { cryptoKey } = useAuthStore();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [targetDate, setTargetDate] = useState('2027-01-01');
  const [status, setStatus] = useState<SavingsGoal['status']>('Active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allGoals = await getAllRecords<SavingsGoal>('savings_goals', cryptoKey);
      setGoals(allGoals);
    } catch (err) {
      Alert.alert('Error', 'Failed to load savings goals');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setTargetAmount('');
    setSavedAmount('');
    setMonthlyContribution('');
    setTargetDate('2027-01-01');
    setStatus('Active');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: SavingsGoal) => {
    setTitle(item.title);
    setTargetAmount(String(item.targetAmount));
    setSavedAmount(String(item.savedAmount));
    setMonthlyContribution(String(item.monthlyContribution));
    setTargetDate(item.targetDate);
    setStatus(item.status);
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!title.trim() || !targetAmount.trim() || !savedAmount.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    const payload = {
      title,
      targetAmount: Number(targetAmount),
      savedAmount: Number(savedAmount),
      monthlyContribution: Number(monthlyContribution) || 0,
      targetDate,
      status,
      notes,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('savings_goals', editingId, payload, cryptoKey);
      } else {
        await insertRecord('savings_goals', payload, cryptoKey);
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update savings goal' : 'Failed to save savings goal');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Goal', `Are you sure you want to delete goal: "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('savings_goals', localId);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete goal');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Savings Goals</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {loading && goals.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : goals.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="ribbon-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Goals Configured</Text>
          <Text style={styles.emptySubtitle}>Log home purchase, marriage or education savings goals here.</Text>
        </View>
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const progress = (item.savedAmount / item.targetAmount) * 100;
            const daysLeft = calcDaysRemaining(item.targetDate);
            return (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => handleDelete(item.localId, item.title)}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.goalTitle}>{item.title}</Text>
                    <Text style={styles.targetText}>Target: {formatINR(item.targetAmount)}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressText}>Saved: {progress.toFixed(0)}%</Text>
                    <Text style={styles.progressText}>{formatINR(item.savedAmount)} saved</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>Monthly Contribution: {formatINR(item.monthlyContribution)}</Text>
                  {daysLeft > 0 ? (
                    <Text style={styles.footerText}>Target: {daysLeft}d left</Text>
                  ) : (
                    <Text style={styles.footerText}>Reached Target Date</Text>
                  )}
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
              <Text style={styles.modalTitle}>{editingId ? 'Edit Savings Goal' : 'Vault Savings Goal'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Goal Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. New Farm Tractor"
                placeholderTextColor="#868685"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Target Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 5,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={targetAmount}
                onChangeText={setTargetAmount}
              />

              <Text style={styles.label}>Currently Saved (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 1,50,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={savedAmount}
                onChangeText={setSavedAmount}
              />

              <Text style={styles.label}>Monthly Contribution (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 10,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={monthlyContribution}
                onChangeText={setMonthlyContribution}
              />

              <Text style={styles.label}>Target Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2027-01-01"
                placeholderTextColor="#868685"
                value={targetDate}
                onChangeText={setTargetDate}
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
                placeholder="Investment links, specific banks..."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Goal' : 'Save Goal'}</Text>
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
  goalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  targetText: {
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
