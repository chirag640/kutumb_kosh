import React, { useState, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord, updateRecord } from '../../../src/db/crud';
import { calcDaysRemaining, isValidDate } from '../../../src/utils/calculations';
import type { FamilyMember } from '@kutumbkosh/shared';

const RELATIONSHIPS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

export default function FamilyMembersScreen() {
  const { cryptoKey } = useAuthStore();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form inputs
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<FamilyMember['relationship']>('Other');
  const [dateOfBirth, setDateOfBirth] = useState('1990-01-01');
  const [mobile, setMobile] = useState('');
  const [bloodGroup, setBloodGroup] = useState('A+');
  const [notes, setNotes] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [cryptoKey])
  );

  const loadMembers = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const allMembers = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      setMembers(allMembers);
    } catch (err) {
      Alert.alert('Error', 'Failed to load family members');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setRelationship('Other');
    setDateOfBirth('1990-01-01');
    setMobile('');
    setBloodGroup('A+');
    setNotes('');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item: FamilyMember) => {
    setName(item.name);
    setRelationship(item.relationship);
    setDateOfBirth(item.dateOfBirth);
    setMobile(item.mobile || '');
    setBloodGroup(item.bloodGroup || 'A+');
    setNotes(item.notes || '');
    setEditingId(item.localId);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!name.trim()) {
      Alert.alert('Invalid Name', 'Name cannot be empty.');
      return;
    }
    if (!isValidDate(dateOfBirth)) {
      Alert.alert('Invalid Date', 'Date of Birth must be in YYYY-MM-DD format (e.g., 1995-05-15).');
      return;
    }

    const payload = {
      name,
      relationship,
      dateOfBirth,
      mobile,
      bloodGroup,
      notes,
      aadhaarAvailable: false,
      panAvailable: false,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateRecord('family_members', editingId, payload, cryptoKey);
      } else {
        await insertRecord('family_members', payload, cryptoKey);
      }
      setModalVisible(false);
      resetForm();
      loadMembers();
    } catch (err) {
      Alert.alert('Error', editingId ? 'Failed to update member profile' : 'Failed to save family member profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string, memName: string) => {
    if (members.length === 1) {
      Alert.alert('Cannot Delete', 'At least one family member profile is required.');
      return;
    }
    Alert.alert(
      'Delete Member',
      `Are you sure you want to delete ${memName}? This will not delete linked records but they may lose profile associations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteRecord('family_members', localId);
              loadMembers();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete member profile');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getBdayCountdown = (dobStr: string) => {
    if (!dobStr) return null;
    const birthDate = new Date(dobStr);
    const today = new Date();
    const nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    if (nextBirthday < today) {
      nextBirthday.setFullYear(today.getFullYear() + 1);
    }
    return calcDaysRemaining(nextBirthday.toISOString().split('T')[0]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Family Profiles</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>

      {loading && members.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const bdayDays = getBdayCountdown(item.dateOfBirth);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => handleDelete(item.localId, item.name)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.relation}>{item.relationship}</Text>
                  </View>
                  {bdayDays !== null && bdayDays <= 30 && (
                    <View style={styles.bdayBadge}>
                      <Ionicons name="gift" size={12} color="#db2777" style={{ marginRight: 4 }} />
                      <Text style={styles.bdayText}>{bdayDays === 0 ? 'Today!' : `${bdayDays}d`}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailsRow}>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Mobile</Text>
                    <Text style={styles.detailValue}>{item.mobile || '—'}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>DOB</Text>
                    <Text style={styles.detailValue}>{item.dateOfBirth.split('-').reverse().join('/')}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Blood</Text>
                    <Text style={styles.detailValue}>{item.bloodGroup || '—'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add / Edit Member Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Family Member' : 'Add Family Member'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#868685"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Relationship</Text>
              <View style={styles.pickerContainer}>
                {RELATIONSHIPS.map((rel) => (
                  <TouchableOpacity
                    key={rel}
                    style={[styles.pickerChip, relationship === rel && styles.pickerChipActive]}
                    onPress={() => setRelationship(rel as FamilyMember['relationship'])}
                  >
                    <Text style={[styles.pickerChipText, relationship === rel && styles.pickerChipTextActive]}>
                      {rel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="1995-05-15"
                placeholderTextColor="#868685"
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
              />

              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Mobile"
                placeholderTextColor="#868685"
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={setMobile}
              />

              <Text style={styles.label}>Blood Group</Text>
              <View style={styles.pickerContainer}>
                {BLOOD_GROUPS.map((bg) => (
                  <TouchableOpacity
                    key={bg}
                    style={[styles.pickerChip, bloodGroup === bg && styles.pickerChipActive]}
                    onPress={() => setBloodGroup(bg)}
                  >
                    <Text style={[styles.pickerChipText, bloodGroup === bg && styles.pickerChipTextActive]}>
                      {bg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Private Notes</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Allergies, medical info..."
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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Profile' : 'Save Profile'}</Text>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    marginBottom: 16,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e2f6d5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#2ead4b' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: '#0e0f0c' },
  relation: { fontSize: 12, color: '#868685', marginTop: 2 },
  bdayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FCE7F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bdayText: { fontSize: 11, fontWeight: '700', color: '#db2777' },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
    paddingTop: 12,
  },
  detailCol: { flex: 1, alignItems: 'center' },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#0e0f0c' },
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
