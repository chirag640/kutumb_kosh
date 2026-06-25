import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  FlatList
} from 'react-native';
import { showAlert } from '../../../src/utils/alert';
const Alert = { alert: showAlert };
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { db } from '../../../src/db';

interface Conflict {
  id: number;
  table_name: string;
  local_id: string;
  local_data: string;
  remote_data: string;
  remote_iv: string;
  remote_data_enc: string;
}

export default function ConflictResolutionScreen() {
  const { cryptoKey } = useAuthStore();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = () => {
    try {
      const rows = db.getAllSync(
        `SELECT id, table_name, local_id, local_data, remote_data, remote_iv, remote_data_enc 
         FROM sync_conflicts WHERE resolved = 0`
      ) as Conflict[];
      setConflicts(rows);
    } catch (e) {
      console.log('Error querying conflicts', e);
    }
  };

  const getFriendlyTableName = (name: string) => {
    switch (name) {
      case 'family_members': return 'Family Member';
      case 'income_entries': return 'Income Entry';
      case 'expense_entries': return 'Expense Entry';
      case 'bank_accounts': return 'Bank Account';
      case 'lic_policies': return 'LIC Policy';
      case 'insurance_policies': return 'Insurance Policy';
      case 'loans': return 'Loan / Liability';
      case 'documents': return 'Important Document';
      case 'fdrd_entries': return 'FD / RD Account';
      case 'property': return 'Property Record';
      case 'savings_goals': return 'Savings Goal';
      default: return name;
    }
  };

  const handleKeepLocal = async (conflictId: number) => {
    try {
      db.runSync(`DELETE FROM sync_conflicts WHERE id = ?`, [conflictId]);
      Alert.alert('Success', 'Local version kept. It will be pushed to the cloud on next sync.');
      loadConflicts();
    } catch (e) {
      Alert.alert('Error', 'Failed to resolve conflict.');
    }
  };

  const handleKeepCloud = async (conflict: Conflict) => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const table = conflict.table_name;
      const recordObj = JSON.parse(conflict.remote_data);

      let indexFields: Record<string, string | null> = {};
      if (table === 'income_entries') {
        indexFields = { entry_date: recordObj.date || null, member_idx: recordObj.memberId || null };
      } else if (table === 'expense_entries') {
        indexFields = { entry_date: recordObj.date || null, category_idx: recordObj.category || null };
      } else if (table === 'lic_policies') {
        indexFields = { due_date: recordObj.nextDueDate || null };
      } else if (table === 'insurance_policies') {
        indexFields = { renewal_date: recordObj.renewalDate || null };
      } else if (table === 'documents') {
        indexFields = { expiry_date: recordObj.expiryDate || null };
      } else if (table === 'fdrd_entries') {
        indexFields = { maturity_date: recordObj.maturityDate || null };
      }

      const indexColNames = Object.keys(indexFields).join(', ');
      const indexPart = indexColNames ? `, ${indexColNames}` : '';
      const placeholders = Object.keys(indexFields).map(() => '?').join(', ');
      const indexValPlaceholder = placeholders ? `, ${placeholders}` : '';

      const nowStr = new Date().toISOString();

      db.runSync(
        `INSERT OR REPLACE INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at ${indexPart})
         VALUES (?, ?, ?, 'synced', ?, ? ${indexValPlaceholder})`,
        [conflict.local_id, conflict.remote_iv, conflict.remote_data_enc, nowStr, nowStr, ...Object.values(indexFields)]
      );

      // Remove from conflict table
      db.runSync(`DELETE FROM sync_conflicts WHERE id = ?`, [conflict.id]);

      Alert.alert('Success', 'Cloud version restored locally.');
      loadConflicts();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to apply remote version.');
    } finally {
      setLoading(false);
    }
  };

  const renderConflictItem = ({ item }: { item: Conflict }) => {
    let localFields: Record<string, any> = {};
    let remoteFields: Record<string, any> = {};
    
    try {
      localFields = JSON.parse(item.local_data);
      remoteFields = JSON.parse(item.remote_data);
    } catch (e) {
      console.log('Failed to parse conflict data fields', e);
    }

    const allKeys = Array.from(new Set([...Object.keys(localFields), ...Object.keys(remoteFields)]))
      .filter(k => k !== 'localId' && k !== 'id' && k !== 'syncStatus');

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare" size={18} color="#0e0f0c" style={{ marginRight: 6 }} />
          <Text style={styles.cardTitle}>{getFriendlyTableName(item.table_name)}</Text>
        </View>

        <Text style={styles.cardSubtitle}>ID: {item.local_id}</Text>

        <View style={styles.comparisonGrid}>
          {/* Header Row */}
          <View style={styles.gridHeaderRow}>
            <Text style={[styles.gridCellHeader, { flex: 2 }]}>Field</Text>
            <Text style={[styles.gridCellHeader, { flex: 3 }]}>Local (Device)</Text>
            <Text style={[styles.gridCellHeader, { flex: 3 }]}>Cloud (Server)</Text>
          </View>

          {/* Key Value Rows */}
          {allKeys.map((key) => {
            const localVal = typeof localFields[key] === 'object' ? JSON.stringify(localFields[key]) : String(localFields[key] ?? '');
            const remoteVal = typeof remoteFields[key] === 'object' ? JSON.stringify(remoteFields[key]) : String(remoteFields[key] ?? '');
            const isDifferent = localVal !== remoteVal;

            return (
              <View key={key} style={[styles.gridRow, isDifferent && styles.gridRowDiff]}>
                <Text style={[styles.fieldLabel, { flex: 2 }]} numberOfLines={1}>{key}</Text>
                <Text style={[styles.cellText, { flex: 3, color: isDifferent ? '#B91C1C' : '#0e0f0c' }]} numberOfLines={2}>
                  {localVal || '—'}
                </Text>
                <Text style={[styles.cellText, { flex: 3, color: isDifferent ? '#166534' : '#0e0f0c' }]} numberOfLines={2}>
                  {remoteVal || '—'}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnLocal]} 
            onPress={() => handleKeepLocal(item.id)}
            disabled={loading}
          >
            <Ionicons name="phone-portrait-outline" size={16} color="#0e0f0c" style={{ marginRight: 4 }} />
            <Text style={styles.btnText}>Keep Local</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnRemote]} 
            onPress={() => handleKeepCloud(item)}
            disabled={loading}
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#0e0f0c" style={{ marginRight: 4 }} />
            <Text style={styles.btnText}>Keep Cloud</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Conflicts ({conflicts.length})</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && conflicts.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : conflicts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={64} color="#2ead4b" />
          <Text style={styles.emptyTitle}>All Conflicts Resolved</Text>
          <Text style={styles.emptySubtitle}>No conflicting database rows found. Your sync engine is in a clean state.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conflicts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderConflictItem}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
    paddingHorizontal: 16,
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
    fontSize: 20,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  cardSubtitle: {
    fontSize: 10,
    color: '#868685',
    fontWeight: '600',
    marginBottom: 14,
  },
  comparisonGrid: {
    borderWidth: 1,
    borderColor: '#e8ebe6',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e8ebe6',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  gridCellHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#454745',
    textTransform: 'uppercase',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  gridRowDiff: {
    backgroundColor: '#fffbeb',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 12,
    fontWeight: '600',
    paddingRight: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 9999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
  },
  btnLocal: {
    backgroundColor: '#ffffff',
  },
  btnRemote: {
    backgroundColor: '#9fe870',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0e0f0c',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#868685',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
});
