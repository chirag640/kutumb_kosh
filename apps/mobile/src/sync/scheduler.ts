import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { performSync } from './engine';
import { db } from '../db';

const EOD_SYNC_TASK = 'KK_EOD_SYNC';

TaskManager.defineTask(EOD_SYNC_TASK, async () => {
  try {
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
