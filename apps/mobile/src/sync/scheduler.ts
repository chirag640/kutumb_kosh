import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { performSync } from './engine';

const EOD_SYNC_TASK = 'KK_EOD_SYNC';

TaskManager.defineTask(EOD_SYNC_TASK, async () => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Only fire between 23:45 and 23:59
  if (hour === 23 && minute >= 45) {
    const result = await performSync('scheduled');
    return result.success
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.Failed;
  }
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerEODSync(): Promise<void> {
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
