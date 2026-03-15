import { MonthlyOrders } from '@/components/orders/MonthlyOrders';

export default async function OrdersPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Monthly Orders</h1>
      <MonthlyOrders />
    </div>
  );
}
