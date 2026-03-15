import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://khpdyxacmpuaqvohpzdp.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGR5eGFjbXB1YXF2b2hwemRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ5MjQ5OSwiZXhwIjoyMDg5MDY4NDk5fQ.pndwB5V7--HBAYOODBC2L5T6wAVoySq3gRawoBgdVHE';

async function setupDatabase() {
  // Read schema SQL
  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Executing schema SQL via Supabase SQL API...');

  // Use the pg_net/SQL endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    console.log('RPC method not available, trying alternative approach...');

    // Alternative: split SQL into statements and execute via the supabase-js client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Try checking if tables already exist
    const { data: existingTables, error: checkError } = await supabase
      .from('ord_suppliers')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('Tables already exist! Checking data...');

      const { count: supplierCount } = await supabase
        .from('ord_suppliers')
        .select('*', { count: 'exact', head: true });

      const { count: itemCount } = await supabase
        .from('ord_items')
        .select('*', { count: 'exact', head: true });

      const { count: visitorCount } = await supabase
        .from('ord_visitor_stats')
        .select('*', { count: 'exact', head: true });

      console.log(`  ord_suppliers: ${supplierCount} rows`);
      console.log(`  ord_items: ${itemCount} rows`);
      console.log(`  ord_visitor_stats: ${visitorCount} rows`);
      console.log('\nDatabase is already set up!');
      return;
    }

    console.log('Tables do not exist yet.');
    console.log('\n========================================');
    console.log('MANUAL SETUP REQUIRED');
    console.log('========================================');
    console.log('Please execute the SQL in supabase/schema.sql');
    console.log('using the Supabase SQL Editor at:');
    console.log(`${SUPABASE_URL.replace('.supabase.co', '')}`);
    console.log('Dashboard → SQL Editor → New query → Paste & Run');
    console.log('========================================\n');
  } else {
    const result = await response.json();
    console.log('Schema executed successfully:', result);
  }
}

setupDatabase().catch(console.error);
