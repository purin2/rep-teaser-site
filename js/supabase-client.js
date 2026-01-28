/**
 * Supabase Client Configuration
 *
 * IMPORTANT: Replace these values with your actual Supabase project credentials
 * Get them from: https://supabase.com/dashboard/project/[YOUR_PROJECT]/settings/api
 */

// Supabase configuration - UPDATE THESE VALUES
const SUPABASE_URL = 'https://vpxtqlgzsokqexnbjioe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZweHRxbGd6c29rcWV4bmJqaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODU3MTUsImV4cCI6MjA4NTE2MTcxNX0.IbRZlyieSr5Kgfn6MQdC8PS2aCWjUPzOOIOcEPGn0CU';

// Validate configuration
if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
  console.warn('[Supabase] Configuration not set. Please update SUPABASE_URL and SUPABASE_ANON_KEY in js/supabase-client.js');
}

// Initialize Supabase client
let supabase = null;

function initSupabase() {
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('[Supabase] Supabase JS library not loaded. Make sure to include the CDN script.');
    return null;
  }

  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] Client initialized');
  }

  return supabase;
}

// Export for use in other scripts
window.getSupabaseClient = function () {
  if (!supabase) {
    return initSupabase();
  }
  return supabase;
};
