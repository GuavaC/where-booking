'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface StoreSettingsManagerProps {
  storeId: string;
  onUpdated?: (newStoreName: string) => void;
}

export default function StoreSettingsManager({
  storeId,
  onUpdated,
}: StoreSettingsManagerProps) {
  const [storeName, setStoreName] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    const loadStore = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('stores')
        .select('store_name, bank_info')
        .eq('id', storeId)
        .single();

      if (data) {
        setStoreName(data.store_name || '');
        setBankInfo(data.bank_info || '');
      }
      setLoading(false);
    };
    loadStore();
  }, [storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !bankInfo.trim()) {
      alert('請完整填寫工作室名稱與收款銀行資訊');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('stores')
      .update({
        store_name: storeName.trim(),
        bank_info: bankInfo.trim(),
      })
      .eq('id', storeId);
    setSaving(false);

    if (error) {
      alert('儲存失敗：' + error.message);
      return;
    }

    alert('店家與收款資訊已更新！');
    onUpdated?.(storeName.trim());
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-gray-400">載入店家設定中...</div>;
  }

  return (
    <form
      onSubmit={handleSave}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4"
    >
      <h2 className="text-sm font-bold text-gray-800">🏦 店家名稱與定金收款資訊</h2>

      <div>
        <label className="block text-xs text-gray-600 mb-1">工作室名稱</label>
        <input
          type="text"
          required
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          定金轉帳資訊（將顯示於客端步驟三匯款提示）
        </label>
        <textarea
          rows={3}
          required
          placeholder="例如：中國信託 (822) 1234-5678-9012 戶名：陳艾莉"
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-black text-white py-3 rounded-xl text-xs font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-all"
      >
        {saving ? '儲存中...' : '儲存店家與收款設定'}
      </button>
    </form>
  );
}