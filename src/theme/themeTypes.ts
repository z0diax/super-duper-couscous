export type AppearanceMode = 'system' | 'light' | 'dark';
export type ResolvedAppearance = 'light' | 'dark';
export type SystemThemeId = 'classic' | 'valentine' | 'womens-month' | 'amihan-bloom' | 'winter' | 'chinese-new-year' | 'hallo-christmas' | 'government' | 'festive' | 'rainy-season' | 'weather-sync';
export type ThemeEffectId = Exclude<SystemThemeId, 'classic' | 'government' | 'weather-sync'>;
export const WEATHER_THEMES = ['sunny','cloudy','windy','rainy','thunderstorm','winter'] as const;
export type WeatherTheme = typeof WEATHER_THEMES[number];
export const isWeatherTheme = (value: unknown): value is WeatherTheme => typeof value === 'string' && (WEATHER_THEMES as readonly string[]).includes(value);
