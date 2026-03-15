'use client';

import { useState, useCallback } from 'react';
import { ExternalLink, ShoppingCart, Check, Zap, AlertTriangle } from 'lucide-react';
import type { Supplier, Item, OrderStatus } from '@/types/database';
import {
  updateOrderAdjustment,
  updateManualOrderQuantity,
} from '@/app/admin/orders/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalculatedOrderItem {
  id: string; // monthly_order id (from upsert)
  year_month: string;
  item_id: string;
  expected_visitors: number;
  calculated_quantity: number;
  inventory_quantity: number | null;
  adjustment: number;
  final_quantity: number;
  order_status: OrderStatus;
  item: Item & { supplier: Supplier };
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

interface MonthlyOrdersProps {
  suppliers: Supplier[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return `\u00a5${value.toLocaleString()}`;
}

function statusBadge(status: OrderStatus) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-gray-200 text-gray-700' },
    confirmed: { label: '確定', cls: 'bg-blue-100 text-blue-700' },
    ordered: { label: '発注済', cls: 'bg-green-100 text-green-700' },
    completed: { label: '完了', cls: 'bg-green-200 text-green-900' },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Group helpers
// ---------------------------------------------------------------------------

type GroupedOrders = Map<string, { supplier: Supplier; items: CalculatedOrderItem[] }>;

function groupBySupplier(orders: CalculatedOrderItem[]): GroupedOrders {
  const map: GroupedOrders = new Map();
  for (const order of orders) {
    const sid = order.item.supplier.id;
    if (!map.has(sid)) {
      map.set(sid, { supplier: order.item.supplier, items: [] });
    }
    map.get(sid)!.items.push(order);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthlyOrders({ suppliers }: MonthlyOrdersProps) {
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth);
  const [expectedVisitors, setExpectedVisitors] = useState(300);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The full list from the API, split into auto vs manual
  const [autoOrders, setAutoOrders] = useState<CalculatedOrderItem[]>([]);
  const [manualOrders, setManualOrders] = useState<CalculatedOrderItem[]>([]);

  // Local adjustment overrides (keyed by order item_id)
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  // Local manual quantity overrides
  const [manualQuantities, setManualQuantities] = useState<
    Record<string, number>
  >({});
  // Local manual remarks
  const [manualRemarks, setManualRemarks] = useState<Record<string, string>>(
    {},
  );

  const yearMonthOptions = buildYearMonthOptions();

  // ---- Generate plan -------------------------------------------------------

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

      const auto = data.orders.filter(
        (o) => o.item.consumption_per_visit !== null,
      );
      const manual = data.orders.filter(
        (o) => o.item.consumption_per_visit === null,
      );

      setAutoOrders(auto);
      setManualOrders(manual);

      // Reset local overrides
      setAdjustments({});
      setManualQuantities({});
      setManualRemarks({});
    } catch (e: any) {
      setError(e.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [yearMonth, expectedVisitors]);

  // ---- Adjustment change ---------------------------------------------------

  const handleAdjustmentChange = useCallback(
    async (order: CalculatedOrderItem, value: number) => {
      setAdjustments((prev) => ({ ...prev, [order.item_id]: value }));

      // Optimistic update in local state
      const newFinal = Math.max(0, order.calculated_quantity + value);
      setAutoOrders((prev) =>
        prev.map((o) =>
          o.item_id === order.item_id
            ? { ...o, adjustment: value, final_quantity: newFinal }
            : o,
        ),
      );

      if (order.id) {
        await updateOrderAdjustment(order.id, value);
      }
    },
    [],
  );

  // ---- Manual quantity change ----------------------------------------------

  const handleManualQuantityChange = useCallback(
    async (order: CalculatedOrderItem, value: number) => {
      setManualQuantities((prev) => ({ ...prev, [order.item_id]: value }));

      setManualOrders((prev) =>
        prev.map((o) =>
          o.item_id === order.item_id
            ? {
                ...o,
                calculated_quantity: value,
                final_quantity: value,
              }
            : o,
        ),
      );

      if (order.id) {
        await updateManualOrderQuantity(order.id, value);
      }
    },
    [],
  );

  // ---- Execute order -------------------------------------------------------

  const handleExecuteOrder = useCallback(
    async (supplier: Supplier, items: CalculatedOrderItem[], autoConfirm: boolean) => {
      if (autoConfirm) {
        const totalAmount = items.reduce((sum, o) => sum + o.final_quantity * (o.item.unit_price ?? 0), 0);
        if (
          !confirm(
            `${supplier.name} の注文を確定します。\n\n品目数: ${items.length}\n合計金額: ¥${totalAmount.toLocaleString()}\n\n注文が確定され、取り消しできません。よろしいですか？`,
          )
        ) {
          return;
        }
      } else {
        if (!confirm(`${supplier.name} のカートに投入しますか？`)) return;
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

        // Update statuses locally
        setAutoOrders((prev) =>
          prev.map((o) =>
            items.some((i) => i.item_id === o.item_id)
              ? { ...o, order_status: newStatus as OrderStatus }
              : o,
          ),
        );

        if (autoConfirm && !data.checkoutSuccess) {
          alert('注文確定に失敗しました。カートには投入済みです。手動で確認してください。');
        }
      } catch (e: any) {
        alert(`発注実行エラー: ${e.message}`);
      } finally {
        setExecuting(null);
      }
    },
    [yearMonth],
  );

  // ---- Totals --------------------------------------------------------------

  const autoTotal = autoOrders.reduce((sum, o) => {
    const price = o.item.unit_price ?? 0;
    return sum + o.final_quantity * price;
  }, 0);

  const manualTotal = manualOrders.reduce((sum, o) => {
    const price = o.item.unit_price ?? 0;
    return sum + o.final_quantity * price;
  }, 0);

  const grandTotal = autoTotal + manualTotal;

  const hasResults = autoOrders.length > 0 || manualOrders.length > 0;

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Parameters section */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              対象年月
            </label>
            <select
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {yearMonthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {ym}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              予想来客数
            </label>
            <input
              type="number"
              value={expectedVisitors}
              onChange={(e) =>
                setExpectedVisitors(Number(e.target.value) || 0)
              }
              className="w-32 rounded-md border border-gray-300 bg-blue-50 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              min={0}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" />
            {loading ? '計算中...' : '発注計画を生成'}
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          ※
          初回は棚卸し在庫を加味して6週間分、以降は4週間分で算出
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <>
          {/* Section 1: Auto-calculated */}
          {autoOrders.length > 0 && (
            <AutoSection
              orders={autoOrders}
              adjustments={adjustments}
              executing={executing}
              onAdjustmentChange={handleAdjustmentChange}
              onExecuteOrder={handleExecuteOrder}
            />
          )}

          {/* Section 2: Manual */}
          {manualOrders.length > 0 && (
            <ManualSection
              orders={manualOrders}
              manualQuantities={manualQuantities}
              manualRemarks={manualRemarks}
              onQuantityChange={handleManualQuantityChange}
              onRemarksChange={(itemId, val) =>
                setManualRemarks((prev) => ({ ...prev, [itemId]: val }))
              }
            />
          )}

          {/* Grand totals */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">
                  自動算出 小計
                </span>
                <span className="font-medium">
                  {formatCurrency(autoTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">
                  手入力 小計
                </span>
                <span className="font-medium">
                  {formatCurrency(manualTotal)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-base font-bold text-gray-900">
                  合計
                </span>
                <span className="text-base font-bold text-gray-900">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Section 1: Auto-calculated orders
// ===========================================================================

function AutoSection({
  orders,
  adjustments,
  executing,
  onAdjustmentChange,
  onExecuteOrder,
}: {
  orders: CalculatedOrderItem[];
  adjustments: Record<string, number>;
  executing: string | null;
  onAdjustmentChange: (order: CalculatedOrderItem, value: number) => void;
  onExecuteOrder: (supplier: Supplier, items: CalculatedOrderItem[], autoConfirm: boolean) => void;
}) {
  const grouped = groupBySupplier(orders);

  return (
    <div className="space-y-4">
      <div className="rounded-t-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">
        ■ 自動算出（来客数に基づく推奨発注量）
      </div>

      {Array.from(grouped.entries()).map(([supplierId, group]) => {
        const subtotal = group.items.reduce((sum, o) => {
          const price = o.item.unit_price ?? 0;
          return sum + o.final_quantity * price;
        }, 0);

        return (
          <div
            key={supplierId}
            className="rounded-lg border bg-white shadow-sm"
          >
            {/* Supplier header */}
            <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
              {group.supplier.name}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-3 py-2" style={{ width: '22%' }}>
                      品目名
                    </th>
                    <th className="px-3 py-2" style={{ width: '10%' }}>
                      規格
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                      現在庫
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                      必要数量
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                      発注数量
                    </th>
                    <th className="px-3 py-2 text-center" style={{ width: '8%' }}>
                      調整
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                      最終数量
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '7%' }}>
                      単価
                    </th>
                    <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                      金額
                    </th>
                    <th className="px-3 py-2 text-center" style={{ width: '5%' }}>
                      商品URL
                    </th>
                    <th className="px-3 py-2 text-center" style={{ width: '8%' }}>
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((order) => {
                    const adj =
                      adjustments[order.item_id] ?? order.adjustment ?? 0;
                    const lineAmount =
                      order.final_quantity * (order.item.unit_price ?? 0);

                    return (
                      <tr
                        key={order.item_id}
                        className="border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {order.item.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {order.item.spec ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {order.inventory_quantity ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {order.calculated_quantity}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {order.calculated_quantity}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            value={adj}
                            onChange={(e) =>
                              onAdjustmentChange(
                                order,
                                Number(e.target.value) || 0,
                              )
                            }
                            className="w-16 rounded border border-gray-300 px-1 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">
                          {order.final_quantity}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(order.item.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {formatCurrency(lineAmount)}
                        </td>
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
                        <td className="px-3 py-2 text-center">
                          {statusBadge(order.order_status)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal row */}
                  <tr className="border-t bg-gray-50 font-medium">
                    <td
                      colSpan={8}
                      className="px-3 py-2 text-right text-gray-700"
                    >
                      {group.supplier.name} 小計
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {formatCurrency(subtotal)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Execute buttons */}
            {group.supplier.auto_order_supported && (
              <div className="flex gap-3 border-t px-4 py-3">
                <button
                  onClick={() => onExecuteOrder(group.supplier, group.items, false)}
                  disabled={executing === supplierId}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {executing === supplierId ? (
                    '実行中...'
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4" />
                      カートに投入のみ
                    </>
                  )}
                </button>
                <button
                  onClick={() => onExecuteOrder(group.supplier, group.items, true)}
                  disabled={executing === supplierId}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {executing === supplierId ? (
                    '実行中...'
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      注文確定まで実行
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Section 2: Manual input orders
// ===========================================================================

function ManualSection({
  orders,
  manualQuantities,
  manualRemarks,
  onQuantityChange,
  onRemarksChange,
}: {
  orders: CalculatedOrderItem[];
  manualQuantities: Record<string, number>;
  manualRemarks: Record<string, string>;
  onQuantityChange: (order: CalculatedOrderItem, value: number) => void;
  onRemarksChange: (itemId: string, value: string) => void;
}) {
  const grouped = groupBySupplier(orders);

  return (
    <div className="space-y-4">
      <div className="rounded-t-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">
        ■ 手入力（データ不足のため自動算出できない品目）
      </div>

      {Array.from(grouped.entries()).map(([supplierId, group]) => (
        <div key={supplierId} className="rounded-lg border bg-white shadow-sm">
          {/* Supplier header */}
          <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
            {group.supplier.name}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-3 py-2" style={{ width: '25%' }}>
                    品目名
                  </th>
                  <th className="px-3 py-2" style={{ width: '12%' }}>
                    規格
                  </th>
                  <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                    現在庫
                  </th>
                  <th className="px-3 py-2 text-center" style={{ width: '10%' }}>
                    発注数量
                  </th>
                  <th className="px-3 py-2" style={{ width: '6%' }}>
                    発注単位
                  </th>
                  <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                    単価
                  </th>
                  <th className="px-3 py-2 text-right" style={{ width: '10%' }}>
                    金額
                  </th>
                  <th className="px-3 py-2 text-center" style={{ width: '5%' }}>
                    商品URL
                  </th>
                  <th className="px-3 py-2" style={{ width: '16%' }}>
                    備考
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((order) => {
                  const qty =
                    manualQuantities[order.item_id] ?? order.final_quantity;
                  const lineAmount = qty * (order.item.unit_price ?? 0);

                  return (
                    <tr
                      key={order.item_id}
                      className="border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {order.item.name}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {order.item.spec ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {order.inventory_quantity ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          value={qty}
                          onChange={(e) =>
                            onQuantityChange(
                              order,
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-20 rounded border border-gray-300 bg-yellow-50 px-2 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {order.item.order_unit ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {formatCurrency(order.item.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {formatCurrency(lineAmount)}
                      </td>
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
                          onChange={(e) =>
                            onRemarksChange(order.item_id, e.target.value)
                          }
                          className="w-full rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="備考"
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
