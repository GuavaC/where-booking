import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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

    // 2. 取得服務項目名稱與金額
    const { data: service, error: serviceErr } = await supabase
      .from('services')
      .select('id, name, price, deposit, duration_minutes')
      .eq('id', serviceId)
      .eq('store_id', storeId)
      .single();

    if (serviceErr || !service) {
      return NextResponse.json({ success: false, error: '找不到此服務項目' }, { status: 404 });
    }

    // 3. 檢查該時段是否剛被其他客人搶先預約（排除已取消）
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

    // 4. 寫入 appointments 資料表
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

    // 5. 推播 LINE 新預約通知給老闆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineId = store.owner_line_id;
	const ownerUrl = `${req.nextUrl.origin}/store/${store.id}/owner`;

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