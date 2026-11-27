import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_MONTHLY_LIMIT = 50;

function getMonthlyOrderLimit(): number {
  const rawOrderLimit = Number(process.env.MONTHLY_ORDER_LIMIT);
  if (Number.isFinite(rawOrderLimit) && rawOrderLimit > 0) {
    return Math.floor(rawOrderLimit);
  }

  const rawBookingLimit = Number(process.env.MONTHLY_BOOKING_LIMIT);
  if (Number.isFinite(rawBookingLimit) && rawBookingLimit > 0) {
    return Math.floor(rawBookingLimit);
  }

  return DEFAULT_MONTHLY_LIMIT;
}

function getTaiwanMonthRangeIso(now = new Date()): { startIso: string; endIso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  // 台灣為 UTC+8（無日光節約時間），月初 00:00:00+08:00 轉成 UTC ISO 字串
  const startUtcMs = Date.UTC(year, month - 1, 1, -8, 0, 0, 0);
  const nextMonthUtcMs = Date.UTC(year, month, 1, -8, 0, 0, 0);

  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(nextMonthUtcMs).toISOString(),
  };
}

interface CartItemInput {
  productId: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      storeId,
      customerLineId,
      customerName,
      customerPhone,
      deliveryMethod,
      deliveryAddress,
      preferredDate,
      bankLastFive,
      note,
      items,
    } = body as {
      storeId: string;
      customerLineId: string;
      customerName: string;
      customerPhone: string;
      deliveryMethod: 'pickup' | 'cold_delivery';
      deliveryAddress?: string;
      preferredDate?: string;
      bankLastFive: string;
      note?: string;
      items: CartItemInput[];
    };

    if (!storeId || !customerLineId || !customerName?.trim() || !customerPhone?.trim()) {
      return NextResponse.json(
        { success: false, error: '請完整填寫訂購人姓名與聯絡電話' },
        { status: 400 }
      );
    }

    if (deliveryMethod === 'cold_delivery' && !deliveryAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: '選擇冷凍宅配請填寫完整收件地址' },
        { status: 400 }
      );
    }

    if (!bankLastFive || bankLastFive.trim().length !== 5) {
      return NextResponse.json(
        { success: false, error: '請輸入正確的 5 碼銀行帳號後五碼' },
        { status: 400 }
      );
    }

    const validItems = (items || []).filter((i) => i.productId && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '購物車內至少需要選擇一項商品' },
        { status: 400 }
      );
    }

    // 1. 取得店家運費與推播資訊
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, store_name, owner_line_id, shipping_fee, free_shipping_threshold')
      .eq('id', storeId)
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ success: false, error: '找不到此店家' }, { status: 404 });
    }

    // 2. 檢查該店家本月訂單筆數是否已達上限（排除已取消）
    const monthlyLimit = getMonthlyOrderLimit();
    const { startIso, endIso } = getTaiwanMonthRangeIso();

    const { count: currentMonthCount, error: countErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .gte('created_at', startIso)
      .lt('created_at', endIso);

    if (countErr) {
      console.error('查詢本月訂單筆數失敗:', countErr);
      return NextResponse.json(
        { success: false, error: '系統忙碌中，請稍後再試' },
        { status: 500 }
      );
    }

    if ((currentMonthCount ?? 0) >= monthlyLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `本商店本月線上訂單已達上限（${monthlyLimit} 筆），請直接聯繫店家訂購`,
        },
        { status: 429 }
      );
    }

    // 3. 取得資料庫最新商品單價與庫存
    const productIds = validItems.map((i) => i.productId);
    const { data: dbProducts, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .in('id', productIds);

    if (prodErr || !dbProducts) {
      return NextResponse.json({ success: false, error: '讀取商品資料失敗' }, { status: 500 });
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));
    let subtotal = 0;
    const orderItemsToInsert: Array<{
      product_id: string;
      product_name: string;
      unit: string;
      unit_price: number;
      quantity: number;
      line_total: number;
      newStock: number | null;
    }> = [];

    for (const item of validItems) {
      const prod = productMap.get(item.productId);
      if (!prod || !prod.is_active) {
        return NextResponse.json(
          { success: false, error: '購物車內包含已下架或不存在的商品，請重新整理頁面' },
          { status: 400 }
        );
      }

      const qty = Math.floor(Number(item.quantity));
      if (prod.stock !== null && qty > prod.stock) {
        return NextResponse.json(
          { success: false, error: `「${prod.name}」庫存不足（目前僅剩 ${prod.stock} ${prod.unit}）` },
          { status: 400 }
        );
      }

      const lineTotal = prod.price * qty;
      subtotal += lineTotal;
      orderItemsToInsert.push({
        product_id: prod.id,
        product_name: prod.name,
        unit: prod.unit,
        unit_price: prod.price,
        quantity: qty,
        line_total: lineTotal,
        newStock: prod.stock !== null ? prod.stock - qty : null,
      });
    }

    // 4. 計算運費（自取 0 元；宅配依店家運費與免運門檻計算）
    let shippingFee = 0;
    if (deliveryMethod === 'cold_delivery') {
      const baseFee = Number(store.shipping_fee || 0);
      const threshold = store.free_shipping_threshold;
      if (threshold && threshold > 0 && subtotal >= threshold) {
        shippingFee = 0;
      } else {
        shippingFee = baseFee;
      }
    }

    const totalAmount = subtotal + shippingFee;

    // 5. 寫入 orders 主表
    const { data: createdOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        store_id: storeId,
        customer_line_id: customerLineId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_method: deliveryMethod,
        delivery_address: deliveryMethod === 'cold_delivery' ? deliveryAddress!.trim() : '',
        preferred_date: preferredDate || null,
        subtotal,
        shipping_fee: shippingFee,
        total_amount: totalAmount,
        bank_last_five: bankLastFive.trim(),
        status: 'pending_verify',
        note: note ? note.trim() : '',
      })
      .select('*')
      .single();

    if (orderErr || !createdOrder) {
      console.error('建立訂單主表失敗:', orderErr);
      return NextResponse.json({ success: false, error: '建立訂單失敗，請稍後再試' }, { status: 500 });
    }

    // 6. 寫入 order_items 明細
    const { error: itemsErr } = await supabase.from('order_items').insert(
      orderItemsToInsert.map(({ newStock: _ignore, ...row }) => ({
        order_id: createdOrder.id,
        ...row,
      }))
    );

    if (itemsErr) {
      console.error('寫入訂單明細失敗:', itemsErr);
    }

    // 7. 扣除有設定庫存的商品數量
    for (const item of orderItemsToInsert) {
      if (item.newStock !== null) {
        await supabase
          .from('products')
          .update({ stock: item.newStock })
          .eq('id', item.product_id);
      }
    }

    // 8. 推播 LINE 新訂單通知給老闆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = store.owner_line_id;
    const liffBaseUrl =
      process.env.NEXT_PUBLIC_LIFF_URL || 'https://liff.line.me/2012698099-NqhRzmeW';
    const ownerUrl = `${liffBaseUrl}/store/${store.id}/owner`;
    if (channelAccessToken && ownerLineId && !String(ownerLineId).startsWith('demo')) {
      const summaryLines = orderItemsToInsert
        .map((i) => `・${i.product_name} x${i.quantity}`)
        .join('\n');
      const methodText = deliveryMethod === 'pickup' ? '面交自取' : '冷凍宅配';

      try {
        const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${channelAccessToken}`,
          },
          body: JSON.stringify({
            to: ownerLineId,
            messages: [
              {
                type: 'text',
                text: `🥟 新訂單通知（${store.store_name}）\n訂購人：${customerName.trim()}（${customerPhone.trim()}）\n方式：${methodText}\n明細：\n${summaryLines}\n應付總額：NT$ ${totalAmount}（後五碼：${bankLastFive.trim()}）\n👉 前往老闆後台對帳確認：${ownerUrl}`,
              },
            ],
          }),
        });

        const lineBody = await lineRes.text();
        console.log('📨 LINE push status:', lineRes.status, 'ownerLineId:', ownerLineId, 'body:', lineBody);
      } catch (err) {
        console.error('LINE 推播新訂單失敗:', err);
      }
    } else {
      console.warn('⚠️ 略過 LINE 推播，請檢查:', {
        hasToken: Boolean(channelAccessToken),
        ownerLineId,
      });
    }

    return NextResponse.json({ success: true, order: createdOrder });
  } catch (err) {
    console.error('orders/create error:', err);
    return NextResponse.json({ success: false, error: '伺服器發生錯誤' }, { status: 500 });
  }
}