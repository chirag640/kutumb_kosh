import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FormDraftState {
  drafts: Record<string, any>;
  setDraft: (formKey: string, data: any) => void;
  clearDraft: (formKey: string) => void;
}

export const useFormDraftStore = create<FormDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (formKey, data) => set((s) => ({
        drafts: {
          ...s.drafts,
          [formKey]: {
            ...s.drafts[formKey],
            ...data
          }
        }
      })),
      clearDraft: (formKey) => set((s) => {
        const nextDrafts = { ...s.drafts };
        delete nextDrafts[formKey];
        return { drafts: nextDrafts };
      }),
    }),
    {
      name: 'kk-form-drafts',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
