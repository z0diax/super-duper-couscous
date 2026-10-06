import React from 'react';
import { Heart, Mail } from 'lucide-react';
import type { VisualEffectId } from '../effects/effectDefinitions';
import {
  WomensMonthNavMotif,
  BreastCancerAwarenessNavMotif,
  AmihanBloomNavMotif,
  WinterNavMotif,
  ChineseNewYearNavMotif,
  HalloChristmasNavMotif,
  FestiveNavMotif,
  RainySeasonNavMotif,
} from './ThemeNavMotifs';

const WeatherMotif: React.FC<{ kind: 'sunny' | 'cloudy' | 'windy' | 'thunderstorm' }> = ({ kind }) => (
  <svg viewBox="0 0 180 130" fill="none" aria-hidden="true" focusable="false">
    {kind === 'sunny' && <>
      <circle cx="150" cy="95" r="54" stroke="currentColor" strokeWidth="2" />
      <path d="M150 21V8M96 40 87 31M70 95H57M96 149 87 158M150 169v13M204 40l9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>}
    {kind === 'cloudy' && <>
      <path d="M37 100c-18 0-29-11-29-25s11-24 25-25c7-21 27-33 47-29 15-15 43-15 57 3 20 0 34 15 34 33 0 18-14 32-34 32H37Z" stroke="currentColor" strokeWidth="2" />
      <path d="M69 111h115M99 121h83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>}
    {kind === 'windy' && <>
      <path d="M0 44c47-31 72-26 110-7 24 12 45 9 63-7M-15 73c43-18 71-15 97-3 27 13 54 16 103-2M4 102c43-13 69-9 95 2 25 11 53 12 86-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M100 25c14-8 28-17 39-23M69 112c16 7 26 14 37 24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>}
    {kind === 'thunderstorm' && <>
      <path d="M26 79c-15 0-24-9-24-21s9-21 22-22C31 17 50 8 68 13c14-13 38-12 51 3 21-1 38 14 38 32 0 17-13 31-31 31H26Z" stroke="currentColor" strokeWidth="2" />
      <path d="m92 68-17 32h19l-18 31 43-47H98l13-16" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m27 91-8 18m29-17-8 18m86-19-8 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>}
  </svg>
);

/** Shared artwork; each surface controls placement through its own wrapper. */
export const ThemeMotif: React.FC<{ effectId: VisualEffectId; side?: 'left' | 'right' }> = ({ effectId, side = 'left' }) => (
  <>
    {effectId === 'valentine' && <><Heart className="theme-motif-heart" strokeWidth={.8} /><Mail className="theme-motif-mail" strokeWidth={.8} /></>}
    {effectId === 'womens-month' && <WomensMonthNavMotif side={side} />}
    {effectId === 'breast-cancer-awareness' && <BreastCancerAwarenessNavMotif side={side} />}
    {effectId === 'amihan-bloom' && <AmihanBloomNavMotif side={side} />}
        {(effectId === 'winter' || effectId === 'weather-winter') && <WinterNavMotif side={side} />}
    {effectId === 'chinese-new-year' && <ChineseNewYearNavMotif side={side} />}
    {effectId === 'hallo-christmas' && <HalloChristmasNavMotif side={side} />}
    {effectId === 'festive' && <FestiveNavMotif side={side} />}
        {(effectId === 'rainy-season' || effectId === 'weather-rainy') && <RainySeasonNavMotif side={side} />}
    {effectId === 'weather-sunny' && <WeatherMotif kind="sunny" />}
    {effectId === 'weather-cloudy' && <WeatherMotif kind="cloudy" />}
    {effectId === 'weather-windy' && <WeatherMotif kind="windy" />}
    {effectId === 'weather-thunderstorm' && <WeatherMotif kind="thunderstorm" />}
  </>
);
