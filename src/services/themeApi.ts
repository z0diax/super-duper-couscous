import { request } from './http';
import type { SystemThemeId } from '../theme/themeTypes';

export type SystemThemeSetting = {
  theme: SystemThemeId;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

export const getSystemTheme = (): Promise<SystemThemeSetting> => request('settings.php');
export const saveSystemTheme = (theme: SystemThemeId): Promise<SystemThemeSetting> => request('settings.php', { method: 'PUT', body: JSON.stringify({ theme }) });
