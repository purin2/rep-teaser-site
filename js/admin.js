/**
 * Admin Dashboard Logic
 * Handles authentication, dashboard stats, and registration management
 */

// Pagination state
let currentPage = 1;
const pageSize = 20;
let currentSearchQuery = '';

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
async function checkAuth() {
  const client = window.getSupabaseClient();
  if (!client) return false;

  const { data: { session } } = await client.auth.getSession();
  return session !== null;
}

/**
 * Login with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function login(email, password) {
  const client = window.getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabaseクライアント未初期化' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('[Admin] Login failed:', error);
      return { success: false, error: error.message };
    }

    console.log('[Admin] Login successful', data);
    return { success: true };
  } catch (err) {
    console.error('[Admin] Login exception:', err);
    return { success: false, error: err.message || '接続エラー' };
  }
}

/**
 * Logout current user
 */
async function logout() {
  const client = window.getSupabaseClient();
  if (!client) return;

  await client.auth.signOut();
  console.log('[Admin] Logged out');
  window.location.reload();
}

/**
 * Get dashboard statistics
 * @returns {Promise<{remaining_count: number, total: number, today: number}>}
 */
async function getDashboardStats() {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Client not initialized');
  }

  const today = new Date().toISOString().split('T')[0];

  const [countRes, totalRes, todayRes] = await Promise.all([
    client.from('settings').select('value').eq('key', 'remaining_count').single(),
    client.from('registrations').select('id', { count: 'exact', head: true }),
    client.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', today)
  ]);

  return {
    remaining_count: Number(countRes.data?.value ?? 0),
    total: totalRes.count ?? 0,
    today: todayRes.count ?? 0
  };
}

/**
 * Update remaining count
 * @param {number} newCount
 */
async function updateRemainingCount(newCount) {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Client not initialized');
  }

  // Validate input
  if (typeof newCount !== 'number' || newCount < 0) {
    throw new Error('Invalid count value');
  }

  const { data: { user } } = await client.auth.getUser();

  // Get current value for audit log
  const { data: current } = await client
    .from('settings')
    .select('value')
    .eq('key', 'remaining_count')
    .single();

  // Update settings
  const { error: updateError } = await client
    .from('settings')
    .update({
      value: newCount.toString(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id
    })
    .eq('key', 'remaining_count');

  if (updateError) {
    console.error('[Admin] Update failed:', updateError);
    throw updateError;
  }

  // Create audit log
  const { error: auditError } = await client
    .from('audit_logs')
    .insert({
      action: 'UPDATE',
      table_name: 'settings',
      record_id: 'remaining_count',
      old_value: { count: current?.value },
      new_value: { count: newCount },
      performed_by: user?.id
    });

  if (auditError) {
    console.error('[Admin] Audit log failed:', auditError);
    // Don't throw - audit log failure shouldn't block the operation
  }

  console.log('[Admin] Remaining count updated to:', newCount);
}

/**
 * Get registrations with pagination and search
 * @param {number} page
 * @param {number} limit
 * @param {string} query
 * @returns {Promise<{data: Array, count: number}>}
 */
async function getRegistrations(page = 1, limit = 20, query = '') {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Client not initialized');
  }

  const offset = (page - 1) * limit;
  let q = client
    .from('registrations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (query) {
    q = q.or(`email.ilike.%${query}%,name.ilike.%${query}%,company.ilike.%${query}%`);
  }

  const { data, count, error } = await q;

  if (error) {
    console.error('[Admin] Get registrations failed:', error);
    throw error;
  }

  return { data: data ?? [], count: count ?? 0 };
}

/**
 * Export all registrations to CSV
 */
async function exportCSV() {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Client not initialized');
  }

  const { data, error } = await client
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Admin] Export failed:', error);
    throw error;
  }

  // Build CSV
  const headers = ['ID', 'Email', '氏名', '会社名', '役職', '登録日時'];
  const rows = data?.map(r => [
    r.id,
    `"${(r.email || '').replace(/"/g, '""')}"`,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${(r.company || '').replace(/"/g, '""')}"`,
    `"${(r.position || '').replace(/"/g, '""')}"`,
    r.created_at
  ]) ?? [];

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // Add BOM for Excel compatibility
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `registrations_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('[Admin] CSV exported');
}

/**
 * Delete a registration
 * @param {string} id
 */
async function deleteRegistration(id) {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Client not initialized');
  }

  const { error } = await client
    .from('registrations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Admin] Delete failed:', error);
    throw error;
  }

  console.log('[Admin] Registration deleted:', id);
}

// Export functions for use in HTML
window.adminAPI = {
  checkAuth,
  login,
  logout,
  getDashboardStats,
  updateRemainingCount,
  getRegistrations,
  exportCSV,
  deleteRegistration,
  // Pagination helpers
  getCurrentPage: () => currentPage,
  setCurrentPage: (page) => { currentPage = page; },
  getPageSize: () => pageSize,
  getSearchQuery: () => currentSearchQuery,
  setSearchQuery: (query) => { currentSearchQuery = query; }
};
