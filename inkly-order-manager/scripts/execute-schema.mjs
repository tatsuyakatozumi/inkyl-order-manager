import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Supabase PostgreSQL connection (transaction mode)
const connectionString = `postgresql://postgres.khpdyxacmpuaqvohpzdp:${process.env.SUPABASE_DB_PASSWORD}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;

// Alternative: direct connection
const directConnection = `postgresql://postgres.khpdyxacmpuaqvohpzdp:${process.env.SUPABASE_DB_PASSWORD}@db.khpdyxacmpuaqvohpzdp.supabase.co:5432/postgres`;

async function main() {
  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // Try session mode connection first (port 5432 direct)
  const connStr = process.env.SUPABASE_DB_PASSWORD ? directConnection : null;

  if (!connStr) {
    console.log('SUPABASE_DB_PASSWORD not set.');
    console.log('\n========================================');
    console.log('Please run with:');
    console.log('  SUPABASE_DB_PASSWORD=<your-db-password> node scripts/execute-schema.mjs');
    console.log('\nOr manually execute the SQL in Supabase SQL Editor:');
    console.log('  1. Go to https://supabase.com/dashboard/project/khpdyxacmpuaqvohpzdp/sql');
    console.log('  2. Click "New query"');
    console.log('  3. Paste the contents of supabase/schema.sql');
    console.log('  4. Click "Run"');
    console.log('========================================');
    return;
  }

  console.log('Connecting to Supabase PostgreSQL...');
  const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected! Executing schema...');
    await client.query(sql);
    console.log('Schema executed successfully!');

    // Verify
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ord_%' ORDER BY table_name");
    console.log('\nCreated tables:');
    res.rows.forEach(r => console.log(`  - ${r.table_name}`));

    const supplierCount = await client.query('SELECT count(*) FROM ord_suppliers');
    const visitorCount = await client.query('SELECT count(*) FROM ord_visitor_stats');
    console.log(`\nInitial data:`);
    console.log(`  ord_suppliers: ${supplierCount.rows[0].count} rows`);
    console.log(`  ord_visitor_stats: ${visitorCount.rows[0].count} rows`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
