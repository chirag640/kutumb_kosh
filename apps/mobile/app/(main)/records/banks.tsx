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
import { SkeletonCard } from '../../../src/components/Skeleton';
import type { BankAccount, FamilyMember } from '@kutumbkosh/shared';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useFormDraftStore } from '../../../src/store/formDraftStore';

const TYPES = ['Savings', 'Current', 'Salary', 'Joint', 'NRI'];

export default function BanksScreen() {
  const { cryptoKey } = useAuthStore();
  const params = useLocalSearchParams<{ editId?: string }>();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Edit mode — null means "add new"
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<BankAccount['accountType']>('Savings');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [balance, setBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { updateDraftField } = useFormDraft('bank', {
    bankName: setBankName,
    accountType: setAccountType,
    ownerMemberId: setOwnerMemberId,
    accountNumber: setAccountNumber,
    balance: setBalance,
    notes: setNotes,
  }, !editingId);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.editId && banks.length > 0) {
      const item = banks.find(b => b.localId === params.editId);
      if (item) {
        handleOpenEdit(item);
      }
    }
  }, [params.editId, banks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [cryptoKey]);

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const allBanks = await getAllRecords<BankAccount>('bank_accounts', cryptoKey);
      setBanks(allBanks);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        const draft = useFormDraftStore.getState().drafts['bank'];
        if (!draft || !draft.ownerMemberId) {
          setOwnerMemberId(allMembers[0].localId);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load bank accounts');
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const resetForm = (firstMemberId?: string) => {
    setBankName('');
    setAccountType('Savings');
    setOwnerMemberId(firstMemberId || members[0]?.localId || '');
    setAccountNumber('');
    setBalance('');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: BankAccount) => {
    setBankName(item.bankName);
    setAccountType(item.accountType);
    setOwnerMemberId(item.ownerMemberId);
    setAccountNumber(item.accountNumber);
    setBalance(String(item.balance));
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!bankName.trim() || !accountNumber.trim() || !balance.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    const payload = {
      bankName,
      accountType,
      ownerMemberId,
      accountNumber,
      balance: Number(balance),
      lastUpdated: new Date().toISOString(),
      notes,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('bank_accounts', editingId, payload, cryptoKey);
      } else {
        await insertRecord('bank_accounts', payload, cryptoKey);
        useFormDraftStore.getState().clearDraft('bank');
      }
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update bank account' : 'Failed to save bank account');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, name: string) => {
    Alert.alert('Delete Account', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('bank_accounts', localId);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete record');
          } finally {
            setLoading(false);
          }
        },
      },
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
        <Text style={styles.title}>Bank Accounts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {loading && banks.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : banks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="business-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Accounts Vaulted</Text>
          <Text style={styles.emptySubtitle}>Log your savings and joint bank accounts here.</Text>
        </View>
      ) : (
        <FlatList
          data={banks}
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
              onLongPress={() => handleDelete(item.localId, item.bankName)}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.bankName}>{item.bankName}</Text>
                  <Text style={styles.typeText}>{item.accountType} — Account No: {item.accountNumber}</Text>
                </View>
                <AmountDisplay amount={item.balance} color="#0e0f0c" size={18} />
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.ownerText}>Owner: {getMemberName(item.ownerMemberId)}</Text>
                <Text style={styles.updateText}>
                  Updated: {new Date(item.lastUpdated).toLocaleDateString('en-IN')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add / Edit Bank Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Bank Account' : 'Vault Bank Account'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Bank Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. State Bank of India"
                placeholderTextColor="#868685"
                value={bankName}
                onChangeText={(val) => { setBankName(val); updateDraftField('bankName', val); }}
              />

              <Text style={styles.label}>Account Owner</Text>
              <View style={styles.pickerContainer}>
                {members.map((m) => (
                  <TouchableOpacity
                    key={m.localId}
                    style={[styles.pickerChip, ownerMemberId === m.localId && styles.pickerChipActive]}
                    onPress={() => { setOwnerMemberId(m.localId); updateDraftField('ownerMemberId', m.localId); }}
                  >
                    <Text style={[styles.pickerChipText, ownerMemberId === m.localId && styles.pickerChipTextActive]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Account Type</Text>
              <View style={styles.pickerContainer}>
                {TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.pickerChip, accountType === type && styles.pickerChipActive]}
                    onPress={() => { setAccountType(type as BankAccount['accountType']); updateDraftField('accountType', type); }}
                  >
                    <Text style={[styles.pickerChipText, accountType === type && styles.pickerChipTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 123456789012"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={accountNumber}
                onChangeText={(val) => { setAccountNumber(val); updateDraftField('accountNumber', val); }}
              />

              <Text style={styles.label}>Current Balance (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 0"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={balance}
                onChangeText={(val) => { setBalance(val); updateDraftField('balance', val); }}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Branch, IFSC code, etc."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Account' : 'Save Account'}</Text>
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
  container: { flex: 1, backgroundColor: '#e8ebe6', padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 4,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: '#0e0f0c' },
  addBtn: {
    backgroundColor: '#9fe870',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    padding: 8,
  },
  hintText: {
    fontSize: 11,
    color: '#868685',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0e0f0c', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#454745', textAlign: 'center', paddingHorizontal: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 12,
  },
  bankName: { fontSize: 16, fontWeight: '800', color: '#0e0f0c' },
  typeText: { fontSize: 12, color: '#868685', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  ownerText: { fontSize: 12, fontWeight: '700', color: '#454745' },
  updateText: { fontSize: 11, color: '#868685' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14, 15, 12, 0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0e0f0c' },
  modalScroll: { paddingBottom: 40 },
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
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4 },
  pickerChip: {
    backgroundColor: '#e8ebe6',
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  pickerChipActive: { backgroundColor: '#9fe870', borderWidth: 1, borderColor: '#0e0f0c' },
  pickerChipText: { fontSize: 13, fontWeight: '600', color: '#454745' },
  pickerChipTextActive: { color: '#0e0f0c', fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#0e0f0c' },
  spacer: { height: 12 },
});
