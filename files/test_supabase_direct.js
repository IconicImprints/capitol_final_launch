import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase connection with direct SQL...');
console.log('URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('Service Key:', supabaseServiceKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

// Use the direct REST API with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testConnection() {
  try {
    // First, let's try to get the schema information using RPC
    console.log('\nTesting with RPC function...');
    
    // Try to create a simple RPC function to bypass RLS
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_all_users');
    
    if (rpcError) {
      console.log('RPC function not available:', rpcError.message);
      
      // Try direct query with service role bypass
      console.log('\nTrying direct query with service role...');
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error('❌ Direct query failed:', error.message);
        console.error('Error details:', error);
        
        // Try to get table information
        console.log('\nTrying to get table information...');
        const { data: tableData, error: tableError } = await supabase
          .from('users')
          .select('id')
          .limit(1);
        
        if (tableError) {
          console.error('❌ Table access failed:', tableError.message);
        } else {
          console.log('✅ Table access works');
        }
      } else {
        console.log('✅ Direct query works');
        console.log('Sample data:', data);
      }
    } else {
      console.log('✅ RPC function works');
      console.log('Sample data:', rpcData);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testConnection();