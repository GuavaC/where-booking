import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function formatTaiwanDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('zh-TW', {
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
    const body = await req.json();
    const { appointmentId } = body as { appointmentId?: string };

    if (!appointmentId) {
      return NextResponse.json({ error: '缺少 appointmentId' }, { status: 400 });
    }

    // 1. 查詢該筆預約、關聯店家與服務資訊
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id,
        store_id,
        customer_line_id,
        customer_name,
        service_id,
        start_time,
        end_time,
        payment_status,
        bank_last_five,
        stores (
          store_name,
          bank_info
        ),
        services (
          name,
          duration_minutes,
          price,
          deposit
        )
      `)
      .eq('id', appointmentId)
      .single();

    if (apptErr || !appt) {
      return NextResponse.json({ error: '找不到該筆預約紀錄' }, { status: 404 });
    }

    // 2. 更新預約狀態為 confirmed
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ payment_status: 'confirmed' })
      .eq('id', appointmentId);

    if (updateErr) {
      return NextResponse.json({ error: '更新預約狀態失敗' }, { status: 500 });
    }

    // 3. 準備 LINE Messaging API 推播
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const customerLineId = appt.customer_line_id;

    // 若是在本機測試模式（非真實 LINE userId）或尚未設定 Token，仍算對帳成功但略過真實推播
    const isRealLineUserId =
      typeof customerLineId === 'string' && /^U[0-9a-fA-F]{32}$/.test(customerLineId);

    if (!channelAccessToken) {
      return NextResponse.json({
        success: true,
        lineNotified: false,
        reason: '尚未設定 LINE_CHANNEL_ACCESS_TOKEN',
      });
    }

    if (!isRealLineUserId) {
      return NextResponse.json({
        success: true,
        lineNotified: false,
        reason: '非真實 LINE userId（可能為測試模式），已略過推播',
      });
    }

    const storeInfo = Array.isArray(appt.stores) ? appt.stores[0] : appt.stores;
    const serviceInfo = Array.isArray(appt.services) ? appt.services[0] : appt.services;

    const storeName = storeInfo?.store_name || '預約工作室';
    const serviceName = serviceInfo?.name || '預約服務';
    const startText = formatTaiwanDateTime(appt.start_time);
	const customerUrl = `${req.nextUrl.origin}/store/${appt.store_id}`;

    const messageText = [
      `🎉【${storeName}】預約成功通知`,
      ``,
      `${appt.customer_name} 您好，我們已確認收到您的定金（後五碼：${appt.bank_last_five}），您的預約已正式成立！`,
      ``,
      `📌 預約項目：${serviceName}`,
      `🕒 預約時間：${startText}`,
      serviceInfo?.duration_minutes ? `⏱️ 預計耗時：${serviceInfo.duration_minutes} 分鐘` : '',
      ``,
	  `👉 查看店家與預約資訊：${customerUrl}`,
      `如需更改或取消預約，請直接回覆此官方帳號與我們聯繫，期待為您服務！`,
    ]
      .filter(Boolean)
      .join('\n');

    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: customerLineId,
        messages: [
          {
            type: 'text',
            text: messageText,
          },
        ],
      }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error('LINE Messaging API 推播失敗:', errText);
      return NextResponse.json({
        success: true,
        lineNotified: false,
        lineError: errText,
      });
    }

    return NextResponse.json({
      success: true,
      lineNotified: true,
    });
  } catch (err) {
    console.error('確認入帳 API 例外錯誤:', err);
    return NextResponse.json({ error: '伺服器發生錯誤' }, { status: 500 });
  }
}