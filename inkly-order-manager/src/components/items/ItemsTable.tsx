'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Ban, Edit, ExternalLink, Plus, Search } from 'lucide-react';
import type { Item } from '@/types/database';
import { toggleItemActive, updateItemAutoOrder } from '@/app/admin/items/actions';
import ItemEditModal from './ItemEditModal';

type SupplierOption = {
  id: string;
  name: string;
  is_active: boolean;
};

type ItemWithSupplier = Item & {
  supplier: { id: string; name: string } | null;
};

interface ItemsTableProps {
  items: ItemWithSupplier[];
  suppliers: SupplierOption[];
  categoryLargeOptions: string[];
  categoryMediumOptions: string[];
  page: number;
  totalCount: number;
  pageSize: number;
}

export default function ItemsTable({
  items,
  suppliers,
  categoryLargeOptions,
  categoryMediumOptions,
  page,
  totalCount,
  pageSize,
}: ItemsTableProps) {
  const [consumableFilter, setConsumableFilter] =
    useState<'all' | 'consumable' | 'non_consumable'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryMediumFilter, setCategoryMediumFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [editItem, setEditItem] = useState<Item | null | 'new'>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let result = items;

    if (consumableFilter !== 'all') {
      result = result.filter((i) => i.consumable_type === consumableFilter);
    }
    if (categoryFilter) {
      result = result.filter((i) => i.category_large === categoryFilter);
    }
    if (categoryMediumFilter) {
      result = result.filter((i) => i.category_medium === categoryMediumFilter);
    }
    if (supplierFilter) {
      result = result.filter((i) => i.supplier_id === supplierFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }

    return result;
  }, [items, consumableFilter, categoryFilter, categoryMediumFilter, supplierFilter, searchText]);

  const hasPrevPage = page > 1;
  const hasNextPage = page * pageSize < totalCount;

  function handleAutoOrderToggle(itemId: string, current: boolean) {
    startTransition(async () => {
      await updateItemAutoOrder(itemId, !current);
    });
  }

  function handleToggleActive(itemId: string, current: boolean) {
    startTransition(async () => {
      await toggleItemActive(itemId, !current);
    });
  }

  function formatYen(v: number | null) {
    if (v === null || v === undefined) return '-';
    return `¥${v.toLocaleString()}`;
  }

  function formatDecimal4(v: number | null) {
    if (v === null || v === undefined) return '-';
    return v.toFixed(4);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold md:text-2xl">Items</h1>
        <button
          onClick={() => setEditItem('new')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <select
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
            value={consumableFilter}
            onChange={(e) => setConsumableFilter(e.target.value as 'all' | 'consumable' | 'non_consumable')}
          >
            <option value="all">All Types</option>
            <option value="consumable">Consumable</option>
            <option value="non_consumable">Non-consumable</option>
          </select>

          <select
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categoryLargeOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
            value={categoryMediumFilter}
            onChange={(e) => setCategoryMediumFilter(e.target.value)}
          >
            <option value="">All Medium Categories</option>
            {categoryMediumOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="min-h-[44px] w-full rounded border border-gray-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Search item name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Showing {filtered.length} items on this page (total {totalCount.toLocaleString()})
      </p>

      <div className="space-y-3 md:hidden">
        {filtered.length === 0 && (
          <div className="rounded border bg-white p-6 text-center text-sm text-gray-500">No items found</div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-3">
              <button
                className="text-left text-base font-semibold text-blue-700"
                onClick={() => setEditItem(item)}
              >
                {item.name}
              </button>
              {item.product_url && (
                <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="text-gray-500">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div>Spec: {item.spec ?? '-'}</div>
              <div>Supplier: {item.supplier?.name ?? '-'}</div>
              <div>Unit Price: {formatYen(item.unit_price)}</div>
              <div>Per Visit: {formatDecimal4(item.consumption_per_visit)}</div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleAutoOrderToggle(item.id, item.auto_order_enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                  item.auto_order_enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    item.auto_order_enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <button
                onClick={() => handleToggleActive(item.id, item.is_active)}
                disabled={isPending}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-gray-200 text-gray-600"
                title={item.is_active ? 'Deactivate' : 'Activate'}
              >
                <Ban className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditItem(item)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-gray-200 text-gray-600"
                title="Edit"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Spec</th>
              <th className="px-4 py-3">Category (Large)</th>
              <th className="px-4 py-3">Category (Medium)</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Per Visit</th>
              <th className="px-4 py-3 text-center">Visitor Linked</th>
              <th className="px-4 py-3 text-center">Auto Order</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No items found
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr key={item.id} className={`hover:bg-gray-50 ${!item.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <button className="text-left font-medium text-blue-600 hover:underline" onClick={() => setEditItem(item)}>
                    {item.name}
                  </button>
                  {item.product_url && (
                    <a
                      href={item.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-block text-gray-400 hover:text-blue-500"
                    >
                      <ExternalLink className="inline h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{item.spec ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{item.category_large}</td>
                <td className="px-4 py-3 text-gray-600">{item.category_medium}</td>
                <td className="px-4 py-3 text-gray-600">{item.supplier?.name ?? '-'}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatYen(item.unit_price)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatDecimal4(item.consumption_per_visit)}</td>
                <td className="px-4 py-3 text-center">{item.is_visitor_linked ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAutoOrderToggle(item.id, item.auto_order_enabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                      item.auto_order_enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        item.auto_order_enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setEditItem(item)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                      disabled={isPending}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                      title={item.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-white p-3">
        <Link
          href={`/admin/items?page=${Math.max(1, page - 1)}`}
          prefetch={false}
          className={`rounded border px-3 py-2 text-sm ${
            hasPrevPage ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-200 text-gray-300'
          }`}
        >
          Previous
        </Link>
        <span className="text-sm text-gray-600">
          Page {page} / {Math.max(1, Math.ceil(totalCount / pageSize))}
        </span>
        <Link
          href={`/admin/items?page=${page + 1}`}
          prefetch={false}
          className={`rounded border px-3 py-2 text-sm ${
            hasNextPage ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-200 text-gray-300'
          }`}
        >
          Next
        </Link>
      </div>

      {editItem !== null && (
        <ItemEditModal
          item={editItem === 'new' ? null : editItem}
          suppliers={suppliers}
          categoryLargeOptions={categoryLargeOptions}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}
