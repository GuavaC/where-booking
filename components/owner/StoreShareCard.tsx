'use client';

import { useState } from 'react';

export default function StoreShareCard({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const liffBaseUrl =
    process.env.NEXT_PUBLIC_LIFF_URL || 'https://liff.line.me/2012698099-NqhRzmeW';
  const customerUrl = `${liffBaseUrl}/store/${storeId}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=16&data=${encodeURIComponent(
    customerUrl
  )}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(customerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(`請手動複製以下網址：\n${customerUrl}`);
    }
  };

  const handleDownloadQr = async () => {
    try {
      const res = await fetch(qrImageUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${storeName}-專屬預約下單QRCode.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(qrImageUrl, '_blank');
    }
  };

  return (
    <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-blue-900">🔗 給客人的專屬店面連結</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
          >
            {copied ? '✅ 已複製' : '📋 複製連結'}
          </button>
          <button
            type="button"
            onClick={() => setShowQr((prev) => !prev)}
            className="bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
          >
            {showQr ? '收合 QR' : '📱 QR Code'}
          </button>
        </div>
      </div>

      <div className="bg-white/90 border border-blue-100 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-gray-700 break-all select-all">
        {customerUrl}
      </div>

      {showQr && (
        <div className="bg-white border border-blue-100 rounded-xl p-3 flex flex-col items-center space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt={`${storeName} QR Code`}
            className="w-40 h-40 rounded-lg border border-gray-100"
          />
          <p className="text-[11px] text-gray-500 text-center">
            可下載列印貼在店面櫃檯，或放上 IG／粉專供客人掃碼
          </p>
          <button
            type="button"
            onClick={handleDownloadQr}
            className="bg-gray-900 hover:bg-black text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-all"
          >
            ⬇️ 下載 QR Code 圖片
          </button>
        </div>
      )}
    </div>
  );
}