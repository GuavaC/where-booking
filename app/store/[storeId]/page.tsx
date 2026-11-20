import StoreBookingClient from '@/components/StoreBookingClient';

export default async function StoreBookingPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <StoreBookingClient storeId={storeId} />;
}