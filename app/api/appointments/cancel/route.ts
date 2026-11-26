import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const CANCEL_WINDOW_HOURS = 24;

function formatTaiwanDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { appointmentId, customerLineId, ownerLineId } = await req.json();

    if (!appointmentId || (!customerLineId && !ownerLineId)) {
      return NextResponse.json(
        { success: false, error: '缺少預約編號或操作者身分' },
        { status: 400 }
      );
    }

    // 1. 查詢該筆預約與所屬店家資訊
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('*, stores(store_name, owner_line_id), services(name)')
      .eq('id', appointmentId)
      .single();

    if (apptErr || !appt) {
      return NextResponse.json(
        { success: false, error: '找不到此筆預約紀錄' },
        { status: 404 }
      );
    }

    if (appt.payment_status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: '此筆預約已經取消' },
        { status: 400 }
      );
    }

    // 判斷操作者身分：老闆後台取消 vs 客人自行取消
    const isOwnerAction = Boolean(ownerLineId);

    if (isOwnerAction) {
      // 驗證是否為該店老闆
      if (appt.stores?.owner_line_id !== ownerLineId) {
        return NextResponse.json(
          { success: false, error: '無權限取消此店家的預約' },
          { status: 403 }
        );
      }
    } else {
      // 驗證是否為預約本人
      if (appt.customer_line_id !== customerLineId) {
        return NextResponse.json(
          { success: false, error: '無權限取消此筆預約' },
          { status: 403 }
        );
      }

      if (appt.payment_status === 'confirmed') {
        return NextResponse.json(
          {
            success: false,
            error: '此筆預約已確認入帳，如需取消或改期請直接聯繫工作室協助',
          },
          { status: 400 }
        );
      }

      const startMs = new Date(appt.start_time).getTime();
      const diffHours = (startMs - Date.now()) / (1000 * 60 * 60);

      if (diffHours < CANCEL_WINDOW_HOURS) {
        return NextResponse.json(
          {
            success: false,
            error: `距離預約時間已不足 ${CANCEL_WINDOW_HOURS} 小時，無法線上取消，請直接聯繫工作室`,
          },
          { status: 400 }
        );
      }
    }

    // 2. 更新狀態為 cancelled（釋出時段）
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ payment_status: 'cancelled' })
      .eq('id', appointmentId);

    if (updateErr) {
      console.error('取消預約更新失敗:', updateErr);
      return NextResponse.json(
        { success: false, error: '取消預約失敗，請稍後再試' },
        { status: 500 }
      );
    }

    // 3. 準備 LINE 推播通知（依取消方決定通知對象與 LIFF 連結）
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const liffBaseUrl =
      process.env.NEXT_PUBLIC_LIFF_URL || 'https://liff.line.me/2012698099-NqhRzmeW';
    const formattedTime = formatTaiwanDateTime(appt.start_time);
    const serviceName = appt.services?.name || '預約服務';
    const storeName = appt.stores?.store_name || '工作室';

    if (channelAccessToken) {
      if (isOwnerAction) {
        // 老闆取消 ➔ 推播通知客人
        const targetCustomerId = appt.customer_line_id;
        if (targetCustomerId && !String(targetCustomerId).startsWith('demo')) {
          const customerUrl = `${liffBaseUrl}/store/${appt.store_id}`;
          const messageText = [
            `❌ 預約已取消通知（${storeName}）`,
            `您好 ${appt.customer_name}，您原訂的預約已取消。`,
            `📌 服務項目：${serviceName}`,
            `🕒 原預約時間：${formattedTime}`,
            `若您已完成定金匯款，請直接聯繫工作室辦理退款或改期事宜。`,
            `👉 查看店家與預約資訊：${customerUrl}`,
          ].join('\n');

          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
              to: targetCustomerId,
              messages: [{ type: 'text', text: messageText }],
            }),
          }).catch((err) => console.error('LINE 通知客人取消失敗:', err));
        }
      } else {
        // 客人自行取消 ➔ 推播通知老闆
        const targetOwnerId = appt.stores?.owner_line_id;
        if (targetOwnerId && !String(targetOwnerId).startsWith('demo')) {
          const ownerUrl = `${liffBaseUrl}/store/${appt.store_id}/owner`;
          const messageText = [
            `⚠️ 客人取消預約通知（${storeName}）`,
            `客人：${appt.customer_name}`,
            `服務：${serviceName}`,
            `原預約時間：${formattedTime}`,
            `狀態：已取消（時段已自動釋出）`,
            `👉 前往老闆後台查看：${ownerUrl}`,
          ].join('\n');

          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
              to: targetOwnerId,
              messages: [{ type: 'text', text: messageText }],
            }),
          }).catch((err) => console.error('LINE 通知老闆取消失敗:', err));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('cancel route error:', err);
    return NextResponse.json(
      { success: false, error: '伺服器發生錯誤' },
      { status: 500 }
    );
  }
}