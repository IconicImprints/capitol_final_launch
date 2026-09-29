import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('Service Key:', supabaseServiceKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

// Service role key should bypass RLS, but we need to set the auth header properly
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  }
});

async function testConnection() {
  try {
    // Test basic connection
    const { error: testError } = await supabase.from('users').select('id').limit(1);
    if (testError) {
      console.error('❌ Connection test failed:', testError.message);
      process.exit(1);
    }
    console.log('✅ Connection successful');

    // Check existing tables
    const tables = [
      'users', 'sessions', 'rooms', 'room_members', 'proofs', 
      'streaks', 'achievements', 'user_achievements', 'notifications',
      'follows', 'challenges', 'close_friends', 'close_friend_requests',
      'freeze_tokens', 'waiting_queue', 'replacement_queue', 'config',
      'activity_log', 'moderation_events', 'user_strikes', 'prohibited_terms',
      'moderation_config'
    ];

    console.log('\nChecking tables...');
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (error) {
          console.log(`❌ ${table}: ${error.message}`);
        } else {
          console.log(`✅ ${table}: exists`);
        }
      } catch (e) {
        console.log(`❌ ${table}: ${e.message}`);
      }
    }

    // Check data counts
    console.log('\nChecking data counts...');
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    console.log(`Users: ${userCount || 0}`);

    const { count: roomCount } = await supabase.from('rooms').select('*', { count: 'exact', head: true });
    console.log(`Rooms: ${roomCount || 0}`);

    const { count: proofCount } = await supabase.from('proofs').select('*', { count: 'exact', head: true });
    console.log(`Proofs: ${proofCount || 0}`);

    console.log('\n✅ All tests completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testConnection();