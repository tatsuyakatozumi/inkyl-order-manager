'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { encryptCredentials, decryptCredentials } from '@/lib/utils/encryption';

interface SupplierUpdateData {
  name?: string;
  order_cycle?: string;
  auto_order_supported?: boolean;
  login_url?: string | null;
  credentials_encrypted?: string | null;
  lead_time_days?: number | null;
  notes?: string | null;
  is_active?: boolean;
  updated_at?: string;
}

export async function updateSupplier(
  id: string,
  data: SupplierUpdateData & { credentials?: string }
) {
  const supabase = await createServerSupabaseClient();

  const updateData: SupplierUpdateData = { ...data };
  delete (updateData as Record<string, unknown>)['credentials'];

  if (data.credentials !== undefined && data.credentials !== '') {
    updateData.credentials_encrypted = encryptCredentials(data.credentials);
  }

  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('ord_suppliers')
    .update(updateData)
    .eq('id', id);

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

export async function getSupplierCredentials(id: string): Promise<
  | { success: true; data: { username: string; password: string } }
  | { success: false; error: string }
> {
  const supabase = await createServerSupabaseClient();

  const { data: supplier, error } = await supabase
    .from('ord_suppliers')
    .select('credentials_encrypted')
    .eq('id', id)
    .single();

  if (error || !supplier) {
    return { success: false, error: error?.message ?? 'Not found' };
  }

  if (!supplier.credentials_encrypted) {
    return { success: false, error: 'No credentials set' };
  }

  try {
    const decrypted = decryptCredentials(supplier.credentials_encrypted);
    const parsed = JSON.parse(decrypted);
    return {
      success: true,
      data: { username: parsed.username ?? '', password: parsed.password ?? '' },
    };
  } catch {
    return { success: false, error: 'Failed to decrypt credentials' };
  }
}
