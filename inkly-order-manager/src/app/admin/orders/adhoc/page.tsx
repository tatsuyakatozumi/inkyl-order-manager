import { AdhocOrderForm } from '@/components/orders/AdhocOrderForm';

export default function AdhocOrderPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">臨時発注</h1>
      <AdhocOrderForm />
    </div>
  );
}
