import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SyncState {
  lastSynced: string | null;
  isSyncing: boolean;
  lastError: string | null;
  pendingCount: number;
  setSyncing: (v: boolean) => void;
  setLastSynced: (date: string) => void;
  setLastError: (err: string | null) => void;
  setPendingCount: (n: number) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      lastSynced: null,
      isSyncing: false,
      lastError: null,
      pendingCount: 0,
      setSyncing: (v) => set({ isSyncing: v }),
      setLastSynced: (date) => set({ lastSynced: date, lastError: null }),
      setLastError: (err) => set({ lastError: err, isSyncing: false }),
      setPendingCount: (n) => set({ pendingCount: n }),
    }),
    { name: 'kk-sync', storage: createJSONStorage(() => AsyncStorage) }
  )
);
