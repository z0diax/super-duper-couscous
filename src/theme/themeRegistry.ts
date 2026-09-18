import type { SystemThemeId, ThemeEffectId } from './themeTypes';

export type SystemThemeDefinition = {
  id: SystemThemeId;
  name: string;
  description: string;
  enabled: boolean;
  category: 'standard' | 'seasonal' | 'institutional';
  preview: { primary: string; secondary: string; surface: string };
  effectId: ThemeEffectId | null;
};

export const SYSTEM_THEMES: Record<SystemThemeId, SystemThemeDefinition> = {
  classic: { id: 'classic', name: 'Classic', description: 'Standard blue and slate HRMDO interface.', enabled: true, category: 'standard', preview: { primary: '#2563eb', secondary: '#0f172a', surface: '#eff6ff' }, effectId: null },
  valentine: { id: 'valentine', name: 'Valentine', description: 'Roses, love letters, ribbons, and romantic seasonal accents.', enabled: true, category: 'seasonal', preview: { primary: '#be185d', secondary: '#4c0519', surface: '#fff1f2' }, effectId: 'valentine' },
  'womens-month': { id: 'womens-month', name: "National Women's Month", description: 'Professional violet and lavender accents.', enabled: true, category: 'seasonal', preview: { primary: '#7c3aed', secondary: '#2e1065', surface: '#f5f3ff' }, effectId: 'womens-month' },
  'amihan-bloom': { id: 'amihan-bloom', name: 'Amihan Bloom', description: 'Fresh teal and tropical green accents.', enabled: true, category: 'seasonal', preview: { primary: '#0f766e', secondary: '#042f2e', surface: '#f0fdfa' }, effectId: 'amihan-bloom' },
  winter: { id: 'winter', name: 'Winter', description: 'Cool navy and icy blue accents.', enabled: true, category: 'seasonal', preview: { primary: '#0369a1', secondary: '#0c2748', surface: '#f0f9ff' }, effectId: 'winter' },
  'chinese-new-year': { id: 'chinese-new-year', name: 'Chinese New Year', description: 'Deep red with restrained gold highlights.', enabled: true, category: 'seasonal', preview: { primary: '#b91c1c', secondary: '#450a0a', surface: '#fef2f2' }, effectId: 'chinese-new-year' },
  'hallo-christmas': { id: 'hallo-christmas', name: 'Hallo-Christmas', description: 'Evergreen with warm seasonal accents.', enabled: true, category: 'seasonal', preview: { primary: '#15803d', secondary: '#052e16', surface: '#f0fdf4' }, effectId: 'hallo-christmas' },
  government: { id: 'government', name: 'Government', description: 'Formal navy, royal blue, and gold.', enabled: true, category: 'institutional', preview: { primary: '#1d4ed8', secondary: '#0a2342', surface: '#eff6ff' }, effectId: null },
  festive: { id: 'festive', name: 'Festive', description: 'Vibrant celebratory accents on a professional base.', enabled: true, category: 'seasonal', preview: { primary: '#7e22ce', secondary: '#2e1065', surface: '#faf5ff' }, effectId: 'festive' },
  'rainy-season': { id: 'rainy-season', name: 'Rainy Season', description: 'Cool storm blue and teal accents.', enabled: true, category: 'seasonal', preview: { primary: '#0e7490', secondary: '#172554', surface: '#ecfeff' }, effectId: 'rainy-season' },
  'weather-sync': { id: 'weather-sync', name: 'Weather Sync', description: 'Automatically adapts to current weather at a configured location.', enabled: true, category: 'standard', preview: { primary: '#0284c7', secondary: '#164e63', surface: '#ecfeff' }, effectId: null },
};

export const DEFAULT_SYSTEM_THEME: SystemThemeId = 'classic';
export const isSystemThemeId = (value: unknown): value is SystemThemeId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYSTEM_THEMES, value) && SYSTEM_THEMES[value as SystemThemeId].enabled;
