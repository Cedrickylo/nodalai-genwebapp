# Implementation Plan: Disable Offline Downloads for Signed-Out Users & Show Explanatory Notice

Hide and disable offline downloading across the UI when the user is not signed in to a Puter account (since all quiz data and statistics are already stored locally on-device), display a clear explanatory notice on the Downloads page for signed-out users, and restrict automatic offline downloading strictly to authenticated Puter users.

---

## User Review Required

> [!IMPORTANT]
> **Key Architecture Decisions:**
> 1. **Offline Playability for Signed-Out Users**: When signed out, all quiz records and attempts are 100% stored in the browser's local storage. Therefore, signed-out users will never be blocked by the "quiz not downloaded for offline use" guard when practicing without internet connection.
> 2. **Downloads View Access**: The Downloads view (`#downloads`) remains navigable from the desktop and mobile navigation, but when visited while signed out, it presents a dedicated notice explaining that local device storage is active and offline downloads are only needed for cloud-synced Puter accounts.
> 3. **Automatic Offline Retention**: The 7-day automatic offline retention window in `isQuizAvailableOffline()` will only activate for signed-in Puter users.

---

## Proposed Changes

### Component 1: Core Offline Logic & Authentication Gate (`scripts/quiz/quizOffline.js`)

#### [MODIFY] [`scripts/quiz/quizOffline.js`](file:///C:/Users/cedri/Documents/nodalai-genwebapp/scripts/quiz/quizOffline.js)

1. **Add `isPuterSignedIn()` Helper**:
   - Centralize authentication detection:
   ```javascript
   export function isPuterSignedIn() {
       return typeof puter !== 'undefined' && !!window.puter?.auth?.isSignedIn?.();
   }
   ```

2. **Restrict `downloadQuizForOffline()` & `renewQuizOfflineAccess()`**:
   - Block execution if signed out:
   ```javascript
   if (!isPuterSignedIn()) {
       showToast('Offline downloading is not available when signed out. Your quizzes are already stored locally.', 4000, 'info');
       throw new Error('Offline downloading is disabled for signed-out accounts.');
   }
   ```

3. **Disable Auto-Offline Retention when Signed Out (`isQuizAvailableOffline`)**:
   - Ensure `isQuizAvailableOffline(quizKey)` returns `{ available: false }` if `!isPuterSignedIn()`.
   - Restrict automatic 7-day window (< 7 days from creation/import) strictly to signed-in Puter users.

4. **Hide Offline Actions in Options Submenu (`updateHistorySubmenuOfflineButton`)**:
   - If `!isPuterSignedIn()`, add `hidden` to `elements.historySubmenuOfflineBtn`.
   - If `isPuterSignedIn()`, show and configure status as usual.

5. **Hide Offline Bar in Statistics View (`updateStatisticsOfflineBar`)**:
   - If `!isPuterSignedIn()`, add `hidden` to `elements.statisticsOfflineBar`.
   - If `isPuterSignedIn()`, show and configure status as usual.

6. **Block Offline Management Modal (`openOfflineModal`)**:
   - If `!isPuterSignedIn()`, do not open modal; show informative toast explaining that local quizzes do not require offline downloading.

7. **Render Signed-Out Notice in Downloads View (`renderDownloadsView`)**:
   - Check `isPuterSignedIn()`:
   - If **Signed Out**:
     - Set storage badge to `Local Storage Active` with an emerald badge style.
     - Hide the 1-week retention info box (`#downloads-retention-info`).
     - Render a dedicated notice card in `#downloads-list`:
       - Title: **Offline Downloads Not Needed**
       - Badge: **Signed Out (Local Device Mode)**
       - Explanation: All quizzes, questions, and statistics are stored locally on this device and are always accessible offline without downloading. Explains that offline downloads are only used by cloud-synced Puter accounts to selectively cache remote library quizzes.
       - Action buttons: "View All Quizzes in History" (navigates to History) and "Sign In with Puter" (initiates Puter login).
   - If **Signed In**:
     - Reveal `#downloads-retention-info`.
     - Calculate and display total offline bytes in the storage badge.
     - Render active offline quizzes and empty state as normal.

---

### Component 2: Markup ID Hook (`index.html`)

#### [MODIFY] [`index.html`](file:///C:/Users/cedri/Documents/nodalai-genwebapp/index.html#L628)

- Add `id="downloads-retention-info"` to the 1-week retention info box in `#downloads-view` so it can be cleanly hidden when signed out and shown when signed in.

```html
<!-- Line 628 in index.html -->
<div id="downloads-retention-info" class="bg-gray-900/40 border border-gray-700/50 rounded-xl p-3 sm:p-4 mb-4 text-xs sm:text-sm text-gray-300 flex items-center gap-2.5">
    <svg class="w-5 h-5 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    <span>Downloaded quizzes and their statistics are kept offline for <strong>1 week</strong>. They automatically expire unless renewed.</span>
</div>
```

---

### Component 3: Offline Loading Protection for Signed-Out Users (`scripts/quiz/quizHistory.js` & `scripts/helpers.js`)

#### [MODIFY] [`scripts/quiz/quizHistory.js`](file:///C:/Users/cedri/Documents/nodalai-genwebapp/scripts/quiz/quizHistory.js#L164-L170)

- Update the offline playability check so signed-out users (whose quizzes are already stored locally in `state.quizHistory`) are never blocked from taking quizzes offline:

```javascript
// Guard: For cloud-synced accounts, block history operations for non-downloaded quizzes while offline
const { isQuizAvailableOffline, isPuterSignedIn } = await import('./quizOffline.js');
if (!navigator.onLine && isPuterSignedIn() && !isQuizAvailableOffline(key).available) {
    showToast('This quiz is not available offline. Please connect to the internet or download it for offline use.', 4000, 'error');
    return;
}
```

#### [MODIFY] [`scripts/helpers.js`](file:///C:/Users/cedri/Documents/nodalai-genwebapp/scripts/helpers.js#L4365-L4373)

- Apply the same authentication gate in `openHistoryActionsModal`:

```javascript
const { isQuizAvailableOffline, isPuterSignedIn, updateHistorySubmenuOfflineButton } = await import('./quiz/quizOffline.js');
if (!navigator.onLine && isPuterSignedIn() && !isQuizAvailableOffline(quizKey).available) {
    showToast('This quiz is not available offline. Please connect to the internet or download it for offline use.', 4000, 'error');
    return;
}
```

- In `updateAuthUI()`:
  - If the active view is `downloads` or `#downloads`, re-render `renderDownloadsView(false)` so logging in or out instantly updates the Downloads page between the signed-out notice and the signed-in downloads list.

---

### Component 4: Service Worker Cache Bump (`sw.js`)

#### [MODIFY] [`sw.js`](file:///C:/Users/cedri/Documents/nodalai-genwebapp/sw.js#L1-L3)

- Bump cache from `nodal-ai-cache-v50` to `nodal-ai-cache-v51` to ensure all clients immediately receive the updated offline rules.

---

## Verification Plan

### Manual Verification
1. **Signed-Out State**:
   - Open Nodal AI while signed out.
   - Navigate to the **Downloads** page from Desktop navigation or Mobile drawer.
   - Verify the notice appears:
     - Title: "Offline Downloads Not Needed"
     - Status: "Signed Out (Local Device Mode)"
     - Clear explanation that all data is on device.
     - Storage badge says "Local Storage Active".
     - Retention policy box is hidden.
     - Clicking "View All Quizzes in History" redirects to History.
   - In **History**: Open the Quiz Options modal on any quiz.
     - Verify the "Make Available Offline" / "Offline Download Status" button is hidden.
   - In **Quiz Statistics**:
     - Verify the `#statistics-offline-bar` ("Available Offline / Manage Offline") is hidden.
   - Simulate **Offline Mode** (DevTools -> Network -> Offline):
     - Click any quiz in History to load or take it.
     - Verify the quiz loads and executes smoothly without being blocked.

2. **Signed-In State**:
   - Sign in with a Puter account.
   - Navigate to **Downloads**:
     - Verify the notice is replaced by the standard Downloads view with active downloads and storage count.
   - In **History**: Open Quiz Options modal.
     - Verify the Offline Download button is visible and active.
   - In **Quiz Statistics**:
     - Verify the Offline Status & Manage Bar is visible and allows managing offline access.
   - Verify automatic offline retention works for signed-in accounts.
