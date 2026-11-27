import { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_MONTHLY_LIMIT = 50;

export type QuotaType = 'booking' | 'order';

export interface MonthlyQuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  isReached: boolean;
}

export function getMonthlyQuotaLimit(type: QuotaType): number {
  const raw =
    type === 'booking'
      ? process.env.NEXT_PUBLIC_MONTHLY_BOOKING_LIMIT ?? process.env.MONTHLY_BOOKING_LIMIT
      : process.env.NEXT_PUBLIC_MONTHLY_ORDER_LIMIT ??
        process.env.MONTHLY_ORDER_LIMIT ??
        process.env.NEXT_PUBLIC_MONTHLY_BOOKING_LIMIT ??
        process.env.MONTHLY_BOOKING_LIMIT;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MONTHLY_LIMIT;
}

export function getTaiwanMonthRangeIso(now = new Date()): { startIso: string; endIso: string } {
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

export async function getStoreMonthlyQuota(
  supabase: SupabaseClient,
  storeId: string,
  type: QuotaType,
  now = new Date()
): Promise<MonthlyQuotaInfo> {
  const limit = getMonthlyQuotaLimit(type);
  const { startIso, endIso } = getTaiwanMonthRangeIso(now);

  const { count, error } =
    type === 'booking'
      ? await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .neq('payment_status', 'cancelled')
          .gte('created_at', startIso)
          .lt('created_at', endIso)
      : await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .gte('created_at', startIso)
          .lt('created_at', endIso);

  if (error) {
    throw error;
  }

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    limit,
    used,
    remaining,
    isReached: used >= limit,
  };
}