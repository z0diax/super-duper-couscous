import type { SystemThemeId } from './themeTypes';

export type SystemThemeDefinition = {
  id: SystemThemeId;
  name: string;
  description: string;
  enabled: boolean;
};

export const SYSTEM_THEMES: Record<SystemThemeId, SystemThemeDefinition> = {
  classic: { id: 'classic', name: 'Classic', description: 'Standard HRMDO interface', enabled: true },
};

export const DEFAULT_SYSTEM_THEME: SystemThemeId = 'classic';
export const isSystemThemeId = (value: unknown): value is SystemThemeId => typeof value === 'string' && value in SYSTEM_THEMES;
