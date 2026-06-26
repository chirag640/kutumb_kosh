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
import { DaysChip } from '../../../src/components/DaysChip';
import { calcDaysRemaining, formatINR, isValidDate } from '../../../src/utils/calculations';
import type { InsurancePolicy, FamilyMember } from '@kutumbkosh/shared';

const TYPES = ['Health', 'Term Life', 'Vehicle', 'Home', 'Crop/Farming', 'Personal Accident', 'Travel'];
const STATUSES = ['Active', 'Expired', 'Cancelled'];

export default function InsuranceScreen() {
  const { cryptoKey } = useAuthStore();
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [policyHolderMemberId, setPolicyHolderMemberId] = useState('');
  const [insuranceType, setInsuranceType] = useState<InsurancePolicy['insuranceType']>('Health');
  const [company, setCompany] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [coverageAmount, setCoverageAmount] = useState('');
  const [premium, setPremium] = useState('');
  const [renewalDate, setRenewalDate] = useState('2026-06-20');
  const [status, setStatus] = useState<InsurancePolicy['status']>('Active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allPolicies = await getAllRecords<InsurancePolicy>('insurance_policies', cryptoKey);
      // Sort by renewal date ascending
      allPolicies.sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
      setPolicies(allPolicies);

      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
      if (allMembers.length > 0) {
        setPolicyHolderMemberId(allMembers[0].localId);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load general insurance policies');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPolicyHolderMemberId(members[0]?.localId || '');
    setInsuranceType('Health');
    setCompany('');
    setPolicyNumber('');
    setCoverageAmount('');
    setPremium('');
    setRenewalDate('2026-06-20');
    setStatus('Active');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: InsurancePolicy) => {
    setPolicyHolderMemberId(item.policyHolderMemberId);
    setInsuranceType(item.insuranceType);
    setCompany(item.company);
    setPolicyNumber(item.policyNumber);
    setCoverageAmount(String(item.coverageAmount));
    setPremium(String(item.premium));
    setRenewalDate(item.renewalDate);
    setStatus(item.status);
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!company.trim() || !policyNumber.trim() || !premium.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (!isValidDate(renewalDate)) {
      Alert.alert('Invalid Date', 'Renewal date must be in YYYY-MM-DD format (e.g., 2026-06-20).');
      return;
    }

    const payload = {
      policyHolderMemberId,
      insuranceType,
      company,
      policyNumber,
      coverageAmount: Number(coverageAmount),
      premium: Number(premium),
      renewalDate,
      status,
      notes,
    };
    const indexFields = {
      renewal_date: renewalDate,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('insurance_policies', editingId, payload, cryptoKey, indexFields);
      } else {
        await insertRecord('insurance_policies', payload, cryptoKey, indexFields);
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update insurance policy' : 'Failed to save insurance policy');
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
            await deleteRecord('insurance_policies', localId);
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

  const getUrgencyColor = (renewalDateStr: string) => {
    const days = calcDaysRemaining(renewalDateStr);
    if (days < 0) return '#d03238'; // expired
    if (days <= 7) return '#ffc091'; // warning orange
    if (days <= 30) return '#ffd11a'; // warning yellow
    return '#2ead4b'; // green
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>General Insurance</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {loading && policies.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : policies.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Insurance Vaulted</Text>
          <Text style={styles.emptySubtitle}>Log and track health, motor and property insurances here.</Text>
        </View>
      ) : (
        <FlatList
          data={policies}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const urgencyColor = getUrgencyColor(item.renewalDate);
            const daysLeft = calcDaysRemaining(item.renewalDate);
            return (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => handleDelete(item.localId, item.company)}
              >
                {/* Left urgency colored strip */}
                <View style={[styles.urgencyBar, { backgroundColor: urgencyColor }]} />
                
                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.companyName}>{item.company}</Text>
                      <Text style={styles.typeText}>{item.insuranceType} — Holder: {getMemberName(item.policyHolderMemberId)}</Text>
                    </View>
                    <DaysChip daysRemaining={daysLeft} />
                  </View>

                  <View style={styles.detailsRow}>
                    <View>
                      <Text style={styles.detailLabel}>Policy No</Text>
                      <Text style={styles.detailValue}>{item.policyNumber}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.detailLabel}>Premium</Text>
                      <AmountDisplay amount={item.premium} color="#0e0f0c" size={15} />
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Text style={styles.footerText}>Renewal Date: {item.renewalDate.split('-').reverse().join('/')}</Text>
                    <Text style={[styles.footerText, styles.coverageText]}>Coverage: {formatINR(item.coverageAmount)}</Text>
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
              <Text style={styles.modalTitle}>{editingId ? 'Edit Insurance Policy' : 'Vault Insurance Policy'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Insurance Company</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. HDFC Ergo"
                placeholderTextColor="#868685"
                value={company}
                onChangeText={setCompany}
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
                    onPress={() => setPolicyHolderMemberId(m.localId)}
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

              <Text style={styles.label}>Insurance Type</Text>
              <View style={styles.pickerContainer}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.pickerChip,
                      insuranceType === t && styles.pickerChipActive
                    ]}
                    onPress={() => setInsuranceType(t as any)}
                  >
                    <Text style={[
                      styles.pickerChipText,
                      insuranceType === t && styles.pickerChipTextActive
                    ]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Policy Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Policy number"
                placeholderTextColor="#868685"
                value={policyNumber}
                onChangeText={setPolicyNumber}
              />

              <Text style={styles.label}>Coverage / Sum Insured (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 5,00,000"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={coverageAmount}
                onChangeText={setCoverageAmount}
              />

              <Text style={styles.label}>Premium Paid (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 8,500"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={premium}
                onChangeText={setPremium}
              />

              <Text style={styles.label}>Renewal Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-06-20"
                placeholderTextColor="#868685"
                value={renewalDate}
                onChangeText={setRenewalDate}
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
                placeholder="Co-pay parameters, cashless hospitals, etc."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Policy' : 'Save Policy'}</Text>
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
  companyName: {
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
  coverageText: {
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
