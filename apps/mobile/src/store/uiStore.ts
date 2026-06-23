import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UIState {
  privacyMode: boolean;
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'gu' | 'hi';
  simpleMode: boolean;
  togglePrivacy: () => void;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  setLanguage: (l: 'en' | 'gu' | 'hi') => void;
  setSimpleMode: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      privacyMode: false,
      theme: 'system',
      language: 'en',
      simpleMode: false,
      togglePrivacy: () => set(s => ({ privacyMode: !s.privacyMode })),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSimpleMode: (simpleMode) => set({ simpleMode }),
    }),
    { name: 'kk-ui', storage: createJSONStorage(() => AsyncStorage) }
  )
);
