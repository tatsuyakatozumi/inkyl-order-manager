import XLSX from 'xlsx';

const workbook = XLSX.readFile('./統合発注管理_v10_棚卸し対応.xlsx');
console.log('Sheets:', workbook.SheetNames);

const sheet = workbook.Sheets['マスターデータ'];
if (!sheet) {
  // Try first sheet
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  console.log('\nFirst sheet headers (row 1):', rows[0]);
  console.log('Row 2:', rows[1]);
  console.log('Row 3:', rows[2]);
  console.log('Total rows:', rows.length);
} else {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log('\nHeaders (row 1):', rows[0]);
  console.log('Row 2 (first data):', rows[1]);
  console.log('Row 3:', rows[2]);
  console.log('Total rows:', rows.length);

  // Also check with named keys
  const namedRows = XLSX.utils.sheet_to_json(sheet);
  console.log('\nFirst row keys:', Object.keys(namedRows[0]));
  console.log('First row:', namedRows[0]);
  console.log('Total named rows:', namedRows.length);
}
