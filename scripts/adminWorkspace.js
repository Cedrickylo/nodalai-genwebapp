// =====================================================================
// adminWorkspace.js - Administration Dashboard Engine Module
// Manages authentication gates, telemetry, users, and version tracks
// =====================================================================

// Global Management State
const adminState = {
    token: null,
    sessionRole: null, // "master" (Super Admin) or "admin" (Puter Whitelist)
    activePanel: 'dashboard',
    toastTimeout: null,
    
    // Core Collections synced with cloud storage
    users: [],
    subAdmins: [],
    globalConfig: {
        aiClient: 'groq',
        rateLimit: 5,
        version: { major: 1, minor: 0, patch: 0 },
        autoVersion: true,
        totalRequestsLog: 142
    }
};

// Target DOM Registry Element Lookups
const adminElements = {
    gateView: document.getElementById('admin-gate-view'),
    workspaceShell: document.getElementById('admin-workspace-shell'),
    
    // Auth Tab Components
    tabSuperAdmin: document.getElementById('tab-super-admin'),
    tabPuterAdmin: document.getElementById('tab-puter-admin'),
    formSuperAdmin: document.getElementById('form-super-admin'),
    formPuterAdmin: document.getElementById('form-puter-admin'),
    
    // Input Fields & Action Triggers
    superUsername: document.getElementById('super-username'),
    superPassword: document.getElementById('super-password'),
    masterPassphrase: document.getElementById('master-passphrase'),
    btnLoginSuper: document.getElementById('btn-login-super'),
    btnLoginPuter: document.getElementById('btn-login-puter'),
    btnAdminLogout: document.getElementById('btn-admin-logout'),
    gateError: document.getElementById('gate-error-message'),
    
    // Nav & Layout Components
    navButtons: document.querySelectorAll('.admin-nav-btn'),
    panels: document.querySelectorAll('.admin-view-panel'),
    versionTag: document.getElementById('display-version-tag'),
    
    // Metrics Pointers
    metricTotalUsers: document.getElementById('metric-total-users'),
    metricTotalRequests: document.getElementById('metric-total-requests'),
    
    // Data Render Matrices
    tableUserDirectory: document.getElementById('table-user-directory'),
    tableAdminHierarchy: document.getElementById('table-admin-hierarchy'),
    inputNewAdminUsername: document.getElementById('input-new-admin-username'),
    btnSubmitNewAdmin: document.getElementById('btn-submit-new-admin'),
    
    // Configuration Inputs
    selectGlobalClient: document.getElementById('select-global-client'),
    inputGlobalRateLimit: document.getElementById('input-global-rate-limit'),
    versionMajor: document.getElementById('version-major'),
    versionMinor: document.getElementById('version-minor'),
    versionPatch: document.getElementById('version-patch'),
    toggleAutoVersion: document.getElementById('toggle-auto-version'),
    btnSaveGlobalSettings: document.getElementById('btn-save-global-settings'),
    
    // Edit User Modal Windows
    modalEditUserOverlay: document.getElementById('modal-edit-user-overlay'),
    btnCloseEditUserModal: document.getElementById('btn-close-edit-user-modal'),
    modalEditUserId: document.getElementById('modal-edit-user-id'),
    modalEditUserName: document.getElementById('modal-edit-user-name'),
    modalEditUserLimit: document.getElementById('modal-edit-user-limit'),
    btnSaveUserProfileOverride: document.getElementById('btn-save-user-profile-override'),
    
    // Notification Widgets
    toastEl: document.getElementById('admin-toast-notification'),
    toastMessageEl: document.getElementById('admin-toast-message')
};

// =====================================================================
// INITIALIZATION AND ROUTING UTILITIES
// =====================================================================

function initAdminWorkspace() {
    setupAuthTabListeners();
    setupNavigationListeners();
    setupActionButtonListeners();
    
    // Attempt to restore existing workspace access token from session memory
    const savedToken = sessionStorage.getItem('nodal_admin_jwt');
    const savedRole = sessionStorage.getItem('nodal_admin_role');
    
    if (savedToken && savedRole) {
        adminState.token = savedToken;
        adminState.sessionRole = savedRole;
        unlockWorkspaceShell();
    }
}

// Handles switching tabs on the login screen
function setupAuthTabListeners() {
    adminElements.tabSuperAdmin.addEventListener('click', () => {
        toggleAuthTab('super');
    });
    adminElements.tabPuterAdmin.addEventListener('click', () => {
        toggleAuthTab('puter');
    });
}

function toggleAuthTab(track) {
    adminElements.gateError.textContent = '';
    if (track === 'super') {
        adminElements.tabSuperAdmin.className = "py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all duration-150";
        adminElements.tabPuterAdmin.className = "py-2 text-xs font-semibold rounded-lg text-gray-400 hover:text-white transition-all duration-150";
        adminElements.formSuperAdmin.classList.remove('hidden');
        adminElements.formPuterAdmin.classList.add('hidden');
    } else {
        adminElements.tabPuterAdmin.className = "py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all duration-150";
        adminElements.tabSuperAdmin.className = "py-2 text-xs font-semibold rounded-lg text-gray-400 hover:text-white transition-all duration-150";
        adminElements.formPuterAdmin.classList.remove('hidden');
        adminElements.formSuperAdmin.classList.add('hidden');
    }
}

// =====================================================================
// AUTHENTICATION PROTOCOL HANDLERS
// =====================================================================

function setupActionButtonListeners() {
    // Track A Commit: Super Admin Credential Check
    adminElements.btnLoginSuper.addEventListener('click', handleSuperAdminLogin);
    
    // Track B Commit: Puter Whitelist Verification Gate
    adminElements.btnLoginPuter.addEventListener('click', handlePuterAdminLogin);
    
    // Sign Out Protocol Terminal
    adminElements.btnAdminLogout.addEventListener('click', executeAdminLogout);
    
    // Edit Profile Override Submission
    adminElements.btnSaveUserProfileOverride.addEventListener('click', commitUserProfileChanges);
    adminElements.btnCloseEditUserModal.addEventListener('click', () => {
        adminElements.modalEditUserOverlay.classList.add('hidden');
    });
    
    // Provision New Sub-Admin Trigger
    adminElements.btnSubmitNewAdmin.addEventListener('click', registerNewSubAdminAccount);
    
    // Commit Global Settings Configuration Matrix
    adminElements.btnSaveGlobalSettings.addEventListener('click', saveGlobalConfigurationSettings);
}

async function handleSuperAdminLogin() {
    const user = adminElements.superUsername.value.trim();
    const pass = adminElements.superPassword.value;
    
    if (!user || !pass) {
        showGateError('Please enter both administrative credentials.');
        return;
    }
    
    adminElements.btnLoginSuper.disabled = true;
    adminElements.btnLoginSuper.textContent = 'Verifying Authenticity...';
    
    try {
        const response = await fetch('/.netlify/functions/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'super', username: user, password: pass })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Authorization Rejected');
        
        storeSessionToken(data.token, 'master');
        unlockWorkspaceShell();
        showAdminToast('Root Access Verified. Welcome back Master.', 'success');
    } catch (err) {
        showGateError(err.message);
    } finally {
        adminElements.btnLoginSuper.disabled = false;
        adminElements.btnLoginSuper.textContent = 'Verify Root Credentials';
    }
}

async function handlePuterAdminLogin() {
    const passphrase = adminElements.masterPassphrase.value;
    if (!passphrase) {
        showGateError('Master passphrase is required.');
        return;
    }

    if (typeof puter === 'undefined' || !puter.auth.isSignedIn()) {
        showGateError('You must be signed into your Puter user profile asset first.');
        return;
    }

    adminElements.btnLoginPuter.disabled = true;
    
    try {
        const pUser = await puter.auth.getUser();
        const username = pUser.username;
        
        const response = await fetch('/.netlify/functions/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'puter', passphrase: passphrase, puterUsername: username })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Access Denied: Puter account not whitelisted.');
        
        storeSessionToken(data.token, 'admin');
        unlockWorkspaceShell();
        showAdminToast(`Authenticated as Puter Admin: ${username}`, 'success');
    } catch (err) {
        showGateError(err.message);
    } finally {
        adminElements.btnLoginPuter.disabled = false;
    }
}

function storeSessionToken(token, role) {
    adminState.token = token;
    adminState.sessionRole = role;
    sessionStorage.setItem('nodal_admin_jwt', token);
    sessionStorage.setItem('nodal_admin_role', role);
}

function executeAdminLogout() {
    adminState.token = null;
    adminState.sessionRole = null;
    sessionStorage.removeItem('nodal_admin_jwt');
    sessionStorage.removeItem('nodal_admin_role');
    
    adminElements.superUsername.value = '';
    adminElements.superPassword.value = '';
    adminElements.masterPassphrase.value = '';
    
    adminElements.workspaceShell.classList.add('hidden');
    adminElements.gateView.classList.remove('hidden');
    showAdminToast('Administrative session disconnected cleanly.', 'info');
}

// =====================================================================
// DATA LOADING AND REFRESH CIRCUITS
// =====================================================================

async function unlockWorkspaceShell() {
    adminElements.gateView.classList.add('hidden');
    adminElements.workspaceShell.classList.remove('hidden');
    
    await syncDatabaseCollections();
    renderActivePanelCanvas();
}

async function syncDatabaseCollections() {
    // 1. Core Seed: Read or generate Mock user directory mappings 
    const savedUsers = localStorage.getItem('nodal_admin_mock_users');
    if (savedUsers) {
        adminState.users = JSON.parse(savedUsers);
    } else {
        adminState.users = [
            { id: 'usr_cedrickylo_nu', name: 'John Cedrick Siason', usage: 4, limit: 5, active: true },
            { id: 'usr_test_alpha', name: 'Jane Doe Developer', usage: 1, limit: 5, active: true },
            { id: 'usr_spam_bot', name: 'Abusive Token Requester', usage: 45, limit: 5, active: false }
        ];
        saveUsersToMockStore();
    }

    // 2. Fetch Whitelisted Sub-Admins list from cloud storage
    if (window.puter && puter.auth.isSignedIn()) {
        try {
            const rawAdmins = await puter.kv.get('nodal_cloud_whitelisted_admins');
            adminState.subAdmins = rawAdmins ? JSON.parse(rawAdmins) : ['cedrickylo'];
        } catch (e) {
            adminState.subAdmins = ['cedrickylo'];
        }
    } else {
        adminState.subAdmins = ['cedrickylo'];
    }

    // 3. Sync Application Version Metrics Configurations
    const savedConfig = localStorage.getItem('nodal_admin_global_config');
    if (savedConfig) {
        adminState.globalConfig = JSON.parse(savedConfig);
    } else {
        localStorage.setItem('nodal_admin_global_config', JSON.stringify(adminState.globalConfig));
    }

    // Push state properties to active UI wrappers
    syncGlobalConfigUIElements();
}

function syncGlobalConfigUIElements() {
    const cfg = adminState.globalConfig;
    adminElements.selectGlobalClient.value = cfg.aiClient || 'groq';
    adminElements.inputGlobalRateLimit.value = cfg.rateLimit || 5;
    
    adminElements.versionMajor.value = cfg.version.major;
    adminElements.versionMinor.value = cfg.version.minor;
    adminElements.versionPatch.value = cfg.version.patch;
    adminElements.toggleAutoVersion.checked = cfg.autoVersion;
    
    const versionStr = `v${cfg.version.major}.${cfg.version.minor}.${cfg.version.patch}`;
    adminElements.versionTag.textContent = versionStr;
}

// =====================================================================
// CORE PANEL LAYOUT SWITCHERS AND RENDERING MATRICES
// =====================================================================

function setupNavigationListeners() {
    adminElements.navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPanel = btn.getAttribute('data-target');
            adminState.activePanel = targetPanel;
            
            // Adjust sidebar navigation active layout rules
            adminElements.navButtons.forEach(b => {
                b.className = "admin-nav-btn whitespace-nowrap w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-xs";
            });
            btn.className = "admin-nav-btn whitespace-nowrap w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white bg-blue-600 font-medium transition-colors text-xs";
            
            renderActivePanelCanvas();
        });
    });
}

function renderActivePanelCanvas() {
    // Hide all panel surfaces
    adminElements.panels.forEach(p => p.classList.add('hidden'));
    
    // Reveal target panel surface
    const activeId = `panel-${adminState.activePanel}`;
    document.getElementById(activeId)?.classList.remove('hidden');
    
    // Execute panel-specific render sequences
    if (adminState.activePanel === 'dashboard') {
        adminElements.metricTotalUsers.textContent = adminState.users.length;
        adminElements.metricTotalRequests.textContent = adminState.globalConfig.totalRequestsLog;
    } else if (adminState.activePanel === 'users') {
        renderUserDirectoryMatrix();
    } else if (adminState.activePanel === 'admins') {
        renderAdminHierarchyMatrix();
    }
}

function renderUserDirectoryMatrix() {
    adminElements.tableUserDirectory.innerHTML = '';
    
    adminState.users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = user.active ? "hover:bg-gray-700/20" : "bg-red-900/10 hover:bg-red-900/20";
        
        const statusBadge = user.active 
            ? `<span class="text-green-400 font-medium flex items-center gap-1">● Active</span>`
            : `<span class="text-red-400 font-bold flex items-center gap-1">⚠️ Suspended</span>`;
            
        const banActionBtn = user.active
            ? `<button class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 px-2 py-1 rounded text-[11px] font-medium transition-all" onclick="toggleUserStatus('${user.id}', false)">Suspend</button>`
            : `<button class="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-500/20 px-2 py-1 rounded text-[11px] font-medium transition-all" onclick="toggleUserStatus('${user.id}', true)">Reinstate</button>`;

        tr.innerHTML = `
            <td class="p-3 font-mono text-gray-300 select-all">${user.id}</td>
            <td class="p-3 text-white font-medium">${user.name}</td>
            <td class="p-3 font-mono">${user.usage} / <span class="text-blue-400">${user.limit}</span></td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 text-right flex gap-1.5 justify-end">
                <button class="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-[11px] font-medium transition-all" onclick="openEditUserModal('${user.id}', '${user.name}', ${user.limit})">Edit</button>
                ${banActionBtn}
            </td>
        `;
        adminElements.tableUserDirectory.appendChild(tr);
    });
}

function renderAdminHierarchyMatrix() {
    // Keep the hardcoded super admin row intact, clear the rest
    const rows = adminElements.tableAdminHierarchy.querySelectorAll('tr');
    for (let i = rows.length - 1; i > 0; i--) {
        rows[i].remove();
    }
    
    adminState.subAdmins.forEach(username => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-700/20";
        
        tr.innerHTML = `
            <td class="p-3 font-mono text-gray-300 select-all">${username}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-400 border border-gray-600/40 uppercase tracking-wide">Puter Admin</span></td>
            <td class="p-3"><span class="text-green-400 font-medium flex items-center gap-1">● Active</span></td>
            <td class="p-3 text-right">
                <button class="bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-medium transition-all" onclick="revokeSubAdminPrivileges('${username}')">Revoke Access</button>
            </td>
        `;
        adminElements.tableAdminHierarchy.appendChild(tr);
    });
}

// =====================================================================
// ADMINISTRATIVE ACTION PIPELINES
// =====================================================================

window.openEditUserModal = function(id, currentName, currentLimit) {
    adminElements.modalEditUserId.value = id;
    adminElements.modalEditUserName.value = currentName;
    adminElements.modalEditUserLimit.value = currentLimit;
    adminElements.modalEditUserOverlay.classList.remove('hidden');
};

function commitUserProfileChanges() {
    const id = adminElements.modalEditUserId.value;
    const name = adminElements.modalEditUserName.value.trim();
    const limit = parseInt(adminElements.modalEditUserLimit.value, 10) || 5;
    
    if (!name) {
        showAdminToast('Profile display name string cannot be empty.', 'error');
        return;
    }
    
    const userIndex = adminState.users.findIndex(u => u.id === id);
    if (userIndex !== -1) {
        adminState.users[userIndex].name = name;
        adminState.users[userIndex].limit = limit;
        
        saveUsersToMockStore();
        renderUserDirectoryMatrix();
        adminElements.modalEditUserOverlay.classList.add('hidden');
        showAdminToast(`Profile constraints overridden for ID: ${id}`, 'success');
    }
}

window.toggleUserStatus = function(id, shouldReinstate) {
    const userIndex = adminState.users.findIndex(u => u.id === id);
    if (userIndex !== -1) {
        adminState.users[userIndex].active = shouldReinstate;
        saveUsersToMockStore();
        renderUserDirectoryMatrix();
        
        const actionMsg = shouldReinstate ? 'reinstated to standard active state' : 'suspended from platform generation access';
        showAdminToast(`User session context ${id} successfully ${actionMsg}.`, 'info');
        
        // Push the ban list updates up to the Puter Cloud key space to enforce it in production right away
        pushBanDatabaseToCloudStore();
    }
};

async function pushBanDatabaseToCloudStore() {
    if (window.puter && puter.auth.isSignedIn() && navigator.onLine) {
        const disabledIds = adminState.users.filter(u => !u.active).map(u => u.id);
        try {
            await puter.kv.set('nodal_cloud_suspended_users_array', JSON.stringify(disabledIds));
        } catch (e) {
            console.error('Failed to broadcast target block list metrics to cloud storage.', e);
        }
    }
}

async function registerNewSubAdminAccount() {
    const username = adminElements.inputNewAdminUsername.value.trim().toLowerCase();
    if (!username) {
        showAdminToast('Please provide an authentic Puter user registry handle.', 'warning');
        return;
    }
    
    if (adminState.subAdmins.includes(username)) {
        showAdminToast('Target user account profile already holds administrative privileges.', 'warning');
        return;
    }
    
    adminState.subAdmins.push(username);
    adminElements.inputNewAdminUsername.value = '';
    
    if (window.puter && puter.auth.isSignedIn() && navigator.onLine) {
        await puter.kv.set('nodal_cloud_whitelisted_admins', JSON.stringify(adminState.subAdmins));
    }
    
    renderAdminHierarchyMatrix();
    showAdminToast(`Administrative credentials granted to: ${username}`, 'success');
}

window.revokeSubAdminPrivileges = async function(username) {
    if (username === 'cedrickylo') {
        showAdminToast('Sovereign primary platform owner profile cannot be unlinked from administrative tracks.', 'error');
        return;
    }
    
    adminState.subAdmins = adminState.subAdmins.filter(u => u !== username);
    
    if (window.puter && puter.auth.isSignedIn() && navigator.onLine) {
        await puter.kv.set('nodal_cloud_whitelisted_admins', JSON.stringify(adminState.subAdmins));
    }
    
    renderAdminHierarchyMatrix();
    showAdminToast(`Administrative permissions revoked from: ${username}`, 'info');
};

function saveGlobalConfigurationSettings() {
    const initialConfig = { ...adminState.globalConfig };
    
    // Map inputs back to data objects
    adminState.globalConfig.aiClient = adminElements.selectGlobalClient.value;
    adminState.globalConfig.rateLimit = parseInt(adminElements.inputGlobalRateLimit.value, 10) || 5;
    
    adminState.globalConfig.version.major = parseInt(adminElements.versionMajor.value, 10) || 1;
    adminState.globalConfig.version.minor = parseInt(adminElements.versionMinor.value, 10) || 0;
    adminState.globalConfig.version.patch = parseInt(adminElements.versionPatch.value, 10) || 0;
    adminState.globalConfig.autoVersion = adminElements.toggleAutoVersion.checked;
    
    // Check if configuration parameters were edited to handle auto-patch bumps
    const hasConfigShift = initialConfig.aiClient !== adminState.globalConfig.aiClient || 
                           initialConfig.rateLimit !== adminState.globalConfig.rateLimit;
                           
    if (hasConfigShift && adminState.globalConfig.autoVersion) {
        adminState.globalConfig.version.patch += 1;
        adminElements.versionPatch.value = adminState.globalConfig.version.patch;
    }
    
    localStorage.setItem('nodal_admin_global_config', JSON.stringify(adminState.globalConfig));
    
    // Broadcast updates to all client endpoints via Puter KV synchronization
    broadcastGlobalConfigurationToCloud();
    
    syncGlobalConfigUIElements();
    showAdminToast('Global system parameters committed and broadcast successfully.', 'success');
}

async function broadcastGlobalConfigurationToCloud() {
    if (window.puter && puter.auth.isSignedIn() && navigator.onLine) {
        try {
            await puter.kv.set('nodal_cloud_global_app_config', JSON.stringify(adminState.globalConfig));
        } catch (e) {
            console.error('Failed to sync global settings parameters to cloud metadata bucket tracks.', e);
        }
    }
}

// =====================================================================
// AUXILIARY FEEDBACK AND CACHE PERSISTENCE ENGINE PLUGS
// =====================================================================

function saveUsersToMockStore() {
    localStorage.setItem('nodal_admin_mock_users', JSON.stringify(adminState.users));
}

function showGateError(msg) {
    adminElements.gateError.textContent = msg;
}

function showAdminToast(message, type = 'success') {
    if (adminState.toastTimeout) clearTimeout(adminState.toastTimeout);
    
    adminElements.toastMessageEl.textContent = message;
    adminElements.toastEl.classList.remove('hidden', 'bg-green-600', 'bg-red-600', 'bg-blue-600', 'bg-yellow-600');
    
    const colorMap = { error: 'bg-red-600', warning: 'bg-yellow-600', info: 'bg-blue-600', success: 'bg-green-600' };
    adminElements.toastEl.classList.add(colorMap[type] || 'bg-green-600');
    
    adminState.toastTimeout = setTimeout(() => {
        adminElements.toastEl.classList.add('hidden');
    }, 3500);
}

// Fire system boot tracking scripts
window.addEventListener('DOMContentLoaded', initAdminWorkspace);