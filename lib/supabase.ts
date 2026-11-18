import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('🔍 檢查 Supabase URL:', supabaseUrl);
console.log('🔍 檢查 Supabase Key 是否存在:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ 缺少 Supabase 環境變數，請確認 .env.local 設定是否正確');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);