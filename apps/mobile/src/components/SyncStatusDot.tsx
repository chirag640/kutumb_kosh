import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSyncStore } from '../store/syncStore';
import { router } from 'expo-router';

export function SyncStatusDot() {
  const { isSyncing, lastError, pendingCount } = useSyncStore();

  const color = isSyncing ? '#F59E0B' : lastError ? '#EF4444' : pendingCount > 0 ? '#F59E0B' : '#22C55E';

  return (
    <TouchableOpacity onPress={() => router.push('/settings/sync')}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </TouchableOpacity>
  );
}
