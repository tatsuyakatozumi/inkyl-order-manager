'use client'

import { useState, useMemo, useTransition } from 'react'
import { Plus, Edit, Ban, ExternalLink, Search } from 'lucide-react'
import type { Item, Supplier } from '@/types/database'
import { updateItemAutoOrder, toggleItemActive } from '@/app/admin/items/actions'
import ItemEditModal from './ItemEditModal'

type ItemWithSupplier = Item & {
  supplier: Pick<Supplier, 'id' | 'name'> | null
}

interface ItemsTableProps {
  items: ItemWithSupplier[]
  suppliers: Supplier[]
  categoryLargeOptions: string[]
}

const PAGE_SIZE = 50

export default function ItemsTable({
  items,
  suppliers,
  categoryLargeOptions,
}: ItemsTableProps) {
  const [consumableFilter, setConsumableFilter] = useState<'all' | 'consumable' | 'non_consumable'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [editItem, setEditItem] = useState<Item | null | 'new'>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    let result = items

    if (consumableFilter !== 'all') {
      result = result.filter((i) => i.consumable_type === consumableFilter)
    }
    if (categoryFilter) {
      result = result.filter((i) => i.category_large === categoryFilter)
    }
    if (supplierFilter) {
      result = result.filter((i) => i.supplier_id === supplierFilter)
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      result = result.filter((i) => i.name.toLowerCase().includes(q))
    }

    return result
  }, [items, consumableFilter, categoryFilter, supplierFilter, searchText])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleAutoOrderToggle(itemId: string, current: boolean) {
    startTransition(async () => {
      await updateItemAutoOrder(itemId, !current)
    })
  }

  function handleToggleActive(itemId: string, current: boolean) {
    startTransition(async () => {
      await toggleItemActive(itemId, !current)
    })
  }

  function formatYen(v: number | null) {
    if (v === null || v === undefined) return '-'
    return `¥${v.toLocaleString()}`
  }

  function formatDecimal4(v: number | null) {
    if (v === null || v === undefined) return '-'
    return v.toFixed(4)
  }

  // Unique suppliers from items for filter dropdown
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach((i) => {
      if (i.supplier) map.set(i.supplier.id, i.supplier.name)
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">品目マスター</h1>
        <button
          onClick={() => setEditItem('new')}
          className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          品目追加
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        {/* 消耗区分 */}
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={consumableFilter}
          onChange={(e) => {
            setConsumableFilter(e.target.value as 'all' | 'consumable' | 'non_consumable')
            setPage(1)
          }}
        >
          <option value="all">全て</option>
          <option value="consumable">消耗品</option>
          <option value="non_consumable">非消耗品</option>
        </select>

        {/* 大分類 */}
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">大分類: 全て</option>
          {categoryLargeOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* サプライヤー */}
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={supplierFilter}
          onChange={(e) => {
            setSupplierFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">サプライヤー: 全て</option>
          {supplierOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        {/* 検索 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded border border-gray-300 py-2 pl-9 pr-3 text-sm"
            placeholder="品目名で検索..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {/* Count */}
      <p className="mb-2 text-sm text-gray-500">
        {filtered.length} 件中 {(safePage - 1) * PAGE_SIZE + 1}〜
        {Math.min(safePage * PAGE_SIZE, filtered.length)} 件表示
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3" style={{ width: '25%' }}>品目名</th>
              <th className="px-4 py-3" style={{ width: '10%' }}>規格</th>
              <th className="px-4 py-3" style={{ width: '15%' }}>大分類 &gt; 中分類</th>
              <th className="px-4 py-3" style={{ width: '12%' }}>サプライヤー</th>
              <th className="px-4 py-3 text-right" style={{ width: '8%' }}>単価</th>
              <th className="px-4 py-3 text-right" style={{ width: '8%' }}>1施術あたり</th>
              <th className="px-4 py-3 text-center" style={{ width: '6%' }}>客数連動</th>
              <th className="px-4 py-3 text-center" style={{ width: '6%' }}>自動発注</th>
              <th className="px-4 py-3 text-center" style={{ width: '10%' }}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  品目が見つかりません
                </td>
              </tr>
            )}
            {paged.map((item) => (
              <tr
                key={item.id}
                className={`hover:bg-gray-50 ${!item.is_active ? 'opacity-50' : ''}`}
              >
                {/* 品目名 */}
                <td className="px-4 py-3">
                  <button
                    className="text-left font-medium text-blue-600 hover:underline"
                    onClick={() => setEditItem(item)}
                  >
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

                {/* 規格 */}
                <td className="px-4 py-3 text-gray-600">{item.spec ?? '-'}</td>

                {/* 大分類>中分類 */}
                <td className="px-4 py-3 text-gray-600">
                  {item.category_large} &gt; {item.category_medium}
                </td>

                {/* サプライヤー */}
                <td className="px-4 py-3 text-gray-600">{item.supplier?.name ?? '-'}</td>

                {/* 単価 */}
                <td className="px-4 py-3 text-right text-gray-600">{formatYen(item.unit_price)}</td>

                {/* 1施術あたり */}
                <td className="px-4 py-3 text-right text-gray-600">
                  {formatDecimal4(item.consumption_per_visit)}
                </td>

                {/* 客数連動 */}
                <td className="px-4 py-3 text-center">
                  {item.is_visitor_linked ? (
                    <span className="text-green-600">○</span>
                  ) : (
                    <span className="text-gray-400">×</span>
                  )}
                </td>

                {/* 自動発注 toggle */}
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAutoOrderToggle(item.id, item.auto_order_enabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
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

                {/* 操作 */}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setEditItem(item)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      title="編集"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                      disabled={isPending}
                      className={`rounded p-1 hover:bg-gray-100 disabled:opacity-50 ${
                        item.is_active
                          ? 'text-gray-500 hover:text-red-600'
                          : 'text-red-400 hover:text-green-600'
                      }`}
                      title={item.is_active ? '無効化' : '有効化'}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {safePage} / {totalPages}
          </span>
          <button
            className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            次へ
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editItem !== null && (
        <ItemEditModal
          item={editItem === 'new' ? null : editItem}
          suppliers={suppliers}
          categoryLargeOptions={categoryLargeOptions}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null)
            // Data refreshes via revalidatePath in server actions
          }}
        />
      )}
    </div>
  )
}
