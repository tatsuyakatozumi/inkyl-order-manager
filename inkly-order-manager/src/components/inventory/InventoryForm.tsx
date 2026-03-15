'use client';

import { useState, useCallback } from 'react';
import type { Item, Supplier } from '@/types/database';
import { saveInventorySnapshot, getLatestSnapshots } from '@/app/admin/inventory/actions';

type ItemWithSupplier = Item & { supplier: Supplier };

interface InventoryFormProps {
  items: ItemWithSupplier[];
  suppliers: Supplier[];
  categories: string[];
}

interface RowData {
  quantity: string;
  notes: string;
}

export default function InventoryForm({ items, suppliers, categories }: InventoryFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [snapshotDate, setSnapshotDate] = useState(today);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [rowData, setRowData] = useState<Record<string, RowData>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filteredItems = items.filter((item) => {
    if (selectedSupplier && item.supplier_id !== selectedSupplier) return false;
    if (selectedCategory && item.category_large !== selectedCategory) return false;
    return true;
  });

  const updateRow = useCallback((itemId: string, field: keyof RowData, value: string) => {
    setRowData((prev) => ({
      ...prev,
      [itemId]: {
        quantity: prev[itemId]?.quantity ?? '',
        notes: prev[itemId]?.notes ?? '',
        [field]: value,
      },
    }));
  }, []);

  const handleSave = async () => {
    setMessage(null);
    const entries = Object.entries(rowData)
      .filter(([, v]) => v.quantity !== '')
      .map(([itemId, v]) => ({
        itemId,
        quantity: Number(v.quantity),
        notes: v.notes || null,
      }));

    if (entries.length === 0) {
      setMessage({ type: 'error', text: '在庫数量が入力されている行がありません' });
      return;
    }

    setSaving(true);
    try {
      const result = await saveInventorySnapshot(entries, snapshotDate);
      if (result.success) {
        setMessage({ type: 'success', text: `${entries.length}件の棚卸しデータを保存しました` });
      } else {
        setMessage({ type: 'error', text: result.error ?? '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存中にエラーが発生しました' });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPrevious = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const result = await getLatestSnapshots();
      if (result.success && result.data) {
        const newRowData: Record<string, RowData> = {};
        for (const [itemId, snap] of Object.entries(result.data)) {
          newRowData[itemId] = {
            quantity: String(snap.quantity),
            notes: snap.notes ?? '',
          };
        }
        setRowData(newRowData);
        const dates = Object.values(result.data).map((s) => s.snapshot_date);
        const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : null;
        setMessage({
          type: 'success',
          text: latestDate
            ? `前回の棚卸しデータ（${latestDate}）を読み込みました`
            : '前回の棚卸しデータはありません',
        });
      } else {
        setMessage({ type: 'error', text: result.error ?? '読み込みに失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '読み込み中にエラーが発生しました' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">棚卸し入力</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleLoadPrevious}
            disabled={loading}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? '読み込み中...' : '前回の棚卸しデータを読み込む'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="supplier-filter" className="text-sm font-medium text-gray-700">
            サプライヤー
          </label>
          <select
            id="supplier-filter"
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">すべて</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">
            大分類
          </label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2 font-medium" style={{ width: '30%' }}>品目名</th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>規格</th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>サプライヤー</th>
              <th className="px-3 py-2 font-medium" style={{ width: '8%' }}>発注単位</th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>在庫数量</th>
              <th className="px-3 py-2 font-medium" style={{ width: '17%' }}>備考</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.map((item, index) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2 text-gray-600">{item.spec ?? '-'}</td>
                <td className="px-3 py-2 text-gray-600">{item.supplier.name}</td>
                <td className="px-3 py-2 text-gray-600">{item.order_unit ?? '-'}</td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={rowData[item.id]?.quantity ?? ''}
                    onChange={(e) => updateRow(item.id, 'quantity', e.target.value)}
                    tabIndex={index + 1}
                    className="w-full rounded border border-gray-300 bg-green-50 px-2 py-1.5 text-right focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="0"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={rowData[item.id]?.notes ?? ''}
                    onChange={(e) => updateRow(item.id, 'notes', e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder=""
                  />
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                  該当する品目がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer link */}
      <div>
        <a
          href="/admin/items"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          シートにない品目を追加
        </a>
      </div>
    </div>
  );
}
