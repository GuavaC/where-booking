'use client';

import { useState, useEffect, useCallback } from 'react';
import { initLiff, LiffUser } from '@/lib/liff';
import { supabase } from '@/lib/supabase';
import { Store, Product, Order, DeliveryMethod } from '@/types/database';

export default function StoreShopClient({ storeId }: { storeId: string }) {
  const [liffUser, setLiffUser] = useState<LiffUser | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundStore, setNotFoundStore] = useState(false);

  // 購物車數量表: { [productId]: quantity }
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const loadProducts = useCallback(async (sId: string) => {
    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', sId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (prodData) {
      setProducts(prodData as Product[]);
    }
  }, []);

  const loadMyOrders = useCallback(async (sId: string, lineId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('store_id', sId)
      .eq('customer_line_id', lineId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setMyOrders(data as Order[]);
    }
  }, []);

  useEffect(() => {
    if (!storeId) return;

    async function init() {
      setLoading(true);
      const user = await initLiff();
      setLiffUser(user);
      if (user?.displayName) {
        setCustomerName(user.displayName);
      }

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

      await loadProducts(storeId);

      if (user?.userId) {
        await loadMyOrders(storeId, user.userId);
      }

      setLoading(false);
    }

    init();
  }, [storeId, loadProducts, loadMyOrders]);

  const updateQty = (product: Product, delta: number) => {
    setCart((prev) => {
      const current = prev[product.id] || 0;
      let next = current + delta;
      if (next < 0) next = 0;
      if (product.stock !== null && next > product.stock) {
        next = product.stock;
      }
      const copy = { ...prev };
      if (next === 0) {
        delete copy[product.id];
      } else {
        copy[product.id] = next;
      }
      return copy;
    });
  };

  // 計算小計、運費與總金額
  const subtotal = products.reduce((sum, p) => sum + (cart[p.id] || 0) * p.price, 0);
  const totalCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const baseShippingFee = Number(store?.shipping_fee || 0);
  const freeThreshold = store?.free_shipping_threshold || 0;

  let shippingFee = 0;
  if (deliveryMethod === 'cold_delivery' && subtotal > 0) {
    if (freeThreshold > 0 && subtotal >= freeThreshold) {
      shippingFee = 0;
    } else {
      shippingFee = baseShippingFee;
    }
  }
  const totalAmount = subtotal + shippingFee;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !liffUser?.userId) return;

    if (totalCount === 0) {
      alert('請先選擇至少一項商品！');
      return;
    }

    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([productId, quantity]) => ({
        productId,
        quantity,
      }));

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          customerLineId: liffUser.userId,
          customerName,
          customerPhone,
          deliveryMethod,
          deliveryAddress,
          preferredDate: preferredDate || null,
          bankLastFive,
          note,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || '訂單送出失敗');
        return;
      }

      setCart({});
      setBankLastFive('');
      setNote('');
      await Promise.all([
        loadProducts(store.id),
        loadMyOrders(store.id, liffUser.userId),
      ]);
      setOrderSuccess(true);
    } catch (err) {
      console.error(err);
      alert('送出訂單時發生錯誤');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        載入商品目錄中...
      </main>
    );
  }

  if (notFoundStore) {
    return (
      <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 p-6 text-center text-gray-600">
        找不到此店家，請確認連結是否正確。
      </main>
    );
  }

  if (orderSuccess) {
    return (
      <main className="mx-auto w-full max-w-md min-h-screen bg-white p-6 flex flex-col justify-center items-center text-center">
        <div className="text-5xl mb-4">🥟</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">訂單已成功送出！</h1>
        <p className="text-gray-600 mb-6 text-sm leading-relaxed">
          我們已收到您的訂購明細與匯款後五碼。<br />
          店家確認入帳與出貨後，將透過 LINE 通知您！
        </p>
        <button
          onClick={() => setOrderSuccess(false)}
          className="w-full bg-black text-white py-3 rounded-xl font-medium shadow"
        >
          返回商店查看訂單
        </button>
      </main>
    );
  }

  const renderStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'pending_verify':
        return (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            ⏳ 待對帳
          </span>
        );
      case 'confirmed':
        return (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            📦 已收款備貨中
          </span>
        );
      case 'shipped':
        return (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            🚚 已出貨
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <main className="mx-auto w-full max-w-md min-h-screen bg-gray-50 pb-14">
      <header className="bg-white p-6 shadow-sm border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">{store?.store_name}</h1>
        <p className="text-xs text-gray-500 mt-1">
          登入身分：{liffUser?.displayName} {liffUser?.isDemo && '(測試模式)'}
        </p>
      </header>

      <form onSubmit={handleOrderSubmit} className="p-4 space-y-5">
        {/* 1. 商品選購 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">1. 選擇訂購商品</h2>
            {freeThreshold > 0 && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                宅配滿 NT$ {freeThreshold} 免運
              </span>
            )}
          </div>

          {products.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">目前尚無上架商品</p>
          ) : (
            <div className="space-y-3">
              {products.map((p) => {
                const qty = cart[p.id] || 0;
                const soldOut = p.stock !== null && p.stock <= 0;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      qty > 0 ? 'border-black bg-black/[0.02]' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-gray-800">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-gray-500 leading-relaxed">{p.description}</p>
                        )}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-sm font-bold text-rose-600">NT$ {p.price}</span>
                          <span className="text-xs text-gray-400">/ {p.unit}</span>
                          {p.stock !== null && (
                            <span className="text-[11px] text-gray-400">
                              （剩餘 {p.stock}）
                            </span>
                          )}
                        </div>
                      </div>

                      {soldOut ? (
                        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">
                          已售完
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQty(p, -1)}
                            disabled={qty === 0}
                            className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-base font-bold text-gray-700 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-gray-800">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(p, 1)}
                            disabled={p.stock !== null && qty >= p.stock}
                            className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center text-base font-bold disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 2. 取貨與收件資料 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">2. 取貨方式與聯絡資料</h2>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDeliveryMethod('pickup')}
              className={`p-3 rounded-xl border text-left transition-all ${
                deliveryMethod === 'pickup'
                  ? 'border-black bg-black/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-xs font-bold text-gray-800">🏪 面交 / 到店自取</p>
              <p className="text-[11px] text-gray-500 mt-0.5">免運費</p>
            </button>

            <button
              type="button"
              onClick={() => setDeliveryMethod('cold_delivery')}
              className={`p-3 rounded-xl border text-left transition-all ${
                deliveryMethod === 'cold_delivery'
                  ? 'border-black bg-black/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-xs font-bold text-gray-800">🚚 冷凍宅配到府</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                運費 NT$ {baseShippingFee}
                {freeThreshold > 0 ? `（滿 ${freeThreshold} 免運）` : ''}
              </p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">訂購人姓名 *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">聯絡手機 *</label>
              <input
                type="tel"
                required
                placeholder="0912345678"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {deliveryMethod === 'cold_delivery' && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">冷凍宅配收件地址 *</label>
              <input
                type="text"
                required
                placeholder="請輸入縣市、鄉鎮市區與完整門牌地址"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">希望自取／到貨日（選填）</label>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">訂單備註（選填）</label>
              <input
                type="text"
                placeholder="例如：管理室代收"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </div>
        </section>

        {/* 3. 金額明細與匯款後五碼 */}
        <section className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-3">
          <h2 className="text-sm font-semibold text-amber-900">3. 訂單金額與匯款後五碼回報</h2>

          <div className="bg-white/90 p-3 rounded-xl border border-amber-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>商品小計（共 {totalCount} 件）</span>
              <span>NT$ {subtotal}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>運費（{deliveryMethod === 'pickup' ? '面交自取' : '冷凍宅配'}）</span>
              <span>NT$ {shippingFee}</span>
            </div>
            {deliveryMethod === 'cold_delivery' &&
              freeThreshold > 0 &&
              subtotal > 0 &&
              subtotal < freeThreshold && (
                <p className="text-[11px] text-emerald-700">
                  💡 再買 NT$ {freeThreshold - subtotal} 即可享免運優惠！
                </p>
              )}
            <div className="flex justify-between items-center pt-2 border-t border-amber-100 text-sm font-bold text-gray-900">
              <span>應付總金額</span>
              <span className="text-rose-600 text-base">NT$ {totalAmount}</span>
            </div>
          </div>

          <div className="text-xs text-amber-800 bg-white/80 p-3 rounded-xl border border-amber-100">
            💳 <strong className="font-semibold">匯款帳號</strong>：{store?.bank_info || '請聯繫店家確認帳號'}
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">
              請輸入您的轉帳帳號「後五碼」 *
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

        <button
          type="submit"
          disabled={submitting || totalCount === 0}
          className="w-full bg-black text-white py-4 rounded-2xl font-medium shadow-lg hover:bg-gray-800 disabled:bg-gray-300 transition-all"
        >
          {submitting ? '送出訂單中...' : `送出訂單（NT$ ${totalAmount}）`}
        </button>
      </form>

      {/* 我的訂購紀錄 */}
      {myOrders.length > 0 && (
        <section className="px-4 mt-2">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">📦 我的訂購紀錄</h2>
            <div className="space-y-2.5">
              {myOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('zh-TW')} ·{' '}
                      {order.delivery_method === 'pickup' ? '面交自取' : '冷凍宅配'}
                    </span>
                    {renderStatusBadge(order.status)}
                  </div>

                  <div className="text-gray-800 font-medium space-y-0.5">
                    {order.order_items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {item.product_name} × {item.quantity}
                        </span>
                        <span className="text-gray-500">NT$ {item.line_total}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-1.5 border-t border-gray-200/70 font-bold text-gray-900">
                    <span>實付總額（含運 NT$ {order.shipping_fee}）</span>
                    <span>NT$ {order.total_amount}</span>
                  </div>

                  {order.status === 'shipped' && order.tracking_number && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 font-medium">
                      🚚 物流單號：{order.tracking_number}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}