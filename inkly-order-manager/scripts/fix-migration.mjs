import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // 1. Add ラクスル as a supplier
  console.log('Adding ラクスル supplier...');
  const { data: newSupplier, error: insertErr } = await supabase
    .from('ord_suppliers')
    .insert({
      name: 'ラクスル',
      order_cycle: 'irregular',
      auto_order_supported: false,
      lead_time_days: 5,
      notes: '印刷・名刺・チラシ',
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('Failed to add ラクスル:', insertErr.message);
    process.exit(1);
  }
  console.log('ラクスル added with ID:', newSupplier.id);

  // 2. Read Excel and insert the 19 skipped items
  const workbook = XLSX.readFile('./統合発注管理_v10_棚卸し対応.xlsx');
  const sheet = workbook.Sheets['マスターデータ'];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const raksulRows = rows.filter(r => r['購入サイト'] === 'ラクスル');
  console.log(`Found ${raksulRows.length} ラクスル items to insert`);

  const items = raksulRows.map(row => {
    const visitorLinkedRaw = row['客数連動区分'] || '客数連動';
    const isVisitorLinked = visitorLinkedRaw !== '固定消費';

    return {
      name: row['品目'],
      category_large: row['大分類'],
      category_medium: row['中分類'],
      category_small: row['小分類'] || null,
      supplier_id: newSupplier.id,
      consumable_type: row['消耗区分'] === '非消耗品' ? 'non_consumable' : 'consumable',
      spec: row['規格'] || null,
      unit_price: row['単価（円）'] != null ? Number(row['単価（円）']) : null,
      order_unit: row['発注単位'] || null,
      order_unit_quantity: row['発注単位あたり数量'] != null ? Number(row['発注単位あたり数量']) : null,
      is_visitor_linked: isVisitorLinked,
      consumption_per_visit: row['1施術あたり消費量'] != null ? Number(row['1施術あたり消費量']) : null,
      fixed_monthly_consumption: !isVisitorLinked && row['月間消費量（個別単位）'] != null
        ? Number(row['月間消費量（個別単位）'])
        : null,
      product_url: row['商品ページURL'] || null,
      notes: row['備考'] || null,
      auto_order_enabled: false,
      is_active: true,
    };
  });

  const { error } = await supabase.from('ord_items').insert(items);
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`Inserted ${items.length} items`);

  // 3. Verify total
  const { count } = await supabase
    .from('ord_items')
    .select('*', { count: 'exact', head: true });
  console.log(`\nVerification: ord_items COUNT = ${count} (expected: 206)`);

  const { count: supplierCount } = await supabase
    .from('ord_suppliers')
    .select('*', { count: 'exact', head: true });
  console.log(`ord_suppliers COUNT = ${supplierCount} (expected: 10)`);
}

main().catch(console.error);
