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
  valentine: { id: 'valentine', name: 'Valentine', description: 'Roses, love letters, ribbons, and romantic seasonal accents.', enabled: true, category: 'seasonal', preview: { primary: '#be185d', secondary: '#4c0519', surface: '#fff1f2' }, effectId: 'valentine', brandMessage: { title: 'Happy Valentine’s Day!', subtitle: 'Wishing you a day filled with kindness, appreciation, and love.' } },
  'womens-month': { id: 'womens-month', name: "National Women's Month", description: 'Professional violet and lavender accents.', enabled: true, category: 'seasonal', preview: { primary: '#7c3aed', secondary: '#2e1065', surface: '#f5f3ff' }, effectId: 'womens-month', brandMessage: { title: 'Happy National Women’s Month!', subtitle: 'Celebrating the strength, achievements, and contributions of every woman.' } },
  'breast-cancer-awareness': { id: 'breast-cancer-awareness', name: 'Breast Cancer Awareness Month', description: 'Pink ribbons and rose accents in support of awareness.', enabled: true, category: 'seasonal', preview: { primary: '#b42369', secondary: '#3b1c32', surface: '#fdf2f8' }, effectId: 'breast-cancer-awareness', brandMessage: { title: 'Together, let us raise awareness and inspire hope.', subtitle: 'Supporting every fighter, survivor, and family touched by breast cancer.' } },
  'amihan-bloom': { id: 'amihan-bloom', name: 'Amihan Bloom', description: 'Fresh teal and tropical green accents.', enabled: true, category: 'seasonal', preview: { primary: '#0f766e', secondary: '#042f2e', surface: '#f0fdfa' }, effectId: 'amihan-bloom', brandMessage: { title: 'Wishing you a fresh and wonderful day!', subtitle: 'May this season bring renewed energy and brighter days ahead.' } },
  winter: { id: 'winter', name: 'Winter', description: 'Cool navy and icy blue accents.', enabled: true, category: 'seasonal', preview: { primary: '#0369a1', secondary: '#0c2748', surface: '#f0f9ff' }, effectId: 'winter', brandMessage: { title: 'Warm wishes this season!', subtitle: 'May your days be filled with warmth, peace, and happiness.' } },
  'chinese-new-year': { id: 'chinese-new-year', name: 'Chinese New Year', description: 'Deep red with restrained gold highlights.', enabled: true, category: 'seasonal', preview: { primary: '#b91c1c', secondary: '#450a0a', surface: '#fef2f2' }, effectId: 'chinese-new-year', brandMessage: { title: 'Happy Chinese New Year!', subtitle: 'May the new year bring prosperity, happiness, and good fortune.' } },
  'hallo-christmas': { id: 'hallo-christmas', name: 'Hallo-Christmas', description: 'Seasonal Halloween, remembrance, and Christmas accents follow the local calendar.', enabled: true, category: 'seasonal', preview: { primary: '#c2410c', secondary: '#2b1025', surface: '#fff7ed' }, effectId: 'hallo-christmas', brandMessage: { title: 'Happy Halloween!', subtitle: 'Wishing everyone a fun and spook-tacular celebration!' } },
  government: { id: 'government', name: 'Government', description: 'Formal navy, royal blue, and gold.', enabled: true, category: 'institutional', preview: { primary: '#1d4ed8', secondary: '#0a2342', surface: '#eff6ff' }, effectId: null },
  festive: { id: 'festive', name: 'Festive', description: 'Vibrant celebratory accents on a professional base.', enabled: true, category: 'seasonal', preview: { primary: '#7e22ce', secondary: '#2e1065', surface: '#faf5ff' }, effectId: 'festive', brandMessage: { title: 'Warm wishes for a joyful festive season!', subtitle: 'May this season bring happiness, gratitude, and togetherness.' } },
  'rainy-season': { id: 'rainy-season', name: 'Rainy Season', description: 'Cool storm blue and teal accents.', enabled: true, category: 'seasonal', preview: { primary: '#0e7490', secondary: '#172554', surface: '#ecfeff' }, effectId: 'rainy-season', brandMessage: { title: 'Stay safe this rainy season!', subtitle: 'Take care, stay prepared, and look out for one another.' } },
  'weather-sync': { id: 'weather-sync', name: 'Weather Sync', description: 'Automatically adapts to current weather at a configured location.', enabled: true, category: 'standard', preview: { primary: '#0284c7', secondary: '#164e63', surface: '#ecfeff' }, effectId: null },
};

export const DEFAULT_SYSTEM_THEME: SystemThemeId = 'classic';
export const isSystemThemeId = (value: unknown): value is SystemThemeId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYSTEM_THEMES, value) && SYSTEM_THEMES[value as SystemThemeId].enabled;
