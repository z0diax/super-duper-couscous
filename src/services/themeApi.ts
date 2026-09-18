import { request } from './http';
import type { SystemThemeId, WeatherTheme } from '../theme/themeTypes';

export type WeatherLocation = { query: string; name: string; latitude: number; longitude: number; timezone: string };
export type WeatherSnapshot = { effectiveTheme: WeatherTheme; code: number; label: string; updatedAt: string | null };

export type SystemThemeSetting = {
  theme: SystemThemeId;
  revision: number;
  effectiveWeatherTheme: WeatherTheme | null;
  location: WeatherLocation | null;
  weather: WeatherSnapshot | null;
  weatherUpdatedAt: string | null;
  weatherStale: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

export const getSystemTheme = (signal?: AbortSignal): Promise<SystemThemeSetting> => request('settings.php', { signal });
export const saveSystemTheme = (theme: SystemThemeId): Promise<SystemThemeSetting> => request('settings.php', { method: 'PUT', body: JSON.stringify({ theme }) });
export type WeatherPreview = { location: WeatherLocation; weather: WeatherSnapshot };
export const previewWeatherLocation = (location: string): Promise<WeatherPreview> => request('weather.php', { method: 'POST', body: JSON.stringify({ action: 'preview', location }) });
export const activateWeatherSync = (location: string): Promise<SystemThemeSetting> => request('weather.php', { method: 'PUT', body: JSON.stringify({ location }) });
export const refreshWeatherSync = (): Promise<SystemThemeSetting> => request('weather.php', { method: 'POST', body: JSON.stringify({ action: 'refresh' }) });
