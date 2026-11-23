import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import StoreOwnerClient from '@/components/StoreOwnerClient';
import StoreShopOwnerClient from '@/components/StoreShopOwnerClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function StoreOwnerLoader({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;

  const { data: store } = await supabase
    .from('stores')
    .select('store_type')
    .eq('id', storeId)
    .single();

  if (store?.store_type === 'ecommerce') {
    return <StoreShopOwnerClient storeId={storeId} />;
  }

  return <StoreOwnerClient storeId={storeId} />;
}

export default function StoreOwnerPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-2xl min-h-screen bg-gray-50 p-6 flex items-center justify-center text-sm text-gray-500">
          驗證身分與載入後台中...
        </main>
      }
    >
      <StoreOwnerLoader params={params} />
    </Suspense>
  );
}