'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';

export interface SelectableSupplier {
  id: string;
  name: string;
  auto_order_supported: boolean;
}

export interface SelectableItem {
  id: string;
  name: string;
  supplier_id: string;
  spec: string | null;
  unit_price: number | null;
  order_unit: string | null;
  product_url: string | null;
  category_large: string;
  supplier: SelectableSupplier;
}

interface ItemSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: SelectableItem) => void;
  excludeItemIds: string[];
}

export function ItemSelectModal({
  isOpen,
  onClose,
  onSelect,
  excludeItemIds,
}: ItemSelectModalProps) {
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [suppliers, setSuppliers] = useState<SelectableSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (!isOpen || loaded) return;

    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();

      const [itemsRes, suppliersRes] = await Promise.all([
        supabase
          .from('ord_items')
          .select(
            'id,name,supplier_id,spec,unit_price,order_unit,product_url,category_large,supplier:ord_suppliers!supplier_id(id,name,auto_order_supported)',
          )
          .eq('consumable_type', 'consumable')
          .eq('is_active', true)
          .order('name')
          .limit(2000),
        supabase
          .from('ord_suppliers')
          .select('id,name,auto_order_supported')
          .eq('is_active', true)
          .order('name')
          .limit(300),
      ]);

      if (itemsRes.data) {
        const safeItems = (itemsRes.data as any[])
          .map((row) => {
            const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
            if (!supplier) return null;
            return {
              id: row.id,
              name: row.name,
              supplier_id: row.supplier_id,
              spec: row.spec,
              unit_price: row.unit_price,
              order_unit: row.order_unit,
              product_url: row.product_url,
              category_large: row.category_large,
              supplier: {
                id: supplier.id,
                name: supplier.name,
                auto_order_supported: supplier.auto_order_supported,
              },
            };
          })
          .filter((row): row is SelectableItem => row !== null);
        setItems(safeItems);
      }
      if (suppliersRes.data) {
        setSuppliers(suppliersRes.data as SelectableSupplier[]);
      }

      setLoaded(true);
      setLoading(false);
    };

    fetchData();
  }, [isOpen, loaded]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category_large))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return items.filter((item) => {
      if (excludeItemIds.includes(item.id)) return false;
      if (normalized && !item.name.toLowerCase().includes(normalized)) return false;
      if (supplierFilter && item.supplier_id !== supplierFilter) return false;
      if (categoryFilter && item.category_large !== categoryFilter) return false;
      return true;
    });
  }, [items, search, supplierFilter, categoryFilter, excludeItemIds]);

  const handleSelect = (item: SelectableItem) => {
    onSelect(item);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Item"
      size="xl"
      mobileFullscreen
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items"
              className="min-h-[44px] w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No items found.</div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto rounded-md border md:max-h-[400px]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Spec</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-blue-50"
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
                    <td className="px-3 py-2 text-gray-600">{item.spec ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{item.supplier.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {item.unit_price != null ? `¥${item.unit_price.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
