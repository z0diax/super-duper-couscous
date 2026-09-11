import { useEffect, useState } from 'react';

const PREFIX = 'hrmdo-dts.workspace.v1';

function keyFor(userId: string, key: string) {
  return `${PREFIX}.${userId}.${key}`;
}

export function readWorkspaceValue<T>(userId: string, key: string, fallback: T): T {
  if (!userId || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(keyFor(userId, key));
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeWorkspaceValue<T>(userId: string, key: string, value: T) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(userId, key), JSON.stringify(value));
  } catch {
    // Workspace restoration is a convenience. Storage restrictions must not block work.
  }
}

export function useWorkspaceState<T>(userId: string, key: string, fallback: T) {
  const storageKey = userId ? keyFor(userId, key) : '';
  const [value, setValue] = useState<T>(() => readWorkspaceValue(userId, key, fallback));
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);

  useEffect(() => {
    setValue(readWorkspaceValue(userId, key, fallback));
    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey) return;
    writeWorkspaceValue(userId, key, value);
  }, [storageKey, loadedStorageKey, value]);

  return [value, setValue] as const;
}
