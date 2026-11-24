import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      inviteCode,
      storeName,
      storeType,
      bankInfo,
      ownerLineId,
      ownerName,
    } = body;

    const trimmedCode = inviteCode ? String(inviteCode).trim() : '';
    if (!trimmedCode) {
      return NextResponse.json(
        { success: false, error: '請輸入開通邀請碼' },
        { status: 400 }
      );
    }

    if (!storeName || !String(storeName).trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入店家名稱' },
        { status: 400 }
      );
    }

    if (!ownerLineId || !String(ownerLineId).trim()) {
      return NextResponse.json(
        { success: false, error: '無法取得您的 LINE 帳號資訊，請重新開啟頁面' },
        { status: 400 }
      );
    }

    // 1. 優先查詢資料庫中的一次性邀請碼（支援 90 天體驗 / 365 天年費等不同天數）
    let durationDays = 90;
    let matchedDbInviteCode: string | null = null;

    const { data: inviteRecord } = await supabase
      .from('invite_codes')
      .select('code, duration_days, is_used')
      .eq('code', trimmedCode)
      .maybeSingle();

    if (inviteRecord) {
      if (inviteRecord.is_used) {
        return NextResponse.json(
          { success: false, error: '此邀請碼已被使用，請聯繫管理員取得新邀請碼' },
          { status: 401 }
        );
      }
      durationDays = Number(inviteRecord.duration_days || 90);
      matchedDbInviteCode = inviteRecord.code;
    } else {
      // 2. 若資料庫查無此碼，向下相容檢查環境變數 REGISTER_INVITE_CODE（預設 90 天）
      const expectedCode = process.env.REGISTER_INVITE_CODE;
      if (!expectedCode || trimmedCode !== expectedCode.trim()) {
        return NextResponse.json(
          { success: false, error: '邀請碼錯誤或無效，請確認後再試' },
          { status: 401 }
        );
      }
    }

    // 3. 計算服務到期日並建立店家
    const expiresAt = new Date(
      Date.now() + durationDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const normalizedType =
      storeType === 'ecommerce' || storeType === 'hybrid' ? storeType : 'booking';

    const { data, error } = await supabase
      .from('stores')
      .insert({
        store_name: String(storeName).trim(),
        store_type: normalizedType,
        bank_info: bankInfo ? String(bankInfo).trim() : '',
        owner_line_id: String(ownerLineId).trim(),
        subscription_status: 'active',
        expires_at: expiresAt,
      })
      .select('id, store_name, store_type, owner_line_id, expires_at')
      .single();

    if (error || !data) {
      console.error('建立店家失敗:', error);
      return NextResponse.json(
        { success: false, error: '建立店家資料失敗，請稍後再試' },
        { status: 500 }
      );
    }

    // 4. 若為資料庫邀請碼，標記為已使用並綁定店家 ID
    if (matchedDbInviteCode) {
      await supabase
        .from('invite_codes')
        .update({
          is_used: true,
          used_by_store_id: data.id,
          used_at: new Date().toISOString(),
        })
        .eq('code', matchedDbInviteCode);
    }

    return NextResponse.json({
      success: true,
      store: data,
      durationDays,
      applicantName: ownerName || '',
    });
  } catch (err) {
    console.error('register route error:', err);
    return NextResponse.json(
      { success: false, error: '伺服器發生錯誤' },
      { status: 500 }
    );
  }
}