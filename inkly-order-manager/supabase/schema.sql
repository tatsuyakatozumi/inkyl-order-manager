-- ==========================================
-- 発注管理システム - Supabase Schema
-- ==========================================
-- このファイルをSupabase SQLエディタで実行してテーブルを作成する

-- ==========================================
-- ord_suppliers（サプライヤーマスター）
-- ==========================================
CREATE TABLE ord_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_cycle text NOT NULL CHECK (order_cycle IN ('monthly', 'irregular')),
  auto_order_supported boolean NOT NULL DEFAULT false,
  login_url text,
  credentials_encrypted text,
  lead_time_days integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 初期データ
INSERT INTO ord_suppliers (name, order_cycle, auto_order_supported, lead_time_days, notes) VALUES
  ('FLAG Tattoo Supply', 'monthly', true, 3, '国内タトゥー専門店'),
  ('TKTX Official', 'monthly', false, 14, '海外/£建て/購入上限あり'),
  ('Amazon', 'monthly', true, 1, '翌日配送'),
  ('MonotaRO', 'monthly', true, 1, '自動発注対応可/翌日配送/注文コードで一括発注可'),
  ('ASKUL', 'monthly', true, 1, '自動発注対応可/翌日配送'),
  ('光成マーケット', 'monthly', false, 3, '医療機関向け'),
  ('DHM TATTOO SUPPLY', 'irregular', false, 3, '国内タトゥー専門'),
  ('Solid Ink 公式サイト', 'irregular', false, 14, '海外/$建て'),
  ('StarBrite Colors 公式サイト', 'irregular', false, 14, '海外/$建て');

-- ==========================================
-- ord_items（品目マスター）
-- ==========================================
CREATE TABLE ord_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_large text NOT NULL,
  category_medium text NOT NULL,
  category_small text,
  supplier_id uuid NOT NULL REFERENCES ord_suppliers(id),
  alt_supplier_id uuid REFERENCES ord_suppliers(id),
  spec text,
  unit_price integer,
  order_unit text,
  order_unit_quantity integer,
  consumption_per_visit numeric(10,4),
  is_visitor_linked boolean NOT NULL DEFAULT true,
  fixed_monthly_consumption numeric(10,2),
  consumable_type text NOT NULL CHECK (consumable_type IN ('consumable', 'non_consumable')),
  auto_order_enabled boolean NOT NULL DEFAULT false,
  product_url text,
  supplier_product_code text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- ord_order_history（発注履歴）
-- ==========================================
CREATE TABLE ord_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES ord_items(id),
  supplier_id uuid NOT NULL REFERENCES ord_suppliers(id),
  order_date date NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('monthly_regular', 'ad_hoc')),
  quantity numeric(10,2) NOT NULL,
  unit_price integer,
  total_amount integer,
  order_method text NOT NULL CHECK (order_method IN ('auto', 'manual', 'slack_reported')),
  auto_order_status text CHECK (auto_order_status IN ('pending', 'cart_added', 'ordered', 'failed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- ord_inventory_snapshots（棚卸しデータ）
-- ==========================================
CREATE TABLE ord_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES ord_items(id),
  snapshot_date date NOT NULL,
  quantity numeric(10,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- ord_monthly_orders（月次発注計画）
-- ==========================================
CREATE TABLE ord_monthly_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,
  expected_visitors integer NOT NULL,
  item_id uuid NOT NULL REFERENCES ord_items(id),
  calculated_quantity numeric(10,2) NOT NULL,
  inventory_quantity numeric(10,2),
  adjustment numeric(10,2),
  final_quantity numeric(10,2) NOT NULL,
  order_status text NOT NULL DEFAULT 'draft' CHECK (order_status IN ('draft', 'confirmed', 'ordered', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- ord_stock_alerts（在庫報告ログ）
-- ==========================================
CREATE TABLE ord_stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES ord_items(id),
  alert_type text NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock', 'ordered')),
  raw_message text NOT NULL,
  parsed_item_name text,
  parsed_quantity numeric(10,2),
  slack_user_id text,
  slack_ts text,
  reported_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- ord_visitor_stats（来客数実績）
-- ==========================================
CREATE TABLE ord_visitor_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL UNIQUE,
  actual_visitors integer NOT NULL,
  source text NOT NULL CHECK (source IN ('manual', 'reservation_api')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 来客数の初期データ（2025年2月〜2026年2月）
INSERT INTO ord_visitor_stats (year_month, actual_visitors, source) VALUES
  ('2025-02', 11, 'manual'),
  ('2025-03', 91, 'manual'),
  ('2025-04', 141, 'manual'),
  ('2025-05', 160, 'manual'),
  ('2025-06', 156, 'manual'),
  ('2025-07', 237, 'manual'),
  ('2025-08', 316, 'manual'),
  ('2025-09', 395, 'manual'),
  ('2025-10', 391, 'manual'),
  ('2025-11', 340, 'manual'),
  ('2025-12', 256, 'manual'),
  ('2026-01', 212, 'manual'),
  ('2026-02', 226, 'manual');

-- ==========================================
-- インデックス
-- ==========================================
CREATE INDEX idx_ord_items_supplier ON ord_items(supplier_id);
CREATE INDEX idx_ord_items_consumable ON ord_items(consumable_type);
CREATE INDEX idx_ord_order_history_item ON ord_order_history(item_id);
CREATE INDEX idx_ord_order_history_date ON ord_order_history(order_date);
CREATE INDEX idx_ord_order_history_type ON ord_order_history(order_type);
CREATE INDEX idx_ord_monthly_orders_month ON ord_monthly_orders(year_month);
CREATE INDEX idx_ord_monthly_orders_status ON ord_monthly_orders(order_status);
CREATE INDEX idx_ord_inventory_snapshots_item ON ord_inventory_snapshots(item_id);
CREATE INDEX idx_ord_stock_alerts_item ON ord_stock_alerts(item_id);
CREATE INDEX idx_ord_stock_alerts_type ON ord_stock_alerts(alert_type);

-- ==========================================
-- updated_at 自動更新トリガー
-- ==========================================
CREATE OR REPLACE FUNCTION ord_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ord_suppliers_updated
  BEFORE UPDATE ON ord_suppliers
  FOR EACH ROW EXECUTE FUNCTION ord_update_updated_at();

CREATE TRIGGER trigger_ord_items_updated
  BEFORE UPDATE ON ord_items
  FOR EACH ROW EXECUTE FUNCTION ord_update_updated_at();

CREATE TRIGGER trigger_ord_monthly_orders_updated
  BEFORE UPDATE ON ord_monthly_orders
  FOR EACH ROW EXECUTE FUNCTION ord_update_updated_at();

-- ==========================================
-- RLS（Row Level Security）
-- ==========================================
ALTER TABLE ord_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_monthly_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ord_visitor_stats ENABLE ROW LEVEL SECURITY;
