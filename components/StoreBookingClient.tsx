'use client';

import { useState, useEffect } from 'react';
import { initLiff, LiffUser } from '@/lib/liff';
import { supabase } from '@/lib/supabase';
import { Store, Service } from '@/types/database';
import BookingCalendarPicker from '@/components/BookingCalendarPicker';
import MyAppointmentsList from '@/components/MyAppointmentsList';

export default function StoreBookingClient({ storeId }: { storeId: string }) {
  const [liffUser, setLiffUser] = useState<LiffUser | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundStore, setNotFoundStore] = useState(false);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedStartIso, setSelectedStartIso] = useState<string>('');
  const [bankLastFive, setBankLastFive] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [appointmentsRefreshKey, setAppointmentsRefreshKey] = useState(0);

  const lineOaUrl = process.env.NEXT_PUBLIC_LINE_OA_URL;

  useEffect(() => {
    if (!storeId) return;

    async function init() {
      setLoading(true);
      const user = await initLiff();
      setLiffUser(user);

      const { data: storeData, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (storeErr || !storeData) {
        setNotFoundStore(true);
        setLoading(false);
        return;
      }

      setStore(storeData as Store);

      const { data: serviceData } = await supabase
        .from('services')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true });

      if (serviceData && serviceData.length > 0) {
        setServices(serviceData as Service[]);
        setSelectedService(serviceData[0] as Service);
      }

      setLoading(false);
    }

    init();
  }, [storeId]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedService ||
      !selectedDate ||
      !selectedTime ||
      !bankLastFive ||
      !liffUser ||
      !store
    ) {
      alert('請完整填寫服務項目、日期時段與轉帳後五碼！');
      return;
    }

    if (bankLastFive.trim().length !== 5) {
      alert('請輸入正確的 5 碼銀行帳號後五碼');
      return;
    }

    setSubmitting(true);

    try {
      const startTime = selectedStartIso
        ? new Date(selectedStartIso)
        : new Date(`${selectedDate}T${selectedTime}:00`);
      const endTime = new Date(startTime.getTime() + selectedService.duration_minutes * 60000);

      const res = await fetch('/api/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          customerLineId: liffUser.userId,
          customerName: liffUser.displayName,
          serviceId: selectedService.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          bankLastFive: bankLastFive.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || '預約送出失敗，請稍後再試');
        return;
      }

      setAppointmentsRefreshKey((k) => k + 1);
      setSuccessMsg(true);
    } catch (err) {
      console.error(err);
      alert('網路連線異常，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        載入預約系統中...
      </main>
    );
  }

  if (notFoundStore) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 p-6 text-center text-gray-600">
        找不到此預約店家，請確認連結是否正確。
      </main>
    );
  }

  if (successMsg) {
    return (
      <main className="mx-auto w-full max-w-md min-h-screen bg-white p-6 flex flex-col justify-center items-center text-center">
        <div className="w-full space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-2xl font-bold text-gray-800">預約申請已送出！</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            我們已收到您的定金轉帳後五碼。<br />
            老闆確認入帳後，將透過 LINE 發送預約成功通知給您！
          </p>

          <div className="p-3.5 rounded-xl bg-[#06C755]/10 border border-[#06C755]/30 space-y-2 text-xs text-left">
            <p className="font-bold text-gray-800 flex items-center gap-1.5">
              <span>🔔</span>
              <span>重要提醒：開啟 LINE 預約通知</span>
            </p>
            <p className="text-gray-600 leading-relaxed">
              請務必先加入系統通知官方帳號為好友，預約確認入帳、取消或異動時您才會即時收到 LINE 提醒！
            </p>
            {lineOaUrl ? (
              <a
                href={lineOaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-2.5 rounded-lg bg-[#06C755] text-white font-bold shadow-sm hover:opacity-90 transition-opacity"
              >
                ➕ 點此加入通知官方帳號
              </a>
            ) : (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                提醒：請確認您已加入本系統的 LINE 通知官方帳號好友，以確保能正常接收預約推播。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-black text-white py-3 rounded-xl font-medium shadow hover:bg-gray-800 transition-all"
          >
            返回首頁
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 pb-12">
      <header className="bg-white p-6 shadow-sm border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">{store?.store_name || '載入中...'}</h1>
        <p className="text-xs text-gray-500 mt-1">
          登入身分：{liffUser?.displayName} {liffUser?.isDemo && '(測試模式)'}
        </p>
      </header>

      <form onSubmit={handleBookingSubmit} className="p-4 space-y-6">
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">1. 選擇預約服務項目</h2>
          <div className="space-y-2">
            {services.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setSelectedService(s);
                  setSelectedTime('');
                  setSelectedStartIso('');
                }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedService?.id === s.id
                    ? 'border-black bg-black/5 font-medium'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-800 text-sm">{s.name}</span>
                  <span className="text-gray-900 font-bold">NT$ {s.price}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                  <span>⏱️ 耗時 {s.duration_minutes} 分鐘</span>
                  <span className="text-rose-600 font-medium">需付定金 NT$ {s.deposit}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">2. 選擇預約日期與時段</h2>
          {store?.id && (
            <BookingCalendarPicker
              storeId={store.id}
              durationMinutes={selectedService?.duration_minutes || 60}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onSelectDateTime={(dateStr, timeStr, isoStr) => {
                setSelectedDate(dateStr);
                setSelectedTime(timeStr);
                setSelectedStartIso(isoStr);
              }}
            />
          )}
        </section>

        {selectedService && (
          <section className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-3">
            <h2 className="text-sm font-semibold text-amber-900">3. 定金匯款與後五碼回報</h2>
            <div className="text-xs text-amber-800 space-y-1 bg-white/80 p-3 rounded-xl border border-amber-100">
              <p>
                💳 <strong className="font-semibold">轉帳資訊</strong>：{store?.bank_info}
              </p>
              <p>
                💰 <strong className="font-semibold">應付定金</strong>：
                <span className="font-bold text-rose-600">NT$ {selectedService.deposit}</span>
              </p>
              <p className="text-gray-500 text-[11px] mt-1">
                ⚠️ 請於 15 分鐘內完成轉帳並填寫帳號後五碼，否則系統將自動釋出時段。
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                請輸入您的轉帳帳號「後五碼」
              </label>
              <input
                type="text"
                maxLength={5}
                required
                placeholder="例如：12345"
                value={bankLastFive}
                onChange={(e) => setBankLastFive(e.target.value)}
                className="w-full p-3 rounded-xl border border-amber-300 text-base bg-white focus:outline-none focus:border-black tracking-widest font-mono"
              />
            </div>
          </section>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedService}
          className="w-full bg-black text-white py-4 rounded-2xl font-medium shadow-lg hover:bg-gray-800 disabled:bg-gray-300 transition-all"
        >
          {submitting ? '提交預約中...' : '確認送出預約申請'}
        </button>
      </form>

      {liffUser?.userId && store?.id && (
        <div className="px-4 mt-2">
          <MyAppointmentsList
            storeId={store.id}
            customerLineId={liffUser.userId}
            refreshKey={appointmentsRefreshKey}
            onCancelled={() => setAppointmentsRefreshKey((k) => k + 1)}
          />
        </div>
      )}
    </main>
  );
}