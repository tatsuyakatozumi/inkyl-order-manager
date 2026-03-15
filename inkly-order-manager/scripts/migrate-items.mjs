import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile('./統合発注管理_v10_棚卸し対応.xlsx');
  const sheet = workbook.Sheets['マスターデータ'];
  if (!sheet) {
    console.error('Sheet "マスターデータ" not found. Available:', workbook.SheetNames);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`Found ${rows.length} rows`);

  // Check if items already exist
  const { count: existingCount } = await supabase
    .from('ord_items')
    .select('*', { count: 'exact', head: true });

  if (existingCount && existingCount > 0) {
    console.log(`ord_items already has ${existingCount} rows. Aborting to prevent duplicates.`);
    console.log('If you want to re-migrate, delete existing rows first.');
    process.exit(0);
  }

  // Fetch suppliers
  const { data: suppliers, error: suppErr } = await supabase
    .from('ord_suppliers')
    .select('id, name');

  if (suppErr || !suppliers) {
    console.error('Failed to fetch suppliers:', suppErr);
    process.exit(1);
  }

  const supplierMap = new Map(suppliers.map(s => [s.name, s.id]));
  console.log('Suppliers found:', suppliers.length);
  console.log('Supplier names:', [...supplierMap.keys()].join(', '));

  let insertCount = 0;
  let skipCount = 0;
  const errors = [];

  // Batch insert for performance
  const batch = [];

  for (const row of rows) {
    const supplierName = row['購入サイト'];
    const supplierId = supplierMap.get(supplierName);

    if (!supplierId) {
      errors.push(`Supplier not found: "${supplierName}" for item "${row['品目']}"`);
      skipCount++;
      continue;
    }

    const visitorLinkedRaw = row['客数連動区分'] || '客数連動';
    const isVisitorLinked = visitorLinkedRaw !== '固定消費';

    const item = {
      name: row['品目'],
      category_large: row['大分類'],
      category_medium: row['中分類'],
      category_small: row['小分類'] || null,
      supplier_id: supplierId,
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

    batch.push(item);
  }

  // Insert in batches of 50
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    const { error } = await supabase.from('ord_items').insert(chunk);
    if (error) {
      console.error(`Batch insert failed at index ${i}:`, error.message);
      // Fall back to individual inserts for this batch
      for (const item of chunk) {
        const { error: singleErr } = await supabase.from('ord_items').insert(item);
        if (singleErr) {
          errors.push(`Failed to insert "${item.name}": ${singleErr.message}`);
          skipCount++;
        } else {
          insertCount++;
        }
      }
    } else {
      insertCount += chunk.length;
    }
  }

  console.log('\n=== Migration Results ===');
  console.log(`Inserted: ${insertCount}`);
  console.log(`Skipped: ${skipCount}`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log(`\nExpected: 206 items`);

  // Verify
  const { count } = await supabase
    .from('ord_items')
    .select('*', { count: 'exact', head: true });
  console.log(`\nVerification: ord_items COUNT = ${count}`);
}

main().catch(console.error);
