'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Image,
  Plus,
  Save,
  ShoppingCart,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { ItemSelectModal, type SelectableItem } from './ItemSelectModal';
import { showToast } from '@/components/ui/Toast';

interface OrderLineItem {
  item: SelectableItem;
  quantity: number | '';
}

interface AutoOrderResultItem {
  itemId: string;
  supplierName: string;
  status: 'ordered' | 'cart_added' | 'failed' | 'manual_required';
  errorMessage: string | null;
  checkoutSuccess?: boolean;
  screenshotUrl?: string | null;
  screenshotExpiresAt?: string | null;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `¥${value.toLocaleString()}`;
}

function groupBySupplier(lines: OrderLineItem[]) {
  const map = new Map<
    string,
    { supplier: SelectableItem['supplier']; lines: OrderLineItem[] }
  >();
  for (const line of lines) {
    const sid = line.item.supplier_id;
    if (!map.has(sid)) {
      map.set(sid, { supplier: line.item.supplier, lines: [] });
    }
    map.get(sid)!.lines.push(line);
  }
  return map;
}

function groupResultsBySupplier(results: AutoOrderResultItem[]) {
  const map = new Map<string, AutoOrderResultItem[]>();
  for (const r of results) {
    if (!map.has(r.supplierName)) map.set(r.supplierName, []);
    map.get(r.supplierName)!.push(r);
  }
  return map;
}

export function AdhocOrderForm() {
  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [autoResults, setAutoResults] = useState<AutoOrderResultItem[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [lastAutoConfirm, setLastAutoConfirm] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [orderHistoryIds, setOrderHistoryIds] = useState<string[]>([]);

  const handleItemSelect = useCallback(
    (item: SelectableItem) => {
      if (lines.some((l) => l.item.id === item.id)) {
        showToast('Item already added.', 'warning');
        return;
      }
      setLines((prev) => [...prev, { item, quantity: '' }]);
    },
    [lines],
  );

  const handleRemoveLine = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  }, []);

  const handleQuantityChange = useCallback((itemId: string, value: string) => {
    const num = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    setLines((prev) =>
      prev.map((l) => (l.item.id === itemId ? { ...l, quantity: num } : l)),
    );
  }, []);

  const validate = (): boolean => {
    if (lines.length === 0) {
      showToast('Please add at least one item.', 'warning');
      return false;
    }
    const emptyQty = lines.some((l) => l.quantity === '' || l.quantity <= 0);
    if (emptyQty) {
      showToast('Please enter quantity for all items.', 'warning');
      return false;
    }
    return true;
  };

  const executeSubmit = useCallback(
    async (executeAutoOrder: boolean, autoConfirm: boolean) => {
      setConfirmDialogOpen(false);
      setLastAutoConfirm(autoConfirm);
      setSubmitting(true);
      try {
        const res = await fetch('/api/orders/adhoc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: lines.map((l) => ({
              itemId: l.item.id,
              quantity: l.quantity as number,
              unitPrice: l.item.unit_price ?? 0,
            })),
            executeAutoOrder,
            autoConfirm,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        setOrderHistoryIds(data.orderIds ?? []);

        if (executeAutoOrder && data.autoOrderResults) {
          setAutoResults(data.autoOrderResults);
          const failed = data.autoOrderResults.filter(
            (r: AutoOrderResultItem) =>
              r.status === 'failed' || r.status === 'manual_required',
          );
          if (failed.length === 0) {
            showToast(autoConfirm ? 'Order confirmed.' : 'Items added to cart.', 'success');
          } else if (failed.length < data.autoOrderResults.length) {
            showToast('Some items failed to process.', 'warning');
          } else {
            showToast('Auto-order failed.', 'error');
          }
        } else {
          showToast('Saved successfully.', 'success');
        }

        setOrderComplete(true);
        setLines([]);
      } catch (e: any) {
        showToast(e.message ?? 'Unexpected error occurred.', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [lines],
  );

  const handleAutoOrderClick = useCallback(
    (autoConfirm: boolean) => {
      if (!validate()) return;

      if (autoConfirm) {
        setConfirmDialogOpen(true);
        return;
      }

      const grouped = groupBySupplier(lines);
      const autoSuppliers = Array.from(grouped.values())
        .filter((g) => g.supplier.auto_order_supported)
        .map((g) => g.supplier.name);

      if (autoSuppliers.length > 0) {
        const ok = confirm(
          `Add items to cart for the following suppliers?\n\n${autoSuppliers.join(', ')}`,
        );
        if (!ok) return;
      }

      executeSubmit(true, false);
    },
    [lines, executeSubmit],
  );

  const handleConfirmOrder = useCallback(
    async (supplierName: string) => {
      if (!confirm(`Confirm order for ${supplierName}?`)) return;

      setConfirming(supplierName);
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch('/api/orders/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierName,
            orderHistoryIds,
            idempotencyKey,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();

        setAutoResults((prev) =>
          prev.map((r) => {
            if (r.supplierName !== supplierName) return r;
            return {
              ...r,
              status: data.status === 'ordered' ? 'ordered' : r.status,
              screenshotUrl: data.screenshotUrl ?? r.screenshotUrl,
              screenshotExpiresAt: data.screenshotExpiresAt ?? r.screenshotExpiresAt,
            };
          }),
        );

        if (data.success) {
          showToast(`${supplierName}: order confirmed`, 'success');
        } else {
          showToast(`${supplierName}: checkout failed`, 'error');
        }
      } catch (e: any) {
        showToast(e.message ?? 'Unexpected error occurred.', 'error');
      } finally {
        setConfirming(null);
      }
    },
    [orderHistoryIds],
  );

  const grouped = groupBySupplier(lines);
  const grandTotal = lines.reduce((sum, l) => {
    const qty = typeof l.quantity === 'number' ? l.quantity : 0;
    return sum + qty * (l.item.unit_price ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      {orderComplete && (
        <div className="space-y-3">
          {autoResults.length > 0 && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Auto-order Result</h3>

              {lastAutoConfirm ? (
                autoResults.some((r) => r.status === 'ordered') ? (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>Order has been confirmed.</span>
                  </div>
                ) : (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>Checkout failed. Items may still be in cart.</span>
                  </div>
                )
              ) : (
                autoResults.some((r) => r.status === 'cart_added') && (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>Items were added to cart. Review screenshot and confirm.</span>
                  </div>
                )
              )}

              {Array.from(groupResultsBySupplier(autoResults).entries()).map(
                ([supplierName, results]) => {
                  const screenshotUrl = results[0]?.screenshotUrl;
                  const hasCartItems = results.some((r) => r.status === 'cart_added');

                  return (
                    <div key={supplierName} className="mb-4 rounded border bg-gray-50 p-3">
                      <div className="mb-2 font-medium text-gray-900">{supplierName}</div>

                      <div className="space-y-1">
                        {results.map((r) => (
                          <div key={r.itemId} className="flex items-center gap-2 text-sm">
                            {r.status === 'ordered' ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : r.status === 'cart_added' ? (
                              <CheckCircle className="h-4 w-4 text-blue-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            )}
                            <span className="text-gray-600">
                              {r.status === 'ordered'
                                ? 'Order confirmed'
                                : r.status === 'cart_added'
                                  ? 'Added to cart'
                                  : r.status === 'manual_required'
                                    ? 'Manual order required'
                                    : `Failed: ${r.errorMessage ?? ''}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {screenshotUrl && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                            <Image className="h-3 w-3" />
                            Cart screenshot
                          </div>
                          <img
                            src={screenshotUrl}
                            alt={`${supplierName} cart screenshot`}
                            className="max-h-64 rounded border object-contain"
                          />
                        </div>
                      )}

                      {!lastAutoConfirm && hasCartItems && (
                        <div className="mt-3">
                          <button
                            onClick={() => handleConfirmOrder(supplierName)}
                            disabled={confirming === supplierName}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                          >
                            <Zap className="h-4 w-4" />
                            {confirming === supplierName ? 'Confirming...' : 'Confirm Order'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <Link
              href="/admin/orders/history"
              className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              View order history
            </Link>
            <button
              onClick={() => {
                setOrderComplete(false);
                setAutoResults([]);
                setLastAutoConfirm(false);
                setOrderHistoryIds([]);
              }}
              className="min-h-[44px] text-left text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              Create another order
            </button>
          </div>
        </div>
      )}

      {!orderComplete && (
        <>
          <div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          {lines.length > 0 && (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([supplierId, group]) => {
                const subtotal = group.lines.reduce((sum, l) => {
                  const qty = typeof l.quantity === 'number' ? l.quantity : 0;
                  return sum + qty * (l.item.unit_price ?? 0);
                }, 0);

                return (
                  <div key={supplierId} className="rounded-lg border bg-white shadow-sm">
                    <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
                      {group.supplier.name}
                      {group.supplier.auto_order_supported && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Auto order supported
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                            <th className="px-3 py-2" style={{ width: '15%' }}>Supplier</th>
                            <th className="px-3 py-2" style={{ width: '25%' }}>Item</th>
                            <th className="px-3 py-2" style={{ width: '12%' }}>Spec</th>
                            <th className="px-3 py-2 text-center" style={{ width: '10%' }}>Qty</th>
                            <th className="px-3 py-2" style={{ width: '8%' }}>Unit</th>
                            <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Price</th>
                            <th className="px-3 py-2 text-right" style={{ width: '10%' }}>Amount</th>
                            <th className="px-3 py-2 text-center" style={{ width: '5%' }}>Remove</th>
                            <th className="px-3 py-2 text-center" style={{ width: '7%' }}>URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => {
                            const qty = typeof line.quantity === 'number' ? line.quantity : 0;
                            const lineAmount = qty * (line.item.unit_price ?? 0);
                            return (
                              <tr key={line.item.id} className="border-b last:border-b-0 hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-600">{line.item.supplier.name}</td>
                                <td className="px-3 py-2 font-medium text-gray-900">{line.item.name}</td>
                                <td className="px-3 py-2 text-gray-600">{line.item.spec ?? '-'}</td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) => handleQuantityChange(line.item.id, e.target.value)}
                                    className="min-h-[44px] w-20 rounded border border-gray-300 bg-yellow-50 px-2 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    min={1}
                                    placeholder="Qty"
                                  />
                                </td>
                                <td className="px-3 py-2 text-gray-600">{line.item.order_unit ?? '-'}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(line.item.unit_price)}</td>
                                <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(lineAmount)}</td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => handleRemoveLine(line.item.id)}
                                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {line.item.product_url ? (
                                    <a href={line.item.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex text-blue-600 hover:text-blue-800">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-t bg-gray-50 font-medium">
                            <td colSpan={6} className="px-3 py-2 text-right text-gray-700">
                              {group.supplier.name} subtotal
                            </td>
                            <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(subtotal)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                <button
                  onClick={() => executeSubmit(false, false)}
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-gray-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 md:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? 'Saving...' : 'Save only'}
                </button>
                <button
                  onClick={() => handleAutoOrderClick(false)}
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 md:w-auto"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {submitting ? 'Running...' : 'Add to cart only'}
                </button>
                <button
                  onClick={() => handleAutoOrderClick(true)}
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 md:w-auto"
                >
                  <Zap className="h-4 w-4" />
                  {submitting ? 'Running...' : 'Confirm order'}
                </button>
              </div>
            </div>
          )}

          {lines.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
              <p className="text-sm text-gray-500">Add items from the button above to start an adhoc order.</p>
            </div>
          )}
        </>
      )}

      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center">
          <div className="h-full w-full overflow-y-auto bg-white p-6 shadow-xl md:mx-4 md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-lg">
            <div className="mb-4 flex items-center gap-2 text-lg font-bold text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Confirm final order?
            </div>
            <p className="mb-4 text-sm text-gray-700">
              This will proceed checkout on supplier websites automatically.
            </p>

            <div className="mb-4 space-y-2">
              {Array.from(grouped.entries()).map(([supplierId, group]) => {
                const subtotal = group.lines.reduce((sum, l) => {
                  const qty = typeof l.quantity === 'number' ? l.quantity : 0;
                  return sum + qty * (l.item.unit_price ?? 0);
                }, 0);
                return (
                  <div key={supplierId} className="rounded border bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between font-medium text-gray-900">
                      <span>{group.supplier.name}</span>
                      <span>{group.lines.length} items</span>
                    </div>
                    <div className="mt-1 text-right text-gray-600">Subtotal: {formatCurrency(subtotal)}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded border bg-yellow-50 p-3 text-sm font-bold text-gray-900">
              Grand Total: {formatCurrency(grandTotal)}
            </div>

            <div className="mt-6 flex flex-col gap-2 md:flex-row md:justify-end">
              <button
                onClick={() => setConfirmDialogOpen(false)}
                className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSubmit(true, true)}
                className="min-h-[44px] rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

      <ItemSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleItemSelect}
        excludeItemIds={lines.map((l) => l.item.id)}
      />
    </div>
  );
}
