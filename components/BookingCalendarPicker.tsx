'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface TimeSlotOption {
  startTime: string; // 'HH:mm'
  endTime: string;   // 'HH:mm'
  startIso: string;  // 完整 ISO 時間字串
  disabled: boolean;
  reason?: string;
}

interface WorkingHourRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed?: boolean | null;
}

interface StoreExceptionRow {
  exception_date?: string | null;
  is_closed?: boolean | null;
}

interface AppointmentRow {
  start_time: string;
  end_time: string;
  payment_status?: string | null;
}

interface BookingCalendarPickerProps {
  storeId: string;
  durationMinutes: number;
  selectedDate: string; // 'YYYY-MM-DD'
  selectedTime: string; // 'HH:mm'
  onSelectDateTime: (dateStr: string, timeStr: string, startIso: string) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  return h * 60 + m;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// 判斷兩個時間區間 [startA, endA) 與 [startB, endB) 是否重疊
function isOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

export default function BookingCalendarPicker({
  storeId,
  durationMinutes,
  selectedDate,
  selectedTime,
  onSelectDateTime,
}: BookingCalendarPickerProps) {
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateYMD(now), [now]);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (y && m) return new Date(y, m - 1, 1);
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [workingHours, setWorkingHours] = useState<WorkingHourRow[]>([]);
  const [exceptions, setExceptions] = useState<StoreExceptionRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingMonth, setLoadingMonth] = useState<boolean>(false);

  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();

  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;
    const loadMonthAvailability = async () => {
      setLoadingMonth(true);
      try {
        const monthStart = new Date(year, monthIndex, 1);
        const monthEnd = new Date(year, monthIndex + 1, 0);
        const startDateStr = formatDateYMD(monthStart);
        const endDateStr = formatDateYMD(monthEnd);

        const rangeStartIso = new Date(year, monthIndex, 0, 0, 0, 0).toISOString();
        const rangeEndIso = new Date(year, monthIndex + 1, 2, 23, 59, 59).toISOString();

        const [whRes, apRes] = await Promise.all([
          supabase.from('working_hours').select('*').eq('store_id', storeId),
          supabase
            .from('appointments')
            .select('*')
            .eq('store_id', storeId)
            .gte('start_time', rangeStartIso)
            .lte('start_time', rangeEndIso),
        ]);

        let exData: StoreExceptionRow[] = [];
        try {
          const exRes = await supabase
            .from('store_exceptions')
            .select('*')
            .eq('store_id', storeId)
            .gte('exception_date', startDateStr)
            .lte('exception_date', endDateStr);
          if (!exRes.error && exRes.data) {
            exData = exRes.data as StoreExceptionRow[];
          }
        } catch {
          exData = [];
        }

        if (cancelled) return;

        if (!whRes.error && whRes.data) {
          setWorkingHours(whRes.data as WorkingHourRow[]);
        }
        setExceptions(exData);
        if (!apRes.error && apRes.data) {
          setAppointments(apRes.data as AppointmentRow[]);
        }
      } catch (err) {
        console.error('載入月曆可預約資料失敗:', err);
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    };

    loadMonthAvailability();
    return () => {
      cancelled = true;
    };
  }, [storeId, year, monthIndex]);

  const getSlotsForDate = (dateStr: string): TimeSlotOption[] => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0(日) ~ 6(六)

    // 1. 例外公休日判斷
    const matchedException = exceptions.find((ex) => ex.exception_date === dateStr);
    if (matchedException && matchedException.is_closed !== false) {
      return [];
    }

    // 2. 該星期營業時間（is_closed === true 代表公休；無資料時預設 10:00 - 20:00）
    const dayRules = workingHours.filter(
      (wh) => wh.day_of_week === dayOfWeek && wh.is_closed !== true
    );

    const hasExplicitClosedRule = workingHours.some(
      (wh) => wh.day_of_week === dayOfWeek && wh.is_closed === true
    );

    if (dayRules.length === 0 && hasExplicitClosedRule) {
      return [];
    }

    const effectiveRanges: Array<{ startMin: number; endMin: number }> =
      dayRules.length > 0
        ? dayRules.map((r) => ({
            startMin: parseTimeToMinutes(r.open_time),
            endMin: parseTimeToMinutes(r.close_time),
          }))
        : [{ startMin: 10 * 60, endMin: 20 * 60 }];

    // 3. 當天有效預約區間（排除 cancelled）
    const activeAppts = appointments.filter((ap) => {
      if (ap.payment_status === 'cancelled') return false;
      const apDate = new Date(ap.start_time);
      return formatDateYMD(apDate) === dateStr;
    });

    const bookedRanges = activeAppts.map((ap) => {
      const startDate = new Date(ap.start_time);
      const startMin = startDate.getHours() * 60 + startDate.getMinutes();
      const endDate = new Date(ap.end_time);
      const endMin = endDate.getHours() * 60 + endDate.getMinutes();
      return { startMin, endMin };
    });

    // 4. 依服務時長切出時段（每 30 分鐘一格）
    const serviceDur = durationMinutes > 0 ? durationMinutes : 60;
    const stepMinutes = 30;
    const isToday = dateStr === todayStr;
    const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

    const slots: TimeSlotOption[] = [];

    for (const range of effectiveRanges) {
      for (
        let cursor = range.startMin;
        cursor + serviceDur <= range.endMin;
        cursor += stepMinutes
      ) {
        const slotEnd = cursor + serviceDur;
        const startHHMM = formatMinutesToHHMM(cursor);
        const endHHMM = formatMinutesToHHMM(slotEnd);

        const startDateTime = new Date(y, m - 1, d, Math.floor(cursor / 60), cursor % 60, 0);
        const startIso = startDateTime.toISOString();

        if (dateStr < todayStr || (isToday && cursor <= currentMinutesNow)) {
          slots.push({
            startTime: startHHMM,
            endTime: endHHMM,
            startIso,
            disabled: true,
            reason: '已逾時',
          });
          continue;
        }

        const conflict = bookedRanges.some((b) =>
          isOverlap(cursor, slotEnd, b.startMin, b.endMin)
        );

        if (conflict) {
          slots.push({
            startTime: startHHMM,
            endTime: endHHMM,
            startIso,
            disabled: true,
            reason: '已預約',
          });
        } else {
          slots.push({
            startTime: startHHMM,
            endTime: endHHMM,
            startIso,
            disabled: false,
          });
        }
      }
    }

    return slots;
  };

  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const startWeekday = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const cells: Array<{
      dateStr: string | null;
      dayNumber: number | null;
      isPast: boolean;
      hasAvailableSlot: boolean;
    }> = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({
        dateStr: null,
        dayNumber: null,
        isPast: true,
        hasAvailableSlot: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
      const isPast = dateStr < todayStr;
      const daySlots = isPast ? [] : getSlotsForDate(dateStr);
      const hasAvailableSlot = !isPast && daySlots.some((s) => !s.disabled);

      cells.push({
        dateStr,
        dayNumber: day,
        isPast,
        hasAvailableSlot,
      });
    }

    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex, todayStr, workingHours, exceptions, appointments, durationMinutes, now]);

  const currentDaySlots = useMemo(() => {
    if (!selectedDate) return [];
    return getSlotsForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, workingHours, exceptions, appointments, durationMinutes, now]);

  const handlePrevMonth = () => {
    setViewMonth(new Date(year, monthIndex - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonth(new Date(year, monthIndex + 1, 1));
  };

  const handleResetAll = () => {
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDateTime('', '', '');
  };

  const handleSelectDay = (dateStr: string) => {
    onSelectDateTime(dateStr, '', '');
  };

  const handleSelectSlot = (slot: TimeSlotOption) => {
    if (slot.disabled || !selectedDate) return;
    onSelectDateTime(selectedDate, slot.startTime, slot.startIso);
  };

  return (
    <div className="space-y-5 min-w-0">
      {/* 月份切換 Header */}
      <div className="flex items-center justify-between bg-sky-400 text-white px-4 py-3 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-lg font-bold cursor-pointer"
          aria-label="上個月"
        >
          &lt;
        </button>
        <div className="text-sm sm:text-base font-bold tracking-wide">
          {year}年 {monthIndex + 1}月
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-lg font-bold cursor-pointer"
          aria-label="下個月"
        >
          &gt;
        </button>
      </div>

      {/* 星期列 */}
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 pb-1 border-b border-gray-100">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* 整月日期格子 */}
      {loadingMonth ? (
        <div className="py-10 text-center text-xs text-gray-400">正在計算整月可預約時段...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {calendarCells.map((cell, idx) => {
            if (!cell.dateStr || !cell.dayNumber) {
              return <div key={`empty-${idx}`} className="h-10" />;
            }

            const isDisabled = cell.isPast || !cell.hasAvailableSlot;
            const isSelected = selectedDate === cell.dateStr && !isDisabled;

            return (
              <button
                key={cell.dateStr}
                type="button"
                disabled={isDisabled}
                onClick={() => handleSelectDay(cell.dateStr!)}
                className={`h-10 rounded-lg text-sm transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : isDisabled
                    ? 'text-gray-300 bg-gray-50/70 cursor-not-allowed font-normal'
                    : 'text-gray-800 hover:bg-sky-50 font-semibold cursor-pointer'
                }`}
              >
                {cell.dayNumber}
              </button>
            );
          })}
        </div>
      )}

      {/* 圖例與全部重選 */}
      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-600" />
            已選日期
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" />
            已過期／已滿／公休
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          className="text-gray-600 hover:text-black underline underline-offset-2 cursor-pointer"
        >
          ↻ 全部重選
        </button>
      </div>

      {/* 可預約時段列表 */}
      <div className="pt-3 border-t border-gray-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">
            {selectedDate ? `${selectedDate} 可預約時段` : '請先點選上方可預約日期'}
          </h3>
          {selectedDate && (
            <span className="text-[11px] text-gray-400">服務時長：{durationMinutes} 分鐘</span>
          )}
        </div>

        {!selectedDate ? (
          <div className="py-6 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            點選月曆上的日期後，即可查看當天時段
          </div>
        ) : currentDaySlots.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-gray-200">
            當日無可預約時段（公休或已額滿）
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {currentDaySlots.map((slot) => {
              const isSlotSelected = selectedTime === slot.startTime && !slot.disabled;

              return (
                <button
                  key={slot.startTime}
                  type="button"
                  disabled={slot.disabled}
                  onClick={() => handleSelectSlot(slot)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between ${
                    slot.disabled
                      ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                      : isSlotSelected
                      ? 'bg-sky-50 border-sky-600 text-gray-900 shadow-xs cursor-pointer'
                      : 'bg-white border-gray-200 hover:border-sky-400 text-gray-800 cursor-pointer'
                  }`}
                >
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        slot.disabled ? 'text-gray-400' : 'text-gray-900'
                      }`}
                    >
                      {slot.startTime} - {slot.endTime}
                    </div>
                  </div>

                  {slot.disabled ? (
                    <span className="text-xs text-gray-400">{slot.reason || '不可選'}</span>
                  ) : (
                    <span
                      className={`text-xs font-medium ${
                        isSlotSelected ? 'text-sky-700' : 'text-gray-600'
                      }`}
                    >
                      {isSlotSelected ? '✓ 已選擇' : '可預約'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}