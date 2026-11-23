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

    const expectedCode = process.env.REGISTER_INVITE_CODE;
    if (!expectedCode) {
      return NextResponse.json(
        { success: false, error: '系統尚未設定開通邀請碼，請聯繫管理員' },
        { status: 500 }
      );
    }

    if (!inviteCode || String(inviteCode).trim() !== expectedCode.trim()) {
      return NextResponse.json(
        { success: false, error: '邀請碼錯誤，請確認後再試' },
        { status: 401 }
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

    const normalizedType =
      storeType === 'ecommerce' || storeType === 'hybrid' ? storeType : 'booking';

    const { data, error } = await supabase
      .from('stores')
      .insert({
        store_name: String(storeName).trim(),
        store_type: normalizedType,
        bank_info: bankInfo ? String(bankInfo).trim() : '',
        owner_line_id: String(ownerLineId).trim(),
      })
      .select('id, store_name, store_type, owner_line_id')
      .single();

    if (error || !data) {
      console.error('建立店家失敗:', error);
      return NextResponse.json(
        { success: false, error: '建立店家資料失敗，請稍後再試' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      store: data,
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