import React, { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SidebarTooltipProps {
  enabled: boolean;
  label: string;
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
}

const TooltipGroup = createContext<{ activeId: string | null; select: (id: string | null) => void } | null>(null);

export function SidebarTooltipGroup({ children }: { children: React.ReactNode }) {
  const [activeId, select] = useState<string | null>(null);
  const value = useMemo(() => ({ activeId, select }), [activeId]);
  return <TooltipGroup.Provider value={value}>{children}</TooltipGroup.Provider>;
}

// The wrapper has no layout box. The tooltip escapes both the rail's clipping
// and the navigation scroller, with listeners only while it is displayed.
export function SidebarTooltip({ enabled, label, children }: SidebarTooltipProps) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const id = useId();
  const group = useContext(TooltipGroup);
  const [shown, setShown] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const show = () => {
    if (enabled && window.matchMedia('(min-width: 1024px)').matches) {
      group?.select(id);
      setShown(true);
    }
  };
  const dismiss = () => { setShown(false); group?.select(null); };

  useLayoutEffect(() => {
    if (!enabled || (group && group.activeId !== id)) { setShown(false); return; }
    if (!shown) return;
    const button = wrapper.current?.querySelector('button');
    const aside = button?.closest('.app-layout')?.querySelector('aside.app-sidebar');
    if (!button || !aside) return;
    const update = () => {
      const rect = button.getBoundingClientRect();
      setPosition({ left: Math.max(aside.getBoundingClientRect().right, rect.right) + 12,
        top: Math.max(24, Math.min(window.innerHeight - 24, rect.top + rect.height / 2)) });
    };
    const dismiss = () => setShown(false);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(aside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [shown, enabled, group?.activeId, id]);

  const visible = shown && enabled && (!group || group.activeId === id);
  return <span ref={wrapper} className="contents"
    onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }}
    onPointerLeave={() => {
      if (!wrapper.current?.querySelector('button:focus-visible')) setShown(false);
    }}
    onFocusCapture={event => { if (event.target.matches(':focus-visible')) show(); }}
    onBlurCapture={() => setShown(false)}
    onClickCapture={dismiss}
    onKeyDownCapture={event => { if (event.key === 'Escape') dismiss(); }}>
    {React.cloneElement(children, {
      'aria-describedby': [children.props['aria-describedby'], visible ? id : undefined].filter(Boolean).join(' ') || undefined,
    })}
    {visible && createPortal(<div id={id} role="tooltip" className="sidebar-tooltip"
      style={{ left: position.left, top: position.top }}>{label}</div>, document.body)}
  </span>;
}
