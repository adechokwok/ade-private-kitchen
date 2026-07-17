import OrderStatusClient from "./status-client";

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderStatusClient token={token} />;
}
