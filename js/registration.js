/**
 * Pre-registration functionality
 * Handles email registration and questionnaire submission to Supabase
 */

// Store registration ID for questionnaire update
let currentRegistrationId = null;

/**
 * Get remaining count from settings table
 * @returns {Promise<number>} Remaining count
 */
async function getCount() {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', 'remaining_count')
    .single();

  if (error) {
    console.error('[Registration] Failed to get count:', error);
    throw error;
  }

  return Number(data.value);
}

/**
 * Register a new email
 * @param {string} email - User's email address
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function register(email) {
  const client = window.getSupabaseClient();
  if (!client) {
    return { success: false, error: 'client_not_initialized' };
  }

  // Check remaining count first
  try {
    const count = await getCount();
    if (count <= 0) {
      return { success: false, error: 'registration_closed' };
    }
  } catch (e) {
    console.error('[Registration] Count check failed:', e);
    // Continue with registration even if count check fails
  }

  // Insert registration
  const { data, error } = await client
    .from('registrations')
    .insert({ email })
    .select('id')
    .single();

  if (error) {
    console.error('[Registration] Insert failed:', error);
    if (error.code === '23505') {
      return { success: false, error: 'duplicate_email' };
    }
    return { success: false, error: error.message };
  }

  console.log('[Registration] Success:', data.id);
  return { success: true, id: data.id };
}

/**
 * Update registration with questionnaire data
 * @param {string} id - Registration ID
 * @param {string} name - User's name
 * @param {string} company - Company name
 * @param {string} position - Job position
 * @returns {Promise<void>}
 */
async function updateQuestionnaire(id, name, company, position) {
  const client = window.getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await client
    .from('registrations')
    .update({
      name: name || null,
      company: company || null,
      position: position || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('[Registration] Update failed:', error);
    throw error;
  }

  console.log('[Registration] Questionnaire updated');
}

/**
 * Initialize count display on page load
 */
async function initCount() {
  try {
    const count = await getCount();
    if (typeof updateCount === 'function') {
      updateCount(count);
    }
    console.log('[Registration] Initial count:', count);
  } catch (e) {
    console.error('[Registration] Failed to initialize count:', e);
  }
}

// Export functions for use in HTML
window.registrationAPI = {
  getCount,
  register,
  updateQuestionnaire,
  initCount,
  getCurrentRegistrationId: () => currentRegistrationId,
  setCurrentRegistrationId: (id) => { currentRegistrationId = id; }
};
