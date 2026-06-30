import { useEffect } from 'react';
import { useFormDraftStore } from '../store/formDraftStore';

/**
 * A custom hook to automatically populate and save form drafts.
 *
 * @param formKey Unique identifier for the form (e.g. 'income', 'member')
 * @param fields Object mapping draft field names to their state setter functions
 * @param activeCondition Boolean condition (e.g. !editingId) under which draft autosaving is active
 */
export function useFormDraft(
  formKey: string,
  fields: Record<string, (val: any) => void>,
  activeCondition: boolean = true
) {
  const { setDraft } = useFormDraftStore();

  useEffect(() => {
    if (activeCondition) {
      const draft = useFormDraftStore.getState().drafts[formKey];
      if (draft) {
        Object.entries(fields).forEach(([key, setter]) => {
          if (draft[key] !== undefined) {
            setter(draft[key]);
          }
        });
      }
    }
  }, [formKey, activeCondition]);

  const updateDraftField = (fieldName: string, val: any) => {
    if (activeCondition) {
      setDraft(formKey, { [fieldName]: val });
    }
  };

  return { updateDraftField };
}
