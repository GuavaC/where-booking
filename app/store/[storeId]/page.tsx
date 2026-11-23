import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import StoreBookingClient from '@/components/StoreBookingClient';
import StoreShopClient from '@/components/StoreShopClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function StoreLoader({
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
    return <StoreShopClient storeId={storeId} />;
  }

  return <StoreBookingClient storeId={storeId} />;
}

export default function StorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 text-gray-500">
          載入系統中...
        </main>
      }
    >
      <StoreLoader params={params} />
    </Suspense>
  );
}