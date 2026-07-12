import supabase from './supabaseClient.js';
import { showToast } from './helpers.js';

let currentAdminTab = 'users';

// Helper: get current Puter.js user ID
function getPuterUserId() {
    if (typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn() && puter.auth.getUser) {
        // Puter.js getUser() returns a promise, but we need the UUID synchronously for some calls
        // We cache it after first fetch
        return window.__puterUserId || null;
    }
    return null;
}

// Fetch and cache Puter user ID
async function fetchPuterUserId() {
    if (window.__puterUserId) return window.__puterUserId;
    console.log('[Admin] Checking Puter auth...', {
        puterDefined: typeof puter !== 'undefined',
        authExists: typeof puter !== 'undefined' && !!puter.auth,
        isSignedIn: typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn()
    });
    if (typeof puter === 'undefined' || !puter.auth || !puter.auth.isSignedIn()) return null;
    try {
        const user = await puter.auth.getUser();
        console.log('[Admin] Puter user object:', user);
        window.__puterUserId = user.uuid || user.id || user.accountId;
        return window.__puterUserId;
    } catch (e) {
        console.warn('Failed to get Puter user ID:', e);
        return null;
    }
}

// Sync Puter.js user profile to Supabase
export async function syncProfileToSupabase() {
    const userId = await fetchPuterUserId();
    if (!userId) return null;

    try {
        const puterUser = await puter.auth.getUser();
        const email = puterUser.email || '';
        const displayName = puterUser.username || 'User';

        // Check if profile exists
        const { data: existing } = await supabase.from('profiles').select('*').eq('id', userId).single();

        if (existing) {
            // Update last seen
            await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', userId);
            return existing;
        }

        // Create new profile
        const { data: newProfile, error } = await supabase.from('profiles').insert({
            id: userId,
            email: email,
            display_name: displayName,
            plan: 'free',
            is_admin: false
        }).select().single();

        if (error) throw error;
        return newProfile;
    } catch (e) {
        console.warn('Profile sync failed:', e);
        return null;
    }
}

// Guard: only admins can access
export async function isAdmin() {
    const userId = await fetchPuterUserId();
    if (!userId) return false;
    try {
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
        return data?.is_admin === true;
    } catch (e) {
        console.warn('Admin check failed:', e);
        return false;
    }
}

export async function getCurrentProfile() {
    const userId = await fetchPuterUserId();
    if (!userId) return null;
    try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        return data;
    } catch (e) {
        console.warn('Profile fetch failed:', e);
        return null;
    }
}

export async function hasFeatureAccess(flagName) {
    const profile = await getCurrentProfile();
    if (!profile) return false;
    try {
        const { data } = await supabase.from('feature_flags').select('allowed_plans').eq('flag_name', flagName).single();
        return data?.allowed_plans?.includes(profile.plan) ?? false;
    } catch (e) {
        console.warn('Feature access check failed:', e);
        return false;
    }
}

export async function checkQuizLimits() {
    const profile = await getCurrentProfile();
    if (!profile) return { allowed: false, reason: 'Not signed in', profile: null };

    const hasUnlimited = await hasFeatureAccess('unlimited_quizzes');
    if (hasUnlimited) return { allowed: true, reason: null, profile };

    if (profile.quizzes_generated >= profile.quizzes_limit) {
        return {
            allowed: false,
            reason: `Free plan limit reached (${profile.quizzes_limit} quizzes). Upgrade to Pro for unlimited.`,
            profile
        };
    }
    return { allowed: true, reason: null, profile };
}

export async function incrementQuizCount() {
    const userId = await fetchPuterUserId();
    if (!userId) return;
    try {
        await supabase.rpc('increment_quiz_count', { p_user_id: userId });
    } catch (e) {
        console.warn('Failed to increment quiz count:', e);
    }
}

// ==========================================
// SHARE LIMITS
// ==========================================

const SHARE_LIMITS = {
    free: 3,
    pro: Infinity,
    enterprise: Infinity
};

export function getActiveShareCount() {
    const now = Date.now();
    let count = 0;
    try {
        const history = JSON.parse(localStorage.getItem('AIQuizGeneratorDB_v4') || '{}');
        for (const quiz of Object.values(history)) {
            if (quiz.share && quiz.share.isShared && quiz.share.expiryTimestamp > now) {
                count++;
            }
        }
    } catch (e) {
        console.warn('Failed to count active shares:', e);
    }
    return count;
}

export async function canShare() {
    const profile = await getCurrentProfile();
    if (!profile) return { allowed: false, reason: 'Not signed in', remaining: 0 };

    const limit = SHARE_LIMITS[profile.plan] ?? SHARE_LIMITS.free;
    const active = getActiveShareCount();
    const remaining = Math.max(0, limit - active);

    if (active >= limit) {
        return {
            allowed: false,
            reason: `Share limit reached (${limit} active links). Upgrade to Pro for unlimited.`,
            remaining: 0
        };
    }
    return { allowed: true, reason: null, remaining };
}

export async function logQuizAnalytics(quizData) {
    const userId = await fetchPuterUserId();
    try {
        await supabase.from('quiz_analytics').insert({
            user_id: userId || null,
            quiz_id: quizData.id,
            questions_count: quizData.questionsCount,
            score: quizData.score,
            time_spent_seconds: quizData.timeSpent,
            completed: quizData.completed
        });
    } catch (e) {
        console.warn('Analytics log failed:', e);
    }
}

// ==========================================
// ADMIN PANEL UI
// ==========================================

export async function initAdmin() {
    const userId = await fetchPuterUserId();
    console.log('[Admin] Puter user ID:', userId);
    if (!userId) {
        console.log('[Admin] No Puter user ID — skipping admin init');
        return false;
    }

    const adminStatus = await isAdmin();
    console.log('[Admin] Is admin:', adminStatus);
    if (!adminStatus) return false;

    setupAdminNavButtons();
    setupAdminTabListeners();
    console.log('[Admin] Admin panel initialized');
    return true;
}

// Show/hide admin buttons based on current auth state
// Called after login/logout to update UI in real time
export async function refreshAdminVisibility() {
    const adminStatus = await isAdmin();

    // If admin but buttons don't exist yet, create them
    if (adminStatus && !document.getElementById('desktop-nav-admin-btn')) {
        setupAdminNavButtons();
        setupAdminTabListeners();
    }

    const desktopBtn = document.getElementById('desktop-nav-admin-btn');
    const mobileBtn = document.getElementById('mobile-menu-admin-btn');

    if (desktopBtn) desktopBtn.classList.toggle('hidden', !adminStatus);
    if (mobileBtn) mobileBtn.classList.toggle('hidden', !adminStatus);

    // If on admin view but not admin anymore, redirect to start
    if (!adminStatus && document.getElementById('admin-view')?.classList.contains('active')) {
        const { showView } = await import('./helpers.js');
        showView('start');
        showToast('Admin access revoked.', 3000, 'warning');
    }
}

function setupAdminNavButtons() {
    // Desktop sidebar admin button
    const desktopNav = document.querySelector('#desktop-nav-home-btn')?.closest('.space-y-2');
    if (desktopNav && !document.getElementById('desktop-nav-admin-btn')) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'desktop-nav-admin-btn';
        adminBtn.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors duration-200';
        adminBtn.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Admin</span>
        `;
        adminBtn.onclick = () => openAdminView();
        desktopNav.appendChild(adminBtn);
    }

    // Mobile menu admin button
    const mobileMenu = document.querySelector('#mobile-menu-modal .space-y-3');
    if (mobileMenu && !document.getElementById('mobile-menu-admin-btn')) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'mobile-menu-admin-btn';
        adminBtn.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-md text-gray-300 bg-gray-700/30 hover:bg-gray-700 transition-colors duration-150';
        adminBtn.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Admin</span>
        `;
        adminBtn.onclick = () => {
            document.getElementById('mobile-menu-modal')?.classList.add('hidden');
            openAdminView();
        };
        mobileMenu.appendChild(adminBtn);
    }
}

function setupAdminTabListeners() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = btn.dataset.adminTab;
            switchAdminTab(tab);
        });
    });
}

function switchAdminTab(tab) {
    currentAdminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.add('hidden'));
    document.getElementById(`admin-${tab}-tab`)?.classList.remove('hidden');

    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
        btn.classList.toggle('text-white', btn.dataset.adminTab === tab);
        btn.classList.toggle('bg-blue-600/20', btn.dataset.adminTab === tab);
    });

    if (tab === 'users') loadUsers();
    else if (tab === 'analytics') loadAnalytics();
    else if (tab === 'features') loadFeatureFlags();
    else if (tab === 'settings') loadSettings();
}

async function openAdminView() {
    const { showView } = await import('./helpers.js');
    showView('admin');
    loadUsers();
    loadAnalytics();
    loadFeatureFlags();
    loadSettings();
}

// ==========================================
// USER MANAGEMENT
// ==========================================

async function loadUsers() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) {
        console.warn('[Admin] Could not find #admin-users-table-body');
        return;
    }
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">Loading users...</td></tr>';

    try {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('[Admin] Profiles query error:', error);
            throw error;
        }
        console.log('[Admin] Loaded profiles:', data?.length, data);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(u => `
            <tr class="border-t border-gray-700/50">
                <td class="py-3 px-4 text-sm text-white font-medium truncate max-w-[200px]" title="${u.email || ''}">${u.display_name || u.email || 'N/A'}</td>
                <td class="py-3 px-4">
                    <select onchange="window.__adminUpdatePlan('${u.id}', this.value)" class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                        <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free</option>
                        <option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Pro</option>
                        <option value="enterprise" ${u.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                    </select>
                </td>
                <td class="py-3 px-4 text-sm text-gray-300">${u.quizzes_generated || 0} / ${u.quizzes_limit || 5}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${u.is_admin ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-600/30 text-gray-400'}">
                        ${u.is_admin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td class="py-3 px-4 text-xs text-gray-400">${new Date(u.created_at).toLocaleDateString()}</td>
                <td class="py-3 px-4">
                    <button onclick="window.__adminToggleAdmin('${u.id}', ${!u.is_admin})" class="text-xs px-2 py-1 rounded ${u.is_admin ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40'} transition-colors">
                        ${u.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Failed to load users:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red-400 py-4">Failed to load users.</td></tr>';
    }
}

window.__adminUpdatePlan = async (userId, plan) => {
    try {
        const { error } = await supabase.from('profiles').update({ plan, updated_at: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        showToast(`Plan updated to ${plan}`, 2000, 'success');
    } catch (e) {
        console.error('Failed to update plan:', e);
        showToast('Failed to update plan', 3000, 'error');
    }
};

window.__adminToggleAdmin = async (userId, makeAdmin) => {
    try {
        const { error } = await supabase.from('profiles').update({ is_admin: makeAdmin, updated_at: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        showToast(makeAdmin ? 'User promoted to admin' : 'Admin rights removed', 2000, 'success');
        loadUsers();
    } catch (e) {
        console.error('Failed to toggle admin:', e);
        showToast('Failed to update admin status', 3000, 'error');
    }
};

// ==========================================
// ANALYTICS
// ==========================================

async function loadAnalytics() {
    try {
        const [
            { count: totalUsers },
            { count: totalQuizzes },
            { count: paidUsers },
            { data: recentActivity }
        ] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }),
            supabase.from('quiz_analytics').select('*', { count: 'exact', head: true }),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('plan', 'free'),
            supabase.from('quiz_analytics').select('created_at').gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        const statTotalUsers = document.getElementById('stat-total-users');
        const statTotalQuizzes = document.getElementById('stat-total-quizzes');
        const statPaidUsers = document.getElementById('stat-paid-users');
        const statActiveWeek = document.getElementById('stat-active-week');

        if (statTotalUsers) statTotalUsers.textContent = totalUsers || 0;
        if (statTotalQuizzes) statTotalQuizzes.textContent = totalQuizzes || 0;
        if (statPaidUsers) statPaidUsers.textContent = paidUsers || 0;
        if (statActiveWeek) statActiveWeek.textContent = recentActivity?.length || 0;
    } catch (e) {
        console.error('Failed to load analytics:', e);
    }
}

// ==========================================
// FEATURE FLAGS
// ==========================================

async function loadFeatureFlags() {
    const container = document.getElementById('feature-flags-list');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-sm">Loading feature flags...</p>';

    try {
        const { data, error } = await supabase.from('feature_flags').select('*').order('created_at');
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">No feature flags configured.</p>';
            return;
        }

        container.innerHTML = data.map(f => `
            <div class="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700/50 mb-2">
                <div class="flex items-center gap-3">
                    <input type="checkbox" ${f.enabled ? 'checked' : ''} onchange="window.__adminToggleFlag('${f.flag_name}', this.checked)" class="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 cursor-pointer">
                    <div>
                        <span class="text-sm font-medium text-white">${f.flag_name}</span>
                        <p class="text-xs text-gray-400">${f.description || ''}</p>
                    </div>
                </div>
                <span class="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">${f.allowed_plans?.join(', ') || 'all'}</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load feature flags:', e);
        container.innerHTML = '<p class="text-red-400 text-sm">Failed to load feature flags.</p>';
    }
}

window.__adminToggleFlag = async (flagName, enabled) => {
    try {
        const { error } = await supabase.from('feature_flags').update({ enabled }).eq('flag_name', flagName);
        if (error) throw error;
        showToast(`Feature "${flagName}" ${enabled ? 'enabled' : 'disabled'}`, 2000, 'success');
    } catch (e) {
        console.error('Failed to toggle flag:', e);
        showToast('Failed to update feature flag', 3000, 'error');
    }
};

// ==========================================
// SITE SETTINGS
// ==========================================

async function loadSettings() {
    const container = document.getElementById('site-settings-form');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-sm">Loading settings...</p>';

    try {
        const { data, error } = await supabase.from('site_settings').select('*').order('key');
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">No site settings configured.</p>';
            return;
        }

        container.innerHTML = data.map(s => {
            const value = typeof s.value === 'object' ? JSON.stringify(s.value) : s.value;
            return `
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-300 mb-1">${s.key}</label>
                    <input type="text" value="${value.replace(/"/g, '&quot;')}" data-setting-key="${s.key}" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
            `;
        }).join('') + `
            <button onclick="window.__adminSaveSettings()" class="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition text-sm">Save Settings</button>
        `;
    } catch (e) {
        console.error('Failed to load settings:', e);
        container.innerHTML = '<p class="text-red-400 text-sm">Failed to load settings.</p>';
    }
}

window.__adminSaveSettings = async () => {
    const inputs = document.querySelectorAll('[data-setting-key]');
    let successCount = 0;

    for (const input of inputs) {
        const key = input.dataset.settingKey;
        let value = input.value.trim();
        try { value = JSON.parse(value); } catch { /* keep as string */ }

        try {
            const { error } = await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
            if (error) throw error;
            successCount++;
        } catch (e) {
            console.error(`Failed to save setting "${key}":`, e);
        }
    }

    if (successCount === inputs.length) {
        showToast('All settings saved!', 2000, 'success');
    } else {
        showToast(`Saved ${successCount}/${inputs.length} settings`, 3000, 'warning');
    }
};
