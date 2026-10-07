import type { HalloChristmasPhase } from '../themeTypes';
import React from 'react';

export const WomensMonthNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`womens-month-nav-motif womens-month-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M0 63C23 59 29 43 48 29M29 62C47 56 61 49 77 37" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M24 51C22 42 16 39 10 39C12 46 17 50 24 51ZM39 39C47 39 52 33 54 27C46 28 41 32 39 39ZM58 51C64 44 70 43 77 45C73 50 67 53 58 51Z" fill="#a78bfa" fillOpacity=".58" />
    <g fill="#e9d5ff">
      <ellipse cx="66" cy="19" rx="6" ry="11" transform="rotate(-24 66 19)" />
      <ellipse cx="77" cy="18" rx="6" ry="11" transform="rotate(32 77 18)" />
      <ellipse cx="82" cy="29" rx="6" ry="11" transform="rotate(88 82 29)" />
      <ellipse cx="71" cy="35" rx="6" ry="11" transform="rotate(145 71 35)" />
      <ellipse cx="61" cy="29" rx="6" ry="11" transform="rotate(207 61 29)" />
    </g>
    <circle cx="71" cy="26" r="5" fill="#f9a8d4" />
    <circle cx="71" cy="26" r="2" fill="#fef3c7" />
    <circle cx="101" cy="43" r="2" fill="#f0abfc" />
    <circle cx="109" cy="31" r="1.5" fill="#ddd6fe" />
  </svg>
);

export const BreastCancerAwarenessNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`breast-cancer-awareness-nav-motif breast-cancer-awareness-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M46 12C57 12 63 19 59 28C55 37 43 48 29 57" stroke="#f472b6" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M46 12C35 12 31 19 35 29C39 39 50 49 61 58" stroke="#fbcfe8" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M39 34 48 43" stroke="#be185d" strokeWidth="1.2" strokeOpacity=".45" strokeLinecap="round" />
    <circle cx="80" cy="18" r="2" fill="#f9a8d4" />
    <circle cx="96" cy="35" r="1.5" fill="#fbcfe8" />
    <path d="M91 9V14M88.5 11.5H93.5M75 44V48M73 46H77" stroke="#f9a8d4" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const AmihanBloomNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`amihan-bloom-nav-motif amihan-bloom-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M0 59C20 54 28 42 45 31C56 24 69 22 89 21M18 63C30 52 40 48 55 47" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M22 49C17 39 10 38 5 39C9 46 14 49 22 49ZM34 39C35 28 43 22 51 21C49 29 43 36 34 39ZM52 27C55 17 63 12 72 13C68 21 61 26 52 27ZM49 48C55 39 64 37 73 40C68 47 60 50 49 48Z" fill="#2dd4bf" fillOpacity=".72" />
    <path d="M22 49L11 41M34 39L47 25M52 27L66 16M49 48L68 42" stroke="#99f6e4" strokeWidth=".7" strokeLinecap="round" />
    <g fill="#fda4af">
      <ellipse cx="89" cy="8" rx="5" ry="8" />
      <ellipse cx="101" cy="14" rx="5" ry="8" transform="rotate(70 101 14)" />
      <ellipse cx="97" cy="27" rx="5" ry="8" transform="rotate(145 97 27)" />
      <ellipse cx="82" cy="26" rx="5" ry="8" transform="rotate(215 82 26)" />
      <ellipse cx="79" cy="13" rx="5" ry="8" transform="rotate(290 79 13)" />
    </g>
    <circle cx="90" cy="18" r="5" fill="#fcd34d" />
    <circle cx="90" cy="18" r="2" fill="#fff7ed" />
    <circle cx="109" cy="42" r="2" fill="#99f6e4" />
  </svg>
);

export const WinterNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`winter-nav-motif winter-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <g stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M42 9V51M21 30H63M27 15L57 45M57 15L27 45" />
      <path d="M36 16L42 22L48 16M36 44L42 38L48 44M28 24L34 30L28 36M56 24L50 30L56 36" />
      <path d="M27 21L35 21L35 13M49 13L49 21L57 21M27 39L35 39L35 47M49 47L49 39L57 39" />
    </g>
    <circle cx="42" cy="30" r="3" fill="#e0f2fe" />
    <g stroke="#7dd3fc" strokeWidth="1.1" strokeLinecap="round">
      <path d="M87 5V25M77 15H97M80 8L94 22M94 8L80 22" />
      <path d="M99 37V49M93 43H105M95 39L103 47M103 39L95 47" />
    </g>
    <circle cx="13" cy="10" r="1.5" fill="#e0f2fe" />
    <circle cx="74" cy="45" r="2" fill="#bae6fd" />
    <circle cx="111" cy="24" r="1.5" fill="#e0f2fe" />
  </svg>
);

export const ChineseNewYearNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`chinese-new-year-nav-motif chinese-new-year-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M44 0V9" stroke="#fbbf24" strokeWidth="1.5" />
    <path d="M34 10H54M34 44H54" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M37 12C30 18 30 36 37 43H51C58 36 58 18 51 12Z" fill="#b91c1c" stroke="#fbbf24" strokeWidth="1.4" />
    <path d="M39 14C35 22 35 33 39 41M49 14C53 22 53 33 49 41" stroke="#fcd34d" strokeWidth="1" strokeOpacity=".75" />
    <path d="M44 13V42" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity=".6" />
    <path d="M44 46V58M40 58H48M42 59V63M46 59V63" stroke="#fbbf24" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M64 44C74 42 77 32 87 33C93 33 97 38 93 42C90 45 85 43 86 39M72 52C82 48 89 50 97 54C103 57 110 55 114 50" stroke="#d4a72c" strokeWidth="1.3" strokeLinecap="round" strokeOpacity=".78" />
    <circle cx="76" cy="17" r="2" fill="#fbbf24" />
    <circle cx="105" cy="28" r="1.5" fill="#fcd34d" />
  </svg>
);

export const HalloChristmasNavMotif: React.FC<{ side: 'left' | 'right'; phase: HalloChristmasPhase }> = ({ side, phase }) => (
  <svg className={'hallo-christmas-nav-motif hallo-christmas-nav-motif--' + side} data-hallo-phase={phase} viewBox="0 0 120 64" fill="none" aria-hidden="true" focusable="false">
    {phase === 'halloween' && <g data-hallo-art="halloween">
      <path d="M35 28C24 28 19 36 21 47C23 56 31 59 40 59C51 59 58 54 59 45C60 35 53 28 44 28Z" fill="#ea580c" stroke="#fdba74" strokeWidth="1.3" />
      <path d="M33 29C28 36 28 51 34 57M46 29C52 36 52 51 46 57" stroke="#fb923c" strokeWidth="1.2" />
      <path d="M39 29C39 23 42 20 46 20" stroke="#4d7c0f" strokeWidth="3" strokeLinecap="round" />
      <path d="m29 40 5-3 4 3m8 0 5-3 4 3M34 48C38 53 44 53 49 48" stroke="#42162f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M74 20 68 14 59 16 66 22 70 21 74 26 78 21 83 22 90 16 81 14Z" fill="#c4b5fd" fillOpacity=".65" />
      <path d="M88 48V38a8 8 0 0 1 16 0v12l-4-3-4 3-4-3Z" fill="#ede9fe" fillOpacity=".5" />
      <circle cx="93" cy="38" r="1" fill="#42162f" /><circle cx="99" cy="38" r="1" fill="#42162f" />
      <path d="m16 12 2 4 4 1-4 2-2 4-1-4-4-2 4-1Z" fill="#fdba74" />
    </g>}
    {phase === 'remembrance' && <g data-hallo-art="remembrance">
      <ellipse cx="59" cy="55" rx="35" ry="4" fill="#fde68a" fillOpacity=".08" />
      <circle cx="60" cy="22" r="15" fill="#fde68a" fillOpacity=".07" />
      <rect x="52" y="30" width="16" height="23" rx="2" fill="#e7dfd0" stroke="#fef3c7" strokeWidth="1" />
      <path d="M60 29v-5" stroke="#a18865" strokeWidth="1.2" />
      <path d="M60 25c-7-4-3-10 0-14 5 6 6 10 0 14Z" fill="#fcd58b" />
      <path d="M27 52c10 2 16-2 22-6M72 47c8 5 14 7 22 5" stroke="#a8b5a0" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M32 52c-2-8 5-9 7-3M84 51c1-8 7-8 8-1" fill="#a8b5a0" fillOpacity=".5" />
      <g fill="#ede6db" fillOpacity=".8">
        <ellipse cx="42" cy="44" rx="3" ry="6" /><ellipse cx="42" cy="44" rx="6" ry="3" />
        <ellipse cx="78" cy="44" rx="3" ry="6" /><ellipse cx="78" cy="44" rx="6" ry="3" />
      </g>
      <circle cx="42" cy="44" r="2" fill="#d6b77b" /><circle cx="78" cy="44" r="2" fill="#d6b77b" />
    </g>}
    {phase === 'christmas' && <g data-hallo-art="christmas">
      <path d="M86 11 70 34h8L66 50h40L94 34h8Z" fill="#166534" stroke="#86efac" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M86 6 88 10 92 10 89 13 90 17 86 15 82 17 83 13 80 10 84 10Z" fill="#fbbf24" />
      <path d="M82 50V57H90V50" fill="#92400e" />
      <circle cx="78" cy="36" r="2" fill="#fca5a5" />
      <circle cx="94" cy="43" r="2" fill="#fbbf24" />
      <circle cx="85" cy="27" r="1.8" fill="#fecaca" />
      <path d="M7 10c18 9 30 7 49 0" stroke="#d4a72c" strokeWidth="1" />
      <circle cx="15" cy="13" r="2" fill="#fbbf24" /><circle cx="28" cy="16" r="2" fill="#fca5a5" /><circle cx="42" cy="14" r="2" fill="#fbbf24" />
      <path d="M30 32v5" stroke="#d4a72c" /><circle cx="30" cy="44" r="7" fill="#b91c1c" stroke="#fca5a5" strokeWidth="1" />
      <path d="m45 27 2 4 4 1-4 2-2 4-1-4-4-2 4-1Z" fill="#fbbf24" />
    </g>}
  </svg>
);

export const FestiveNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`festive-nav-motif festive-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M0 5C28 16 65 12 116 3" stroke="#f0abfc" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M16 9 23 25 30 11Z" fill="#fbbf24" />
    <path d="M39 14 47 29 54 14Z" fill="#f472b6" />
    <path d="M65 12 73 27 80 10Z" fill="#67e8f9" />
    <path d="M27 51 47 34 52 40 37 59Z" fill="#a855f7" stroke="#e9d5ff" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M33 47 40 56M39 42 46 50" stroke="#fbbf24" strokeWidth="1.5" />
    <path d="M52 36C57 32 57 27 54 23M55 38C63 38 68 33 68 28M52 33C48 28 49 23 52 19" stroke="#f0abfc" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m73 38 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="#fbbf24" />
    <circle cx="63" cy="18" r="2" fill="#67e8f9" />
    <circle cx="92" cy="34" r="2" fill="#f472b6" />
    <circle cx="103" cy="20" r="1.5" fill="#fbbf24" />
  </svg>
);

export const RainySeasonNavMotif: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <svg className={`rainy-season-nav-motif rainy-season-nav-motif--${side}`} viewBox="0 0 120 64" fill="none" aria-hidden="true">
    <path d="M18 28C24 10 48 9 57 28C51 25 47 27 44 31C41 27 36 26 32 31C28 27 23 25 18 28Z" fill="#0891b2" stroke="#67e8f9" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M37 15C32 19 31 24 32 31M38 15C43 19 45 24 44 31" stroke="#a5f3fc" strokeWidth=".9" strokeOpacity=".7" />
    <path d="M38 14V9M38 29V49C38 57 48 58 49 49" stroke="#bae6fd" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M69 18C73 14 80 14 84 18C88 16 93 18 95 22H65C65 20 67 18 69 18Z" fill="#94a3b8" fillOpacity=".72" />
    <path d="M71 30 69 37M81 29 79 36M91 30 89 37M103 16 101 23M108 39 106 46" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M65 53C72 50 79 50 86 53C93 56 101 56 109 52" stroke="#38bdf8" strokeWidth="1.1" strokeLinecap="round" strokeOpacity=".7" />
  </svg>
);

