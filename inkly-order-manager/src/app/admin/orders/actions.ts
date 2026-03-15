'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function confirmOrders(yearMonth: string, itemIds: string[]) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('ord_monthly_orders')
    .update({ order_status: 'confirmed' })
    .eq('year_month', yearMonth)
    .in('item_id', itemIds);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateOrderAdjustment(
  orderId: string,
  adjustment: number,
) {
  const supabase = await createServerSupabaseClient();

  // First get the current order to recalculate final_quantity
  const { data: order, error: fetchError } = await supabase
    .from('ord_monthly_orders')
    .select('id,calculated_quantity')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return { success: false, error: fetchError?.message ?? 'Order not found' };
  }

  const finalQuantity = Math.max(0, order.calculated_quantity + adjustment);

  const { error } = await supabase
    .from('ord_monthly_orders')
    .update({
      adjustment,
      final_quantity: finalQuantity,
    })
    .eq('id', orderId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, finalQuantity };
}

export async function updateManualOrderQuantity(
  orderId: string,
  quantity: number,
) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('ord_monthly_orders')
    .update({
      calculated_quantity: quantity,
      final_quantity: quantity,
    })
    .eq('id', orderId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
