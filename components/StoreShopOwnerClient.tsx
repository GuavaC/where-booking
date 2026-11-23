'use client';

import { useState, useEffect, useCallback } from 'react';
import { initLiff, LiffUser } from '@/lib/liff';
import { supabase } from '@/lib/supabase';
import { Store, Product, Order } from '@/types/database';

type OwnerTab = 'orders' | 'products' | 'settings';

export default function StoreShopOwnerClient({ storeId }: { storeId: string }) {
  const [liffUser, setLiffUser] = useState<LiffUser | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<OwnerTab>('orders');

  // 訂單狀態
  const [orders, setOrders] = useState<Order[]>([]);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  // 商品管理狀態
  const [products, setProducts] = useState<Product[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodUnit, setProdUnit] = useState('包');
  const [prodStock, setProdStock] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  // 運費與收款設定
  const [bankInfo, setBankInfo] = useState('');
  const [shippingFee, setShippingFee] = useState('0');
  const [freeThreshold, setFreeThreshold] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const loadOrders = useCallback(async (sId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('store_id', sId)
      .order('created_at', { ascending: false });

    if (data) {
      setOrders(data as Order[]);
    }
  }, []);

  const loadProducts = useCallback(async (sId: string) => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', sId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (data) {
      setProducts(data as Product[]);
    }
  }, []);

  useEffect(() => {
    if (!storeId) return;

    async function init() {
      setLoading(true);
      const user = await initLiff();
      setLiffUser(user);

      const { data: storeData } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (!storeData) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (storeData.owner_line_id && user?.userId !== storeData.owner_line_id) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      const typedStore = storeData as Store;
      setStore(typedStore);
      setBankInfo(typedStore.bank_info || '');
      setShippingFee(String(typedStore.shipping_fee ?? 0));
      setFreeThreshold(
        typedStore.free_shipping_threshold ? String(typedStore.free_shipping_threshold) : ''
      );

      await Promise.all([loadOrders(storeId), loadProducts(storeId)]);
      setLoading(false);
    }

    init();
  }, [storeId, loadOrders, loadProducts]);

  // 訂單操作（確認收款 / 確認出貨 / 取消）
  const handleOrderAction = async (
    orderId: string,
    action: 'confirm_payment' | 'ship_order' | 'cancel_order'
  ) => {
    if (!liffUser?.userId || processingOrderId) return;
    if (action === 'cancel_order' && !confirm('確定要取消此筆訂單並將商品加回庫存嗎？')) {
      return;
    }

    setProcessingOrderId(orderId);
    try {
      const res = await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          ownerLineId: liffUser.userId,
          action,
          trackingNumber: trackingInputs[orderId] || '',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || '操作失敗');
        return;
      }

      await Promise.all([loadOrders(storeId), loadProducts(storeId)]);
    } catch (err) {
      console.error(err);
      alert('執行訂單操作失敗');
    } finally {
      setProcessingOrderId(null);
    }
  };

  // 商品新增或更新
  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdUnit('包');
    setProdStock('');
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(String(p.price));
    setProdUnit(p.unit || '包');
    setProdStock(p.stock !== null ? String(p.stock) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || prodPrice === '') return;

    setSavingProduct(true);
    const payload = {
      store_id: storeId,
      name: prodName.trim(),
      description: prodDesc.trim(),
      price: Math.max(0, Number(prodPrice)),
      unit: prodUnit.trim() || '包',
      stock: prodStock.trim() === '' ? null : Math.max(0, Math.floor(Number(prodStock))),
    };

    if (editingProductId) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProductId);

      if (error) {
        alert('更新商品失敗');
      } else {
        resetProductForm();
        await loadProducts(storeId);
      }
    } else {
      const { error } = await supabase.from('products').insert({
        ...payload,
        is_active: true,
        sort_order: products.length + 1,
      });

      if (error) {
        alert('新增商品失敗');
      } else {
        resetProductForm();
        await loadProducts(storeId);
      }
    }
    setSavingProduct(false);
  };

  const handleToggleProductActive = async (p: Product) => {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    await loadProducts(storeId);
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`確定要刪除「${p.name}」嗎？`)) return;
    await supabase.from('products').delete().eq('id', p.id);
    await loadProducts(storeId);
  };

  // 儲存運費與收款設定
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    const { error } = await supabase
      .from('stores')
      .update({
        bank_info: bankInfo.trim(),
        shipping_fee: Math.max(0, Number(shippingFee) || 0),
        free_shipping_threshold:
          freeThreshold.trim() === '' ? null : Math.max(0, Number(freeThreshold)),
      })
      .eq('id', storeId);

    setSavingSettings(false);
    if (error) {
      alert('儲存設定失敗');
    } else {
      alert('已更新商店收款與運費設定！');
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        載入商店後台中...
      </main>
    );
  }

  if (unauthorized) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 p-6 text-center text-gray-600">
        您沒有此商店的老闆管理權限。
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 pb-14">
      <header className="bg-white p-5 shadow-sm border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-800">🛠️ 老闆端管理後台</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {store?.store_name} · {liffUser?.displayName}
        </p>
      </header>

      {/* 分頁切換 */}
      <div className="p-4 pb-2">
        <div className="grid grid-cols-3 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'orders' ? 'bg-black text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            訂單與出貨 ({orders.filter((o) => o.status !== 'cancelled').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'products' ? 'bg-black text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            商品管理 ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'settings' ? 'bg-black text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            運費與收款
          </button>
        </div>
      </div>

      {/* Tab 1: 訂單對帳與出貨 */}
      {activeTab === 'orders' && (
        <div className="p-4 space-y-3">
          {orders.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-xs text-gray-400">
              目前尚未收到任何訂單
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      {order.customer_name}（{order.customer_phone}）
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(order.created_at).toLocaleString('zh-TW', { hour12: false })}
                    </p>
                  </div>

                  {order.status === 'pending_verify' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      ⏳ 待對帳
                    </span>
                  )}
                  {order.status === 'confirmed' && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      📦 待出貨
                    </span>
                  )}
                  {order.status === 'shipped' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                      🚚 已出貨
                    </span>
                  )}
                  {order.status === 'cancelled' && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                      已取消
                    </span>
                  )}
                </div>

                {/* 商品明細 */}
                <div className="bg-gray-50 p-2.5 rounded-xl space-y-1">
                  {order.order_items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-gray-700">
                      <span>
                        {item.product_name} × {item.quantity}
                      </span>
                      <span>NT$ {item.line_total}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 border-t border-gray-200 font-bold text-gray-900">
                    <span>
                      實付總額（{order.delivery_method === 'pickup' ? '自取' : `含運 ${order.shipping_fee}`}）
                    </span>
                    <span className="text-rose-600">NT$ {order.total_amount}</span>
                  </div>
                </div>

                {/* 收件與匯款資訊 */}
                <div className="space-y-1 text-gray-600">
                  <p>
                    💳 轉帳後五碼：<strong className="font-mono text-gray-900">{order.bank_last_five}</strong>
                  </p>
                  {order.delivery_method === 'cold_delivery' && (
                    <p>📍 宅配地址：{order.delivery_address}</p>
                  )}
                  {order.preferred_date && <p>📅 希望日期：{order.preferred_date}</p>}
                  {order.note && <p>📝 備註：{order.note}</p>}
                </div>

                {/* 操作區 */}
                {order.status === 'pending_verify' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={processingOrderId === order.id}
                      onClick={() => handleOrderAction(order.id, 'confirm_payment')}
                      className="flex-1 bg-black text-white py-2.5 rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      ✅ 確認收款
                    </button>
                    <button
                      type="button"
                      disabled={processingOrderId === order.id}
                      onClick={() => handleOrderAction(order.id, 'cancel_order')}
                      className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </div>
                )}

                {order.status === 'confirmed' && (
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    {order.delivery_method === 'cold_delivery' && (
                      <input
                        type="text"
                        placeholder="輸入黑貓 / 冷凍超商物流單號（選填）"
                        value={trackingInputs[order.id] ?? ''}
                        onChange={(e) =>
                          setTrackingInputs((prev) => ({
                            ...prev,
                            [order.id]: e.target.value,
                          }))
                        }
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-black"
                      />
                    )}
                    <button
                      type="button"
                      disabled={processingOrderId === order.id}
                      onClick={() => handleOrderAction(order.id, 'ship_order')}
                      className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      🚚 標記已出貨（並 LINE 通知客人）
                    </button>
                  </div>
                )}

                {order.status === 'shipped' && order.tracking_number && (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg">
                    🚚 物流單號：{order.tracking_number}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: 商品管理 */}
      {activeTab === 'products' && (
        <div className="p-4 space-y-4">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">
                {editingProductId ? '✏️ 編輯商品' : '➕ 新增商品'}
              </h2>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="text-xs text-gray-500 underline"
                >
                  取消編輯
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">商品名稱 *</label>
              <input
                type="text"
                required
                placeholder="例如：高麗菜手工水餃"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">商品說明（選填）</label>
              <input
                type="text"
                placeholder="例如：嚴選高山高麗菜與新鮮豬後腿肉"
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">單價 (NT$) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">單位 *</label>
                <input
                  type="text"
                  required
                  placeholder="包（30顆）"
                  value={prodUnit}
                  onChange={(e) => setProdUnit(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">庫存（空＝不限）</label>
                <input
                  type="number"
                  min={0}
                  placeholder="不限"
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProduct}
              className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:bg-gray-300"
            >
              {savingProduct
                ? '儲存中...'
                : editingProductId
                ? '儲存商品變更'
                : '新增商品'}
            </button>
          </form>

          {/* 商品列表 */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-600 px-1">
              目前商品列表（共 {products.length} 項）
            </h3>
            {products.map((p) => (
              <div
                key={p.id}
                className={`bg-white p-3.5 rounded-2xl border space-y-2 ${
                  p.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      {p.name}{' '}
                      {!p.is_active && (
                        <span className="text-[11px] text-gray-500 font-normal">（已下架）</span>
                      )}
                    </p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                    <p className="text-xs text-gray-700 mt-1">
                      NT$ <strong>{p.price}</strong> / {p.unit} · 庫存：
                      <strong>{p.stock === null ? '不限' : p.stock}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => startEditProduct(p)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    編輯 / 改庫存
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleProductActive(p)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    {p.is_active ? '下架' : '重新上架'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(p)}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 ml-auto"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: 運費與收款設定 */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
          <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-sm font-bold text-gray-800">💳 收款與冷凍運費設定</h2>

            <div>
              <label className="block text-xs text-gray-600 mb-1">匯款銀行帳號資訊</label>
              <input
                type="text"
                value={bankInfo}
                onChange={(e) => setBankInfo(e.target.value)}
                placeholder="例如：國泰世華 (013) 1234-5678-9012"
                className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">冷凍宅配運費 (NT$)</label>
                <input
                  type="number"
                  min={0}
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">滿額免運門檻（空＝不免運）</label>
                <input
                  type="number"
                  min={0}
                  placeholder="例如：1500"
                  value={freeThreshold}
                  onChange={(e) => setFreeThreshold(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full bg-black text-white py-3.5 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:bg-gray-300"
            >
              {savingSettings ? '儲存中...' : '儲存設定'}
            </button>
          </section>
        </form>
      )}
    </main>
  );
}