import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ CRITICAL: Supabase credentials not found.');
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('❌ The application cannot function without Supabase.');
  throw new Error('Supabase credentials are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role key (bypasses RLS for server operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Health check
async function healthCheck() {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    return { ok: true, database: 'connected' };
  } catch (error) {
    console.error('[Supabase] Health check failed:', error.message);
    return { ok: false, database: 'disconnected', error: error.message };
  }
}

// Run migrations (schema is managed in Supabase dashboard)
async function runMigrations() {
  console.log('[Supabase] Migrations are managed in Supabase dashboard');
  console.log('[Supabase] Apply the schema from supabase_complete_schema.sql manually');
  return { ok: true };
}

// Graceful shutdown
async function shutdown() {
  console.log('[Supabase] Client shutdown complete');
}

// Check if database is connected
function isDatabaseConnected() {
  return true; // Supabase client is always "connected" in this context
}

// Direct SQL query compatibility layer
// This converts common PostgreSQL query patterns to Supabase queries
async function query(text, params) {
  const start = Date.now();
  
  try {
    const result = await convertPostgresToSupabase(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Supabase] Query executed', { text: text.substring(0, 50), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('[Supabase] Query error:', error.message);
    console.error('[Supabase] Failed query:', text.substring(0, 100));
    throw error;
  }
}

// Transaction helper (simplified for Supabase)
async function transaction(callback) {
  try {
    // For Supabase, we'll execute operations sequentially
    // In a real implementation, you'd use Supabase RPC functions for true transactions
    const result = await callback(supabase);
    return result;
  } catch (error) {
    console.error('[Supabase] Transaction error:', error);
    throw error;
  }
}

// Convert PostgreSQL queries to Supabase queries
async function convertPostgresToSupabase(text, params) {
  const lowerText = text.toLowerCase().trim();
  
  // Parse the query type and route to appropriate handler
  if (lowerText.startsWith('select')) {
    return handleSelect(text, params);
  } else if (lowerText.startsWith('insert')) {
    return handleInsert(text, params);
  } else if (lowerText.startsWith('update')) {
    return handleUpdate(text, params);
  } else if (lowerText.startsWith('delete')) {
    return handleDelete(text, params);
  } else {
    throw new Error(`Unsupported query type: ${text.substring(0, 20)}`);
  }
}

// Handle SELECT queries
async function handleSelect(text, params) {
  // Extract table name
  const tableMatch = text.match(/from\s+(\w+)/i);
  if (!tableMatch) throw new Error('Could not parse table name from SELECT');
  const tableName = tableMatch[1];
  
  // Check for JOIN operations
  const joinMatch = text.match(/join\s+(\w+)\s+on\s+(.+)/i);
  let selectColumns = '*';
  if (joinMatch) {
    // Handle simple joins by selecting related data
    selectColumns = text.match(/select\s+(.+?)\s+from/i)?.[1] || '*';
  }
  
  let query = supabase.from(tableName).select(selectColumns);
  
  // Handle WHERE clause
  const whereMatch = text.match(/where\s+(.+?)(?:\s+order\s+by|\s+limit|\s+group\s+by|\s+offset|$)/i);
  if (whereMatch) {
    applyWhereClause(query, whereMatch[1], params);
  }
  
  // Handle ORDER BY
  const orderMatch = text.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
  if (orderMatch) {
    const column = orderMatch[1];
    const ascending = !orderMatch[2] || orderMatch[2].toLowerCase() === 'asc';
    query = query.order(column, { ascending });
  }
  
  // Handle LIMIT
  const limitMatch = text.match(/limit\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }
  
  // Handle OFFSET
  const offsetMatch = text.match(/offset\s+(\d+)/i);
  if (offsetMatch) {
    query = query.range(parseInt(offsetMatch[1]), parseInt(offsetMatch[1]) + (limitMatch ? parseInt(limitMatch[1]) - 1 : 999));
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

// Handle INSERT queries
async function handleInsert(text, params) {
  const tableMatch = text.match(/insert\s+into\s+(\w+)/i);
  if (!tableMatch) throw new Error('Could not parse table name from INSERT');
  const tableName = tableMatch[1];
  
  // Parse columns and values
  const columnsMatch = text.match(/\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
  if (!columnsMatch) throw new Error('Could not parse INSERT columns/values');
  
  const columns = columnsMatch[1].split(',').map(c => c.trim());
  const values = parseValues(columnsMatch[2], params);
  
  const rowData = {};
  columns.forEach((col, i) => {
    rowData[col] = values[i];
  });
  
  // Check for ON CONFLICT
  const onConflictMatch = text.match(/on\s+conflict\s*\(([^)]+)\)\s*do\s+(update|nothing)/i);
  
  let query = supabase.from(tableName).insert([rowData]);
  
  if (onConflictMatch) {
    const conflictColumns = onConflictMatch[1].split(',').map(c => c.trim());
    query = query.onConflict(conflictColumns[0]); // Supabase supports single column conflict
    
    if (onConflictMatch[2].toLowerCase() === 'update') {
      // Parse DO UPDATE SET clause
      const updateMatch = text.match(/do\s+update\s+set\s+(.+?)(?:\s+where|$)/i);
      if (updateMatch) {
        const updates = parseSetClause(updateMatch[1], params);
        query = query.select(); // Return updated data
      }
    }
  } else {
    query = query.select();
  }
  
  const { data, error } = await query;
  
  if (error) {
    // Convert Supabase errors to PostgreSQL-like errors
    if (error.code === '23505') {
      const pgError = new Error('Resource already exists');
      pgError.code = '23505';
      throw pgError;
    }
    throw error;
  }
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

// Handle UPDATE queries
async function handleUpdate(text, params) {
  const tableMatch = text.match(/update\s+(\w+)/i);
  if (!tableMatch) throw new Error('Could not parse table name from UPDATE');
  const tableName = tableMatch[1];
  
  // Parse SET clause
  const setMatch = text.match(/set\s+(.+?)\s+where/i);
  if (!setMatch) throw new Error('Could not parse UPDATE SET clause');
  
  const updates = parseSetClause(setMatch[1], params);
  
  // Parse WHERE clause
  const whereMatch = text.match(/where\s+(.+?)(?:\s+returning|$)/i);
  if (!whereMatch) throw new Error('Could not parse UPDATE WHERE clause');
  
  let query = supabase.from(tableName).update(updates);
  applyWhereClause(query, whereMatch[1], params);
  
  // Handle RETURNING
  const returningMatch = text.match(/returning\s+(.+)/i);
  if (returningMatch) {
    query = query.select();
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

// Handle DELETE queries
async function handleDelete(text, params) {
  const tableMatch = text.match(/delete\s+from\s+(\w+)/i);
  if (!tableMatch) throw new Error('Could not parse table name from DELETE');
  const tableName = tableMatch[1];
  
  // Parse WHERE clause
  const whereMatch = text.match(/where\s+(.+?)(?:\s+returning|$)/i);
  if (!whereMatch) throw new Error('Could not parse DELETE WHERE clause');
  
  let query = supabase.from(tableName).delete();
  applyWhereClause(query, whereMatch[1], params);
  
  // Handle RETURNING
  const returningMatch = text.match(/returning\s+(.+)/i);
  if (returningMatch) {
    query = query.select();
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

// Apply WHERE clause to Supabase query
function applyWhereClause(query, clause, params) {
  // Simple WHERE clause parser for common patterns
  const conditions = clause.split(/\s+and\s+/i);
  
  conditions.forEach(condition => {
    // Handle simple equality: column = $1
    const paramMatch = condition.match(/(\w+)\s*=\s*\$(\d+)/i);
    if (paramMatch) {
      const column = paramMatch[1];
      const paramIndex = parseInt(paramMatch[2]) - 1;
      query = query.eq(column, params[paramIndex]);
      return;
    }
    
    // Handle simple equality with value: column = 'value'
    const valueMatch = condition.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/i);
    if (valueMatch) {
      const column = valueMatch[1];
      const value = valueMatch[2];
      query = query.eq(column, value);
      return;
    }
    
    // Handle inequality: column != $1
    const notEqualMatch = condition.match(/(\w+)\s*!=\s*\$(\d+)/i);
    if (notEqualMatch) {
      const column = notEqualMatch[1];
      const paramIndex = parseInt(notEqualMatch[2]) - 1;
      query = query.neq(column, params[paramIndex]);
      return;
    }
    
    // Handle greater than: column > $1
    const gtMatch = condition.match(/(\w+)\s*>\s*\$(\d+)/i);
    if (gtMatch) {
      const column = gtMatch[1];
      const paramIndex = parseInt(gtMatch[2]) - 1;
      query = query.gt(column, params[paramIndex]);
      return;
    }
    
    // Handle less than: column < $1
    const ltMatch = condition.match(/(\w+)\s*<\s*\$(\d+)/i);
    if (ltMatch) {
      const column = ltMatch[1];
      const paramIndex = parseInt(ltMatch[2]) - 1;
      query = query.lt(column, params[paramIndex]);
      return;
    }
    
    // Handle IN clause: column = ANY($1)
    const anyMatch = condition.match(/(\w+)\s*=\s*any\(\$(\d+)\)/i);
    if (anyMatch) {
      const column = anyMatch[1];
      const paramIndex = parseInt(anyMatch[2]) - 1;
      query = query.in(column, params[paramIndex]);
      return;
    }
    
    // Handle LIKE: column LIKE $1
    const likeMatch = condition.match(/(\w+)\s+like\s+\$(\d+)/i);
    if (likeMatch) {
      const column = likeMatch[1];
      const paramIndex = parseInt(likeMatch[2]) - 1;
      // Convert SQL LIKE pattern to Supabase ilike
      query = query.ilike(column, params[paramIndex]);
      return;
    }
    
    console.warn('[Supabase] Unsupported WHERE condition:', condition);
  });
}

// Parse SET clause
function parseSetClause(clause, params) {
  const updates = {};
  const assignments = clause.split(',');
  
  assignments.forEach(assignment => {
    // Handle parameter reference: column = $1
    const paramMatch = assignment.match(/(\w+)\s*=\s*\$(\d+)/i);
    if (paramMatch) {
      const column = paramMatch[1];
      const paramIndex = parseInt(paramMatch[2]) - 1;
      updates[column] = params[paramIndex];
      return;
    }
    
    // Handle direct value: column = 'value'
    const valueMatch = assignment.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/i);
    if (valueMatch) {
      const column = valueMatch[1];
      const value = valueMatch[2];
      updates[column] = value;
      return;
    }
    
    // Handle function calls: column = NOW()
    const funcMatch = assignment.match(/(\w+)\s*=\s*(\w+)\(\)/i);
    if (funcMatch) {
      const column = funcMatch[1];
      const func = funcMatch[2].toLowerCase();
      if (func === 'now') {
        updates[column] = new Date().toISOString();
      }
      return;
    }
    
    // Handle array operations: column = array_append(column, $1)
    const arrayAppendMatch = assignment.match(/(\w+)\s*=\s*array_append\((\w+),\s*\$(\d+)\)/i);
    if (arrayAppendMatch) {
      const column = arrayAppendMatch[1];
      const paramIndex = parseInt(arrayAppendMatch[3]) - 1;
      // This is complex - we'd need to fetch current value, append, and update
      // For now, skip and let the caller handle it
      console.warn('[Supabase] Complex array operation not supported:', assignment);
      return;
    }
    
    console.warn('[Supabase] Unsupported SET assignment:', assignment);
  });
  
  return updates;
}

// Parse VALUES clause
function parseValues(clause, params) {
  const values = [];
  const items = clause.split(',');
  
  items.forEach(item => {
    const trimmed = item.trim();
    
    // Handle parameter reference: $1
    if (trimmed.startsWith('$')) {
      const paramIndex = parseInt(trimmed.substring(1)) - 1;
      values.push(params[paramIndex]);
    } 
    // Handle string literal: 'value'
    else if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
      values.push(trimmed.slice(1, -1));
    }
    // Handle function calls: NOW()
    else if (trimmed.match(/^\w+\(\)$/i)) {
      const func = trimmed.toLowerCase().replace('()', '');
      if (func === 'now') {
        values.push(new Date().toISOString());
      } else {
        values.push(trimmed);
      }
    }
    // Handle JSON literals: '{}' or '[]'
    else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        values.push(JSON.parse(trimmed));
      } catch {
        values.push(trimmed);
      }
    }
    // Handle boolean literals
    else if (trimmed.toLowerCase() === 'true') {
      values.push(true);
    } else if (trimmed.toLowerCase() === 'false') {
      values.push(false);
    }
    // Handle numbers
    else if (!isNaN(trimmed)) {
      values.push(parseFloat(trimmed));
    }
    // Default: treat as string
    else {
      values.push(trimmed);
    }
  });
  
  return values;
}

export { supabase, query, transaction, runMigrations, healthCheck, shutdown, isDatabaseConnected };
