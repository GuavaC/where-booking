import { Suspense } from 'react';
import StoreOwnerClient from '@/components/StoreOwnerClient';

async function StoreOwnerLoader({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
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