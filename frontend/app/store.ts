// Re-exports from utils/store - this file exists to satisfy internal imports
// The actual store is at /utils/store.ts (outside app/ to avoid expo-router treating it as a route)
export * from '../utils/store';

// Dummy default export to prevent expo-router warnings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function _StoreModule(): null { return null; }
