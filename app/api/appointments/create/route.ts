import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_MONTHLY_LIMIT = 50;

function getMonthlyLimit(): number {
  const raw = Number(process.env.MONTHLY_BOOKING_LIMIT);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
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

function formatTaiwanDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return isoString;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      storeId,
      customerLineId,
      customerName,
      serviceId,
      startTime,
      endTime,
      bankLastFive,
    } = body as {
      storeId: string;
      customerLineId: string;
      customerName: string;
      serviceId: string;
      startTime: string;
      endTime: string;
      bankLastFive: string;
    };

    if (!storeId || !customerLineId || !serviceId || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, error: '預約資料不完整，請重新選擇服務與時段' },
        { status: 400 }
      );
    }

    if (!bankLastFive || bankLastFive.trim().length !== 5) {
      return NextResponse.json(
        { success: false, error: '請輸入正確的 5 碼銀行帳號後五碼' },
        { status: 400 }
      );
    }

    // 1. 取得店家推播資訊
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, store_name, owner_line_id')
      .eq('id', storeId)
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ success: false, error: '找不到此預約店家' }, { status: 404 });
    }

    // 2. 檢查該店家本月預約筆數是否已達上限（排除已取消）
    const monthlyLimit = getMonthlyLimit();
    const { startIso, endIso } = getTaiwanMonthRangeIso();

    const { count: currentMonthCount, error: countErr } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .neq('payment_status', 'cancelled')
      .gte('created_at', startIso)
      .lt('created_at', endIso);

    if (countErr) {
      console.error('查詢本月預約筆數失敗:', countErr);
      return NextResponse.json(
        { success: false, error: '系統忙碌中，請稍後再試' },
        { status: 500 }
      );
    }

    if ((currentMonthCount ?? 0) >= monthlyLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `本商店本月線上預約已達上限（${monthlyLimit} 筆），請直接聯繫店家預約`,
        },
        { status: 429 }
      );
    }

    // 3. 取得服務項目名稱與金額
    const { data: service, error: serviceErr } = await supabase
      .from('services')
      .select('id, name, price, deposit, duration_minutes')
      .eq('id', serviceId)
      .eq('store_id', storeId)
      .single();

    if (serviceErr || !service) {
      return NextResponse.json({ success: false, error: '找不到此服務項目' }, { status: 404 });
    }

    // 4. 檢查該時段是否剛被其他客人搶先預約（排除已取消）
    const { data: conflictAppts } = await supabase
      .from('appointments')
      .select('id')
      .eq('store_id', storeId)
      .neq('payment_status', 'cancelled')
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (conflictAppts && conflictAppts.length > 0) {
      return NextResponse.json(
        { success: false, error: '此時段剛被其他顧客預約，請重新選擇其他時段' },
        { status: 409 }
      );
    }

    // 5. 寫入 appointments 資料表
    const { data: createdAppointment, error: insertErr } = await supabase
      .from('appointments')
      .insert({
        store_id: store.id,
        customer_line_id: customerLineId,
        customer_name: (customerName || 'LINE 顧客').trim(),
        service_id: service.id,
        start_time: startTime,
        end_time: endTime,
        payment_status: 'pending_verify',
        bank_last_five: bankLastFive.trim(),
      })
      .select('*')
      .single();

    if (insertErr || !createdAppointment) {
      console.error('建立預約失敗:', insertErr);
      return NextResponse.json(
        { success: false, error: '預約送出失敗，請稍後再試' },
        { status: 500 }
      );
    }

    // 6. 推播 LINE 新預約通知給老闆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = store.owner_line_id;
    const liffBaseUrl =
      process.env.NEXT_PUBLIC_LIFF_URL || 'https://liff.line.me/2012698099-NqhRzmeW';
    const ownerUrl = `${liffBaseUrl}/store/${store.id}/owner`;

    if (channelAccessToken && ownerLineId && !String(ownerLineId).startsWith('demo')) {
      const formattedTime = formatTaiwanDateTime(startTime);

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
                text: `📅 新預約通知（${store.store_name}）\n預約人：${(customerName || 'LINE 顧客').trim()}\n服務項目：${service.name}\n預約時間：${formattedTime}\n定金金額：NT$ ${service.deposit}（後五碼：${bankLastFive.trim()}）\n👉 前往老闆後台對帳確認：${ownerUrl}`,
              },
            ],
          }),
        });

        const lineBody = await lineRes.text();
        console.log(
          '📨 LINE appointment push status:',
          lineRes.status,
          'ownerLineId:',
          ownerLineId,
          'body:',
          lineBody
        );
      } catch (err) {
        console.error('LINE 推播新預約失敗:', err);
      }
    } else {
      console.warn('⚠️ 略過預約 LINE 推播，請檢查:', {
        hasToken: Boolean(channelAccessToken),
        ownerLineId,
      });
    }

    return NextResponse.json({ success: true, appointment: createdAppointment });
  } catch (err) {
    console.error('appointments/create error:', err);
    return NextResponse.json({ success: false, error: '伺服器發生錯誤' }, { status: 500 });
  }
}