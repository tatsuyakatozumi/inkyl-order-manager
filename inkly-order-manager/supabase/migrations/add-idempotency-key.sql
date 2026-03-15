ALTER TABLE ord_order_history
ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ord_order_history_idempotency
ON ord_order_history (idempotency_key)
WHERE idempotency_key IS NOT NULL;
