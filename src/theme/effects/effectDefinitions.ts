import type { ThemeEffectId, WeatherTheme } from '../themeTypes';

export type WeatherEffectId = `weather-${WeatherTheme}`;
export type VisualEffectId = ThemeEffectId | WeatherEffectId;

export type EffectMotion = 'fall' | 'float' | 'drift';
export type EffectParticle = {
  id: string;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  opacity: number;
  desktopOnly: boolean;
  tone: number;
};
export type EffectDefinition = {
  id: VisualEffectId;
  kind: 'heart' | 'sparkle' | 'leaf' | 'snow' | 'fleck' | 'star' | 'confetti' | 'rain' | 'mote' | 'cloud' | 'wind' | 'storm';
  motion: EffectMotion;
  particles: EffectParticle[];
};

const seedFor = (value: string) => Array.from(value).reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
const randomFactory = (seed: number) => {
  let state = seed || 1;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const createDefinition = (
  id: VisualEffectId,
  kind: EffectDefinition['kind'],
  motion: EffectMotion,
  count: number,
  mobileCount: number,
  edgeBiased: boolean,
  duration: [number, number],
): EffectDefinition => {
  const random = randomFactory(seedFor(id));
  const particles = Array.from({ length: count }, (_, index): EffectParticle => {
    const edge = index % 2 === 0 ? 2 + random() * 18 : 80 + random() * 18;
    const x = edgeBiased ? edge : 2 + random() * 96;
    const seconds = duration[0] + random() * (duration[1] - duration[0]);
    return {
      id: `${id}-${index}`,
      x,
      y: 5 + random() * 90,
      size: kind === 'rain' ? 10 + random() * 13 : 4 + random() * (kind === 'snow' ? 6 : 8),
      duration: seconds,
      delay: -(random() * seconds),
      drift: -28 + random() * 56,
      opacity: 0.14 + random() * 0.24,
      desktopOnly: index >= mobileCount,
      tone: index % 3,
    };
  });
  return { id, kind, motion, particles };
};

export const THEME_EFFECTS: Record<VisualEffectId, EffectDefinition> = {
  valentine: createDefinition('valentine', 'heart', 'fall', 12, 7, false, [11, 17]),
  'womens-month': createDefinition('womens-month', 'sparkle', 'float', 12, 7, true, [10, 17]),
  'amihan-bloom': createDefinition('amihan-bloom', 'leaf', 'float', 13, 7, true, [11, 18]),
  winter: createDefinition('winter', 'snow', 'fall', 30, 12, false, [9, 16]),
  'chinese-new-year': createDefinition('chinese-new-year', 'fleck', 'fall', 14, 8, true, [10, 17]),
  'hallo-christmas': createDefinition('hallo-christmas', 'star', 'fall', 14, 8, true, [11, 18]),
  festive: createDefinition('festive', 'confetti', 'fall', 16, 9, true, [10, 17]),
  'rainy-season': createDefinition('rainy-season', 'rain', 'fall', 30, 14, false, [3.2, 5]),
  'weather-sunny': createDefinition('weather-sunny', 'mote', 'float', 8, 5, true, [14, 20]),
  'weather-cloudy': createDefinition('weather-cloudy', 'cloud', 'drift', 7, 4, true, [16, 24]),
  'weather-windy': createDefinition('weather-windy', 'wind', 'drift', 11, 6, false, [8, 14]),
  'weather-rainy': createDefinition('weather-rainy', 'rain', 'fall', 30, 14, false, [3.2, 5]),
  'weather-thunderstorm': createDefinition('weather-thunderstorm', 'storm', 'fall', 32, 14, false, [2.8, 4.6]),
  'weather-winter': createDefinition('weather-winter', 'snow', 'fall', 30, 12, false, [9, 16]),
};

export const WEATHER_EFFECTS: Record<WeatherTheme, WeatherEffectId> = {
  sunny:'weather-sunny', cloudy:'weather-cloudy', windy:'weather-windy', rainy:'weather-rainy', thunderstorm:'weather-thunderstorm', winter:'weather-winter',
};
