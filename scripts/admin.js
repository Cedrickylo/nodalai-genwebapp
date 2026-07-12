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
            is_admin: false,
            share_limit: 3,
            quizzes_limit: 5
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

    // Use custom_gen_limit if set, otherwise use plan-based default
    const effectiveLimit = profile.custom_gen_limit ?? 5;
    if (profile.quizzes_generated >= effectiveLimit) {
        return {
            allowed: false,
            reason: `Generation limit reached (${effectiveLimit} quizzes). Upgrade to Pro for unlimited.`,
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

    // -1 means unlimited
    const limit = profile.share_limit ?? 3;
    if (limit === -1) return { allowed: true, reason: null, remaining: Infinity };

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
            percentage: quizData.percentage || null,
            difficulty: quizData.difficulty || null,
            time_spent_seconds: quizData.timeSpent || 0,
            completed: quizData.completed || false
        });
    } catch (e) {
        console.warn('Analytics log failed:', e);
    }
}

// ==========================================
// USER PROGRESS VIEW
// ==========================================

export async function loadUserProgress() {
    const userId = await fetchPuterUserId();
    if (!userId) return;

    try {
        const { data, error } = await supabase
            .from('quiz_analytics')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const quizzes = data || [];
        const totalQuizzes = quizzes.length;
        const completedQuizzes = quizzes.filter(q => q.completed);
        const scores = completedQuizzes.map(q => q.percentage || 0);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
        const totalTime = quizzes.reduce((sum, q) => sum + (q.time_spent_seconds || 0), 0);

        // Update stat cards
        const elTotal = document.getElementById('progress-total-quizzes');
        const elAvg = document.getElementById('progress-avg-score');
        const elBest = document.getElementById('progress-best-score');
        const elTime = document.getElementById('progress-total-time');

        if (elTotal) elTotal.textContent = totalQuizzes;
        if (elAvg) elAvg.textContent = totalQuizzes > 0 ? `${avgScore}%` : '-';
        if (elBest) elBest.textContent = totalQuizzes > 0 ? `${bestScore}%` : '-';
        if (elTime) elTime.textContent = totalTime > 0 ? formatTimeShort(totalTime) : '-';

        // Score distribution bars
        const bars = { '90-100%': 0, '75-89%': 0, '50-74%': 0, '0-49%': 0 };
        scores.forEach(s => {
            if (s >= 90) bars['90-100%']++;
            else if (s >= 75) bars['75-89%']++;
            else if (s >= 50) bars['50-74%']++;
            else bars['0-49%']++;
        });

        const maxCount = Math.max(1, ...Object.values(bars));
        const barsContainer = document.getElementById('progress-score-bars');
        if (barsContainer) {
            const colors = { '90-100%': 'bg-emerald-500', '75-89%': 'bg-blue-500', '50-74%': 'bg-yellow-500', '0-49%': 'bg-red-500' };
            barsContainer.innerHTML = Object.entries(bars).map(([range, count]) => `
                <div class="flex items-center gap-3">
                    <span class="text-xs text-gray-400 w-16 text-right">${range}</span>
                    <div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div class="${colors[range]} h-3 rounded-full transition-all duration-500" style="width: ${(count / maxCount) * 100}%"></div>
                    </div>
                    <span class="text-xs text-gray-500 w-6">${count}</span>
                </div>
            `).join('');
        }

        // Recent quizzes list
        const recentContainer = document.getElementById('progress-recent-list');
        if (recentContainer) {
            if (quizzes.length === 0) {
                recentContainer.innerHTML = '<p class="text-gray-400 text-sm">No quiz data yet. Complete a quiz to see your progress here.</p>';
            } else {
                recentContainer.innerHTML = quizzes.slice(0, 10).map(q => {
                    const pct = q.percentage || 0;
                    const color = pct >= 90 ? 'text-emerald-400' : pct >= 75 ? 'text-blue-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
                    const date = new Date(q.created_at).toLocaleDateString();
                    return `
                        <div class="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700/50">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-white font-medium truncate">${q.quiz_name || q.quiz_id || 'Quiz'}</p>
                                <p class="text-xs text-gray-400">${date} · ${q.questions_count || 0} Qs · ${q.difficulty || 'mixed'}</p>
                            </div>
                            <span class="text-sm font-bold ${color} ml-3">${pct}%</span>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (e) {
        console.warn('Failed to load progress:', e);
    }
}

function formatTimeShort(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
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
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">Loading users...</td></tr>';

    try {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('[Admin] Profiles query error:', error);
            throw error;
        }
        console.log('[Admin] Loaded profiles:', data?.length, data);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-4">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(u => {
            const shareLimit = u.share_limit;
            const shareText = shareLimit === -1 ? 'Unlimited' : (shareLimit ?? 3);
            const genLimit = u.custom_gen_limit;
            const genText = genLimit != null ? genLimit : 'Default';

            return `
            <tr class="border-t border-gray-700/50 cursor-pointer hover:bg-gray-700/20 transition-colors" onclick="window.__adminOpenUserDetail('${u.id}')">
                <td class="py-3 px-4 text-sm text-white font-medium truncate max-w-[200px]" title="${u.email || ''}">${u.display_name || u.email || 'N/A'}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${u.plan === 'enterprise' ? 'bg-yellow-500/20 text-yellow-400' : u.plan === 'pro' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-600/30 text-gray-400'}">
                        ${u.plan || 'free'}
                    </span>
                </td>
                <td class="py-3 px-4 text-sm text-gray-300">${u.quizzes_generated || 0} / ${genText}</td>
                <td class="py-3 px-4 text-sm text-gray-300">${shareText}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${u.is_admin ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-600/30 text-gray-400'}">
                        ${u.is_admin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td class="py-3 px-4 text-xs text-gray-400">${new Date(u.created_at).toLocaleDateString()}</td>
                <td class="py-3 px-4">
                    <button onclick="event.stopPropagation(); window.__adminOpenUserDetail('${u.id}')" class="text-xs px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors">
                        Edit
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error('Failed to load users:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-400 py-4">Failed to load users.</td></tr>';
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
// USER DETAIL EDITOR
// ==========================================

window.__adminOpenUserDetail = async (userId) => {
    const { data: user, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !user) {
        showToast('Failed to load user details', 3000, 'error');
        return;
    }

    const isUnlimited = user.plan === 'pro' || user.plan === 'enterprise';

    const modal = document.getElementById('admin-user-detail-modal');
    const content = document.getElementById('admin-user-detail-content');

    content.innerHTML = `
        <div class="space-y-5">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-bold text-white">${user.display_name || user.email || 'Unknown'}</h3>
                    <p class="text-xs text-gray-400 mt-1">${user.email || ''}</p>
                    <p class="text-[10px] text-gray-500 font-mono mt-0.5">${user.id}</p>
                </div>
                <button onclick="document.getElementById('admin-user-detail-modal').classList.add('hidden')" class="text-gray-400 hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <!-- Plan -->
            <div class="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Plan</label>
                <select id="ud-plan" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-2">
                    <option value="free" ${user.plan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Pro</option>
                    <option value="enterprise" ${user.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                </select>
            </div>

            <!-- Quiz Generation Limits -->
            <div class="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quiz Generation</label>
                <div class="grid grid-cols-2 gap-3 mt-2">
                    <div>
                        <label class="text-[11px] text-gray-500">Generated</label>
                        <p class="text-sm text-white font-medium">${user.quizzes_generated || 0}</p>
                    </div>
                    <div>
                        <label class="text-[11px] text-gray-500">Custom Limit</label>
                        <input type="number" id="ud-gen-limit" value="${user.custom_gen_limit ?? ''}" min="0" placeholder="Default (5)" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm">
                        <p class="text-[10px] text-gray-500 mt-1">Leave empty for plan default</p>
                    </div>
                </div>
                <button onclick="window.__adminResetGenCount('${user.id}')" class="mt-2 text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                    Reset generation count to 0
                </button>
            </div>

            <!-- Quiz Limit (Max quizzes allowed) -->
            <div class="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Max Saved Quizzes</label>
                <input type="number" id="ud-quiz-limit" value="${user.quizzes_limit || 5}" min="1" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm mt-2">
                <p class="text-[10px] text-gray-500 mt-1">Maximum number of quizzes the user can save in history</p>
            </div>

            <!-- Share Link Limits -->
            <div class="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Share Link Limit</label>
                <div class="mt-2">
                    <label class="flex items-center gap-2 mb-2">
                        <input type="checkbox" id="ud-unlimited-shares" ${user.share_limit === -1 ? 'checked' : ''} onchange="document.getElementById('ud-share-limit').disabled = this.checked; if(this.checked) document.getElementById('ud-share-limit').value = '';" class="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500">
                        <span class="text-sm text-gray-300">Unlimited share links</span>
                    </label>
                    <input type="number" id="ud-share-limit" value="${user.share_limit != null && user.share_limit !== -1 ? user.share_limit : ''}" min="0" placeholder="Default (3)" ${user.share_limit === -1 ? 'disabled' : ''} class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm">
                    <p class="text-[10px] text-gray-500 mt-1">Leave empty for plan default (3 for free)</p>
                </div>
            </div>

            <!-- Admin Toggle -->
            <div class="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin Status</label>
                <div class="flex items-center gap-3 mt-2">
                    <button onclick="window.__adminToggleAdmin('${user.id}', ${!user.is_admin})" class="text-xs px-3 py-1.5 rounded ${user.is_admin ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40'} transition-colors">
                        ${user.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <span class="text-xs ${user.is_admin ? 'text-purple-400' : 'text-gray-500'}">${user.is_admin ? 'Admin' : 'Regular User'}</span>
                </div>
            </div>

            <!-- Save Button -->
            <button onclick="window.__adminSaveUserDetail('${user.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg">
                Save Changes
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
};

window.__adminSaveUserDetail = async (userId) => {
    const plan = document.getElementById('ud-plan').value;
    const genLimitRaw = document.getElementById('ud-gen-limit').value;
    const quizLimit = parseInt(document.getElementById('ud-quiz-limit').value, 10) || 5;
    const unlimitedShares = document.getElementById('ud-unlimited-shares').checked;
    const shareLimitRaw = document.getElementById('ud-share-limit').value;

    const customGenLimit = genLimitRaw !== '' ? parseInt(genLimitRaw, 10) : null;
    const shareLimit = unlimitedShares ? -1 : (shareLimitRaw !== '' ? parseInt(shareLimitRaw, 10) : 3);

    try {
        const { error } = await supabase.from('profiles').update({
            plan,
            custom_gen_limit: customGenLimit,
            quizzes_limit: quizLimit,
            share_limit: shareLimit,
            updated_at: new Date().toISOString()
        }).eq('id', userId);

        if (error) throw error;
        showToast('User settings saved!', 2000, 'success');
        document.getElementById('admin-user-detail-modal').classList.add('hidden');
        loadUsers();
    } catch (e) {
        console.error('Failed to save user:', e);
        showToast('Failed to save changes', 3000, 'error');
    }
};

window.__adminResetGenCount = async (userId) => {
    try {
        const { error } = await supabase.from('profiles').update({ quizzes_generated: 0, updated_at: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        showToast('Generation count reset', 2000, 'success');
        // Re-open the detail modal with refreshed data
        window.__adminOpenUserDetail(userId);
    } catch (e) {
        console.error('Failed to reset count:', e);
        showToast('Failed to reset', 3000, 'error');
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
