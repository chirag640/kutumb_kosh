import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from '../utils/notifications';
import { performSync } from './engine';
import { db } from '../db';

const EOD_SYNC_TASK = 'KK_EOD_SYNC';

export async function scheduleAlertsIfNeeded() {
  if (Platform.OS === 'web') return;
  try {
    const scheduledList = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduledList.map(n => n.identifier));

    const now = new Date();
    const nowMs = now.getTime();

    // Helper to format date display safely
    const formatDateStr = (dStr: string) => {
      try {
        return new Date(dStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return dStr;
      }
    };

    // 1. LIC Policies due date checks
    const licPolicies = db.getAllSync(
      `SELECT local_id, due_date FROM lic_policies WHERE deleted_at IS NULL AND due_date IS NOT NULL`
    ) as { local_id: string; due_date: string }[];

    for (const policy of licPolicies) {
      const dueTime = new Date(policy.due_date).getTime();
      if (isNaN(dueTime)) continue;
      const diffDays = Math.ceil((dueTime - nowMs) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 30) {
        // Schedule alert 7 days before
        const trigger7 = new Date(dueTime - 7 * 24 * 60 * 60 * 1000);
        trigger7.setHours(10, 0, 0, 0);
        const ident7 = `lic_7_${policy.local_id}`;
        if (trigger7.getTime() > nowMs && !scheduledIds.has(ident7)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident7,
            content: {
              title: 'LIC Policy Payment Due soon',
              body: `An LIC policy payment is due on ${formatDateStr(policy.due_date)}. Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger7,
            },
          });
        }

        // Schedule alert 1 day before
        const trigger1 = new Date(dueTime - 1 * 24 * 60 * 60 * 1000);
        trigger1.setHours(10, 0, 0, 0);
        const ident1 = `lic_1_${policy.local_id}`;
        if (trigger1.getTime() > nowMs && !scheduledIds.has(ident1)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident1,
            content: {
              title: 'LIC Policy Payment Due Tomorrow',
              body: `An LIC policy payment is due tomorrow (${formatDateStr(policy.due_date)}). Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger1,
            },
          });
        }
      }
    }

    // 2. Insurance Policies renewal checks
    const insurancePolicies = db.getAllSync(
      `SELECT local_id, renewal_date FROM insurance_policies WHERE deleted_at IS NULL AND renewal_date IS NOT NULL`
    ) as { local_id: string; renewal_date: string }[];

    for (const policy of insurancePolicies) {
      const renewalTime = new Date(policy.renewal_date).getTime();
      if (isNaN(renewalTime)) continue;
      const diffDays = Math.ceil((renewalTime - nowMs) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 30) {
        // Schedule alert 7 days before
        const trigger7 = new Date(renewalTime - 7 * 24 * 60 * 60 * 1000);
        trigger7.setHours(10, 0, 0, 0);
        const ident7 = `ins_7_${policy.local_id}`;
        if (trigger7.getTime() > nowMs && !scheduledIds.has(ident7)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident7,
            content: {
              title: 'Insurance Renewal Due soon',
              body: `An insurance policy renewal is due on ${formatDateStr(policy.renewal_date)}. Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger7,
            },
          });
        }

        // Schedule alert 1 day before
        const trigger1 = new Date(renewalTime - 1 * 24 * 60 * 60 * 1000);
        trigger1.setHours(10, 0, 0, 0);
        const ident1 = `ins_1_${policy.local_id}`;
        if (trigger1.getTime() > nowMs && !scheduledIds.has(ident1)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident1,
            content: {
              title: 'Insurance Renewal Tomorrow',
              body: `An insurance policy renewal is due tomorrow (${formatDateStr(policy.renewal_date)}). Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger1,
            },
          });
        }
      }
    }

    // 3. Document expiry checks
    const documents = db.getAllSync(
      `SELECT local_id, expiry_date FROM documents WHERE deleted_at IS NULL AND expiry_date IS NOT NULL`
    ) as { local_id: string; expiry_date: string }[];

    for (const doc of documents) {
      const expiryTime = new Date(doc.expiry_date).getTime();
      if (isNaN(expiryTime)) continue;
      const diffDays = Math.ceil((expiryTime - nowMs) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 30) {
        // Schedule alert 7 days before
        const trigger7 = new Date(expiryTime - 7 * 24 * 60 * 60 * 1000);
        trigger7.setHours(10, 0, 0, 0);
        const ident7 = `doc_7_${doc.local_id}`;
        if (trigger7.getTime() > nowMs && !scheduledIds.has(ident7)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident7,
            content: {
              title: 'Document Expiring soon',
              body: `A document is expiring on ${formatDateStr(doc.expiry_date)}. Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger7,
            },
          });
        }

        // Schedule alert 1 day before
        const trigger1 = new Date(expiryTime - 1 * 24 * 60 * 60 * 1000);
        trigger1.setHours(10, 0, 0, 0);
        const ident1 = `doc_1_${doc.local_id}`;
        if (trigger1.getTime() > nowMs && !scheduledIds.has(ident1)) {
          await Notifications.scheduleNotificationAsync({
            identifier: ident1,
            content: {
              title: 'Document Expiring Tomorrow',
              body: `A document is expiring tomorrow (${formatDateStr(doc.expiry_date)}). Open the app to view.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger1,
            },
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to run scheduleAlertsIfNeeded:', err);
  }
}

TaskManager.defineTask(EOD_SYNC_TASK, async () => {
  try {
    // Perform local notification checks and schedules daily
    await scheduleAlertsIfNeeded();

    const todayStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    
    // Check if there was any successful sync today
    const lastSync = db.getFirstSync(
      `SELECT synced_at FROM sync_log 
       WHERE error IS NULL 
       ORDER BY id DESC LIMIT 1`
    ) as { synced_at: string } | null;

    if (lastSync) {
      const lastSyncDate = lastSync.synced_at.split('T')[0];
      if (lastSyncDate === todayStr) {
        // Already synced today, no need to run again
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
    }

    // Run the sync since it hasn't run today
    const result = await performSync('scheduled');
    return result.success
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (error) {
    console.error('Error during scheduled background sync task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerEODSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('Background fetch is disabled or restricted on this device');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(EOD_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(EOD_SYNC_TASK, {
        minimumInterval: 15 * 60, // check every 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('Registered background sync task successfully');
    }
  } catch (error) {
    console.error('Failed to register background sync task:', error);
  }
}
