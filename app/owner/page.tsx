'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Appointment } from '@/types/database';

export default function OwnerDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. 載入所有預約清單（關聯取得服務項目名稱）
  const fetchAppointments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, services(name, price, deposit)')
      .order('start_time', { ascending: false });

    if (error) {
      console.error('載入預約失敗:', error);
    } else if (data) {
      setAppointments(data as Appointment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // 2. 老闆點擊確認入帳
  const handleConfirmPayment = async (id: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: 'confirmed' })
      .eq('id', id);

    if (error) {
      alert('更新狀態失敗');
    } else {
      alert('已成功確認入帳！');
      fetchAppointments();
    }
  };

  // 3. 老闆取消預約
  const handleCancelAppointment = async (id: string) => {
    if (!confirm('確定要取消此筆預約嗎？')) return;

    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: 'cancelled' })
      .eq('id', id);

    if (error) {
      alert('取消失敗');
    } else {
      fetchAppointments();
    }
  };

  return (
    <main className="mx-auto max-w-2xl min-h-screen bg-gray-50 p-6">
      <header className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-gray-800">🛠️ 老闆端預約對帳管理後台</h1>
          <p className="text-xs text-gray-500 mt-0.5">艾莉絲質感美甲工作室</p>
        </div>
        <button
          onClick={fetchAppointments}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-2 rounded-xl transition-all"
        >
          🔄 重新整理
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12 text-gray-500">載入預約紀錄中...</div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          目前沒有任何預約紀錄
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((item) => (
            <div
              key={item.id}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                    {item.services?.name || '未知服務'}
                  </span>
                  <h2 className="text-base font-bold text-gray-800 mt-2">
                    客人：{item.customer_name}
                  </h2>
                </div>
                <div>
                  {item.payment_status === 'pending_verify' && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                      ⏳ 待對帳
                    </span>
                  )}
                  {item.payment_status === 'confirmed' && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      ✅ 已確認預約
                    </span>
                  )}
                  {item.payment_status === 'cancelled' && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700">
                      ❌ 已取消
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-xl">
                <p>📅 預約時間：{new Date(item.start_time).toLocaleString('zh-TW', { hour12: false })}</p>
                <p>
                  💳 回報轉帳後五碼：<span className="font-mono font-bold text-gray-900 text-sm">{item.bank_last_five}</span>
                </p>
              </div>

              {/* 審核操作按鈕 */}
              {item.payment_status === 'pending_verify' && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleConfirmPayment(item.id)}
                    className="flex-1 bg-black text-white py-2.5 rounded-xl text-xs font-medium hover:bg-gray-800 transition-all"
                  >
                    ✅ 確認入帳 (成立預約)
                  </button>
                  <button
                    onClick={() => handleCancelAppointment(item.id)}
                    className="px-4 bg-gray-100 text-rose-600 py-2.5 rounded-xl text-xs font-medium hover:bg-rose-50 transition-all"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}