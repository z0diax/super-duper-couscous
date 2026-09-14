import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  startDate: string;
  endDate: string;
  dayType: 'WHOLE_DAY' | 'AM_HALF_DAY' | 'PM_HALF_DAY';
  onChange: (startDate: string, endDate: string) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return value && year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
};
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const displayDate = (value: string) => {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date) : '';
};

export const LeaveDateRangePicker: React.FC<Props> = ({ startDate, endDate, dayType, onChange }) => {
  const initial = parseDate(startDate) || new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)));
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const days = useMemo(() => {
    const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const gridStart = new Date(first); gridStart.setUTCDate(1 - first.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart); date.setUTCDate(gridStart.getUTCDate() + index); return date;
    });
  }, [month]);
  const label = startDate
    ? `${displayDate(startDate)}${endDate && endDate !== startDate ? ` to ${displayDate(endDate)}` : ''}`
    : 'Select leave date range';
  const moveMonth = (amount: number) => setMonth(value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1)));
  const chooseDate = (value: string) => {
    if (dayType !== 'WHOLE_DAY') { onChange(value, value); setPendingStart(null); setHoveredDate(null); setIsOpen(false); return; }
    if (!pendingStart) { setPendingStart(value); setHoveredDate(null); onChange(value, value); return; }
    onChange(pendingStart < value ? pendingStart : value, pendingStart < value ? value : pendingStart);
    setPendingStart(null); setHoveredDate(null); setIsOpen(false);
  };

  return <div className="relative">
    <button type="button" aria-label="Select Leave Date Range" aria-expanded={isOpen} onClick={() => { setPendingStart(null); setHoveredDate(null); setIsOpen(value => !value); }} className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left font-normal text-slate-800 outline-none transition hover:border-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
      <span className={startDate ? '' : 'text-slate-400'}>{label}</span><CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
    {isOpen && <div className="absolute left-0 z-30 mt-2 w-[min(21rem,calc(100vw-4rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
        <strong className="text-sm text-slate-800">{MONTHS[month.getUTCMonth()]} {month.getUTCFullYear()}</strong>
        <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map(day => <span key={day} className="py-1 text-[10px] font-bold uppercase text-slate-400">{day}</span>)}
        {days.map(date => {
          const value = isoDate(date); const inMonth = date.getUTCMonth() === month.getUTCMonth();
          const previewStart = pendingStart && hoveredDate ? (pendingStart < hoveredDate ? pendingStart : hoveredDate) : '';
          const previewEnd = pendingStart && hoveredDate ? (pendingStart < hoveredDate ? hoveredDate : pendingStart) : '';
          const previewed = !!previewStart && value >= previewStart && value <= previewEnd;
          const selected = previewed || (!!startDate && value >= startDate && value <= (endDate || startDate));
          const endpoint = pendingStart ? value === pendingStart || (!!hoveredDate && value === hoveredDate) : value === startDate || value === endDate;
          return <button key={value} type="button" aria-label={value} data-range-state={endpoint ? 'endpoint' : selected ? 'between' : undefined} onPointerEnter={() => pendingStart && setHoveredDate(value)} onPointerMove={() => pendingStart && hoveredDate !== value && setHoveredDate(value)} onFocus={() => pendingStart && setHoveredDate(value)} onClick={() => chooseDate(value)} className={`h-9 text-xs font-semibold transition ${endpoint ? 'relative z-10 rounded-lg bg-blue-600 text-white shadow-sm' : selected ? 'rounded-none bg-blue-100 text-blue-800' : inMonth ? 'rounded-lg text-slate-700 hover:bg-slate-100' : 'rounded-lg text-slate-300 hover:bg-slate-50'}`}>{date.getUTCDate()}</button>;
        })}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2 text-center text-[10px] text-slate-500">{dayType === 'WHOLE_DAY' ? (pendingStart ? 'Select the last day of the leave period.' : 'Select the first day, then the last day.') : 'Select the half-day leave date.'}</p>
    </div>}
  </div>;
};
