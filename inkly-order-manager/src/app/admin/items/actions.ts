'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ItemInsert, ItemUpdate } from '@/types/database'
import { revalidatePath } from 'next/cache'

export async function updateItemAutoOrder(itemId: string, enabled: boolean) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('ord_items')
    .update({ auto_order_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/items')
  return { success: true }
}

export async function createItem(data: ItemInsert) {
  const supabase = await createServerSupabaseClient()
  const { data: item, error } = await supabase
    .from('ord_items')
    .insert(data)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/items')
  return { success: true, item }
}

export async function updateItem(itemId: string, data: ItemUpdate) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('ord_items')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/items')
  return { success: true }
}

export async function toggleItemActive(itemId: string, isActive: boolean) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('ord_items')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/items')
  return { success: true }
}
