import { useTheme } from './ThemeProvider';
import { SYSTEM_THEMES } from './themeRegistry';
import { WEATHER_EFFECTS } from './effects/effectDefinitions';

/** Resolve the existing effect registry, including weather that is not ready yet. */
export const useThemeEffect = () => {
  const { systemTheme, effectiveWeatherTheme, effectsEnabled } = useTheme();
  const effectId = systemTheme === 'weather-sync' && effectiveWeatherTheme
    ? WEATHER_EFFECTS[effectiveWeatherTheme]
    : SYSTEM_THEMES[systemTheme].effectId;
  return { effectId, effectsEnabled };
};
