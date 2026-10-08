import React, { useEffect, useState } from 'react';
import { Gift, Heart, Mail, Sparkles } from 'lucide-react';
import { useThemeEffect } from './useThemeEffect';
import { ThemeMotif } from './motifs/ThemeMotif';
import { WinterSantaFlyby } from './WinterSantaFlyby';

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
};

export const ThemeEffects: React.FC = () => {
  const { effectId, effectsEnabled, halloChristmasPhase, definition } = useThemeEffect();
  if (!effectsEnabled || !effectId || !definition) return null;

  if (effectId === 'valentine') return (
    <div className="theme-effect-layer theme-effect-layer--valentine" data-effect="valentine" aria-hidden="true">
      <img
        className="valentine-decor-art"
        src={`${import.meta.env.BASE_URL}assets/themes/valentine-decor.png`}
        alt=""
        decoding="async"
      />
      <div className="valentine-decor-icons">
        <span className="valentine-decor-icon valentine-decor-icon--heart"><Heart /></span>
        <span className="valentine-decor-icon valentine-decor-icon--mail"><Mail /></span>
        <span className="valentine-decor-icon valentine-decor-icon--gift"><Gift /></span>
        <span className="valentine-decor-icon valentine-decor-icon--sparkle"><Sparkles /></span>
      </div>
    </div>
  );

  return (
    <div key={effectId} className={`theme-effect-layer theme-effect-layer--${effectId}`} data-effect={effectId} data-hallo-phase={effectId === 'hallo-christmas' ? halloChristmasPhase : undefined} aria-hidden="true" />
  );
};

/**
 * Universal decoration field for the primary application navbar. Animated
 * effects are kept here so they cannot pass through page cards or dialogs.
 */
export const ThemeNavEffects: React.FC = () => {
  const { effectId, effectsEnabled, halloChristmasPhase, definition } = useThemeEffect();
  const reducedMotion = usePrefersReducedMotion();
  if (!effectsEnabled || !effectId || !definition || (reducedMotion && effectId !== 'womens-month' && effectId !== 'breast-cancer-awareness' && effectId !== 'amihan-bloom' && effectId !== 'winter' && effectId !== 'chinese-new-year' && effectId !== 'hallo-christmas' && effectId !== 'festive' && effectId !== 'rainy-season')) return null;

  return (
    <div key={effectId} className={`theme-nav-effect-field theme-nav-effect-field--${effectId}`} data-nav-effect={effectId} data-hallo-phase={effectId === 'hallo-christmas' ? halloChristmasPhase : undefined} aria-hidden="true">
      {effectId !== 'valentine' && !effectId.startsWith('weather-') && <>
        <ThemeMotif halloChristmasPhase={halloChristmasPhase} effectId={effectId} side="left" />
        <ThemeMotif halloChristmasPhase={halloChristmasPhase} effectId={effectId} side="right" />
      </>}
      {!reducedMotion && definition.particles.map(particle => (
        <span
          key={particle.id}
          data-tone={particle.tone}
          className={`theme-effect-particle theme-effect-particle--${definition.kind} theme-effect-particle--${definition.motion}${particle.desktopOnly ? ' theme-effect-particle--desktop' : ''}`}
          style={{
            left: `${particle.x}%`,
            top: definition.motion==='drift' ? `${particle.y}%` : 0,
            backgroundImage: effectId === 'rainy-season' ? `url(${import.meta.env.BASE_URL}assets/themes/rain-drop.svg)` : definition.kind === 'heart' ? `url(${import.meta.env.BASE_URL}assets/themes/valentine-heart-premium.png)` : undefined,
            width: `${effectId === 'winter' ? particle.size * 0.65 : effectId === 'rainy-season' ? 1.5 + particle.size * 0.14 : definition.kind === 'rain' || definition.kind === 'storm' ? 1 : definition.kind === 'fleck' || definition.kind === 'confetti' ? 3 : definition.kind === 'heart' ? particle.size + 13 : definition.kind === 'leaf' ? particle.size * 1.6 : definition.kind === 'cloud' ? particle.size * 3.2 : definition.kind === 'wind' ? particle.size * 5 : particle.size}px`,
            height: `${effectId === 'winter' ? particle.size * 0.65 : effectId === 'rainy-season' ? (1.5 + particle.size * 0.14) * 1.4 : definition.kind === 'wind' ? 1 : definition.kind === 'storm' ? particle.size * 1.8 : definition.kind === 'heart' ? particle.size + 13 : particle.size}px`,
            opacity: effectId === 'winter' ? 0.55 + particle.opacity * 0.65 : effectId === 'rainy-season' ? 0.36 + particle.opacity * 0.65 : definition.kind === 'heart' ? 0.7 + particle.tone * 0.08 : particle.opacity,
            animationDuration: `${effectId === 'hallo-christmas' ? particle.duration : effectId === 'rainy-season' ? Math.max(1.1, particle.duration * 0.38) : Math.max(2.8, particle.duration * 0.42)}s`,
            animationDelay: `${particle.delay * 0.35}s`,
            '--effect-drift': `${effectId === 'rainy-season' ? particle.drift * 0.25 : particle.drift}px`,
          } as React.CSSProperties}
        />
      ))}
      {effectId === 'winter' && !reducedMotion && <WinterSantaFlyby />}
    </div>
  );
};
