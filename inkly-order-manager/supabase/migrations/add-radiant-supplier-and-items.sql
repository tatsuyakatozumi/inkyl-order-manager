-- Add UNIQUE constraint to supplier name (required for ON CONFLICT)
ALTER TABLE ord_suppliers ADD CONSTRAINT ord_suppliers_name_unique UNIQUE (name);

-- Add Radiant supplier
INSERT INTO ord_suppliers (name, order_cycle, auto_order_supported, login_url, is_active, notes)
VALUES (
  'Radiant',
  'irregular',
  true,
  'https://www.radiantcolors.com/account/login',
  true,
  'Radiant Colors - Shopify store (tattoo ink supplier)'
)
ON CONFLICT (name) DO NOTHING;

-- Add Radiant items
DO $$
DECLARE
  v_supplier_id uuid;
BEGIN
  SELECT id INTO v_supplier_id FROM ord_suppliers WHERE name = 'Radiant';

  INSERT INTO ord_items (name, category_large, category_medium, supplier_id, spec, order_unit, consumable_type, auto_order_enabled, product_url, is_active)
  VALUES
    ('Super White（スーパーホワイト）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/super-white?variant=25575045766', true),
    ('Turbo Black（ターボブラック）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/turbo-black?variant=29337531084', true),
    ('Baby Pink（ベビーピンク）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/baby-pink?variant=25573056646', true),
    ('Scarlet Red（スカーレットレッド）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/scarlet-red?variant=25574681030', true),
    ('Banana（バナナ）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/banana?variant=42460437315671', true),
    ('Electric Blue（エレクトリックブルー）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/electric-blue?variant=27344384710', true),
    ('Lime Green（ライムグリーン）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/lime-green?variant=25574294342', true),
    ('Flesh（フレッシュ）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/flesh?variant=25573803334', true),
    ('Violet（バイオレット）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/violet?variant=27347261894', true),
    ('Teal（ティール）', 'タトゥー用品', 'インク', v_supplier_id, '1/2 oz', 'bottle', 'consumable', true, 'https://www.radiantcolors.com/products/teal?variant=29371162508', true);
END $$;
