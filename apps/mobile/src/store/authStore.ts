import { create } from 'zustand';
import { type CryptoKey } from '../crypto';

interface AuthState {
  cryptoKey: CryptoKey | null;           // in memory ONLY — never persisted
  isUnlocked: boolean;
  email: string | null;
  setKey: (key: CryptoKey) => void;
  lock: () => void;
  setEmail: (email: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  cryptoKey: null,
  isUnlocked: false,
  email: null,
  setKey: (key) => set({ cryptoKey: key, isUnlocked: true }),
  lock: () => set({ cryptoKey: null, isUnlocked: false }),  // clears key from memory
  setEmail: (email) => set({ email }),
}));
