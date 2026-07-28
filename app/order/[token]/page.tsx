import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ensureOrdersSchema, getDb } from "../../../db";
import { orders } from "../../../db/schema";
import OrderStatusClient from "./status-client";

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (/^[a-f0-9]{32}$/i.test(token)) {
    await ensureOrdersSchema();
    const [order] = await getDb().select({ status: orders.status }).from(orders).where(eq(orders.guestToken, token)).limit(1);
    if (order?.status === "done" || order?.status === "cancelled") redirect("/");
  }
  return <OrderStatusClient token={token} />;
}
