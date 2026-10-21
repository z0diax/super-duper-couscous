import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchLeaveSuggestions, saveLeaveSuggestion, type LeaveSuggestion, type LeaveSuggestionCategory } from '../services/leaveApi';

const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ').toLowerCase();

export function LeaveDetailsAutocomplete({ category, locationType, value, onChange, required, placeholder }: {
  category: LeaveSuggestionCategory; locationType: string; value: string; onChange: (value: string) => void;
  required: boolean; placeholder: string;
}) {
  const listId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const recent = useRef(new Map<string, { expires: number; items: LeaveSuggestion[] }>());
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LeaveSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 260, transform: 'none' });

  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const current = generation.current;
    setLoading(true);
    setItems([]);
    const cacheKey = `${category}:${locationType}:${normalize(value)}`;
    const cached = recent.current.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      setItems(cached.items); setLoading(false);
      return () => controller.abort();
    }
    const timer = window.setTimeout(() => {
      searchLeaveSuggestions(category, value.trim().replace(/\s+/gu, ' '), locationType, controller.signal)
        .then(result => {
          if (!controller.signal.aborted && current === generation.current) {
            if (recent.current.size >= 20) recent.current.delete(recent.current.keys().next().value!);
            recent.current.set(cacheKey, { expires: Date.now() + 5000, items: result.items });
            setItems(result.items);
          }
        })
        .catch(reason => { if (!controller.signal.aborted && current === generation.current) setError(reason.message || 'Suggestions could not be loaded.'); })
        .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [category, locationType, value, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      const below = height + offset - rect.bottom - 12;
      const above = rect.top - offset - 12;
      const useAbove = below < 180 && above > below;
      const maxHeight = Math.max(60, Math.min(260, useAbove ? above : below));
      setPosition({ top: useAbove ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.left), width: Math.min(rect.width, window.innerWidth - 16), maxHeight,
        transform: useAbove ? 'translateY(-100%)' : 'none' });
    };
    const outside = (event: PointerEvent) => {
      if (!input.current?.contains(event.target as Node) && !dropdown.current?.contains(event.target as Node)) { setOpen(false); setActive(-1); }
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    if (input.current) observer.observe(input.current);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    document.addEventListener('pointerdown', outside);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);

  useEffect(() => { if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, listId]);

  const select = (item: LeaveSuggestion) => {
    generation.current++;
    onChange(item.value); setOpen(false); setActive(-1); setError(''); setFeedback('Suggestion selected');
  };
  const save = async () => {
    if (!normalize(value) || saving.current) return;
    const current = generation.current;
    saving.current = true; setBusy(true); setError(''); setFeedback('');
    try {
      const result = await saveLeaveSuggestion(category, value, locationType);
      recent.current.clear();
      if (current !== generation.current) return;
      generation.current++;
      onChange(result.item.value); setOpen(false); setActive(-1);
      setFeedback(result.created ? 'Suggestion saved' : 'Existing suggestion selected');
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Suggestion could not be saved. Press Enter to retry.');
    } finally { saving.current = false; setBusy(false); }
  };

  return <>
    <textarea ref={input} id="input-leave-specific-details" role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? listId : undefined} aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
      aria-description="Arrow keys navigate suggestions. Enter selects or saves. Shift+Enter inserts a newline."
      required={required} maxLength={2000} value={value} rows={2} placeholder={placeholder}
      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100"
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={event => { generation.current++; onChange(event.target.value); setItems([]); setActive(-1); setOpen(true); setError(''); setFeedback(''); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return; }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault(); event.stopPropagation();
          if (open && active >= 0 && items[active]) select(items[active]); else void save();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          if (items.length) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % items.length : (previous <= 0 ? items.length - 1 : previous - 1));
        } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
        else if (event.key === 'Tab') { setOpen(false); setActive(-1); }
      }} />
    <span role="status" aria-live="polite" className="block text-[11px] font-normal text-emerald-700">{busy ? 'Saving suggestion…' : feedback}</span>
    {error && <span role="alert" className="block text-[11px] font-normal text-rose-600">{error}</span>}
    {open && createPortal(<div ref={dropdown} style={position}
      className="fixed z-[80] overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-xs font-normal text-[var(--app-text)] shadow-lg"
      onPointerDown={event => { if (event.pointerType === 'mouse') event.preventDefault(); }}>
      <div id={listId} role="listbox" aria-label={category === 'medical' ? 'Medical suggestions' : 'Destination suggestions'} aria-busy={loading}>
        {items.map((item, index) => <div key={item.id} id={`${listId}-${index}`} role="option" aria-selected={active === index}
          className={`cursor-pointer whitespace-pre-wrap break-words px-3 py-2 ${active === index ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary-text)]' : 'hover:bg-[var(--app-surface-muted)]'}`}
          onPointerDown={event => event.preventDefault()} onClick={() => select(item)}>{item.value}</div>)}
      </div>
      <div className="border-t border-[var(--app-border)] px-3 py-2 text-[11px] text-[var(--app-text-muted)]">
        {loading ? 'Searching…' : !items.length && normalize(value) ? 'No matching saved suggestions.' : ''}
        {!loading && normalize(value) && !items.some(item => normalize(item.value) === normalize(value)) &&
          <button type="button" disabled={busy} onPointerDown={event => event.preventDefault()} onClick={() => void save()}
            className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-left font-semibold text-[var(--app-primary-text)] hover:bg-[var(--app-primary-soft)] disabled:opacity-50">
            <span>{busy ? 'Saving suggestion…' : 'Save suggestion'}</span><kbd className="ml-3 text-[10px] font-normal">Enter</kbd>
          </button>}
        {!loading && !normalize(value) && 'Type to search saved suggestions'}
      </div>
    </div>, document.body)}
  </>;
}
