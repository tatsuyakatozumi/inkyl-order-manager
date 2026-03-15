import { AdhocOrderForm } from '@/components/orders/AdhocOrderForm';

export default function AdhocOrderPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900 md:text-2xl">Adhoc Orders</h1>
      <AdhocOrderForm />
    </div>
  );
}
