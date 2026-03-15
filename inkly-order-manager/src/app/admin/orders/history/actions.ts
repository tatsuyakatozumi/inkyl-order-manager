'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface OrderHistoryFilters {
  startMonth: string;
  endMonth: string;
  supplierId?: string;
  orderType?: string;
  orderMethod?: string;
  page: number;
}

export interface OrderHistoryRow {
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
}

export interface OrderHistoryResult {
  data: OrderHistoryRow[];
  totalCount: number;
  error?: string;
}

const PAGE_SIZE = 50;

export async function getOrderHistory(
  filters: OrderHistoryFilters
): Promise<OrderHistoryResult> {
  const supabase = await createServerSupabaseClient();

  const startDate = `${filters.startMonth}-01`;
  // End date: last day of the end month
  const [endYear, endMonth] = filters.endMonth.split('-').map(Number);
  const endDate = new Date(endYear, endMonth, 0)
    .toISOString()
    .split('T')[0];

  let query = supabase
    .from('ord_order_history')
    .select(
      `
      id,
      order_date,
      order_type,
      quantity,
      unit_price,
      total_amount,
      order_method,
      supplier:ord_suppliers!supplier_id(name),
      item:ord_items!item_id(name, spec)
    `,
      { count: 'exact' }
    )
    .gte('order_date', startDate)
    .lte('order_date', endDate)
    .order('order_date', { ascending: false });

  if (filters.supplierId && filters.supplierId !== 'all') {
    query = query.eq('supplier_id', filters.supplierId);
  }
  if (filters.orderType && filters.orderType !== 'all') {
    query = query.eq('order_type', filters.orderType);
  }
  if (filters.orderMethod && filters.orderMethod !== 'all') {
    query = query.eq('order_method', filters.orderMethod);
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    return { data: [], totalCount: 0, error: error.message };
  }

  const rows: OrderHistoryRow[] = (data ?? []).map((row: any) => ({
    id: row.id,
    order_date: row.order_date,
    order_type: row.order_type,
    supplier_name: row.supplier?.name ?? '',
    item_name: row.item?.name ?? '',
    spec: row.item?.spec ?? null,
    quantity: row.quantity,
    unit_price: row.unit_price,
    total_amount: row.total_amount,
    order_method: row.order_method,
  }));

  return { data: rows, totalCount: count ?? 0 };
}
