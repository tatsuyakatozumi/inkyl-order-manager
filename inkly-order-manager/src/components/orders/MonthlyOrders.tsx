'use client';

import { useCallback, useMemo, useState } from 'react';
import { ExternalLink, Image, ShoppingCart, Zap } from 'lucide-react';
import { updateManualOrderQuantity, updateOrderAdjustment } from '@/app/admin/orders/actions';

type OrderStatus = 'draft' | 'confirmed' | 'ordered' | 'completed';

type SupplierLite = {
  id: string;
  name: string;
  auto_order_supported: boolean;
};

type ItemLite = {
  id: string;
  name: string;
  spec: string | null;
  unit_price: number | null;
  product_url: string | null;
  order_unit: string | null;
  consumption_per_visit: number | null;
  supplier: SupplierLite;
};

interface CalculatedOrderItem {
  id: string;
  year_month: string;
  item_id: string;
  expected_visitors: number;
  calculated_quantity: number;
  inventory_quantity: number | null;
  adjustment: number;
  final_quantity: number;
  order_status: OrderStatus;
  item: ItemLite;
  calculation: {
    orderQuantity: number;
    finalQuantity: number;
  };
}

interface CalculateResponse {
  yearMonth: string;
  expectedVisitors: number;
  totalItems: number;
  orders: CalculatedOrderItem[];
}


function getDefaultYearMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildYearMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let offset = -3; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push(`${y}-${m}`);
  }
  return options;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `¥${value.toLocaleString()}`;
}

function statusBadge(status: OrderStatus) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-gray-200 text-gray-700' },
    confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700' },
    ordered: { label: 'Ordered', cls: 'bg-green-100 text-green-700' },
    completed: { label: 'Completed', cls: 'bg-green-200 text-green-900' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function groupBySupplier(orders: CalculatedOrderItem[]) {
  const map = new Map<string, { supplier: SupplierLite; items: CalculatedOrderItem[] }>();
  for (const order of orders) {
    const sid = order.item.supplier.id;
    if (!map.has(sid)) {
      map.set(sid, { supplier: order.item.supplier, items: [] });
    }
    map.get(sid)!.items.push(order);
  }
  return map;
}

export function MonthlyOrders() {
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth);
  const [expectedVisitors, setExpectedVisitors] = useState(300);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const [autoOrders, setAutoOrders] = useState<CalculatedOrderItem[]>([]);
  const [manualOrders, setManualOrders] = useState<CalculatedOrderItem[]>([]);

  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [manualQuantities, setManualQuantities] = useState<Record<string, number>>({});
  const [manualRemarks, setManualRemarks] = useState<Record<string, string>>({});

  const yearMonthOptions = useMemo(buildYearMonthOptions, []);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth, expectedVisitors }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: CalculateResponse = await res.json();

      const auto = data.orders.filter((o) => o.item.consumption_per_visit !== null);
      const manual = data.orders.filter((o) => o.item.consumption_per_visit === null);

      setAutoOrders(auto);
      setManualOrders(manual);
      setAdjustments({});
      setManualQuantities({});
      setManualRemarks({});
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate order plan.');
    } finally {
      setLoading(false);
    }
  }, [yearMonth, expectedVisitors]);

  const handleAdjustmentInput = useCallback((order: CalculatedOrderItem, value: number) => {
    setAdjustments((prev) => ({ ...prev, [order.item_id]: value }));

    const newFinal = Math.max(0, order.calculated_quantity + value);
    setAutoOrders((prev) =>
      prev.map((o) =>
        o.item_id === order.item_id
          ? { ...o, adjustment: value, final_quantity: newFinal }
          : o,
      ),
    );
  }, []);

  const handleAdjustmentCommit = useCallback(async (order: CalculatedOrderItem) => {
    const value = adjustments[order.item_id] ?? order.adjustment ?? 0;
    if (!order.id) return;
    await updateOrderAdjustment(order.id, value);
  }, [adjustments]);

  const handleManualQtyInput = useCallback((order: CalculatedOrderItem, value: number) => {
    setManualQuantities((prev) => ({ ...prev, [order.item_id]: value }));
    setManualOrders((prev) =>
      prev.map((o) =>
        o.item_id === order.item_id
          ? { ...o, calculated_quantity: value, final_quantity: value }
          : o,
      ),
    );
  }, []);

  const handleManualQtyCommit = useCallback(async (order: CalculatedOrderItem) => {
    const value = manualQuantities[order.item_id] ?? order.final_quantity;
    if (!order.id) return;
    await updateManualOrderQuantity(order.id, value);
  }, [manualQuantities]);

  const handleExecuteOrder = useCallback(
    async (
      supplier: SupplierLite,
      items: CalculatedOrderItem[],
      autoConfirm: boolean,
    ) => {
      if (autoConfirm) {
        const totalAmount = items.reduce(
          (sum, o) => sum + o.final_quantity * (o.item.unit_price ?? 0),
          0,
        );
        const ok = confirm(
          `Confirm order for ${supplier.name}?\n\nItems: ${items.length}\nEstimated total: ¥${totalAmount.toLocaleString()}`,
        );
        if (!ok) return;
      } else {
        if (!confirm(`Add items to cart for ${supplier.name}?`)) return;
      }

      setExecuting(supplier.id);
      try {
        const res = await fetch('/api/orders/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierName: supplier.name,
            yearMonth,
            autoConfirm,
            itemIds: items.map((i) => i.item_id),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        const newStatus = data.checkoutSuccess ? 'ordered' : 'confirmed';

        if (data.screenshotUrl) {
          setScreenshotUrls((prev) => ({ ...prev, [supplier.id]: data.screenshotUrl }));
        }

        setAutoOrders((prev) =>
          prev.map((o) =>
            items.some((i) => i.item_id === o.item_id)
              ? { ...o, order_status: newStatus as OrderStatus }
              : o,
          ),
        );

        if (autoConfirm && !data.checkoutSuccess) {
          alert('Checkout failed. Items may still be in cart.');
        }
      } catch (e: any) {
        alert(`Order execution failed: ${e.message}`);
      } finally {
        setExecuting(null);
      }
    },
    [yearMonth],
  );

  const handleConfirmOrder = useCallback(async (supplier: SupplierLite, items: CalculatedOrderItem[]) => {
    if (!confirm(`Confirm order for ${supplier.name}?`)) return;

    setConfirming(supplier.id);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: supplier.name,
          orderHistoryIds: items.map((i) => i.id),
          idempotencyKey,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.screenshotUrl) {
        setScreenshotUrls((prev) => ({ ...prev, [supplier.id]: data.screenshotUrl }));
      }
      if (data.success) {
        setAutoOrders((prev) =>
          prev.map((o) =>
            items.some((i) => i.item_id === o.item_id)
              ? { ...o, order_status: 'ordered' }
              : o,
          ),
        );
      } else {
        alert('Checkout failed. Cart should still contain items.');
      }
    } catch (e: any) {
      alert(`Confirm failed: ${e.message}`);
    } finally {
      setConfirming(null);
    }
  }, []);

  const autoTotal = autoOrders.reduce((sum, o) => sum + o.final_quantity * (o.item.unit_price ?? 0), 0);
  const manualTotal = manualOrders.reduce((sum, o) => sum + o.final_quantity * (o.item.unit_price ?? 0), 0);
  const grandTotal = autoTotal + manualTotal;

  const hasResults = autoOrders.length > 0 || manualOrders.length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Target Month</label>
            <select
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {yearMonthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {ym}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Expected Visitors</label>
            <input
              type="number"
              value={expectedVisitors}
              onChange={(e) => setExpectedVisitors(Number(e.target.value) || 0)}
              className="min-h-[44px] w-36 rounded-md border border-gray-300 bg-blue-50 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              min={0}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" />
            {loading ? 'Generating...' : 'Generate Monthly Plan'}
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Initial operation should keep extra stock, then tune by actual data.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasResults && (
        <>
          {autoOrders.length > 0 && (
            <AutoSection
              orders={autoOrders}
              adjustments={adjustments}
              executing={executing}
              screenshotUrls={screenshotUrls}
              confirming={confirming}
              onAdjustmentInput={handleAdjustmentInput}
              onAdjustmentCommit={handleAdjustmentCommit}
              onExecuteOrder={handleExecuteOrder}
              onConfirmOrder={handleConfirmOrder}
            />
          )}

          {manualOrders.length > 0 && (
            <ManualSection
              orders={manualOrders}
              manualQuantities={manualQuantities}
              manualRemarks={manualRemarks}
              onQuantityInput={handleManualQtyInput}
              onQuantityCommit={handleManualQtyCommit}
              onRemarksChange={(itemId, val) =>
                setManualRemarks((prev) => ({ ...prev, [itemId]: val }))
              }
            />
          )}

          <div className="rounded-lg border bg-white p-4 shadow-sm md:p-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">Auto total</span>
                <span className="font-medium">{formatCurrency(autoTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">Manual total</span>
                <span className="font-medium">{formatCurrency(manualTotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-base font-bold text-gray-900">Grand Total</span>
                <span className="text-base font-bold text-gray-900">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AutoSection({
  orders,
  adjustments,
  executing,
  screenshotUrls,
  confirming,
  onAdjustmentInput,
  onAdjustmentCommit,
  onExecuteOrder,
  onConfirmOrder,
}: {
  orders: CalculatedOrderItem[];
  adjustments: Record<string, number>;
  executing: string | null;
  screenshotUrls: Record<string, string>;
  confirming: string | null;
  onAdjustmentInput: (order: CalculatedOrderItem, value: number) => void;
  onAdjustmentCommit: (order: CalculatedOrderItem) => void;
  onExecuteOrder: (supplier: SupplierLite, items: CalculatedOrderItem[], autoConfirm: boolean) => void;
  onConfirmOrder: (supplier: SupplierLite, items: CalculatedOrderItem[]) => void;
}) {
  const grouped = groupBySupplier(orders);

  return (
    <div className="space-y-4">
      <div className="rounded-t-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">
        Auto-calculated orders
      </div>

      {Array.from(grouped.entries()).map(([supplierId, group]) => {
        const subtotal = group.items.reduce((sum, o) => {
          const price = o.item.unit_price ?? 0;
          return sum + o.final_quantity * price;
        }, 0);

        return (
          <div key={supplierId} className="rounded-lg border bg-white shadow-sm">
            <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
              {group.supplier.name}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-3 py-2" style={{ width: '22%' }}>Item</th>
                    <th className="px-3 py-2" style={{ width: '10%' }}>Spec</th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Inventory</th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Calc Qty</th>
                    <th className="px-3 py-2 text-center" style={{ width: '8%' }}>Adjust</th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Final Qty</th>
                    <th className="px-3 py-2 text-right" style={{ width: '7%' }}>Price</th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Amount</th>
                    <th className="px-3 py-2 text-center" style={{ width: '5%' }}>URL</th>
                    <th className="px-3 py-2 text-center" style={{ width: '8%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((order) => {
                    const adj = adjustments[order.item_id] ?? order.adjustment ?? 0;
                    const lineAmount = order.final_quantity * (order.item.unit_price ?? 0);

                    return (
                      <tr key={order.item_id} className="border-b last:border-b-0 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{order.item.name}</td>
                        <td className="px-3 py-2 text-gray-600">{order.item.spec ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{order.inventory_quantity ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{order.calculated_quantity}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            value={adj}
                            onChange={(e) => onAdjustmentInput(order, Number(e.target.value) || 0)}
                            onBlur={() => onAdjustmentCommit(order)}
                            className="min-h-[44px] w-20 rounded border border-gray-300 px-1 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{order.final_quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(order.item.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(lineAmount)}</td>
                        <td className="px-3 py-2 text-center">
                          {order.item.product_url ? (
                            <a
                              href={order.item.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">{statusBadge(order.order_status)}</td>
                      </tr>
                    );
                  })}

                  <tr className="border-t bg-gray-50 font-medium">
                    <td colSpan={7} className="px-3 py-2 text-right text-gray-700">
                      {group.supplier.name} subtotal
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(subtotal)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>

            {group.supplier.auto_order_supported && (
              <div className="border-t px-4 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                  <button
                    onClick={() => onExecuteOrder(group.supplier, group.items, false)}
                    disabled={executing === supplierId}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {executing === supplierId ? 'Processing...' : <><ShoppingCart className="h-4 w-4" />Add to cart only</>}
                  </button>
                  <button
                    onClick={() => onExecuteOrder(group.supplier, group.items, true)}
                    disabled={executing === supplierId}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    {executing === supplierId ? 'Processing...' : <><Zap className="h-4 w-4" />Confirm order</>}
                  </button>
                </div>

                {screenshotUrls[supplierId] && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                      <Image className="h-3 w-3" />
                      Cart screenshot
                    </div>
                    <img
                      src={screenshotUrls[supplierId]}
                      alt={`${group.supplier.name} cart screenshot`}
                      className="max-h-64 rounded border object-contain"
                    />
                  </div>
                )}

                {group.items.some((i) => i.order_status === 'confirmed') && screenshotUrls[supplierId] && (
                  <div className="mt-3">
                    <button
                      onClick={() => onConfirmOrder(group.supplier, group.items)}
                      disabled={confirming === supplierId}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" />
                      {confirming === supplierId ? 'Confirming...' : 'Confirm order'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManualSection({
  orders,
  manualQuantities,
  manualRemarks,
  onQuantityInput,
  onQuantityCommit,
  onRemarksChange,
}: {
  orders: CalculatedOrderItem[];
  manualQuantities: Record<string, number>;
  manualRemarks: Record<string, string>;
  onQuantityInput: (order: CalculatedOrderItem, value: number) => void;
  onQuantityCommit: (order: CalculatedOrderItem) => void;
  onRemarksChange: (itemId: string, value: string) => void;
}) {
  const grouped = groupBySupplier(orders);

  return (
    <div className="space-y-4">
      <div className="rounded-t-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">
        Manual input orders
      </div>

      {Array.from(grouped.entries()).map(([supplierId, group]) => (
        <div key={supplierId} className="rounded-lg border bg-white shadow-sm">
          <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
            {group.supplier.name}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-3 py-2" style={{ width: '25%' }}>Item</th>
                  <th className="px-3 py-2" style={{ width: '12%' }}>Spec</th>
                  <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Inventory</th>
                  <th className="px-3 py-2 text-center" style={{ width: '10%' }}>Qty</th>
                  <th className="px-3 py-2" style={{ width: '6%' }}>Unit</th>
                  <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Price</th>
                  <th className="px-3 py-2 text-right" style={{ width: '10%' }}>Amount</th>
                  <th className="px-3 py-2 text-center" style={{ width: '5%' }}>URL</th>
                  <th className="px-3 py-2" style={{ width: '16%' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((order) => {
                  const qty = manualQuantities[order.item_id] ?? order.final_quantity;
                  const lineAmount = qty * (order.item.unit_price ?? 0);

                  return (
                    <tr key={order.item_id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{order.item.name}</td>
                      <td className="px-3 py-2 text-gray-600">{order.item.spec ?? '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{order.inventory_quantity ?? '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          value={qty}
                          onChange={(e) => onQuantityInput(order, Number(e.target.value) || 0)}
                          onBlur={() => onQuantityCommit(order)}
                          className="min-h-[44px] w-20 rounded border border-gray-300 bg-yellow-50 px-2 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-600">{order.item.order_unit ?? '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(order.item.unit_price)}</td>
                      <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(lineAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        {order.item.product_url ? (
                          <a
                            href={order.item.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={manualRemarks[order.item_id] ?? ''}
                          onChange={(e) => onRemarksChange(order.item_id, e.target.value)}
                          className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Notes"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
