import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreMonthlyQuota, QuotaType } from '@/lib/monthlyQuota';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params;
    if (!storeId) {
      return NextResponse.json({ success: false, error: '缺少 storeId' }, { status: 400 });
    }

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, store_type')
      .eq('id', storeId)
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ success: false, error: '找不到此商店' }, { status: 404 });
    }

    const queryType = req.nextUrl.searchParams.get('type');
    const quotaType: QuotaType =
      queryType === 'order' || queryType === 'booking'
        ? queryType
        : store.store_type === 'ecommerce'
          ? 'order'
          : 'booking';

    const quota = await getStoreMonthlyQuota(supabase, storeId, quotaType);

    return NextResponse.json({
      success: true,
      quotaType,
      ...quota,
    });
  } catch (err) {
    console.error('quota GET error:', err);
    return NextResponse.json({ success: false, error: '查詢當月額度失敗' }, { status: 500 });
  }
}