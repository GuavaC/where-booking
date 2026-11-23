import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const CANCEL_WINDOW_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    const { appointmentId, customerLineId } = await req.json();

    if (!appointmentId || !customerLineId) {
      return NextResponse.json(
        { success: false, error: '缺少預約編號或使用者身分' },
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

    // 2. 驗證是否為預約本人
    if (appt.customer_line_id !== customerLineId) {
      return NextResponse.json(
        { success: false, error: '無權限取消此筆預約' },
        { status: 403 }
      );
    }

    // 3. 檢查狀態與 24 小時門檻
    if (appt.payment_status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: '此筆預約已經取消' },
        { status: 400 }
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

    // 4. 更新狀態為 cancelled（釋出時段）
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

    // 5. 若有設定老闆 LINE ID 與 Token，順便推播通知老闆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = appt.stores?.owner_line_id;

    if (channelAccessToken && ownerLineId && !String(ownerLineId).startsWith('demo')) {
      const formattedTime = new Date(appt.start_time).toLocaleString('zh-TW', {
        hour12: false,
      });
      const serviceName = appt.services?.name || '預約服務';
      const storeName = appt.stores?.store_name || '工作室';

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
              text: `⚠️ 客人取消預約通知（${storeName}）\n客人：${appt.customer_name}\n服務：${serviceName}\n原預約時間：${formattedTime}\n狀態：已取消（時段已自動釋出）`,
            },
          ],
        }),
      }).catch((err) => console.error('LINE 通知老闆失敗:', err));
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