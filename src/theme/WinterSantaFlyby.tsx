import React, { useEffect, useId, useState } from 'react';
import './styles/winterSantaFlyby.css';

const FLIGHT_DURATION = 9_000;
const randomDelay = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum);

const Reindeer: React.FC<{ x: number; phase: number; coat: string }> = ({ x, phase, coat }) => (
  <g transform={`translate(${x} 0)`}>
    <g className="winter-santa-reindeer" style={{ '--deer-phase': `${phase}s` } as React.CSSProperties}>
      <g className="winter-santa-legs winter-santa-legs--rear" stroke={coat} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M8 45 3 56-6 62M15 46 18 57 11 66" />
      </g>
      <path d="m0 38-8-5 3 9" fill="#e8cda4" />
      <ellipse cx="20" cy="40" rx="23" ry="10" fill={coat} />
      <path d="M31 38 38 25 45 30 42 44" fill={coat} />
      <path d="M5 39c7 6 19 9 29 3" stroke="#e8cda4" strokeWidth="3" opacity=".7" fill="none" />
      <g className="winter-santa-legs winter-santa-legs--front" stroke={coat} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="m32 46 10 8 4 10M26 47l1 11 9 6" />
      </g>
      <g className="winter-santa-deer-head">
        <path d="M39 24 34 13M38 20 28 17M34 14l1-7M34 14l-7-4M46 22l3-12M49 15l8-5M49 15l-3-8" stroke="#e0c49a" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="m37 27-5-7 9 2m4 2 6-6-1 10" fill={coat} />
        <path d="M36 26c1-8 13-8 16 0l9 4c4 5-1 9-9 7l-10-2Z" fill={coat} />
        <path d="m53 31 7 2" stroke="#ead3b1" strokeWidth="3" strokeLinecap="round" />
        <circle cx="46" cy="27" r="1.4" fill="#152d42" />
        <circle cx="60" cy="31" r="2" fill="#49372e" />
      </g>
      <path d="m27 31-3 18m13-16 9 4" stroke="#88d4ee" strokeWidth="2.5" fill="none" />
      <circle cx="25" cy="43" r="2.2" fill="#e5bb68" />
    </g>
  </g>
);

/** Mounted only for the seasonal Winter effect; owns one timeout at a time. */
export const WinterSantaFlyby: React.FC = () => {
  const id = useId().replace(/:/g, '');
  const [flying, setFlying] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const eligible = () => desktop.matches && !motion.matches && !document.hidden;
    const fly = () => {
      if (!eligible()) return;
      setFlying(true);
      timer = setTimeout(() => {
        setFlying(false);
        timer = setTimeout(fly, randomDelay(25_000, 40_000));
      }, FLIGHT_DURATION);
    };
    const restart = () => {
      clear(); setFlying(false);
      if (eligible()) timer = setTimeout(fly, randomDelay(8_000, 15_000));
    };
    desktop.addEventListener('change', restart);
    motion.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    restart();
    return () => {
      clear();
      desktop.removeEventListener('change', restart);
      motion.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, []);

  if (!flying) return null;
  return <div className="winter-santa-flight" aria-hidden="true" data-winter-santa="flying">
    <div className="winter-santa-path">
      <svg viewBox="0 0 420 78" fill="none" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-sleigh`} x1="86" y1="38" x2="168" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#a73549" /><stop offset="1" stopColor="#661f39" /></linearGradient>
          <linearGradient id={`${id}-coat`} x1="111" y1="29" x2="143" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#ed6066" /><stop offset="1" stopColor="#b82f44" /></linearGradient>
        </defs>
        <g className="winter-santa-trail" fill="#d5f3ff">
          {[14, 32, 51, 69].map((x, i) => <g key={x} className="winter-santa-glint" style={{ animationDelay: `${i * -.3}s` }}>
            {i % 2 === 0 ? <path d={`M${x} 45l1.6 4.4L${x + 6} 51l-4.4 1.6L${x} 57l-1.6-4.4L${x - 6} 51l4.4-1.6Z`} /> : <circle cx={x} cy={i === 1 ? 58 : 43} r="1.7" />}
          </g>)}
        </g>
        <g className="winter-santa-reins" stroke="#b7e5f2" strokeWidth="1.2" opacity=".8">
          <path d="M148 39Q208 53 233 40T309 40T389 40M149 42Q210 58 234 45T310 45T390 45" />
        </g>
        <g className="winter-santa-sleigh">
          <path d="M81 48c8 0 12 7 20 7h42c12 0 18-9 25-18l8 2c-1 18-11 25-30 25h-43c-15 0-21-6-22-16Z" fill={`url(#${id}-sleigh)`} />
          <path d="M85 48c9 2 10 9 20 9h36c16 0 22-10 29-18" stroke="#e7bd76" strokeWidth="2" />
          <path d="m103 62-3 7m49-8 6 8M82 68c17 5 61 6 83 0 9-2 14-9 9-13" stroke="#c4e9fa" strokeWidth="2.5" strokeLinecap="round" />
          <path d="m92 65 8 1m54-2 9-3" stroke="#fff5d5" strokeWidth="1.2" />
          <g className="winter-santa-character">
            <path d="M112 35c-10 9-10 18-2 22h28l8-7-15-13Z" fill={`url(#${id}-coat)`} />
            <path d="m128 49 18 1 7 6-17 2-16-7" fill="#b53043" />
            <path d="m146 53 12 2 1 5h-15" fill="#183549" />
            <path d="M108 46h21" stroke="#173449" strokeWidth="4" /><rect x="119" y="44" width="5" height="5" rx="1" stroke="#e7bd76" strokeWidth="1.5" />
            <path d="m128 35 9 8 12-5" stroke="#d84a57" strokeWidth="7" strokeLinecap="round" />
            <path d="m144 40 4-2" stroke="#f0f8ff" strokeWidth="5" strokeLinecap="round" /><circle cx="151" cy="37" r="3" fill="#f4cead" />
            <ellipse cx="121" cy="27" rx="10" ry="11" fill="#f4cead" />
            <path className="winter-santa-beard" d="M111 27c3 4 6 3 10 3s7 1 10-3c2 11-5 17-10 17s-12-7-10-17Z" fill="#edf8ff" />
            <path d="M118 29q3-3 6 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><circle cx="122" cy="26" r="2.5" fill="#edb899" />
            <path d="M115 23h3m7 0h2" stroke="#213b4d" strokeWidth="1.4" strokeLinecap="round" />
            <g className="winter-santa-hat">
              <path d="M110 19c0-10 9-17 17-13l12 12-9-3-1 7Z" fill="#d84654" /><circle cx="140" cy="18" r="4" fill="#f1faff" />
            </g>
            <path d="M110 20q12-5 21 1" stroke="#f1faff" strokeWidth="5" strokeLinecap="round" />
          </g>
        </g>
        <Reindeer x={205} phase={0} coat="#bb9774" />
        <Reindeer x={280} phase={-.24} coat="#c3a17c" />
        <Reindeer x={355} phase={-.48} coat="#d2b087" />
      </svg>
    </div>
  </div>;
};
