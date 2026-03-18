-- Add Solid Ink supplier
INSERT INTO ord_suppliers (name, order_cycle, auto_order_supported, login_url, is_active, notes)
VALUES (
  'Solid Ink',
  'irregular',
  true,
  'https://thesolidink.com/account/login',
  true,
  'Solid Ink - Shopify store (tattoo ink supplier)'
)
ON CONFLICT (name) DO NOTHING;

-- Add Solid Ink items (50 colors, all 1oz)
DO $$
DECLARE
  v_supplier_id uuid;
BEGIN
  SELECT id INTO v_supplier_id FROM ord_suppliers WHERE name = 'Solid Ink';

  INSERT INTO ord_items (name, category_large, category_medium, supplier_id, spec, order_unit, consumable_type, auto_order_enabled, product_url, is_active)
  VALUES
    ('Agave', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/agave', true),
    ('Baby Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/baby-blue', true),
    ('Banana', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/banana', true),
    ('Blood', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/blood', true),
    ('Boca Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/boca-blue', true),
    ('Bordeaux', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/bordeaux', true),
    ('Brown', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/brown', true),
    ('Burgundy', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/burgundy', true),
    ('Burnt Orange', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/burnt-orange', true),
    ('Chocolate', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/chocolate', true),
    ('Cool Grey', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/cool-grey', true),
    ('Coral', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/red-coral', true),
    ('Cream Orange', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/cream-orange', true),
    ('Dark Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/dark-blue', true),
    ('Dark Green', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/dark-green', true),
    ('Deep Red', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/deep-red', true),
    ('Diablo', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/diablo', true),
    ('Dragon', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/dragon', true),
    ('Dulce de Leche', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/dulce-de-leche', true),
    ('El Dorado Yellow', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/dorado-yellow', true),
    ('Fuchsia', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/fuchsia', true),
    ('Heavy Black', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/heavy-black', true),
    ('Lavender', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/lavender', true),
    ('Light Green', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/light-green', true),
    ('Lilac', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/lavender-1', true),
    ('Lime Green', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/atomic-green', true),
    ('Lining Black', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/lining-black', true),
    ('Lollipop', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/lollipop', true),
    ('Magenta', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/magenta', true),
    ('Medium Green', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/medium-green', true),
    ('Miami Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/miami-blue', true),
    ('Mint', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/mint', true),
    ('Nice Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/nice-blue', true),
    ('Ochre', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/ochre', true),
    ('Olive', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/olive', true),
    ('Orange', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/orang', true),
    ('Peach Orange', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/peach-orange', true),
    ('Pink', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/pink', true),
    ('Purple', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/purple', true),
    ('Red', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/red', true),
    ('Silver', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/silver', true),
    ('Sky Blue', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/sky-blue-1', true),
    ('Sunshine', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/sunshine', true),
    ('Tiger', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/tiger', true),
    ('Turquoise', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/turquoise', true),
    ('Ultramarine', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/ultramarine', true),
    ('Violet', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/violet', true),
    ('Watermelon', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/copy-of-agave', true),
    ('White', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/sky-blue', true),
    ('Yellow', 'タトゥー用品', 'インク', v_supplier_id, '1oz', 'bottle', 'consumable', true, 'https://thesolidink.com/products/yellow', true);
END $$;
