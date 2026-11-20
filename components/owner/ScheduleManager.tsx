'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ScheduleManagerProps {
  storeId: string;
}

interface DayScheduleItem {
  id?: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface ExceptionItem {
  id: string;
  exception_date: string;
  reason?: string | null;
  is_closed: boolean;
}

const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function normalizeHHMM(t: string): string {
  return t ? t.slice(0, 5) : '10:00';
}

export default function ScheduleManager({ storeId }: ScheduleManagerProps) {
  const [schedules, setSchedules] = useState<DayScheduleItem[]>(() =>
    DAY_LABELS.map((_, idx) => ({
      day_of_week: idx,
      open_time: '10:00',
      close_time: '20:00',
      is_closed: idx === 0, // 預設週日公休，載入資料庫後會覆蓋
    }))
  );
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [newExDate, setNewExDate] = useState('');
  const [newExReason, setNewExReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [addingEx, setAddingEx] = useState(false);

  const fetchScheduleData = async () => {
    setLoading(true);

    const [whRes, exRes] = await Promise.all([
      supabase.from('working_hours').select('*').eq('store_id', storeId),
      supabase
        .from('store_exceptions')
        .select('*')
        .eq('store_id', storeId)
        .order('exception_date', { ascending: true }),
    ]);

    if (!whRes.error && whRes.data && whRes.data.length > 0) {
      const merged = DAY_LABELS.map((_, idx) => {
        const found = whRes.data.find((r) => r.day_of_week === idx);
        if (found) {
          return {
            id: found.id,
            day_of_week: idx,
            open_time: normalizeHHMM(found.open_time),
            close_time: normalizeHHMM(found.close_time),
            is_closed: Boolean(found.is_closed),
          };
        }
        return {
          day_of_week: idx,
          open_time: '10:00',
          close_time: '20:00',
          is_closed: false,
        };
      });
      setSchedules(merged);
    }

    if (!exRes.error && exRes.data) {
      setExceptions(exRes.data as ExceptionItem[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (storeId) fetchScheduleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const updateDayField = (
    dayIdx: number,
    field: 'open_time' | 'close_time' | 'is_closed',
    value: string | boolean
  ) => {
    setSchedules((prev) =>
      prev.map((item) =>
        item.day_of_week === dayIdx ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSaveWorkingHours = async () => {
    setSavingHours(true);
    try {
      // 先刪除舊規則再寫入最新 7 天規則，確保乾淨不重複
      await supabase.from('working_hours').delete().eq('store_id', storeId);

      const rowsToInsert = schedules.map((s) => ({
        store_id: storeId,
        day_of_week: s.day_of_week,
        open_time: s.open_time,
        close_time: s.close_time,
        is_closed: s.is_closed,
      }));

      const { error } = await supabase.from('working_hours').insert(rowsToInsert);
      if (error) {
        alert('儲存營業時間失敗：' + error.message);
        return;
      }

      alert('每週營業時間已更新！客端月曆將立即套用新規則。');
      await fetchScheduleData();
    } finally {
      setSavingHours(false);
    }
  };

  const handleAddException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExDate) {
      alert('請選擇公休日期');
      return;
    }

    if (exceptions.some((ex) => ex.exception_date === newExDate)) {
      alert('該日期已經在公休清單中了');
      return;
    }

    setAddingEx(true);
    const { error } = await supabase.from('store_exceptions').insert({
      store_id: storeId,
      exception_date: newExDate,
      reason: newExReason.trim() || '店休',
      is_closed: true,
    });
    setAddingEx(false);

    if (error) {
      alert('新增公休日失敗（請確認 store_exceptions 資料表已建立）：' + error.message);
      return;
    }

    setNewExDate('');
    setNewExReason('');
    await fetchScheduleData();
  };

  const handleDeleteException = async (id: string) => {
    const { error } = await supabase.from('store_exceptions').delete().eq('id', id);
    if (!error) {
      await fetchScheduleData();
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-gray-400">載入排班設定中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 區塊一：每週固定營業時間 */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-800">🕒 每週固定營業時間</h2>
          <p className="text-xs text-gray-500 mt-0.5">勾選公休的星期，客端月曆會自動反灰不可預約</p>
        </div>

        <div className="space-y-2.5">
          {schedules.map((item) => (
            <div
              key={item.day_of_week}
              className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${
                item.is_closed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-800 w-9">
                  {DAY_LABELS[item.day_of_week]}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!item.is_closed}
                    onChange={(e) =>
                      updateDayField(item.day_of_week, 'is_closed', !e.target.checked)
                    }
                    className="rounded accent-black"
                  />
                  <span>{item.is_closed ? '公休' : '營業'}</span>
                </label>
              </div>

              {!item.is_closed ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <input
                    type="time"
                    value={item.open_time}
                    onChange={(e) =>
                      updateDayField(item.day_of_week, 'open_time', e.target.value)
                    }
                    className="p-1.5 rounded-lg border border-gray-200 bg-white"
                  />
                  <span className="text-gray-400">至</span>
                  <input
                    type="time"
                    value={item.close_time}
                    onChange={(e) =>
                      updateDayField(item.day_of_week, 'close_time', e.target.value)
                    }
                    className="p-1.5 rounded-lg border border-gray-200 bg-white"
                  />
                </div>
              ) : (
                <span className="text-xs text-gray-400">全日公休</span>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSaveWorkingHours}
          disabled={savingHours}
          className="w-full bg-black text-white py-3 rounded-xl text-xs font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-all"
        >
          {savingHours ? '儲存中...' : '儲存每週營業時間'}
        </button>
      </section>

      {/* 區塊二：特定公休日 / 特休管理 */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-800">🏖️ 特定公休日設定</h2>
          <p className="text-xs text-gray-500 mt-0.5">臨時休假、進修或連假可在此鎖定整天</p>
        </div>

        <form onSubmit={handleAddException} className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            required
            value={newExDate}
            onChange={(e) => setNewExDate(e.target.value)}
            className="p-2.5 rounded-xl border border-gray-200 text-xs bg-white"
          />
          <input
            type="text"
            placeholder="備註（例如：進修公休）"
            value={newExReason}
            onChange={(e) => setNewExReason(e.target.value)}
            className="flex-1 p-2.5 rounded-xl border border-gray-200 text-xs bg-white"
          />
          <button
            type="submit"
            disabled={addingEx}
            className="px-4 py-2.5 bg-black text-white rounded-xl text-xs font-medium hover:bg-gray-800 disabled:bg-gray-400 shrink-0"
          >
            {addingEx ? '新增中...' : '+ 新增公休'}
          </button>
        </form>

        {exceptions.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">目前沒有設定特定公休日</p>
        ) : (
          <div className="space-y-2">
            {exceptions.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs"
              >
                <div>
                  <span className="font-bold text-gray-800">{ex.exception_date}</span>
                  {ex.reason && <span className="text-gray-500 ml-2">（{ex.reason}）</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteException(ex.id)}
                  className="text-rose-600 hover:underline font-medium"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}