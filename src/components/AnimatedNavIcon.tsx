import React, { useEffect, useRef, useState } from 'react';
import './AnimatedNavIcon.css';
import { NavIconArtwork, type NavIconType } from './NavIconArtwork';

export type { NavIconType } from './NavIconArtwork';

interface AnimatedNavIconProps {
  type: NavIconType;
  active: boolean;
}

export function AnimatedNavIcon({ type, active }: AnimatedNavIconProps) {
  const container = useRef<HTMLSpanElement>(null);
  const [animation, setAnimation] = useState({ sequence: 0, trigger: 'idle' });

  useEffect(() => {
    const button = container.current?.closest('button');
    if (!button) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const settle = () => setAnimation(previous => ({ ...previous, trigger: 'idle' }));
    const play = (trigger: string) => {
      if (reducedMotion.matches) return;
      setAnimation(previous => ({ sequence: previous.sequence + 1, trigger }));
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') play('hover');
    };
    const focus = () => { if (button.matches(':focus-visible')) play('focus'); };
    const activate = () => play('activation');
    // Listen on the containing button so its entire hit area and keyboard
    // activation work without changing or delaying its navigation handler.
    button.addEventListener('pointerenter', hover);
    button.addEventListener('focus', focus);
    button.addEventListener('click', activate);
    reducedMotion.addEventListener('change', settle);
    return () => {
      button.removeEventListener('pointerenter', hover);
      button.removeEventListener('focus', focus);
      button.removeEventListener('click', activate);
      reducedMotion.removeEventListener('change', settle);
    };
  }, []);

  return (
    <span
      ref={container}
      className={`animated-nav-icon w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}
      data-icon-type={type}
      data-active={active}
      data-trigger={animation.trigger}
      onAnimationEnd={event => {
        // Parts may finish independently; only the marker settles playback.
        if (event.animationName === 'nav-icon-complete') {
          setAnimation(previous => ({ ...previous, trigger: 'idle' }));
        }
      }}
      aria-hidden="true"
    >
      {/* A new SVG restarts the one-shot animation, including repeated clicks. */}
      <svg key={animation.sequence} className="animated-nav-icon-svg w-full h-full"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <NavIconArtwork type={type} />
        <g className="icon-completion" />
      </svg>
    </span>
  );
}
