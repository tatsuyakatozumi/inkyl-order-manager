'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  X,
  ExternalLink,
  Save,
  ShoppingCart,
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { ItemSelectModal } from './ItemSelectModal';
import { showToast } from '@/components/ui/Toast';
import type { Item, Supplier } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemWithSupplier extends Item {
  supplier: Supplier;
}

interface OrderLineItem {
  item: ItemWithSupplier;
  quantity: number | '';
}

interface AutoOrderResultItem {
  itemId: string;
  supplierName: string;
  status: 'ordered' | 'cart_added' | 'failed' | 'manual_required';
  errorMessage: string | null;
  checkoutSuccess?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `¥${value.toLocaleString()}`;
}

function groupBySupplier(
  lines: OrderLineItem[],
): Map<string, { supplier: Supplier; lines: OrderLineItem[] }> {
  const map = new Map<
    string,
    { supplier: Supplier; lines: OrderLineItem[] }
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdhocOrderForm() {
  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [autoResults, setAutoResults] = useState<AutoOrderResultItem[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [lastAutoConfirm, setLastAutoConfirm] = useState(false);

  // ---- Item selection -------------------------------------------------------

  const handleItemSelect = useCallback(
    (item: ItemWithSupplier) => {
      if (lines.some((l) => l.item.id === item.id)) {
        showToast('既に追加されています', 'warning');
        return;
      }
      setLines((prev) => [...prev, { item, quantity: '' }]);
    },
    [lines],
  );

  const handleRemoveLine = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  }, []);

  const handleQuantityChange = useCallback(
    (itemId: string, value: string) => {
      const num = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
      setLines((prev) =>
        prev.map((l) => (l.item.id === itemId ? { ...l, quantity: num } : l)),
      );
    },
    [],
  );

  // ---- Validation -----------------------------------------------------------

  const validate = (): boolean => {
    if (lines.length === 0) {
      showToast('品目を追加してください', 'warning');
      return false;
    }
    const emptyQty = lines.some(
      (l) => l.quantity === '' || l.quantity <= 0,
    );
    if (emptyQty) {
      showToast('すべての品目に数量を入力してください', 'warning');
      return false;
    }
    return true;
  };

  // ---- Submit ---------------------------------------------------------------

  const handleAutoOrderClick = useCallback(
    (autoConfirm: boolean) => {
      if (!validate()) return;

      if (autoConfirm) {
        // Show confirmation dialog for "注文確定まで実行"
        setConfirmDialogOpen(true);
        return;
      }

      // For cart-only, simple confirm
      const grouped = groupBySupplier(lines);
      const supplierList = Array.from(grouped.values());
      const autoSuppliers = supplierList
        .filter((g) => g.supplier.auto_order_supported)
        .map((g) => g.supplier.name);

      if (autoSuppliers.length > 0) {
        if (!confirm(`以下のサプライヤーのカートに投入します。よろしいですか？\n\n${autoSuppliers.join(', ')}`)) return;
      }

      executeSubmit(true, false);
    },
    [lines],
  );

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

        if (executeAutoOrder && data.autoOrderResults) {
          setAutoResults(data.autoOrderResults);
          const failed = data.autoOrderResults.filter(
            (r: AutoOrderResultItem) =>
              r.status === 'failed' || r.status === 'manual_required',
          );
          if (failed.length === 0) {
            showToast(autoConfirm ? '注文が確定しました' : 'カートに投入しました', 'success');
          } else if (failed.length < data.autoOrderResults.length) {
            showToast('一部の品目で処理に失敗しました', 'warning');
          } else {
            showToast('処理に失敗しました', 'error');
          }
        } else {
          showToast('記録を保存しました', 'success');
        }

        setOrderComplete(true);
        setLines([]);
      } catch (e: any) {
        showToast(e.message ?? 'エラーが発生しました', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [lines],
  );

  // ---- Computed values ------------------------------------------------------

  const grouped = groupBySupplier(lines);
  const grandTotal = lines.reduce((sum, l) => {
    const qty = typeof l.quantity === 'number' ? l.quantity : 0;
    return sum + qty * (l.item.unit_price ?? 0);
  }, 0);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Order complete banner */}
      {orderComplete && (
        <div className="space-y-3">
          {autoResults.length > 0 && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">
                発注結果
              </h3>

              {/* Summary message */}
              {lastAutoConfirm ? (
                autoResults.some((r) => r.status === 'ordered') ? (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>注文が確定しました。</span>
                  </div>
                ) : (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>注文確定に失敗しました。カートには投入済みです。手動で確認してください。</span>
                  </div>
                )
              ) : (
                autoResults.some((r) => r.status === 'cart_added') && (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>カートに投入しました。ブラウザでカート内容を確認し、注文を確定してください。</span>
                  </div>
                )
              )}

              <div className="space-y-1">
                {autoResults.map((r) => (
                  <div
                    key={r.itemId}
                    className="flex items-center gap-2 text-sm"
                  >
                    {r.status === 'ordered' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : r.status === 'cart_added' ? (
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span className="text-gray-700">{r.supplierName}</span>
                    <span className="text-gray-500">
                      {r.status === 'ordered'
                        ? '注文確定済'
                        : r.status === 'cart_added'
                          ? 'カート投入済'
                          : r.status === 'manual_required'
                            ? '手動発注が必要です'
                            : `失敗: ${r.errorMessage ?? ''}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <Link
              href="/admin/orders/history"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              発注履歴を見る →
            </Link>
            <button
              onClick={() => {
                setOrderComplete(false);
                setAutoResults([]);
                setLastAutoConfirm(false);
              }}
              className="text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              新規発注を作成
            </button>
          </div>
        </div>
      )}

      {!orderComplete && (
        <>
          {/* Add item button */}
          <div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              品目を追加
            </button>
          </div>

          {/* Order list */}
          {lines.length > 0 && (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([supplierId, group]) => {
                const subtotal = group.lines.reduce((sum, l) => {
                  const qty =
                    typeof l.quantity === 'number' ? l.quantity : 0;
                  return sum + qty * (l.item.unit_price ?? 0);
                }, 0);

                return (
                  <div
                    key={supplierId}
                    className="rounded-lg border bg-white shadow-sm"
                  >
                    <div className="border-b bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
                      {group.supplier.name}
                      {group.supplier.auto_order_supported && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          自動発注対応
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                            <th className="px-3 py-2" style={{ width: '15%' }}>
                              サプライヤー
                            </th>
                            <th className="px-3 py-2" style={{ width: '25%' }}>
                              品目名
                            </th>
                            <th className="px-3 py-2" style={{ width: '12%' }}>
                              規格
                            </th>
                            <th
                              className="px-3 py-2 text-center"
                              style={{ width: '10%' }}
                            >
                              数量
                            </th>
                            <th className="px-3 py-2" style={{ width: '8%' }}>
                              発注単位
                            </th>
                            <th
                              className="px-3 py-2 text-right"
                              style={{ width: '8%' }}
                            >
                              単価
                            </th>
                            <th
                              className="px-3 py-2 text-right"
                              style={{ width: '10%' }}
                            >
                              金額
                            </th>
                            <th
                              className="px-3 py-2 text-center"
                              style={{ width: '5%' }}
                            >
                              削除
                            </th>
                            <th
                              className="px-3 py-2 text-center"
                              style={{ width: '7%' }}
                            >
                              商品URL
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => {
                            const qty =
                              typeof line.quantity === 'number'
                                ? line.quantity
                                : 0;
                            const lineAmount =
                              qty * (line.item.unit_price ?? 0);

                            return (
                              <tr
                                key={line.item.id}
                                className="border-b last:border-b-0 hover:bg-gray-50"
                              >
                                <td className="px-3 py-2 text-gray-600">
                                  {line.item.supplier.name}
                                </td>
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {line.item.name}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {line.item.spec ?? '-'}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      handleQuantityChange(
                                        line.item.id,
                                        e.target.value,
                                      )
                                    }
                                    className="w-20 rounded border border-gray-300 bg-yellow-50 px-2 py-0.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    min={1}
                                    placeholder="数量"
                                  />
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {line.item.order_unit ?? '-'}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {formatCurrency(line.item.unit_price)}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900">
                                  {formatCurrency(lineAmount)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() =>
                                      handleRemoveLine(line.item.id)
                                    }
                                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {line.item.product_url ? (
                                    <a
                                      href={line.item.product_url}
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
                              </tr>
                            );
                          })}

                          {/* Subtotal row */}
                          <tr className="border-t bg-gray-50 font-medium">
                            <td
                              colSpan={6}
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
                  </div>
                );
              })}

              {/* Grand total */}
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>合計</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => executeSubmit(false, false)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-gray-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? '保存中...' : '記録のみ保存'}
                </button>
                <button
                  onClick={() => handleAutoOrderClick(false)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {submitting ? '実行中...' : 'カートに投入のみ'}
                </button>
                <button
                  onClick={() => handleAutoOrderClick(true)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  {submitting ? '実行中...' : '注文確定まで実行'}
                </button>
              </div>
            </div>
          )}

          {lines.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
              <p className="text-sm text-gray-500">
                「品目を追加」ボタンから発注する品目を選択してください
              </p>
            </div>
          )}
        </>
      )}

      {/* Confirm order dialog */}
      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2 text-lg font-bold text-red-700">
              <AlertTriangle className="h-5 w-5" />
              注文が確定されます
            </div>
            <p className="mb-4 text-sm text-gray-700">
              以下の内容で発注してよろしいですか？注文が確定され、取り消しできません。
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
                      <span>{group.lines.length} 品目</span>
                    </div>
                    <div className="mt-1 text-right text-gray-600">
                      合計: {formatCurrency(subtotal)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded border bg-yellow-50 p-3 text-sm font-bold text-gray-900">
              総合計: {formatCurrency(grandTotal)}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialogOpen(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => executeSubmit(true, true)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                注文を確定する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item select modal */}
      <ItemSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleItemSelect}
        excludeItemIds={lines.map((l) => l.item.id)}
      />
    </div>
  );
}
