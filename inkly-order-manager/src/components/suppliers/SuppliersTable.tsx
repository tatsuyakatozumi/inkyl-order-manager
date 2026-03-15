'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Supplier } from '@/types/database';
import { SupplierEditModal } from './SupplierEditModal';

type SupplierWithCount = Supplier & { item_count: number };

interface SuppliersTableProps {
  suppliers: SupplierWithCount[];
}

export function SuppliersTable({ suppliers }: SuppliersTableProps) {
  const [editingSupplier, setEditingSupplier] =
    useState<SupplierWithCount | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                サプライヤー名
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                発注サイクル
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">
                自動発注対応
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">
                リードタイム
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">
                品目数
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {suppliers.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  サプライヤーが登録されていません
                </td>
              </tr>
            )}
            {suppliers.map((supplier) => (
              <tr
                key={supplier.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {supplier.name}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {supplier.order_cycle === 'monthly' ? '月次' : '不定期'}
                </td>
                <td className="px-4 py-3 text-center">
                  {supplier.auto_order_supported ? (
                    <span className="text-green-600 font-bold">○</span>
                  ) : (
                    <span className="text-gray-400">×</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {supplier.lead_time_days != null
                    ? `${supplier.lead_time_days}日`
                    : '-'}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {supplier.item_count}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setEditingSupplier(supplier)}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingSupplier && (
        <SupplierEditModal
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
        />
      )}
    </>
  );
}
