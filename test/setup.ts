import { vi } from 'vitest';

// Suppress console output in tests by default
// Tests that need console output can restore it with vi.restoreAllMocks()
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
