import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, customerLineId } = body as {
      orderId?: string;
      customerLineId?: string;
    };

    if (!orderId || !customerLineId) {
      return NextResponse.json(
        { success: false, error: '缺少訂單編號或使用者資訊' },
        { status: 400 }
      );
    }

    // 1. 查詢訂單主表
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
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
        { success: false, error: '此訂單已確認收款或已出貨，無法直接線上取消' },
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
        { success: false, error: `更新訂單狀態失敗：${updateErr.message}` },
        { status: 500 }
      );
    }

    // 5. 查詢訂單明細並回補有設定庫存的商品數量
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId);

    if (Array.isArray(orderItems)) {
      for (const item of orderItems) {
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

    // 6. 查詢店家資訊並推播 LINE 取消通知給老闆
    const { data: store } = await supabase
      .from('stores')
      .select('store_name, owner_line_id')
      .eq('id', order.store_id)
      .single();

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = store?.owner_line_id;
    const storeName = store?.store_name || '商店';

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
    const message = err instanceof Error ? err.message : '伺服器發生錯誤';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}