import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeaveApplicationRecord, LeaveDateRange } from '../types';
import { LEAVE_CALENDAR_MONTHS, LEAVE_CALENDAR_WEEKDAYS, leaveCalendarDays } from './LeaveDateRangePicker';

type SelectedDate = { date: string; dayType: LeaveDateRange['dayType'] };
type Props = { record: LeaveApplicationRecord; selectedDates: SelectedDate[] };

const dayLabel = (dayType: LeaveDateRange['dayType']) =>
  dayType === 'AM_HALF_DAY' ? 'AM half-day' : dayType === 'PM_HALF_DAY' ? 'PM half-day' : 'Whole day';

export const LeaveDatesCalendar: React.FC<Props> = ({ record, selectedDates }) => {
  const firstDate = selectedDates[0]?.date || record.startDate;
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = firstDate.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, 1));
  });
  const days = useMemo(() => leaveCalendarDays(month), [month]);
  const selected = useMemo(() => new Map(selectedDates.map(entry => [entry.date, entry.dayType])), [selectedDates]);
  const ranges = record.dateRanges?.length ? record.dateRanges : [{ startDate: record.startDate, endDate: record.endDate }];
  const moveMonth = (amount: number) => setMonth(current => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + amount, 1)));

  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <button type="button" aria-label="Previous leave month" onClick={() => moveMonth(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
      <strong className="text-sm text-slate-800">{LEAVE_CALENDAR_MONTHS[month.getUTCMonth()]} {month.getUTCFullYear()}</strong>
      <button type="button" aria-label="Next leave month" onClick={() => moveMonth(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="grid grid-cols-7 gap-y-1 text-center">
      {LEAVE_CALENDAR_WEEKDAYS.map(day => <span key={day} className="py-1 text-[10px] font-bold uppercase text-slate-400">{day}</span>)}
      {days.map(date => {
        const value = date.toISOString().slice(0, 10);
        const dayType = selected.get(value);
        const isSelected = dayType !== undefined;
        const inRange = ranges.some(range => value >= range.startDate && value <= range.endDate);
        const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
        const skipped = !isSelected && weekend && inRange;
        const endpoint = isSelected && ranges.some(range => value === range.startDate || value === range.endDate);
        const inMonth = date.getUTCMonth() === month.getUTCMonth();
        const halfDay = dayType === 'AM_HALF_DAY' || dayType === 'PM_HALF_DAY';
        const label = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
        const description = isSelected ? `${label}, ${dayLabel(dayType)}` : skipped ? `${label}, weekend skipped` : label;
        return <time key={value} dateTime={value} data-date={value} data-range-state={endpoint ? 'endpoint' : isSelected ? 'between' : skipped ? 'skipped' : undefined} aria-label={description} title={description} className={`relative flex h-9 items-center justify-center text-xs font-semibold ${endpoint ? 'z-10 rounded-lg bg-blue-600 text-white shadow-sm' : isSelected ? 'bg-blue-100 text-blue-800' : skipped ? 'rounded-lg bg-blue-50 text-slate-400' : inMonth ? 'rounded-lg text-slate-700' : 'rounded-lg text-slate-300'}`}>
          {date.getUTCDate()}{halfDay && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-current" aria-hidden="true" />}
        </time>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Leave date</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-50 ring-1 ring-blue-100" /> Weekend skipped</span>
      {selectedDates.some(entry => entry.dayType !== 'WHOLE_DAY') && <span>Dot = half-day</span>}
    </div>
  </div>;
};
