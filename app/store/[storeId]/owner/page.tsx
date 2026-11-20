import StoreOwnerClient from '@/components/StoreOwnerClient';

export default async function StoreOwnerPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <StoreOwnerClient storeId={storeId} />;
}