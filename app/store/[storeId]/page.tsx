import { Suspense } from 'react';
import StoreBookingClient from '@/components/StoreBookingClient';

async function StoreBookingLoader({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <StoreBookingClient storeId={storeId} />;
}

export default function StoreBookingPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md flex h-screen items-center justify-center bg-gray-50 text-gray-500">
          載入預約系統中...
        </main>
      }
    >
      <StoreBookingLoader params={params} />
    </Suspense>
  );
}