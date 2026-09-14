/**
 * Apple Design System - Fluid Motion & Spring Engine
 * Implementation based on Apple's WWDC 'Designing Fluid Interfaces' guidelines
 * and Emil Kowalski's Apple Design specifications.
 */

/**
 * Apple's exponential decay momentum projection function
 * Deceleration rate is ~0.998 for standard iOS scrolling/sheet feel, or ~0.99 for snappier snap
 * @param {number} initialVelocity px/s
 * @param {number} decelerationRate defaults to 0.998
 * @returns {number} projected resting displacement in pixels
 */
export function project(initialVelocity, decelerationRate = 0.998) {
    if (!initialVelocity || Math.abs(initialVelocity) < 1) return 0;
    return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/**
 * Creates an interruptible, velocity-aware spring animator
 * @param {Object} options
 * @param {number} options.damping Damping ratio (1.0 = critically damped, 0.8 = momentum bounce)
 * @param {number} options.response Response duration in seconds (snappiness: 0.3 - 0.4s)
 */
export function createSpring({ damping = 1.0, response = 0.35 } = {}) {
    let currentAnimId = null;
    let currentPos = 0;
    let currentVel = 0;

    // Derived physics parameters from Apple's (damping, response)
    const omega = (2 * Math.PI) / Math.max(0.01, response);
    const zeta = damping;

    function isReducedMotion() {
        return document.documentElement.classList.contains('reduce-motion') ||
            (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /**
     * Animate toward target position starting with an initial velocity
     * @param {number} targetPos 
     * @param {number} initialVelocity (px/s)
     * @param {Function} onUpdate Callback with current position (px)
     * @param {Function} onComplete Callback when spring settles
     */
    function animateTo(targetPos, initialVelocity = 0, onUpdate = null, onComplete = null) {
        if (currentAnimId) {
            cancelAnimationFrame(currentAnimId);
            currentAnimId = null;
        }

        if (isReducedMotion()) {
            currentPos = targetPos;
            currentVel = 0;
            if (typeof onUpdate === 'function') onUpdate(targetPos);
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        currentVel = initialVelocity;
        let lastTime = performance.now();

        function step(now) {
            const dt = Math.min((now - lastTime) / 1000, 0.032); // clamp dt to avoid simulation tunneling
            lastTime = now;

            const displacement = currentPos - targetPos;

            // Damped harmonic oscillator: a = -omega^2 * x - 2 * zeta * omega * v
            const springForce = -Math.pow(omega, 2) * displacement;
            const dampingForce = -2 * zeta * omega * currentVel;
            const acceleration = springForce + dampingForce;

            currentVel += acceleration * dt;
            currentPos += currentVel * dt;

            if (typeof onUpdate === 'function') {
                onUpdate(currentPos);
            }

            // Settle criteria: near target and velocity is negligible
            const isSettled = Math.abs(displacement) < 0.25 && Math.abs(currentVel) < 10;
            if (isSettled) {
                currentPos = targetPos;
                currentVel = 0;
                if (typeof onUpdate === 'function') onUpdate(targetPos);
                if (typeof onComplete === 'function') onComplete();
                currentAnimId = null;
            } else {
                currentAnimId = requestAnimationFrame(step);
            }
        }

        currentAnimId = requestAnimationFrame(step);
    }

    function stop() {
        if (currentAnimId) {
            cancelAnimationFrame(currentAnimId);
            currentAnimId = null;
        }
        return { currentPos, currentVel };
    }

    return {
        animateTo,
        stop,
        setPosition: (pos) => {
            currentPos = pos;
            currentVel = 0;
        },
        getPosition: () => currentPos,
        getVelocity: () => currentVel
    };
}
