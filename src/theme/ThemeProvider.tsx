import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../services/http';
import {
  activateWeatherSync as activateWeatherSyncRequest,
  getSystemTheme,
  refreshWeatherSync as refreshWeatherSyncRequest,
  saveSystemTheme,
  type SystemThemeSetting,
} from '../services/themeApi';
import { DEFAULT_SYSTEM_THEME, isSystemThemeId } from './themeRegistry';
import { isWeatherTheme, type AppearanceMode, type ResolvedAppearance, type SystemThemeId, type WeatherTheme } from './themeTypes';

const APPEARANCE_STORAGE_KEY = 'hrmdo-dts.appearance.mode';
const EFFECTS_STORAGE_KEY = 'hrmdo-dts.appearance.effects-enabled';
const THEME_CACHE_KEY = 'hrmdo-dts.theme-state.v1';
const THEME_CHANNEL = 'hrmdo-theme';
const NORMAL_SYNC_DELAY = 60_000;
const FAILURE_DELAYS = [60_000, 120_000, 300_000];
const validModes: AppearanceMode[] = ['system', 'light', 'dark'];

type SafeThemeState = {
  theme: SystemThemeId;
  effectiveWeatherTheme: WeatherTheme | null;
  revision: number;
  updatedAt: string | null;
  weatherUpdatedAt: string | null;
};

const fallbackThemeState = (): SafeThemeState => ({
  theme: DEFAULT_SYSTEM_THEME,
  effectiveWeatherTheme: null,
  revision: 0,
  updatedAt: null,
  weatherUpdatedAt: null,
});

const normalizeSafeThemeState = (value: unknown): SafeThemeState | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SafeThemeState>;
  if (!isSystemThemeId(candidate.theme)) return null;
  const weather = candidate.theme === 'weather-sync' && isWeatherTheme(candidate.effectiveWeatherTheme)
    ? candidate.effectiveWeatherTheme
    : null;
  const revision = Number(candidate.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  return {
    theme: candidate.theme,
    effectiveWeatherTheme: weather,
    revision,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
    weatherUpdatedAt: typeof candidate.weatherUpdatedAt === 'string' ? candidate.weatherUpdatedAt : null,
  };
};

const readCachedThemeState = (): SafeThemeState => {
  if (typeof window === 'undefined') return fallbackThemeState();
  try {
    const raw = window.localStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return fallbackThemeState();
    const cached = normalizeSafeThemeState(JSON.parse(raw));
    if (cached) return cached;
    window.localStorage.removeItem(THEME_CACHE_KEY);
  } catch { /* Cached presentation state is optional. */ }
  return fallbackThemeState();
};

const readMode = (): AppearanceMode => {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(APPEARANCE_STORAGE_KEY) as AppearanceMode | null;
  if (value && validModes.includes(value)) return value;
  if (value) try { window.localStorage.removeItem(APPEARANCE_STORAGE_KEY); } catch { /* Preference storage is optional. */ }
  return 'system';
};

const readEffectsEnabled = () => {
  if (typeof window === 'undefined') return true;
  const value = window.localStorage.getItem(EFFECTS_STORAGE_KEY);
  if (value === 'true' || value === 'false') return value === 'true';
  if (value) try { window.localStorage.removeItem(EFFECTS_STORAGE_KEY); } catch { /* Preference storage is optional. */ }
  return true;
};

const systemAppearance = (): ResolvedAppearance =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

type ThemeContextValue = {
  appearanceMode: AppearanceMode;
  resolvedAppearance: ResolvedAppearance;
  systemTheme: SystemThemeId;
  effectiveWeatherTheme: WeatherTheme | null;
  systemThemeSetting: SystemThemeSetting | null;
  effectsEnabled: boolean;
  setAppearanceMode: (mode: AppearanceMode) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  refreshSystemTheme: () => Promise<void>;
  updateSystemTheme: (theme: SystemThemeId) => Promise<SystemThemeSetting>;
  activateWeatherSync: (location: string) => Promise<SystemThemeSetting>;
  refreshWeatherSync: () => Promise<SystemThemeSetting>;
};

type SyncResult = 'success' | 'failed' | 'unauthorized' | 'offline' | 'aborted';
type ApplyOptions = { source: 'server' | 'broadcast'; broadcast?: boolean; hydrateMetadata?: boolean; replaceMetadata?: boolean };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [initialTheme] = useState(readCachedThemeState);
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(readMode);
  const [system, setSystem] = useState<ResolvedAppearance>(systemAppearance);
  const [systemTheme, setSystemTheme] = useState<SystemThemeId>(initialTheme.theme);
  const [effectiveWeatherTheme, setEffectiveWeatherTheme] = useState<WeatherTheme | null>(initialTheme.effectiveWeatherTheme);
  const [systemThemeSetting, setSystemThemeSetting] = useState<SystemThemeSetting | null>(null);
  const [effectsEnabled, setEffectsEnabledState] = useState(readEffectsEnabled);
  const resolvedAppearance = appearanceMode === 'system' ? system : appearanceMode;

  const appliedThemeRef = useRef<SafeThemeState>(initialTheme);
  const hasServerStateRef = useRef(false);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const inFlightRef = useRef<Promise<SyncResult> | null>(null);
  const syncControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const authBlockedRef = useRef(false);

  const persistSafeTheme = useCallback((safe: SafeThemeState) => {
    try { window.localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(safe)); }
    catch { /* Cached presentation state is optional. */ }
  }, []);

  const applyThemeState = useCallback((setting: SystemThemeSetting | SafeThemeState, options: ApplyOptions) => {
    const safe = normalizeSafeThemeState(setting);
    if (!safe) return false;
    const current = appliedThemeRef.current;
    const firstAuthoritativeResponse = options.source === 'server' && !hasServerStateRef.current;
    if (!firstAuthoritativeResponse && safe.revision < current.revision) return false;
    const visualChanged = safe.theme !== current.theme || safe.effectiveWeatherTheme !== current.effectiveWeatherTheme;
    const revisionChanged = safe.revision !== current.revision;
    const changed = revisionChanged || visualChanged;

    if (options.source === 'server') hasServerStateRef.current = true;
    if (!changed) {
      if ((options.hydrateMetadata || options.replaceMetadata) && 'location' in setting) {
        setSystemThemeSetting(previous => options.replaceMetadata || !previous ? setting as SystemThemeSetting : previous);
      }
      return false;
    }

    appliedThemeRef.current = safe;
    if (safe.theme !== current.theme) setSystemTheme(safe.theme);
    if (safe.effectiveWeatherTheme !== current.effectiveWeatherTheme) setEffectiveWeatherTheme(safe.effectiveWeatherTheme);
    if ('location' in setting) setSystemThemeSetting(setting as SystemThemeSetting);
    else setSystemThemeSetting(previous => previous ? { ...previous, ...safe } : previous);
    persistSafeTheme(safe);
    if (options.broadcast !== false) broadcastRef.current?.postMessage(safe);
    return true;
  }, [persistSafeTheme]);

  const abortThemeSync = useCallback(() => {
    requestSequenceRef.current += 1;
    syncControllerRef.current?.abort();
    syncControllerRef.current = null;
    inFlightRef.current = null;
  }, []);

  const syncThemeState = useCallback((): Promise<SyncResult> => {
    if (authBlockedRef.current) return Promise.resolve('unauthorized');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve('offline');
    if (inFlightRef.current) return inFlightRef.current;

    const controller = new AbortController();
    const sequence = ++requestSequenceRef.current;
    syncControllerRef.current = controller;
    let requestPromise: Promise<SyncResult>;
    requestPromise = (async () => {
      try {
        const setting = await getSystemTheme(controller.signal);
        if (controller.signal.aborted || sequence !== requestSequenceRef.current) return 'aborted';
        authBlockedRef.current = false;
        applyThemeState(setting, { source: 'server', broadcast: true, hydrateMetadata: true });
        return 'success';
      } catch (error) {
        if (controller.signal.aborted) return 'aborted';
        if (error instanceof ApiError && error.status === 401) {
          authBlockedRef.current = true;
          return 'unauthorized';
        }
        return 'failed';
      } finally {
        if (inFlightRef.current === requestPromise) inFlightRef.current = null;
        if (syncControllerRef.current === controller) syncControllerRef.current = null;
      }
    })();
    inFlightRef.current = requestPromise;
    return requestPromise;
  }, [applyThemeState]);

  const refreshSystemTheme = useCallback(async () => { await syncThemeState(); }, [syncThemeState]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setSystem(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.appearance !== resolvedAppearance) root.dataset.appearance = resolvedAppearance;
  }, [resolvedAppearance]);
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.systemTheme !== systemTheme) root.dataset.systemTheme = systemTheme;
  }, [systemTheme]);
  useEffect(() => {
    const root = document.documentElement;
    if (systemTheme === 'weather-sync' && effectiveWeatherTheme) {
      if (root.dataset.weatherTheme !== effectiveWeatherTheme) root.dataset.weatherTheme = effectiveWeatherTheme;
    } else if (root.dataset.weatherTheme) delete root.dataset.weatherTheme;
  }, [systemTheme, effectiveWeatherTheme]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(THEME_CHANNEL);
    broadcastRef.current = channel;
    channel.onmessage = event => applyThemeState(event.data, { source: 'broadcast', broadcast: false });
    return () => {
      if (broadcastRef.current === channel) broadcastRef.current = null;
      channel.close();
    };
  }, [applyThemeState]);

  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;
    let failures = 0;
    const clearTimer = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
    const schedule = (delay: number) => {
      clearTimer();
      if (stopped || authBlockedRef.current || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      timer = window.setTimeout(() => { void run(); }, delay);
    };
    const run = async () => {
      clearTimer();
      if (stopped || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      const result = await syncThemeState();
      if (stopped) return;
      if (result === 'success') failures = 0;
      else if (result === 'failed') failures += 1;
      if (result === 'unauthorized' || result === 'offline') return;
      const delay = result === 'failed'
        ? FAILURE_DELAYS[Math.min(failures - 1, FAILURE_DELAYS.length - 1)]
        : NORMAL_SYNC_DELAY;
      schedule(delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clearTimer();
      else void run();
    };
    const onOnline = () => { failures = 0; void run(); };
    const onOffline = () => clearTimer();
    const onAuthChanged = (event: Event) => {
      abortThemeSync();
      if ((event as CustomEvent<{ userId?: string | null }>).detail?.userId === null) {
        authBlockedRef.current = true;
        clearTimer();
        return;
      }
      authBlockedRef.current = false;
      hasServerStateRef.current = false;
      failures = 0;
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('hrmdo:auth-changed', onAuthChanged);
    void run();
    return () => {
      stopped = true;
      clearTimer();
      abortThemeSync();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('hrmdo:auth-changed', onAuthChanged);
    };
  }, [abortThemeSync, syncThemeState]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY) {
        const next = event.newValue as AppearanceMode | null;
        setAppearanceModeState(next && validModes.includes(next) ? next : 'system');
      }
      if (event.key === EFFECTS_STORAGE_KEY) setEffectsEnabledState(event.newValue !== 'false');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    const next = validModes.includes(mode) ? mode : 'system';
    setAppearanceModeState(next);
    try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next); } catch { /* Preference storage is optional. */ }
  }, []);
  const setEffectsEnabled = useCallback((enabled: boolean) => {
    setEffectsEnabledState(enabled);
    try { window.localStorage.setItem(EFFECTS_STORAGE_KEY, String(enabled)); } catch { /* Preference storage is optional. */ }
  }, []);

  const updateSystemTheme = useCallback(async (theme: SystemThemeId) => {
    if (!isSystemThemeId(theme)) throw new Error('Invalid system theme.');
    abortThemeSync();
    const setting = await saveSystemTheme(theme);
    applyThemeState(setting, { source: 'server', broadcast: true, hydrateMetadata: true, replaceMetadata: true });
    return setting;
  }, [abortThemeSync, applyThemeState]);
  const activateWeatherSync = useCallback(async (location: string) => {
    abortThemeSync();
    const setting = await activateWeatherSyncRequest(location);
    applyThemeState(setting, { source: 'server', broadcast: true, hydrateMetadata: true, replaceMetadata: true });
    return setting;
  }, [abortThemeSync, applyThemeState]);
  const refreshWeatherSync = useCallback(async () => {
    abortThemeSync();
    const setting = await refreshWeatherSyncRequest();
    applyThemeState(setting, { source: 'server', broadcast: true, hydrateMetadata: true, replaceMetadata: true });
    return setting;
  }, [abortThemeSync, applyThemeState]);

  const value = useMemo(() => ({
    appearanceMode, resolvedAppearance, systemTheme, effectiveWeatherTheme, systemThemeSetting, effectsEnabled,
    setAppearanceMode, setEffectsEnabled, refreshSystemTheme, updateSystemTheme, activateWeatherSync, refreshWeatherSync,
  }), [appearanceMode, resolvedAppearance, systemTheme, effectiveWeatherTheme, systemThemeSetting, effectsEnabled, setAppearanceMode, setEffectsEnabled, refreshSystemTheme, updateSystemTheme, activateWeatherSync, refreshWeatherSync]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
};
