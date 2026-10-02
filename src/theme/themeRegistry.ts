import type { SystemThemeId, ThemeEffectId, BrandMessage } from './themeTypes';

export type SystemThemeDefinition = {
  id: SystemThemeId;
  name: string;
  description: string;
  enabled: boolean;
  category: 'standard' | 'seasonal' | 'institutional';
  preview: { primary: string; secondary: string; surface: string };
  effectId: ThemeEffectId | null;
  brandMessage?: BrandMessage;
};

export const SYSTEM_THEMES: Record<SystemThemeId, SystemThemeDefinition> = {
  classic: { id: 'classic', name: 'Classic', description: 'Standard blue and slate HRMDO interface.', enabled: true, category: 'standard', preview: { primary: '#2563eb', secondary: '#0f172a', surface: '#eff6ff' }, effectId: null },
  valentine: { id: 'valentine', name: 'Valentine', description: 'Roses, love letters, ribbons, and romantic seasonal accents.', enabled: true, category: 'seasonal', preview: { primary: '#be185d', secondary: '#4c0519', surface: '#fff1f2' }, effectId: 'valentine', brandMessage: { title: 'Valentine', subtitle: 'Appreciation · Connection · Care' } },
  'womens-month': { id: 'womens-month', name: "National Women's Month", description: 'Professional violet and lavender accents.', enabled: true, category: 'seasonal', preview: { primary: '#7c3aed', secondary: '#2e1065', surface: '#f5f3ff' }, effectId: 'womens-month', brandMessage: { title: "National Women's Month", subtitle: 'Empower · Inspire · Celebrate' } },
  'breast-cancer-awareness': { id: 'breast-cancer-awareness', name: 'Breast Cancer Awareness Month', description: 'Pink ribbons and rose accents in support of awareness.', enabled: true, category: 'seasonal', preview: { primary: '#b42369', secondary: '#3b1c32', surface: '#fdf2f8' }, effectId: 'breast-cancer-awareness', brandMessage: { title: 'Breast Cancer Awareness Month', subtitle: 'Awareness · Support · Hope' } },
  'amihan-bloom': { id: 'amihan-bloom', name: 'Amihan Bloom', description: 'Fresh teal and tropical green accents.', enabled: true, category: 'seasonal', preview: { primary: '#0f766e', secondary: '#042f2e', surface: '#f0fdfa' }, effectId: 'amihan-bloom', brandMessage: { title: 'Amihan Bloom', subtitle: 'Fresh · Focused · Connected' } },
  winter: { id: 'winter', name: 'Winter', description: 'Cool navy and icy blue accents.', enabled: true, category: 'seasonal', preview: { primary: '#0369a1', secondary: '#0c2748', surface: '#f0f9ff' }, effectId: 'winter', brandMessage: { title: 'Winter', subtitle: 'Steady · Ready · Together' } },
  'chinese-new-year': { id: 'chinese-new-year', name: 'Chinese New Year', description: 'Deep red with restrained gold highlights.', enabled: true, category: 'seasonal', preview: { primary: '#b91c1c', secondary: '#450a0a', surface: '#fef2f2' }, effectId: 'chinese-new-year', brandMessage: { title: 'Chinese New Year', subtitle: 'Prosperity · Unity · Good Fortune' } },
  'hallo-christmas': { id: 'hallo-christmas', name: 'Hallo-Christmas', description: 'Halloween plum and pumpkin orange meet Christmas red, gold, and evergreen details.', enabled: true, category: 'seasonal', preview: { primary: '#c2410c', secondary: '#2b1025', surface: '#fff7ed' }, effectId: 'hallo-christmas', brandMessage: { title: 'Hallo-Christmas', subtitle: 'Service · Unity · Celebration' } },
  government: { id: 'government', name: 'Government', description: 'Formal navy, royal blue, and gold.', enabled: true, category: 'institutional', preview: { primary: '#1d4ed8', secondary: '#0a2342', surface: '#eff6ff' }, effectId: null },
  festive: { id: 'festive', name: 'Festive', description: 'Vibrant celebratory accents on a professional base.', enabled: true, category: 'seasonal', preview: { primary: '#7e22ce', secondary: '#2e1065', surface: '#faf5ff' }, effectId: 'festive', brandMessage: { title: 'Festive Season', subtitle: 'Service · Gratitude · Togetherness' } },
  'rainy-season': { id: 'rainy-season', name: 'Rainy Season', description: 'Cool storm blue and teal accents.', enabled: true, category: 'seasonal', preview: { primary: '#0e7490', secondary: '#172554', surface: '#ecfeff' }, effectId: 'rainy-season', brandMessage: { title: 'Rainy Season', subtitle: 'Prepared · Safe · Connected' } },
  'weather-sync': { id: 'weather-sync', name: 'Weather Sync', description: 'Automatically adapts to current weather at a configured location.', enabled: true, category: 'standard', preview: { primary: '#0284c7', secondary: '#164e63', surface: '#ecfeff' }, effectId: null },
};

export const DEFAULT_SYSTEM_THEME: SystemThemeId = 'classic';
export const isSystemThemeId = (value: unknown): value is SystemThemeId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYSTEM_THEMES, value) && SYSTEM_THEMES[value as SystemThemeId].enabled;
