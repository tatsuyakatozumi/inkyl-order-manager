'use client';

import { useState, useCallback } from 'react';
import { saveInventorySnapshot, getLatestSnapshots } from '@/app/admin/inventory/actions';

type InventoryItem = {
  id: string;
  name: string;
  spec: string | null;
  supplier_id: string;
  category_large: string;
  order_unit: string | null;
  supplier: {
    id: string;
    name: string;
  };
};

type SupplierOption = {
  id: string;
  name: string;
};

interface InventoryFormProps {
  items: InventoryItem[];
  suppliers: SupplierOption[];
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
      setMessage({ type: 'error', text: 'Please enter quantity for at least one item.' });
      return;
    }

    setSaving(true);
    try {
      const result = await saveInventorySnapshot(entries, snapshotDate);
      if (result.success) {
        setMessage({ type: 'success', text: `Saved ${entries.length} inventory rows.` });
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Failed to save snapshot.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Unexpected error while saving snapshot.' });
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
            ? `Loaded previous snapshot (${latestDate}).`
            : 'No previous snapshot data found.',
        });
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Failed to load previous snapshots.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Unexpected error while loading snapshots.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <h1 className="text-xl font-bold md:text-2xl">Inventory</h1>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <input
            type="date"
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleLoadPrevious}
            disabled={loading}
            className="min-h-[44px] rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Previous'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
          <label htmlFor="supplier-filter" className="text-sm font-medium text-gray-700">
            Supplier
          </label>
          <select
            id="supplier-filter"
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
          <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2 font-medium" style={{ width: '30%' }}>
                Item
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>
                Spec
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>
                Supplier
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: '8%' }}>
                Unit
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: '15%' }}>
                Quantity
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: '17%' }}>
                Notes
              </th>
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
                    className="min-h-[44px] w-full rounded border border-gray-300 bg-green-50 px-2 py-1.5 text-right focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="0"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={rowData[item.id]?.notes ?? ''}
                    onChange={(e) => updateRow(item.id, 'notes', e.target.value)}
                    className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder=""
                  />
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                  No items found for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <a href="/admin/items" className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
          View item master
        </a>
      </div>
    </div>
  );
}
