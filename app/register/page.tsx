'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { initLiff, LiffUser } from '@/lib/liff';

type StoreTypeOption = 'booking' | 'ecommerce';

interface CreatedStoreResult {
  id: string;
  store_name: string;
  store_type: string;
  owner_line_id: string;
  expires_at?: string | null;
}

function RegisterFormContent() {
  const [liffUser, setLiffUser] = useState<LiffUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [inviteCode, setInviteCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState<StoreTypeOption>('booking');
  const [bankInfo, setBankInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdStore, setCreatedStore] = useState<CreatedStoreResult | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    async function loadUser() {
      setLoadingUser(true);
      const user = await initLiff();
      setLiffUser(user);
      setLoadingUser(false);
    }
    loadUser();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!liffUser?.userId) {
      setErrorMsg('尚未取得 LINE 使用者身分，請確認 LIFF 或登入狀態。');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/stores/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode,
          storeName,
          storeType,
          bankInfo,
          ownerLineId: liffUser.userId,
          ownerName: liffUser.displayName,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || '開通失敗，請稍後再試');
        return;
      }

      setCreatedStore(data.store);
    } catch (err) {
      console.error(err);
      setErrorMsg('網路或伺服器發生錯誤');
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`已複製${label}`);
    } catch {
      alert(`請手動複製${label}：${text}`);
    }
  };

  if (loadingUser) {
    return (
      <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 p-6 flex items-center justify-center text-sm text-gray-500">
        正在驗證 LINE 身分...
      </main>
    );
  }

  if (createdStore) {
    const customerUrl = `${origin}/store/${createdStore.id}`;
    const ownerUrl = `${origin}/store/${createdStore.id}/owner`;
    const lineOaUrl = process.env.NEXT_PUBLIC_LINE_OA_URL;
    const formattedExpireDate = createdStore.expires_at
      ? new Date(createdStore.expires_at).toLocaleDateString('zh-TW')
      : null;

    return (
      <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 p-4 sm:p-6 flex items-center">
        <div className="w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
          <div className="text-center space-y-1">
            <div className="text-4xl">🎉</div>
            <h1 className="text-xl font-bold text-gray-800">商店開通成功！</h1>
            <p className="text-xs text-gray-500">
              「{createdStore.store_name}」已綁定您的 LINE 帳號為老闆。
            </p>
            {formattedExpireDate && (
              <p className="text-[11px] font-medium text-emerald-700 pt-0.5">
                服務有效期至：{formattedExpireDate}
              </p>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-[#06C755]/10 border border-[#06C755]/30 space-y-2 text-xs">
            <p className="font-bold text-gray-800 flex items-center gap-1.5">
              <span>🔔</span>
              <span>重要第一步：開啟 LINE 接單通知</span>
            </p>
            <p className="text-gray-600 leading-relaxed">
              請務必先加入系統通知官方帳號為好友，客人下單或取消時您才會即時收到 LINE 提醒！
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
                提醒：請確認您已加入本系統的 LINE 通知官方帳號好友，以確保能正常接收訂單推播。
              </p>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1.5">
              <p className="font-semibold text-gray-700">1. 給客人的專屬連結</p>
              <p className="font-mono text-[11px] text-gray-600 break-all">{customerUrl}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyText(customerUrl, '客人連結')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-100"
                >
                  複製連結
                </button>
                <Link
                  href={`/store/${createdStore.id}`}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-700"
                >
                  前往客端頁
                </Link>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
              <p className="font-semibold text-emerald-900">2. 您的老闆管理後台連結</p>
              <p className="font-mono text-[11px] text-emerald-800 break-all">{ownerUrl}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyText(ownerUrl, '後台連結')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-medium hover:bg-emerald-100/60"
                >
                  複製後台連結
                </button>
                <Link
                  href={`/store/${createdStore.id}/owner`}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800"
                >
                  立即進入後台
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 pb-12">
      <header className="bg-white p-6 shadow-sm border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">🏪 店家自助開通</h1>
        <p className="text-xs text-gray-500 mt-1">
          目前登入身分：{liffUser?.displayName || '未知'}（{liffUser?.userId || '無 ID'}）
          {liffUser?.isDemo && ' · 測試模式'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <label className="block text-xs font-semibold text-gray-700">
            開通邀請碼 <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="請輸入系統維運人員提供的邀請碼"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
          />
        </section>

        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <label className="block text-xs font-semibold text-gray-700">
            店家／品牌名稱 <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="例如：阿嬤手工水餃、松筋推拿工作室"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
          />

          <div className="pt-1">
            <span className="block text-xs font-semibold text-gray-700 mb-2">
              經營模式 <span className="text-rose-500">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStoreType('booking')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  storeType === 'booking'
                    ? 'border-black bg-black/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-xs font-bold text-gray-800">💆 預約服務型</p>
                <p className="text-[11px] text-gray-500 mt-0.5">推拿、美甲、時段預約</p>
              </button>

              <button
                type="button"
                onClick={() => setStoreType('ecommerce')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  storeType === 'ecommerce'
                    ? 'border-black bg-black/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-xs font-bold text-gray-800">🥟 商品訂購型</p>
                <p className="text-[11px] text-gray-500 mt-0.5">水餃、粽子、饅頭接單</p>
              </button>
            </div>
          </div>

          <div className="pt-1">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              收款銀行帳號資訊（選填，可至後台修改）
            </label>
            <input
              type="text"
              placeholder="例如：國泰世華 (013) 1234-5678-9012"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
            />
          </div>
        </section>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black text-white py-4 rounded-2xl font-medium shadow-lg hover:bg-gray-800 disabled:bg-gray-300 transition-all"
        >
          {submitting ? '建立商店中...' : '立即建立我的商店'}
        </button>
      </form>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 p-6 flex items-center justify-center text-sm text-gray-500">
          載入開通頁面中...
        </main>
      }
    >
      <RegisterFormContent />
    </Suspense>
  );
}