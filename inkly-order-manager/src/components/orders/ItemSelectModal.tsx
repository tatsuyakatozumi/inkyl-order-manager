'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import type { Item, Supplier } from '@/types/database';

interface ItemWithSupplier extends Item {
  supplier: Supplier;
}

interface ItemSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: ItemWithSupplier) => void;
  excludeItemIds: string[];
}

export function ItemSelectModal({
  isOpen,
  onClose,
  onSelect,
  excludeItemIds,
}: ItemSelectModalProps) {
  const [items, setItems] = useState<ItemWithSupplier[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();

      const [itemsRes, suppliersRes] = await Promise.all([
        supabase
          .from('ord_items')
          .select('*, supplier:ord_suppliers!supplier_id(*)')
          .eq('consumable_type', 'consumable')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('ord_suppliers')
          .select('*')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (itemsRes.data) setItems(itemsRes.data as ItemWithSupplier[]);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      setLoading(false);
    };
    fetchData();
  }, [isOpen]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category_large))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (excludeItemIds.includes(item.id)) return false;
      if (search && !item.name.includes(search)) return false;
      if (supplierFilter && item.supplier_id !== supplierFilter) return false;
      if (categoryFilter && item.category_large !== categoryFilter) return false;
      return true;
    });
  }, [items, search, supplierFilter, categoryFilter, excludeItemIds]);

  const handleSelect = (item: ItemWithSupplier) => {
    onSelect(item);
    onClose();
    setSearch('');
    setSupplierFilter('');
    setCategoryFilter('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="品目を選択" size="xl">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="品目名で検索..."
              className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全サプライヤー</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全カテゴリー</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Items table */}
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            該当する品目がありません
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-3 py-2">品目名</th>
                  <th className="px-3 py-2">規格</th>
                  <th className="px-3 py-2">サプライヤー</th>
                  <th className="px-3 py-2 text-right">単価</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-blue-50"
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {item.spec ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {item.supplier.name}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {item.unit_price != null
                        ? `¥${item.unit_price.toLocaleString()}`
                        : '-'}
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
