import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { orderId, ownerLineId, action, trackingNumber } = await req.json();

    if (!orderId || !ownerLineId || !action) {
      return NextResponse.json({ success: false, error: '缺少必要參數' }, { status: 400 });
    }

    // 1. 查詢訂單、明細與店家老闆身分
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, stores(store_name, owner_line_id), order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: '找不到此筆訂單' }, { status: 404 });
    }

    if (order.stores?.owner_line_id !== ownerLineId) {
      return NextResponse.json({ success: false, error: '無權限操作此店家訂單' }, { status: 403 });
    }

    let nextStatus = order.status;
    let nextTracking = order.tracking_number || '';
    let lineMessage = '';
    const storeName = order.stores?.store_name || '商店';
    const liffBaseUrl =
      process.env.NEXT_PUBLIC_LIFF_URL || 'https://liff.line.me/2012698099-NqhRzmeW';
    const customerUrl = `${liffBaseUrl}/store/${order.store_id}`;

    if (action === 'confirm_payment') {
      nextStatus = 'confirmed';
      lineMessage = [
        `✅ 收款確認通知（${storeName}）`,
        `您好 ${order.customer_name}，我們已收到您的匯款（NT$ ${order.total_amount}），目前正在為您安排備貨與製作！`,
        `👉 查看訂單與店家資訊：${customerUrl}`,
      ].join('\n');
    } else if (action === 'ship_order') {
      nextStatus = 'shipped';
      nextTracking = trackingNumber ? String(trackingNumber).trim() : '';
      const trackingText = nextTracking ? `\n🚚 物流單號：${nextTracking}` : '';
      lineMessage = [
        `🚚 訂單已出貨通知（${storeName}）`,
        `您好 ${order.customer_name}，您的訂購商品已安排寄出／可取貨囉！${trackingText}`,
        `👉 查看訂單與店家資訊：${customerUrl}`,
      ].join('\n');
    } else if (action === 'cancel_order') {
      nextStatus = 'cancelled';
      lineMessage = [
        `❌ 訂單已取消通知（${storeName}）`,
        `您好 ${order.customer_name}，您的訂購單（總額 NT$ ${order.total_amount}）已取消。`,
        `若您已完成匯款，請直接與店家聯繫辦理退款事宜。`,
        `👉 查看店家資訊：${customerUrl}`,
      ].join('\n');

      // 若原本未取消，加回商品庫存
      if (order.status !== 'cancelled' && Array.isArray(order.order_items)) {
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
    } else {
      return NextResponse.json({ success: false, error: '不支援的操作類型' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        tracking_number: nextTracking,
      })
      .eq('id', orderId);

    if (updateErr) {
      console.error('更新訂單狀態失敗:', updateErr);
      return NextResponse.json({ success: false, error: '更新狀態失敗' }, { status: 500 });
    }

    // 推播 LINE 通知給客人
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (
      lineMessage &&
      channelAccessToken &&
      order.customer_line_id &&
      !String(order.customer_line_id).startsWith('demo')
    ) {
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to: order.customer_line_id,
          messages: [{ type: 'text', text: lineMessage }],
        }),
      }).catch((err) => console.error('LINE 推播客人失敗:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('update-status error:', err);
    return NextResponse.json({ success: false, error: '伺服器發生錯誤' }, { status: 500 });
  }
}