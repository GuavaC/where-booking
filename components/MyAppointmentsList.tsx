'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Appointment } from '@/types/database';

interface MyAppointmentsListProps {
  storeId: string;
  customerLineId: string;
  refreshKey?: number;
  onCancelled?: () => void;
}

const CANCEL_WINDOW_HOURS = 24;

export default function MyAppointmentsList({
  storeId,
  customerLineId,
  refreshKey = 0,
  onCancelled,
}: MyAppointmentsListProps) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadMyAppointments = useCallback(async () => {
    if (!storeId || !customerLineId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('appointments')
      .select('*, services(name, price, deposit)')
      .eq('store_id', storeId)
      .eq('customer_line_id', customerLineId)
      .in('payment_status', ['pending_verify', 'confirmed'])
      .order('start_time', { ascending: false });

    if (!error && data) {
      setItems(data as Appointment[]);
    }
    setLoading(false);
  }, [storeId, customerLineId]);

  useEffect(() => {
    loadMyAppointments();
  }, [loadMyAppointments, refreshKey]);

  const handleCancel = async (appointmentId: string) => {
    if (cancellingId) return;
    if (!confirm('確定要取消這筆預約嗎？取消後時段將會釋出。')) return;

    setCancellingId(appointmentId);
    try {
      const res = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          customerLineId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || '無法取消預約');
        return;
      }

      alert('已取消預約，時段已釋出！');
      await loadMyAppointments();
      onCancelled?.();
    } catch (err) {
      console.error(err);
      alert('取消操作失敗，請稍後再試');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-xs text-gray-400 text-center">
        查詢您的預約紀錄中...
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">📌 我的預約紀錄</h2>
        <span className="text-[11px] text-gray-400">預約 24 小時前可線上取消</span>
      </div>

      <div className="space-y-2.5">
        {items.map((appt) => {
          const startDate = new Date(appt.start_time);
          const hoursUntilStart = (startDate.getTime() - Date.now()) / (1000 * 60 * 60);
          const canSelfCancel =
            appt.payment_status === 'pending_verify' && hoursUntilStart >= CANCEL_WINDOW_HOURS;

          return (
            <div
              key={appt.id}
              className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {appt.services?.name || '預約服務'}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    📅 {startDate.toLocaleString('zh-TW', { hour12: false })}
                  </p>
                </div>

                {appt.payment_status === 'pending_verify' ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                    ⏳ 待對帳
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                    ✅ 已確認
                  </span>
                )}
              </div>

              {canSelfCancel ? (
                <button
                  type="button"
                  disabled={cancellingId === appt.id}
                  onClick={() => handleCancel(appt.id)}
                  className="w-full py-2 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-50 transition-all"
                >
                  {cancellingId === appt.id ? '取消處理中...' : '取消此筆預約'}
                </button>
              ) : (
                <p className="text-[11px] text-gray-500 bg-white px-2.5 py-1.5 rounded-lg border border-gray-100">
                  {appt.payment_status === 'confirmed'
                    ? '此預約已確認入帳，如需取消或改期請直接聯繫工作室協助。'
                    : '距離預約已不足 24 小時，無法線上取消，請直接聯繫工作室。'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}