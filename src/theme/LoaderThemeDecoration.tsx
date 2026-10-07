import React from 'react';
import { Heart } from 'lucide-react';
import { useThemeEffect } from './useThemeEffect';
import { ThemeMotif } from './motifs/ThemeMotif';
import './styles/loaderThemeDecoration.css';

export const LoaderThemeDecoration: React.FC = () => {
  const { effectId, effectsEnabled, halloChristmasPhase, definition } = useThemeEffect();
  if (!effectsEnabled || !effectId || !definition) return null;
  const precipitation = ['rain', 'storm', 'snow'].includes(definition.kind);
  // Use a stable, smaller subset of the application's seeded particles.
  const particles = definition.particles.slice(0, precipitation ? 10 : 6);
  return (
    <div key={effectId} className={`app-loader-theme-decoration app-loader-theme-decoration--${effectId}`} data-loader-effect={effectId} data-hallo-phase={effectId === 'hallo-christmas' ? halloChristmasPhase : undefined} aria-hidden="true">
      {(['left', 'right'] as const).map(side => (
        <div key={side} className={`app-loader-theme-motif app-loader-theme-motif--${side}`}>
          <ThemeMotif halloChristmasPhase={halloChristmasPhase} effectId={effectId} side={side} />
        </div>
      ))}
      <div className="app-loader-theme-particles">
        {particles.map((particle, index) => (
          <span key={particle.id} className="app-loader-theme-particle" data-kind={definition.kind} data-motion={definition.motion} data-desktop-only={index >= (precipitation ? 6 : 3)} style={{
            // Constrain each particle to an outer lane, including its drift.
            '--loader-particle-x': `${index % 2 === 0 ? 3 + particle.x * .1 : 87 + particle.x * .1}%`,
            top: `${particle.y}%`,
            width: `${definition.kind === 'wind' ? particle.size * 4 : definition.kind === 'cloud' ? particle.size * 3 : precipitation && definition.kind !== 'snow' ? 1 : particle.size}px`,
            height: `${definition.kind === 'wind' ? 1 : definition.kind === 'cloud' ? particle.size : particle.size}px`,
            opacity: particle.opacity * .8,
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
          } as React.CSSProperties}>
            {definition.kind === 'heart' && <Heart fill="currentColor" strokeWidth={0} />}
          </span>
        ))}
      </div>
    </div>
  );
};
