'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Supplier {
  id: string;
  name: string;
}

interface OrderHistoryRow {
  id: string;
  order_date: string;
  order_type: 'monthly_regular' | 'ad_hoc';
  supplier_name: string;
  item_name: string;
  spec: string | null;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  order_method: 'auto' | 'manual' | 'slack_reported';
  auto_order_status: 'ordered' | 'cart_added' | 'failed' | 'pending' | null;
}

interface OrderHistoryProps {
  suppliers: Supplier[];
}

const PAGE_SIZE = 50;

function getDefaultStartMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  return `¥${value.toLocaleString()}`;
}

function getEndOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

export function OrderHistory({ suppliers }: OrderHistoryProps) {
  const [startMonth, setStartMonth] = useState(getDefaultStartMonth);
  const [endMonth, setEndMonth] = useState(getCurrentMonth);
  const [supplierId, setSupplierId] = useState('all');
  const [orderType, setOrderType] = useState('all');
  const [orderMethod, setOrderMethod] = useState('all');
  const [autoOrderStatus, setAutoOrderStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrderHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const startDate = `${startMonth}-01`;
    const endDate = getEndOfMonth(endMonth);

    let query = supabase
      .from('ord_order_history')
      .select(
        'id,order_date,order_type,quantity,unit_price,total_amount,order_method,auto_order_status,supplier:ord_suppliers!supplier_id(name),item:ord_items!item_id(name,spec)',
        { count: 'exact' },
      )
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .order('order_date', { ascending: false });

    if (supplierId !== 'all') query = query.eq('supplier_id', supplierId);
    if (orderType !== 'all') query = query.eq('order_type', orderType);
    if (orderMethod !== 'all') query = query.eq('order_method', orderMethod);
    if (autoOrderStatus !== 'all') query = query.eq('auto_order_status', autoOrderStatus);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data: rows, count, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
      setData([]);
      setTotalCount(0);
    } else {
      const mapped: OrderHistoryRow[] = (rows ?? []).map((row: any) => {
        const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
        const item = Array.isArray(row.item) ? row.item[0] : row.item;
        return {
          id: row.id,
          order_date: row.order_date,
          order_type: row.order_type,
          supplier_name: supplier?.name ?? '',
          item_name: item?.name ?? '',
          spec: item?.spec ?? null,
          quantity: row.quantity,
          unit_price: row.unit_price,
          total_amount: row.total_amount,
          order_method: row.order_method,
          auto_order_status: row.auto_order_status ?? null,
        };
      });
      setData(mapped);
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  }, [startMonth, endMonth, supplierId, orderType, orderMethod, autoOrderStatus, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [startMonth, endMonth, supplierId, orderType, orderMethod, autoOrderStatus]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const filterSummary = useMemo(() => {
    if (totalCount === 0) return '0 records';
    const from = Math.min((page - 1) * PAGE_SIZE + 1, totalCount);
    const to = Math.min(page * PAGE_SIZE, totalCount);
    return `${totalCount.toLocaleString()} records (${from}-${to})`;
  }, [totalCount, page]);

  const handleExportCsv = async () => {
    const supabase = createClient();
    const startDate = `${startMonth}-01`;
    const endDate = getEndOfMonth(endMonth);

    let query = supabase
      .from('ord_order_history')
      .select(
        'order_date,order_type,quantity,unit_price,total_amount,order_method,auto_order_status,supplier:ord_suppliers!supplier_id(name),item:ord_items!item_id(name,spec)',
      )
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .order('order_date', { ascending: false })
      .limit(20000);

    if (supplierId !== 'all') query = query.eq('supplier_id', supplierId);
    if (orderType !== 'all') query = query.eq('order_type', orderType);
    if (orderMethod !== 'all') query = query.eq('order_method', orderMethod);
    if (autoOrderStatus !== 'all') query = query.eq('auto_order_status', autoOrderStatus);

    const { data: allRows } = await query;
    if (!allRows || allRows.length === 0) return;

    const headers = [
      'Order Date',
      'Order Type',
      'Supplier',
      'Item',
      'Spec',
      'Quantity',
      'Unit Price',
      'Amount',
      'Method',
      'Auto Status',
    ];

    const csvRows = (allRows as any[]).map((row) => {
      const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return [
        row.order_date,
        row.order_type === 'monthly_regular' ? 'Monthly' : 'Adhoc',
        supplier?.name ?? '',
        item?.name ?? '',
        item?.spec ?? '',
        row.quantity,
        row.unit_price ?? '',
        row.total_amount ?? '',
        row.order_method,
        row.auto_order_status ?? '',
      ];
    });

    const bom = '\uFEFF';
    const csv =
      bom +
      [headers, ...csvRows]
        .map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order_history_${startMonth}_${endMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="h-4 w-4" />
          Filters
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Start Month</label>
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">End Month</label>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Order Type</label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="monthly_regular">Monthly</option>
              <option value="ad_hoc">Adhoc</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Method</label>
            <select
              value={orderMethod}
              onChange={(e) => setOrderMethod(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
              <option value="slack_reported">Slack</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Auto Status</label>
            <select
              value={autoOrderStatus}
              onChange={(e) => setAutoOrderStatus(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="ordered">Ordered</option>
              <option value="cart_added">Cart Added</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-500">{filterSummary}</p>
        <button
          onClick={handleExportCsv}
          disabled={totalCount === 0}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Failed to fetch data: {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Supplier</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Spec</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Unit Price</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Method</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Auto Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  No records found.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{formatDate(row.order_date)}</td>
                  <td className="px-4 py-3 text-center">
                    {row.order_type === 'monthly_regular' ? (
                      <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Monthly
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                        Adhoc
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.supplier_name}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.item_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.spec ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{row.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(row.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {row.order_method === 'auto' ? (
                      <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Auto</span>
                    ) : row.order_method === 'slack_reported' ? (
                      <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">Slack</span>
                    ) : (
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">Manual</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.auto_order_status === 'ordered' ? (
                      <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Ordered</span>
                    ) : row.auto_order_status === 'cart_added' ? (
                      <span className="inline-block rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">Cart</span>
                    ) : row.auto_order_status === 'failed' ? (
                      <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Failed</span>
                    ) : row.auto_order_status === 'pending' ? (
                      <span className="inline-block rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">Pending</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
