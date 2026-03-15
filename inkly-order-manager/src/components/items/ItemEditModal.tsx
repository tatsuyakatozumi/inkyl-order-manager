'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Item, Supplier, ItemInsert, ItemUpdate } from '@/types/database'
import { createItem, updateItem } from '@/app/admin/items/actions'

interface ItemEditModalProps {
  item: Item | null
  suppliers: Supplier[]
  categoryLargeOptions: string[]
  onClose: () => void
  onSaved: () => void
}

type FormData = {
  name: string
  category_large: string
  category_medium: string
  category_small: string
  supplier_id: string
  alt_supplier_id: string
  spec: string
  unit_price: string
  order_unit: string
  order_unit_quantity: string
  consumable_type: 'consumable' | 'non_consumable'
  consumption_per_visit: string
  is_visitor_linked: boolean
  fixed_monthly_consumption: string
  product_url: string
  supplier_product_code: string
  notes: string
}

function buildInitialForm(item: Item | null): FormData {
  if (item) {
    return {
      name: item.name,
      category_large: item.category_large,
      category_medium: item.category_medium,
      category_small: item.category_small ?? '',
      supplier_id: item.supplier_id,
      alt_supplier_id: item.alt_supplier_id ?? '',
      spec: item.spec ?? '',
      unit_price: item.unit_price?.toString() ?? '',
      order_unit: item.order_unit ?? '',
      order_unit_quantity: item.order_unit_quantity?.toString() ?? '',
      consumable_type: item.consumable_type,
      consumption_per_visit: item.consumption_per_visit?.toString() ?? '',
      is_visitor_linked: item.is_visitor_linked,
      fixed_monthly_consumption: item.fixed_monthly_consumption?.toString() ?? '',
      product_url: item.product_url ?? '',
      supplier_product_code: item.supplier_product_code ?? '',
      notes: item.notes ?? '',
    }
  }
  return {
    name: '',
    category_large: '',
    category_medium: '',
    category_small: '',
    supplier_id: '',
    alt_supplier_id: '',
    spec: '',
    unit_price: '',
    order_unit: '',
    order_unit_quantity: '',
    consumable_type: 'consumable',
    consumption_per_visit: '',
    is_visitor_linked: true,
    fixed_monthly_consumption: '',
    product_url: '',
    supplier_product_code: '',
    notes: '',
  }
}

export default function ItemEditModal({
  item,
  suppliers,
  categoryLargeOptions,
  onClose,
  onSaved,
}: ItemEditModalProps) {
  const [form, setForm] = useState<FormData>(buildInitialForm(item))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const isEdit = item !== null

  useEffect(() => {
    setForm(buildInitialForm(item))
  }, [item])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = '品目名は必須です'
    if (!form.supplier_id) errs.supplier_id = 'サプライヤーは必須です'
    if (!form.consumable_type) errs.consumable_type = '消耗区分は必須です'
    if (!form.category_large.trim()) errs.category_large = '大分類は必須です'
    if (!form.category_medium.trim()) errs.category_medium = '中分類は必須です'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setServerError(null)

    const payload: ItemInsert | ItemUpdate = {
      name: form.name.trim(),
      category_large: form.category_large.trim(),
      category_medium: form.category_medium.trim(),
      category_small: form.category_small.trim() || null,
      supplier_id: form.supplier_id,
      alt_supplier_id: form.alt_supplier_id || null,
      spec: form.spec.trim() || null,
      unit_price: form.unit_price ? Number(form.unit_price) : null,
      order_unit: form.order_unit.trim() || null,
      order_unit_quantity: form.order_unit_quantity ? Number(form.order_unit_quantity) : null,
      consumable_type: form.consumable_type,
      consumption_per_visit: form.consumption_per_visit ? Number(form.consumption_per_visit) : null,
      is_visitor_linked: form.is_visitor_linked,
      fixed_monthly_consumption: form.is_visitor_linked
        ? null
        : form.fixed_monthly_consumption
          ? Number(form.fixed_monthly_consumption)
          : null,
      product_url: form.product_url.trim() || null,
      supplier_product_code: form.supplier_product_code.trim() || null,
      notes: form.notes.trim() || null,
    }

    const result = isEdit
      ? await updateItem(item!.id, payload as ItemUpdate)
      : await createItem(payload as ItemInsert)

    setSaving(false)

    if (!result.success) {
      setServerError(result.error ?? '保存に失敗しました')
      return
    }

    onSaved()
  }

  const activeSuppliers = suppliers.filter((s) => s.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-6 text-lg font-bold">
          {isEdit ? '品目を編集' : '品目を追加'}
        </h2>

        {serverError && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* 品目名 */}
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              品目名 <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full rounded border px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 大分類 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              大分類 <span className="text-red-500">*</span>
            </label>
            <input
              list="category-large-options"
              className={`w-full rounded border px-3 py-2 text-sm ${errors.category_large ? 'border-red-400' : 'border-gray-300'}`}
              value={form.category_large}
              onChange={(e) => set('category_large', e.target.value)}
            />
            <datalist id="category-large-options">
              {categoryLargeOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {errors.category_large && (
              <p className="mt-1 text-xs text-red-500">{errors.category_large}</p>
            )}
          </div>

          {/* 中分類 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              中分類 <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full rounded border px-3 py-2 text-sm ${errors.category_medium ? 'border-red-400' : 'border-gray-300'}`}
              value={form.category_medium}
              onChange={(e) => set('category_medium', e.target.value)}
            />
            {errors.category_medium && (
              <p className="mt-1 text-xs text-red-500">{errors.category_medium}</p>
            )}
          </div>

          {/* 小分類 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">小分類</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.category_small}
              onChange={(e) => set('category_small', e.target.value)}
            />
          </div>

          {/* 規格 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">規格</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.spec}
              onChange={(e) => set('spec', e.target.value)}
            />
          </div>

          {/* サプライヤー */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              サプライヤー <span className="text-red-500">*</span>
            </label>
            <select
              className={`w-full rounded border px-3 py-2 text-sm ${errors.supplier_id ? 'border-red-400' : 'border-gray-300'}`}
              value={form.supplier_id}
              onChange={(e) => set('supplier_id', e.target.value)}
            >
              <option value="">選択してください</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.supplier_id && (
              <p className="mt-1 text-xs text-red-500">{errors.supplier_id}</p>
            )}
          </div>

          {/* 代替サプライヤー */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">代替サプライヤー</label>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.alt_supplier_id}
              onChange={(e) => set('alt_supplier_id', e.target.value)}
            >
              <option value="">なし</option>
              {activeSuppliers
                .filter((s) => s.id !== form.supplier_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* 単価 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">単価</label>
            <input
              type="number"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.unit_price}
              onChange={(e) => set('unit_price', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* 発注単位 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">発注単位</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.order_unit}
              onChange={(e) => set('order_unit', e.target.value)}
              placeholder="箱、本、個 など"
            />
          </div>

          {/* 発注単位数量 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">発注単位数量</label>
            <input
              type="number"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.order_unit_quantity}
              onChange={(e) => set('order_unit_quantity', e.target.value)}
              placeholder="1"
            />
          </div>

          {/* 消耗区分 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              消耗区分 <span className="text-red-500">*</span>
            </label>
            <select
              className={`w-full rounded border px-3 py-2 text-sm ${errors.consumable_type ? 'border-red-400' : 'border-gray-300'}`}
              value={form.consumable_type}
              onChange={(e) => set('consumable_type', e.target.value as 'consumable' | 'non_consumable')}
            >
              <option value="consumable">消耗品</option>
              <option value="non_consumable">非消耗品</option>
            </select>
            {errors.consumable_type && (
              <p className="mt-1 text-xs text-red-500">{errors.consumable_type}</p>
            )}
          </div>

          {/* 1施術あたり消費量 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">1施術あたり消費量</label>
            <input
              type="number"
              step="0.0001"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.consumption_per_visit}
              onChange={(e) => set('consumption_per_visit', e.target.value)}
              placeholder="0.0000"
            />
          </div>

          {/* 客数連動 */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">客数連動</label>
            <button
              type="button"
              onClick={() => set('is_visitor_linked', !form.is_visitor_linked)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.is_visitor_linked ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.is_visitor_linked ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-gray-500">
              {form.is_visitor_linked ? '○' : '×'}
            </span>
          </div>

          {/* 固定月間消費量 (only when is_visitor_linked=false) */}
          {!form.is_visitor_linked && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">固定月間消費量</label>
              <input
                type="number"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={form.fixed_monthly_consumption}
                onChange={(e) => set('fixed_monthly_consumption', e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          {/* 商品URL */}
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">商品URL</label>
            <input
              type="url"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.product_url}
              onChange={(e) => set('product_url', e.target.value)}
            />
          </div>

          {/* サプライヤー品番 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">サプライヤー品番</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.supplier_product_code}
              onChange={(e) => set('supplier_product_code', e.target.value)}
            />
          </div>

          {/* 備考 */}
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">備考</label>
            <textarea
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
