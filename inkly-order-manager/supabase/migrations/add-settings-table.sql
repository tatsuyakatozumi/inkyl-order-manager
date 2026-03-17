-- Settings table for global configuration (e.g. auto-order toggle)
CREATE TABLE IF NOT EXISTS ord_settings (
  key   text        PRIMARY KEY,
  value jsonb       NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Default: auto-order enabled
INSERT INTO ord_settings (key, value)
VALUES ('auto_order_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
