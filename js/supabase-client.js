/**
 * Supabase Client Configuration
 */
console.log('[Supabase] Loading supabase-client.js...');

// Supabase configuration
const SUPABASE_URL = 'https://vpxtqlgzsokqexnbjioe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZweHRxbGd6c29rcWV4bmJqaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODU3MTUsImV4cCI6MjA4NTE2MTcxNX0.IbRZlyieSr5Kgfn6MQdC8PS2aCWjUPzOOIOcEPGn0CU';

// Initialize Supabase client
let supabaseClient = null;

function initSupabase() {
  console.log('[Supabase] initSupabase called');
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('[Supabase] Supabase JS library not loaded');
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] Client initialized successfully');
  }

  return supabaseClient;
}

// Export for use in other scripts - define immediately
window.getSupabaseClient = function() {
  if (!supabaseClient) {
    return initSupabase();
  }
  return supabaseClient;
};

console.log('[Supabase] window.getSupabaseClient defined:', typeof window.getSupabaseClient);
