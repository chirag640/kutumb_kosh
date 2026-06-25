import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Switch, 
  ActivityIndicator,
  Platform
} from 'react-native';
import { showAlert } from '../../../src/utils/alert';
const Alert = { alert: showAlert };
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from '../../../src/utils/secureStore';
import { useAuthStore } from '../../../src/store/authStore';
import { useSyncStore } from '../../../src/store/syncStore';
import { performSync, pullFromRemote, setupRemoteDatabase } from '../../../src/sync/engine';
import { getDBUrl, storeDBUrl, enforceSSL } from '../../../src/crypto';
import { db } from '../../../src/db';

export default function SyncSettingsScreen() {
  const { cryptoKey } = useAuthStore();
  const { lastSynced, isSyncing, lastError, setSyncing } = useSyncStore();
  const [dbUrl, setDbUrl] = useState('');
  const [dbLoading, setDbLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [autoSync, setAutoSync] = useState(true);

  useEffect(() => {
    loadSyncData();
  }, []);

  const loadSyncData = async () => {
    const url = await getDBUrl();
    if (url) setDbUrl(url);

    if (Platform.OS === 'web') {
      setPendingCount(0);
      setConflictCount(0);
      return;
    }

    // Calculate total pending changes across all tables
    const tables = [
      'family_members', 'income_entries', 'expense_entries', 'bank_accounts',
      'lic_policies', 'insurance_policies', 'loans', 'documents',
      'fdrd_entries', 'property', 'savings_goals',
    ];
    let totalPending = 0;
    try {
      tables.forEach(table => {
        const row = db.getFirstSync(
          `SELECT COUNT(*) as count FROM ${table} WHERE sync_status = 'pending'`
        ) as { count: number } | null;
        if (row) totalPending += row.count;
      });
      setPendingCount(totalPending);

      const conflictRow = db.getFirstSync(
        `SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = 0`
      ) as { count: number } | null;
      if (conflictRow) setConflictCount(conflictRow.count);
    } catch (err) {
      console.log('Error counting pending syncs', err);
    }
  };

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setSyncing(true);
    try {
      const res = await performSync('manual');
      if (res.success) {
        Alert.alert('Sync Complete', 'All pending records pushed to Neon successfully.');
        loadSyncData();
      } else {
        Alert.alert('Sync Failed', res.error || 'Check internet connection and DB URL.');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred during sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateDB = async () => {
    const formattedUrl = enforceSSL(dbUrl);
    if (!formattedUrl || !formattedUrl.startsWith('postgresql://')) {
      Alert.alert('Invalid URL', 'Please enter a valid PostgreSQL connection string.');
      return;
    }
    setDbLoading(true);
    try {
      const res = await setupRemoteDatabase(formattedUrl);
      if (res.success) {
        setDbUrl(formattedUrl);
        await storeDBUrl(formattedUrl);
        Alert.alert('Success', 'Database URL updated and connected successfully.');
      } else {
        Alert.alert('Connection Failed', res.error || 'Failed to connect to PostgreSQL.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update database configuration.');
    } finally {
      setDbLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!cryptoKey) return;
    Alert.alert(
      'Restore from Cloud',
      'WARNING: This will pull all records from Neon and merge them with local SQLite. Are you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore', 
          style: 'destructive',
          onPress: async () => {
            setSyncing(true);
            try {
              const url = await getDBUrl();
              if (!url) {
                Alert.alert('Error', 'Please configure your Database URL first.');
                setSyncing(false);
                return;
              }
              const res = await pullFromRemote(url, cryptoKey);
              if (res.success) {
                Alert.alert('Restore Complete', `Successfully imported ${res.count} records from Neon database.`);
                loadSyncData();
              } else {
                Alert.alert('Restore Failed', res.error || 'Failed to restore database.');
              }
            } catch (err) {
              Alert.alert('Error', 'An error occurred during restore.');
            } finally {
              setSyncing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Cloud Backup & Sync</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Sync Status Card */}
      <View style={styles.syncCard}>
        <View style={styles.syncRow}>
          <View>
            <Text style={styles.syncTitle}>Sync Status</Text>
            <Text style={styles.syncMeta}>
              {isSyncing 
                ? 'Syncing changes...' 
                : lastSynced 
                ? `Last synced: ${new Date(lastSynced).toLocaleString('en-IN')}` 
                : 'Never synced'}
            </Text>
            {lastError && <Text style={styles.errorText}>Error: {lastError}</Text>}
          </View>
          <View style={[styles.dot, { backgroundColor: isSyncing ? '#ffd11a' : lastError ? '#d03238' : pendingCount > 0 ? '#ffd11a' : '#2ead4b' }]} />
        </View>

        <View style={styles.pendingContainer}>
          <Text style={styles.pendingText}>Pending Changes: {pendingCount} entries</Text>
        </View>

        <TouchableOpacity 
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]} 
          onPress={handleSyncNow}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color="#0e0f0c" />
          ) : (
            <Text style={styles.syncBtnText}>Sync Changes Now</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Database Connection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Private Database Configuration</Text>
        <Text style={styles.sectionDesc}>
          Your financial data is stored end-to-end encrypted in your own PostgreSQL instance. 
          Modify or update the connection URL below.
        </Text>
        
        <TextInput
          style={styles.input}
          placeholder="postgresql://..."
          placeholderTextColor="#868685"
          value={dbUrl}
          onChangeText={setDbUrl}
          autoCapitalize="none"
          multiline
        />

        <TouchableOpacity style={styles.updateBtn} onPress={handleUpdateDB} disabled={dbLoading}>
          {dbLoading ? (
            <ActivityIndicator color="#0e0f0c" />
          ) : (
            <Text style={styles.updateBtnText}>Verify & Update Database</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Auto sync scheduler & restore */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup Options</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingMeta}>
            <Text style={styles.settingLabel}>EOD Auto-Sync</Text>
            <Text style={styles.settingDesc}>Auto-sync changes to cloud at midnight (11:45 PM)</Text>
          </View>
          <Switch 
            value={autoSync} 
            onValueChange={setAutoSync} 
            trackColor={{ false: '#e8ebe6', true: '#9fe870' }}
            thumbColor={autoSync ? '#0e0f0c' : '#ffffff'}
          />
        </View>

        {conflictCount > 0 && (
          <TouchableOpacity 
            style={[styles.restoreBtn, { borderColor: '#ffd11a', backgroundColor: '#fffbeb', marginBottom: 12 }]} 
            onPress={() => router.push('/settings/conflicts')}
          >
            <Ionicons name="git-compare-outline" size={18} color="#0e0f0c" style={{ marginRight: 8 }} />
            <Text style={styles.restoreBtnText}>Resolve {conflictCount} Conflicts</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
          <Ionicons name="cloud-download-outline" size={18} color="#0e0f0c" style={{ marginRight: 8 }} />
          <Text style={styles.restoreBtnText}>Restore From Remote Backup</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    fontSize: 20,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  syncCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 20,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 12,
  },
  syncTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  syncMeta: {
    fontSize: 12,
    color: '#868685',
    marginTop: 4,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 11,
    color: '#d03238',
    marginTop: 4,
    fontWeight: '600',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pendingContainer: {
    marginVertical: 12,
  },
  pendingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#454745',
  },
  syncBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  syncBtnDisabled: {
    backgroundColor: '#e8ebe6',
    opacity: 0.7,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#868685',
    lineHeight: 18,
    marginBottom: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    height: 80,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  updateBtn: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#e8ebe6',
  },
  updateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 12,
    marginBottom: 12,
  },
  settingMeta: {
    flex: 1,
    marginRight: 10,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  settingDesc: {
    fontSize: 11,
    color: '#868685',
    marginTop: 2,
    fontWeight: '600',
  },
  restoreBtn: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#d03238',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
});
