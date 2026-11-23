import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { orderId, customerLineId } = await req.json();

    if (!orderId || !customerLineId) {
      return NextResponse.json(
        { success: false, error: '缺少訂單編號或使用者資訊' },
        { status: 400 }
      );
    }

    // 1. 查詢訂單、明細與店家資訊
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, stores(store_name, owner_line_id), order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { success: false, error: '找不到此筆訂單' },
        { status: 404 }
      );
    }

    // 2. 驗證是否為下單本人
    if (order.customer_line_id !== customerLineId) {
      return NextResponse.json(
        { success: false, error: '無權限取消此筆訂單' },
        { status: 403 }
      );
    }

    // 3. 僅允許「待對帳」狀態由客人取消
    if (order.status !== 'pending_verify') {
      return NextResponse.json(
        { success: false, error: '此訂單已確認收款或已出貨，無法直接線上取消，請聯繫店家' },
        { status: 400 }
      );
    }

    // 4. 更新訂單狀態為 cancelled
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .eq('status', 'pending_verify');

    if (updateErr) {
      console.error('取消訂單失敗:', updateErr);
      return NextResponse.json(
        { success: false, error: '取消訂單失敗，請稍後再試' },
        { status: 500 }
      );
    }

    // 5. 加回有設定庫存的商品數量
    if (Array.isArray(order.order_items)) {
      for (const item of order.order_items) {
        if (item.product_id) {
          const { data: prod } = await supabase
            .from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single();

          if (prod && prod.stock !== null) {
            await supabase
              .from('products')
              .update({ stock: prod.stock + item.quantity })
              .eq('id', item.product_id);
          }
        }
      }
    }

    // 6. 推播 LINE 取消通知給老闆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = order.stores?.owner_line_id;
    const storeName = order.stores?.store_name || '商店';

    if (
      channelAccessToken &&
      ownerLineId &&
      !String(ownerLineId).startsWith('demo')
    ) {
      await fetch('https://api.line.me/v2/bot/message/push', {
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
              text: `⚠️ 客人取消訂單通知（${storeName}）\n訂購人：${order.customer_name}（${order.customer_phone}）\n訂單金額：NT$ ${order.total_amount}（後五碼：${order.bank_last_five}）\n該筆訂單已取消，商品庫存已自動回補。`,
            },
          ],
        }),
      }).catch((err) => console.error('LINE 推播取消訂單失敗:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('orders/cancel error:', err);
    return NextResponse.json(
      { success: false, error: '伺服器發生錯誤' },
      { status: 500 }
    );
  }
}