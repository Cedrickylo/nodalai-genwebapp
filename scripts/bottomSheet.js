/**
 * Apple Design System - Direct Manipulation Bottom Sheet Handler
 * Implements full-surface finger tracking with touch-slop gesture arbitration,
 * 1:1 real-time drag following, continuous backdrop dimming, rubber-band resistance,
 * Apple's project() momentum projection, and velocity-aware fluid exit/snap transitions.
 */

import { project } from './spring.js';

/**
 * Attaches fluid Apple bottom sheet physics to a modal element
 * @param {Object} options
 * @param {HTMLElement} options.modalContainer The outer modal wrapper
 * @param {HTMLElement} options.contentEl The sliding drawer panel
 * @param {HTMLElement} options.backdropEl The background backdrop to fade
 * @param {Function} options.onClose Function to call when dismissed
 */
export function attachBottomSheetGestures({ modalContainer, contentEl, backdropEl, onClose }) {
    if (!modalContainer || !contentEl) return;

    let isTracking = false;
    let isDragging = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityY = 0;
    let activePointerId = null;
    let currentTranslateY = 0;
    let isDismissing = false;

    function isMobileDrawer() {
        return window.innerWidth < 768;
    }

    function isReducedMotion() {
        return document.documentElement.classList.contains('reduce-motion') ||
            (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Intercept and swallow clicks if a swipe gesture was performed
    function captureClick(e) {
        if (suppressClick) {
            e.stopPropagation();
            e.preventDefault();
            suppressClick = false;
        }
    }
    contentEl.addEventListener('click', captureClick, { capture: true });

    function onPointerDown(e) {
        if (!isMobileDrawer()) return;
        if (isDismissing) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        // If content is scrollable and user scrolled down into it, let internal scroll handle it
        if (contentEl.scrollTop > 5) return;

        isTracking = true;
        isDragging = false;
        suppressClick = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        lastY = e.clientY;
        lastTime = performance.now();
        velocityY = 0;

        // Interrupt any active inline transition or keyframe
        contentEl.style.transition = 'none';
        contentEl.style.animation = 'none';
        if (backdropEl) {
            backdropEl.style.transition = 'none';
            backdropEl.style.animation = 'none';
        }
    }

    function onPointerMove(e) {
        if (!isTracking || e.pointerId !== activePointerId) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Touch-slop detection: lock in swipe when vertical movement exceeds 6px and exceeds horizontal
        if (!isDragging) {
            if (Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
                isDragging = true;
                suppressClick = true;
                try {
                    contentEl.setPointerCapture(e.pointerId);
                } catch (_) {}
            } else if (Math.abs(deltaX) > 12) {
                // User is gesturing horizontally, cancel sheet drag
                isTracking = false;
                return;
            } else {
                // Within touch-slop threshold, don't move yet (allow tap)
                return;
            }
        }

        // Active dragging
        if (e.cancelable) {
            e.preventDefault();
        }

        const now = performance.now();
        const dt = Math.max(now - lastTime, 1);

        // Smooth filtered velocity in px/s
        const instantVelocity = ((e.clientY - lastY) / dt) * 1000;
        velocityY = 0.7 * instantVelocity + 0.3 * velocityY;
        lastY = e.clientY;
        lastTime = now;

        // 1:1 direct tracking when dragging down, rubber-band resistance when dragging up
        let translateY;
        if (deltaY >= 0) {
            translateY = deltaY;
        } else {
            // Apple rubber-band resistance
            translateY = deltaY * 0.22;
        }

        currentTranslateY = translateY;
        contentEl.style.transform = `translateY(${translateY}px)`;

        // Continuous backdrop opacity feedback
        if (backdropEl) {
            const sheetHeight = contentEl.offsetHeight || 320;
            const progress = Math.max(0, 1 - (Math.max(0, translateY) / sheetHeight));
            backdropEl.style.opacity = progress.toFixed(3);
        }
    }

    function onPointerUp(e) {
        if (!isTracking || e.pointerId !== activePointerId) return;
        isTracking = false;
        activePointerId = null;

        try {
            contentEl.releasePointerCapture(e.pointerId);
        } catch (_) {}

        // If we didn't drag past touch-slop threshold, treat as normal button tap
        if (!isDragging) {
            return;
        }
        isDragging = false;

        // Delay clearing suppressClick slightly so the click event gets intercepted and cancelled
        setTimeout(() => {
            suppressClick = false;
        }, 120);

        const sheetHeight = contentEl.offsetHeight || 320;
        const projectedDisplacement = project(velocityY, 0.998);
        const projectedRestingY = currentTranslateY + projectedDisplacement;

        // Dismissal decision: flick downward OR projected landing past 35% OR dragged down > 45%
        const isDownwardFlick = velocityY > 480 && currentTranslateY > 15;
        const isProjectedDismiss = projectedRestingY > sheetHeight * 0.35 && currentTranslateY > 20;
        const isDraggedFar = currentTranslateY > sheetHeight * 0.45;
        const shouldDismiss = isDownwardFlick || isProjectedDismiss || isDraggedFar;

        if (isReducedMotion()) {
            // Immediate transition for reduced motion
            currentTranslateY = 0;
            contentEl.style.transform = '';
            contentEl.style.transition = '';
            contentEl.style.animation = '';
            if (backdropEl) {
                backdropEl.style.opacity = '';
                backdropEl.style.transition = '';
                backdropEl.style.animation = '';
            }
            if (shouldDismiss) {
                modalContainer.classList.add('hidden');
                if (typeof onClose === 'function') onClose();
            }
            return;
        }

        if (shouldDismiss) {
            // ==============================================================
            // FLUID EXIT ANIMATION & TRANSITION (Smooth glide off-screen)
            // ==============================================================
            isDismissing = true;
            const remainingDistance = Math.max(0, sheetHeight - currentTranslateY);
            // Dynamic duration based on velocity, clamped between 220ms and 300ms
            const duration = Math.min(300, Math.max(220, Math.round(remainingDistance / (Math.max(velocityY, 500) / 350))));

            contentEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
            contentEl.style.transform = 'translateY(100%)';

            if (backdropEl) {
                backdropEl.style.transition = `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
                backdropEl.style.opacity = '0';
            }

            let dismissed = false;
            const finishDismiss = () => {
                if (dismissed) return;
                dismissed = true;
                isDismissing = false;
                modalContainer.classList.add('hidden');
                contentEl.style.transition = '';
                contentEl.style.transform = '';
                contentEl.style.animation = '';
                if (backdropEl) {
                    backdropEl.style.transition = '';
                    backdropEl.style.opacity = '';
                    backdropEl.style.animation = '';
                }
                currentTranslateY = 0;
                if (typeof onClose === 'function') {
                    onClose();
                }
            };

            contentEl.addEventListener('transitionend', finishDismiss, { once: true });
            setTimeout(finishDismiss, duration + 60); // safety fallback timer
        } else {
            // ==============================================================
            // FLUID ELASTIC SNAP-BACK (Smooth spring back to rest position)
            // ==============================================================
            const duration = 280;
            contentEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
            contentEl.style.transform = 'translateY(0)';

            if (backdropEl) {
                backdropEl.style.transition = `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
                backdropEl.style.opacity = '1';
            }

            const finishSnap = () => {
                contentEl.style.transition = '';
                contentEl.style.transform = '';
                contentEl.style.animation = '';
                if (backdropEl) {
                    backdropEl.style.transition = '';
                    backdropEl.style.opacity = '';
                    backdropEl.style.animation = '';
                }
                currentTranslateY = 0;
            };

            contentEl.addEventListener('transitionend', finishSnap, { once: true });
            setTimeout(finishSnap, duration + 60); // safety fallback timer
        }
    }

    contentEl.addEventListener('pointerdown', onPointerDown);
    contentEl.addEventListener('pointermove', onPointerMove);
    contentEl.addEventListener('pointerup', onPointerUp);
    contentEl.addEventListener('pointercancel', onPointerUp);
}
