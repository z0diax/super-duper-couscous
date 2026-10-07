import React from 'react';
import { useThemeEffect } from './useThemeEffect';
import { ThemeMotif } from './motifs/ThemeMotif';
import './styles/sidebarThemeDecoration.css';

export const SidebarThemeDecoration: React.FC = () => {
  const { effectId, effectsEnabled, halloChristmasPhase } = useThemeEffect();
  if (!effectsEnabled) return null;
  if (!effectId) return null;

  return (
    <div className={`sidebar-theme-decoration sidebar-theme-decoration--${effectId}`} data-sidebar-effect={effectId} data-hallo-phase={effectId === 'hallo-christmas' ? halloChristmasPhase : undefined} aria-hidden="true">
      <div className="sidebar-theme-art">
        <ThemeMotif halloChristmasPhase={halloChristmasPhase} effectId={effectId} />
      </div>
    </div>
  );
};
