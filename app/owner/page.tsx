'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Appointment } from '@/types/database';
import ServicesManager from '@/components/owner/ServicesManager';
import ScheduleManager from '@/components/owner/ScheduleManager';
import StoreSettingsManager from '@/components/owner/StoreSettingsManager';

const STORE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

type OwnerTab = 'appointments' | 'services' | 'schedule' | 'settings';

export default function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState<OwnerTab>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [storeName, setStoreName] = useState<string>('載入中...');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 1. 載入店家資訊與所有預約清單
  const fetchDashboardData = async () => {
    setLoading(true);

    const [storeRes, apptRes] = await Promise.all([
      supabase.from('stores').select('store_name').eq('id', STORE_ID).single(),
      supabase
        .from('appointments')
        .select('*, services(name, price, deposit)')
        .eq('store_id', STORE_ID)
        .order('start_time', { ascending: false }),
    ]);

    if (storeRes.data?.store_name) {
      setStoreName(storeRes.data.store_name);
    }

    if (apptRes.error) {
      console.error('載入預約失敗:', apptRes.error);
    } else if (apptRes.data) {
      setAppointments(apptRes.data as Appointment[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 2. 老闆點擊確認入帳
  const handleConfirmPayment = async (appointmentId: string) => {
    if (processingId) return;
    setProcessingId(appointmentId);

    try {
      const res = await fetch('/api/appointments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || '確認入帳失敗');
        return;
      }

      if (data.lineNotified) {
        alert('已確認入帳，並已發送 LINE 預約成功通知給客人！');
      } else {
        alert(`已確認入帳（未發送 LINE 推播：${data.reason || '請檢查設定'}）`);
      }

      await fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert('操作失敗，請稍後再試');
    } finally {
      setProcessingId(null);
    }
  };

  // 3. 老闆取消預約
  const handleCancelAppointment = async (id: string) => {
    if (processingId) return;
    if (!confirm('確定要取消此筆預約嗎？')) return;

    setProcessingId(id);
    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: 'cancelled' })
      .eq('id', id);

    setProcessingId(null);

    if (error) {
      alert('取消失敗');
    } else {
      fetchDashboardData();
    }
  };

  const pendingCount = appointments.filter((a) => a.payment_status === 'pending_verify').length;

  return (
    <main className="mx-auto w-full max-w-2xl min-h-screen bg-gray-50 p-4 sm:p-6 pb-16">
      <header className="flex justify-between items-center mb-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-gray-800">🛠️ 老闆端管理後台</h1>
          <p className="text-xs text-gray-500 mt-0.5">{storeName}</p>
        </div>
        {activeTab === 'appointments' && (
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-xs px-3 py-2 rounded-xl transition-all"
          >
            🔄 重新整理
          </button>
        )}
      </header>

      {/* 功能分頁導覽列 */}
      <nav className="grid grid-cols-4 gap-1.5 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('appointments')}
          className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'appointments'
              ? 'bg-black text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          預約對帳{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'services'
              ? 'bg-black text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          服務項目
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'schedule'
              ? 'bg-black text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          營業與公休
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'settings'
              ? 'bg-black text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          收款設定
        </button>
      </nav>

      {/* Tab 1: 預約對帳 */}
      {activeTab === 'appointments' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">載入預約紀錄中...</div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100 text-sm">
              目前沒有任何預約紀錄
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((item) => {
                const isProcessing = processingId === item.id;

                return (
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
                      <p>
                        📅 預約時間：
                        {new Date(item.start_time).toLocaleString('zh-TW', { hour12: false })}
                      </p>
                      <p>
                        💳 回報轉帳後五碼：
                        <span className="font-mono font-bold text-gray-900 text-sm">
                          {item.bank_last_five}
                        </span>
                      </p>
                    </div>

                    {item.payment_status === 'pending_verify' && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleConfirmPayment(item.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-black text-white py-2.5 rounded-xl text-xs font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-all"
                        >
                          {isProcessing ? '處理與推播中...' : '✅ 確認入帳 (成立預約)'}
                        </button>
                        <button
                          onClick={() => handleCancelAppointment(item.id)}
                          disabled={isProcessing}
                          className="px-4 bg-gray-100 text-rose-600 py-2.5 rounded-xl text-xs font-medium hover:bg-rose-50 disabled:opacity-50 transition-all"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 2: 服務項目管理 */}
      {activeTab === 'services' && <ServicesManager storeId={STORE_ID} />}

      {/* Tab 3: 營業時間與公休日 */}
      {activeTab === 'schedule' && <ScheduleManager storeId={STORE_ID} />}

      {/* Tab 4: 店家與收款資訊設定 */}
      {activeTab === 'settings' && (
        <StoreSettingsManager
          storeId={STORE_ID}
          onUpdated={(newName) => setStoreName(newName)}
        />
      )}
    </main>
  );
}