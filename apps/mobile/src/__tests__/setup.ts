import { vi } from 'vitest';

// Define global React Native/Expo development flag to prevent ReferenceError: __DEV__ is not defined
(globalThis as any).__DEV__ = true;

// 1. Mock react-native Platform.OS dynamically
export let mockPlatformOS = 'web';
export function setPlatformOS(os: string) {
  mockPlatformOS = os;
}

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
    select: (obj: any) => obj[mockPlatformOS] || obj.default,
  },
}));

// 2. Mock expo-crypto
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn().mockImplementation(async (size: number) => {
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = i + 1; // deterministic non-zero values for test consistency
    }
    return arr;
  }),
  randomUUID: vi.fn().mockReturnValue('12345678-1234-1234-1234-1234567890ab'),
}));

// 3. Mock AsyncStorage
let asyncStorageStore: Record<string, string> = {};
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageStore[key] || null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageStore[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete asyncStorageStore[key];
    }),
    clear: vi.fn(async () => {
      asyncStorageStore = {};
    }),
  },
}));

// 4. Mock SecureStore utils
let secureStoreStore: Record<string, string> = {};
vi.mock('../utils/secureStore', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreStore[key] || null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreStore[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete secureStoreStore[key];
  }),
}));

// 5. Mock expo-background-fetch and expo-task-manager
vi.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: {
    NoData: 1,
    NewData: 2,
    Failed: 3,
  },
  getStatusAsync: vi.fn().mockResolvedValue(1),
  registerTaskAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('expo-task-manager', () => ({
  defineTask: vi.fn(),
  isTaskRegisteredAsync: vi.fn().mockResolvedValue(false),
}));

// Mock expo-sqlite to prevent loading native database dependencies in Node test environment
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn().mockReturnValue({
    execSync: vi.fn(),
    runSync: vi.fn(),
    getAllSync: vi.fn().mockReturnValue([]),
    getFirstSync: vi.fn().mockReturnValue(null),
  }),
}));

// Mock expo to bypass expo winter runtime module loading and prevent ReferenceError: window is not defined or ModuleNotFound
vi.mock('expo', () => ({}));

// 6. Mock notifications
vi.mock('../utils/notifications', () => ({
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  scheduleNotificationAsync: vi.fn().mockResolvedValue('mock-notification-id'),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
}));

// 7. Mock @neondatabase/serverless Client
export const mockNeonQuery = vi.fn().mockResolvedValue({ rows: [] });
export const mockNeonConnect = vi.fn().mockResolvedValue(undefined);
export const mockNeonEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('@neondatabase/serverless', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: mockNeonConnect,
      query: mockNeonQuery,
      end: mockNeonEnd,
    })),
  };
});

// Helper to reset mocks/stores between tests
export function resetTestMocks() {
  asyncStorageStore = {};
  secureStoreStore = {};
  mockNeonQuery.mockReset().mockResolvedValue({ rows: [] });
  mockNeonConnect.mockReset().mockResolvedValue(undefined);
  mockNeonEnd.mockReset().mockResolvedValue(undefined);
}
