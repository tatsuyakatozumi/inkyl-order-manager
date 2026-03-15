import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export async function uploadScreenshot(localPath: string): Promise<{
  signedUrl: string;
  expiresAt: string;
} | null> {
  if (!fs.existsSync(localPath)) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const fileName = `${Date.now()}_${path.basename(localPath)}`;
  const fileBuffer = fs.readFileSync(localPath);

  const { error: uploadError } = await supabase.storage
    .from('order-screenshots')
    .upload(fileName, fileBuffer, {
      contentType: 'image/png',
      upsert: false,
    });

  if (uploadError) {
    console.error('[Screenshot] Upload failed:', uploadError);
    return null;
  }

  // 1時間有効なsigned URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from('order-screenshots')
    .createSignedUrl(fileName, 3600);

  if (signedError || !signedData) {
    console.error('[Screenshot] Signed URL failed:', signedError);
    return null;
  }

  // ローカルファイルを削除
  fs.unlinkSync(localPath);

  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return { signedUrl: signedData.signedUrl, expiresAt };
}
