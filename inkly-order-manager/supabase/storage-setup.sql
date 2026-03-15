-- order-screenshots バケットを作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-screenshots', 'order-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- service_role でのアクセスを許可（RLS policy）
CREATE POLICY "Service role can manage order screenshots"
ON storage.objects
FOR ALL
USING (bucket_id = 'order-screenshots')
WITH CHECK (bucket_id = 'order-screenshots');
