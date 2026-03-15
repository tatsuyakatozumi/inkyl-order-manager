'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function saveInventorySnapshot(
  data: { itemId: string; quantity: number; notes: string | null }[],
  snapshotDate: string
) {
  try {
    const supabase = await createServerSupabaseClient();

    const rows = data.map((d) => ({
      item_id: d.itemId,
      snapshot_date: snapshotDate,
      quantity: d.quantity,
      notes: d.notes,
    }));

    const { error } = await supabase
      .from('ord_inventory_snapshots')
      .insert(rows);

    if (error) {
      console.error('Failed to save inventory snapshots:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    console.error('Unexpected error saving inventory snapshots:', e);
    return { success: false, error: '保存中に予期しないエラーが発生しました' };
  }
}

export async function getLatestSnapshots(): Promise<{
  success: boolean;
  data?: Record<string, { quantity: number; notes: string | null; snapshot_date: string }>;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();

    // Get all snapshots ordered by date desc, then deduplicate by item_id in JS
    const { data, error } = await supabase
      .from('ord_inventory_snapshots')
      .select('item_id, quantity, notes, snapshot_date')
      .order('snapshot_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch latest snapshots:', error);
      return { success: false, error: error.message };
    }

    const map: Record<string, { quantity: number; notes: string | null; snapshot_date: string }> = {};
    for (const row of data) {
      if (!map[row.item_id]) {
        map[row.item_id] = {
          quantity: row.quantity,
          notes: row.notes,
          snapshot_date: row.snapshot_date,
        };
      }
    }

    return { success: true, data: map };
  } catch (e) {
    console.error('Unexpected error fetching latest snapshots:', e);
    return { success: false, error: '読み込み中に予期しないエラーが発生しました' };
  }
}
