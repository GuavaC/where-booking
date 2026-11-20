'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Service } from '@/types/database';

interface ServicesManagerProps {
  storeId: string;
}

export default function ServicesManager({ storeId }: ServicesManagerProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 表單狀態（editingId 為 null 代表新增模式）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('1200');
  const [deposit, setDeposit] = useState<string>('300');
  const [durationMinutes, setDurationMinutes] = useState<string>('90');

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setServices(data as Service[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (storeId) fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('1200');
    setDeposit('300');
    setDurationMinutes('90');
  };

  const handleEditClick = (s: Service) => {
    setEditingId(s.id);
    setName(s.name);
    setPrice(String(s.price));
    setDeposit(String(s.deposit));
    setDurationMinutes(String(s.duration_minutes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('請輸入服務名稱');
      return;
    }

    const payload = {
      store_id: storeId,
      name: name.trim(),
      price: Math.max(0, Number(price) || 0),
      deposit: Math.max(0, Number(deposit) || 0),
      duration_minutes: Math.max(15, Number(durationMinutes) || 60),
    };

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', editingId);

      setSaving(false);
      if (error) {
        alert('更新服務失敗：' + error.message);
        return;
      }
      alert('服務項目已更新！');
    } else {
      const { error } = await supabase.from('services').insert(payload);

      setSaving(false);
      if (error) {
        alert('新增服務失敗：' + error.message);
        return;
      }
      alert('已新增服務項目！');
    }

    resetForm();
    await fetchServices();
  };

  const handleDelete = async (id: string, serviceName: string) => {
    if (!confirm(`確定要刪除「${serviceName}」嗎？`)) return;

    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
      alert('無法刪除此服務（可能已有歷史預約紀錄關聯），建議改為編輯名稱或調整價格。');
      return;
    }
    if (editingId === id) resetForm();
    await fetchServices();
  };

  return (
    <div className="space-y-6">
      {/* 新增／編輯表單 */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            {editingId ? '✏️ 編輯服務項目' : '➕ 新增服務項目'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gray-500 underline"
            >
              取消編輯
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">服務名稱</label>
          <input
            type="text"
            required
            placeholder="例如：手部單色凝膠 + 輕保養"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-xs text-gray-600 mb-1">總價 (NT$)</label>
            <input
              type="number"
              min={0}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">定金 (NT$)</label>
            <input
              type="number"
              min={0}
              required
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">耗時 (分鐘)</label>
            <input
              type="number"
              min={15}
              step={15}
              required
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-black text-white py-3 rounded-xl text-xs font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-all"
        >
          {saving ? '儲存中...' : editingId ? '儲存變更' : '新增服務項目'}
        </button>
      </form>

      {/* 現有服務清單 */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 px-1">
          目前上架服務（共 {services.length} 項）
        </h3>

        {loading ? (
          <div className="text-center py-8 text-xs text-gray-400">載入服務清單中...</div>
        ) : services.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400 bg-white rounded-2xl border border-gray-100">
            尚未建立任何服務項目，請從上方新增
          </div>
        ) : (
          services.map((s) => (
            <div
              key={s.id}
              className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{s.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  總價 NT$ {s.price} ・ 定金{' '}
                  <span className="text-rose-600 font-medium">NT$ {s.deposit}</span> ・ 耗時{' '}
                  {s.duration_minutes} 分鐘
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleEditClick(s)}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id, s.name)}
                  className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium"
                >
                  刪除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}