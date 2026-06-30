import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSyncStore } from '../store/syncStore';
import { router } from 'expo-router';
import { db } from '../db';
import { performSync } from '../sync/engine';

export function SyncStatusDot() {
  const { isSyncing, lastError, lastSynced } = useSyncStore();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Count pending changes across all tables
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
    } catch {
      // Silently handle — count will be 0
    }
  }, [isSyncing, lastSynced]);

  const handleSyncPress = async () => {
    if (isSyncing) return;
    useSyncStore.getState().setSyncing(true);
    try {
      await performSync('manual');
    } catch {
      // Silently handle — sync is best-effort from badge
    }
  };

  let badgeColor = '#2ead4b'; // primary green
  let badgeBg = '#e2f6d5';
  let badgeText = 'Synced';
  let emoji = '🟢';

  if (isSyncing) {
    badgeColor = '#b86700'; // warning deep
    badgeBg = '#fffbeb';
    badgeText = 'Syncing...';
    emoji = '🟡';
  } else if (lastError) {
    badgeColor = '#a7000d'; // negative darkest
    badgeBg = '#fef2f2';
    badgeText = 'Sync error (Tap)';
    emoji = '🔴';
  } else if (pendingCount > 0) {
    badgeColor = '#b86700'; // warning deep
    badgeBg = '#fffbeb';
    badgeText = `${pendingCount} pending`;
    emoji = '🟡';
  } else {
    // Normal synced state
    if (lastSynced) {
      const diffSec = Math.floor((Date.now() - new Date(lastSynced).getTime()) / 1000);
      if (diffSec < 60) {
        badgeText = 'Synced just now';
      } else if (diffSec < 3600) {
        badgeText = `Synced ${Math.floor(diffSec / 60)}m ago`;
      } else {
        badgeText = 'Synced';
      }
    } else {
      badgeText = 'Never synced';
    }
  }

  // Tapping when there's an error or pending changes runs sync. Tapping when synced goes to settings page.
  const isActionable = lastError || pendingCount > 0;

  return (
    <TouchableOpacity 
      onPress={isActionable ? handleSyncPress : () => router.push('/settings/sync')}
      style={[styles.badge, { borderColor: badgeColor, backgroundColor: badgeBg }]}
      activeOpacity={0.8}
      accessibilityLabel={`Sync Status: ${badgeText}`}
      accessibilityRole="button"
      accessibilityHint={isActionable ? "Tap to synchronize records with the server" : "Tap to open sync settings"}
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color="#0e0f0c" style={{ marginRight: 4 }} />
      ) : (
        <Text style={styles.emoji}>{emoji}</Text>
      )}
      <Text style={[styles.text, { color: badgeColor }]}>{badgeText}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: '#0e0f0c',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emoji: {
    fontSize: 10,
    marginRight: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
