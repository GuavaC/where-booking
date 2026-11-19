'use client';

import { useState, useEffect } from 'react';
import { initLiff, LiffUser } from '@/lib/liff';
import { supabase } from '@/lib/supabase';
import { Store, Service } from '@/types/database';

export default function BookingPage() {
  const [liffUser, setLiffUser] = useState<LiffUser | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // 表單填寫狀態
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('14:00');
  const [bankLastFive, setBankLastFive] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // 1. 初始化 LIFF 與抓取店家/服務資料
  useEffect(() => {
    async function init() {
      const user = await initLiff();
      setLiffUser(user);

      // 抓取我們剛剛建立的那筆測試店家
      const { data: storeData } = await supabase
        .from('stores')
        .select('*')
        .eq('id', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .single();

      if (storeData) setStore(storeData);

      // 抓取該店家的服務清單
      const { data: serviceData, error } = await supabase
        .from('services')
        .select('*')
        .eq('store_id', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

      console.log('抓到的服務清單:', serviceData, '錯誤:', error);

      if (serviceData) setServices(serviceData);
      setLoading(false);
    }
    init();
  }, []);

  // 2. 提交預約申請
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedDate || !bankLastFive || !liffUser || !store) {
      alert('請完整填寫預約資訊與轉帳後五碼！');
      return;
    }

    if (bankLastFive.length !== 5) {
      alert('請輸入正確的 5 碼銀行帳號後五碼');
      return;
    }

    setSubmitting(true);

    const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const endTime = new Date(startTime.getTime() + selectedService.duration_minutes * 60000);

    const { error } = await supabase.from('appointments').insert({
      store_id: store.id,
      customer_line_id: liffUser.userId,
      customer_name: liffUser.displayName,
      service_id: selectedService.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      payment_status: 'pending_verify',
      bank_last_five: bankLastFive,
    });

    setSubmitting(false);

    if (error) {
      console.error(error);
      alert('預約送出失敗，請稍後再試');
    } else {
      setSuccessMsg(true);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        載入預約系統中...
      </div>
    );
  }

  if (successMsg) {
    return (
      <main className="mx-auto max-w-md min-h-screen bg-white p-6 flex flex-col justify-center items-center text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">預約申請已送出！</h1>
        <p className="text-gray-600 mb-6 text-sm">
          我們已收到您的定金轉帳後五碼。<br />
          老闆確認入帳後，將透過 LINE 發送預約成功通知給您！
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-black text-white py-3 rounded-xl font-medium shadow"
        >
          返回首頁
        </button>
      </main>
    );
  }

  return (
	<main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 pb-12">
      {/* 頂部店家標題 */}
      <header className="bg-white p-6 shadow-sm border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">{store?.store_name || '載入中...'}</h1>
        <p className="text-xs text-gray-500 mt-1">
          登入身分：{liffUser?.displayName} {liffUser?.isDemo && '(測試模式)'}
        </p>
      </header>

      <form onSubmit={handleBookingSubmit} className="p-4 space-y-6">
        {/* 步驟一：選擇服務項目 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">1. 選擇預約服務項目</h2>
          <div className="space-y-2">
            {services.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedService(s)}
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

        {/* 步驟二：選擇日期與時段 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">2. 選擇預約日期與時段</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">選擇日期</label>
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full min-w-0 max-w-full block appearance-none p-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:border-black bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">選擇時段</label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:border-black bg-white"
              >
                <option value="10:00">10:00 AM</option>
                <option value="13:00">01:00 PM</option>
                <option value="15:30">03:30 PM</option>
                <option value="18:00">06:00 PM</option>
              </select>
            </div>
          </div>
        </section>

        {/* 步驟三：定金轉帳與後五碼回報 */}
        {selectedService && (
          <section className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-3">
            <h2 className="text-sm font-semibold text-amber-900">3. 定金匯款與後五碼回報</h2>
            <div className="text-xs text-amber-800 space-y-1 bg-white/80 p-3 rounded-xl border border-amber-100">
			  <p>💳 <strong className="font-semibold">轉帳資訊</strong>：{store?.bank_info}</p>
			  <p>💰 <strong className="font-semibold">應付定金</strong>：<span className="font-bold text-rose-600">NT$ {selectedService.deposit}</span></p>
			  <p className="text-gray-500 text-[11px] mt-1">⚠️ 請於 15 分鐘內完成轉帳並填寫帳號後五碼，否則系統將自動釋出時段。</p>
			</div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">請輸入您的轉帳帳號「後五碼」</label>
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

        {/* 送出預約按鈕 */}
        <button
          type="submit"
          disabled={submitting || !selectedService}
          className="w-full bg-black text-white py-4 rounded-2xl font-medium shadow-lg hover:bg-gray-800 disabled:bg-gray-300 transition-all"
        >
          {submitting ? '提交預約中...' : '確認送出預約申請'}
        </button>
      </form>
    </main>
  );
}