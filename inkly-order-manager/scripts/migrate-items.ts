import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// Configuration - update these before running
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'xxxx';
const EXCEL_PATH = './統合発注管理_v10_棚卸し対応.xlsx';
const SHEET_NAME = 'マスターデータ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ExcelRow {
  '消耗区分': string;
  '大分類': string;
  '中分類': string;
  '小分類'?: string;
  '購入サイト': string;
  '品目': string;
  '規格'?: string;
  '単価（円）'?: number;
  '発注単位'?: string;
  '発注単位あたり数量'?: number;
  '客数連動区分'?: string;
  '1施術あたり消費量'?: number;
  '月間消費量（個別単位）'?: number;
  '商品ページURL'?: string;
  '備考'?: string;
}

async function main() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available sheets:`, workbook.SheetNames);
    process.exit(1);
  }

  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(sheet);
  console.log(`Found ${rows.length} rows in sheet "${SHEET_NAME}"`);

  // Fetch suppliers to map names to IDs
  const { data: suppliers, error: suppErr } = await supabase
    .from('ord_suppliers')
    .select('id, name');

  if (suppErr || !suppliers) {
    console.error('Failed to fetch suppliers:', suppErr);
    process.exit(1);
  }

  const supplierMap = new Map(suppliers.map(s => [s.name, s.id]));
  console.log('Supplier mapping:', Object.fromEntries(supplierMap));

  let insertCount = 0;
  let skipCount = 0;
  const errors: string[] = [];

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
      unit_price: row['単価（円）'] ? Number(row['単価（円）']) : null,
      order_unit: row['発注単位'] || null,
      order_unit_quantity: row['発注単位あたり数量'] ? Number(row['発注単位あたり数量']) : null,
      is_visitor_linked: isVisitorLinked,
      consumption_per_visit: row['1施術あたり消費量'] ? Number(row['1施術あたり消費量']) : null,
      fixed_monthly_consumption: !isVisitorLinked && row['月間消費量（個別単位）'] ? Number(row['月間消費量（個別単位）']) : null,
      product_url: row['商品ページURL'] || null,
      notes: row['備考'] || null,
      auto_order_enabled: false,
      is_active: true,
    };

    const { error } = await supabase.from('ord_items').insert(item);
    if (error) {
      errors.push(`Failed to insert "${row['品目']}": ${error.message}`);
      skipCount++;
    } else {
      insertCount++;
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
}

main().catch(console.error);
