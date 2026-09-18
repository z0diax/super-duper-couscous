import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppearanceMode, ResolvedAppearance, SystemThemeId } from './themeTypes';
import { DEFAULT_SYSTEM_THEME, isSystemThemeId } from './themeRegistry';
import { getSystemTheme, saveSystemTheme, type SystemThemeSetting } from '../services/themeApi';

const STORAGE_KEY = 'hrmdo-dts.appearance.mode';
const validModes: AppearanceMode[] = ['system', 'light', 'dark'];
const readMode = (): AppearanceMode => {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(STORAGE_KEY) as AppearanceMode | null;
  return value && validModes.includes(value) ? value : 'system';
};
const systemAppearance = (): ResolvedAppearance => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

type ThemeContextValue = {
  appearanceMode: AppearanceMode;
  resolvedAppearance: ResolvedAppearance;
  systemTheme: SystemThemeId;
  systemThemeSetting: SystemThemeSetting | null;
  setAppearanceMode: (mode: AppearanceMode) => void;
  refreshSystemTheme: () => Promise<void>;
  updateSystemTheme: (theme: SystemThemeId) => Promise<SystemThemeSetting>;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(readMode);
  const [system, setSystem] = useState<ResolvedAppearance>(systemAppearance);
  const [systemTheme, setSystemTheme] = useState<SystemThemeId>(DEFAULT_SYSTEM_THEME);
  const [systemThemeSetting, setSystemThemeSetting] = useState<SystemThemeSetting | null>(null);
  const resolvedAppearance = appearanceMode === 'system' ? system : appearanceMode;
  const refreshSystemTheme = useCallback(async () => {
    try {
      const setting = await getSystemTheme();
      if (!isSystemThemeId(setting.theme)) return;
      setSystemTheme(setting.theme); setSystemThemeSetting(setting);
    } catch { setSystemTheme(DEFAULT_SYSTEM_THEME); }
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setSystem(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.appearance = resolvedAppearance;
  }, [resolvedAppearance]);
  useEffect(() => { document.documentElement.dataset.systemTheme = systemTheme; }, [systemTheme]);
  useEffect(() => {
    const refresh = () => { void refreshSystemTheme(); };
    window.addEventListener('hrmdo:auth-changed', refresh);
    void refreshSystemTheme();
    return () => window.removeEventListener('hrmdo:auth-changed', refresh);
  }, [refreshSystemTheme]);
  const setAppearanceMode = (mode: AppearanceMode) => {
    setAppearanceModeState(validModes.includes(mode) ? mode : 'system');
    try { window.localStorage.setItem(STORAGE_KEY, validModes.includes(mode) ? mode : 'system'); } catch { /* preference storage is optional */ }
  };
  const updateSystemTheme = useCallback(async (theme: SystemThemeId) => {
    if (!isSystemThemeId(theme)) throw new Error('Invalid system theme.');
    const setting = await saveSystemTheme(theme);
    if (!isSystemThemeId(setting.theme)) throw new Error('The server returned an invalid system theme.');
    setSystemTheme(setting.theme); setSystemThemeSetting(setting); return setting;
  }, []);
  const value = useMemo(() => ({ appearanceMode, resolvedAppearance, systemTheme, systemThemeSetting, setAppearanceMode, refreshSystemTheme, updateSystemTheme }), [appearanceMode, resolvedAppearance, systemTheme, systemThemeSetting, refreshSystemTheme, updateSystemTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
export const useTheme = () => { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; };
