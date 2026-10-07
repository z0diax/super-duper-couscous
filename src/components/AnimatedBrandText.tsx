import { useEffect, useState, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { resolveHalloChristmasMessage } from '../theme/halloChristmasPhase';
import { SYSTEM_THEMES } from '../theme/themeRegistry';
import type { SystemThemeDefinition } from '../theme/themeRegistry';

const NORMAL_TITLE = 'Records Management System';
const NORMAL_SUBTITLE = 'Records · Workflow · Archives';
const TYPE_DELAY = 52;
const DELETE_DELAY = 30;
const TRANSITION_DELAY = 300;
const MESSAGE_DELAY = 5000;

type Line = 'title' | 'subtitle';
type BrandText = { title: string; subtitle: string; cursor: Line | null };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function AnimatedLines({ message, compactMobile }: { message: NonNullable<SystemThemeDefinition['brandMessage']>; compactMobile: boolean }) {
  const [text, setText] = useState<BrandText>({ title: NORMAL_TITLE, subtitle: NORMAL_SUBTITLE, cursor: null });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let finishWait: (() => void) | undefined;
    const wait = (delay: number) => new Promise<void>(resolve => {
      finishWait = resolve;
      timer = window.setTimeout(() => { timer = undefined; finishWait = undefined; resolve(); }, delay);
    });
    const changeLine = async (line: Line, from: string, to: string) => {
      const letters = Array.from(from);
      setText(previous => ({ ...previous, cursor: line }));
      while (active && letters.length) {
        letters.pop();
        setText(previous => ({ ...previous, [line]: letters.join('') }));
        await wait(DELETE_DELAY);
      }
      if (!active) return;
      await wait(TRANSITION_DELAY);
      for (const letter of Array.from(to)) {
        if (!active) return;
        letters.push(letter);
        setText(previous => ({ ...previous, [line]: letters.join('') }));
        await wait(TYPE_DELAY);
      }
    };
    const run = async () => {
      while (active) {
        setText(previous => ({ ...previous, cursor: null }));
        await wait(MESSAGE_DELAY);
        if (!active) break;
        await changeLine('subtitle', NORMAL_SUBTITLE, '');
        if (!active) break;
        await changeLine('title', NORMAL_TITLE, message.title);
        if (!active) break;
        await changeLine('subtitle', '', message.subtitle);
        if (!active) break;
        setText(previous => ({ ...previous, cursor: null }));
        await wait(MESSAGE_DELAY);
        if (!active) break;
        await changeLine('subtitle', message.subtitle, '');
        if (!active) break;
        await changeLine('title', message.title, NORMAL_TITLE);
        if (!active) break;
        await changeLine('subtitle', '', NORMAL_SUBTITLE);
      }
    };
    void run();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      finishWait?.();
    };
  }, [message]);

  const cursor = (line: Line) => text.cursor === line && <span className="brand-type-cursor" aria-hidden="true">|</span>;
  return <BrandLines compactMobile={compactMobile} title={text.title} subtitle={text.subtitle} titleCursor={cursor('title')} subtitleCursor={cursor('subtitle')} />;
}

function BrandLines({ title, subtitle, titleCursor, subtitleCursor, compactMobile = false }: {
  title: string;
  subtitle: string;
  compactMobile?: boolean;
  titleCursor?: ReactNode;
  subtitleCursor?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1" role="group" aria-label="HRMDO Records Management System">
      <div className="flex h-[4.75rem] flex-col justify-center" aria-hidden="true">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">HRMDO</p>
        <p className={'mt-0.5 overflow-hidden break-words font-bold text-white ' + (compactMobile ? 'max-h-6 text-[10px] leading-3 sm:max-h-8 sm:text-sm sm:leading-4' : 'max-h-8 text-xs leading-4 sm:text-sm')}>{title}{titleCursor}</p>
        <p className={'mt-0.5 overflow-hidden break-words text-[10px] font-medium text-slate-400 ' + (compactMobile ? 'h-[33px] leading-[11px] sm:h-6 sm:leading-3' : 'h-6 leading-3')}>{subtitle}{subtitleCursor}</p>
      </div>
    </div>
  );
}

export function AnimatedBrandText() {
  const { systemTheme, effectsEnabled, halloChristmasPhase } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const message = systemTheme === 'hallo-christmas'
    ? resolveHalloChristmasMessage(halloChristmasPhase)
    : SYSTEM_THEMES[systemTheme].brandMessage;
  if (!effectsEnabled || reducedMotion || !message) {
    return <BrandLines title={NORMAL_TITLE} subtitle={NORMAL_SUBTITLE} />;
  }
  return <AnimatedLines key={systemTheme} message={message} compactMobile={systemTheme !== 'hallo-christmas'} />;
}
