import { state } from './state.js';

/**
 * Modern Native Web Audio Synthesizer for Nodal AI
 * Replaces heavy external Tone.js CDN library (eliminates ScriptProcessorNode deprecation warnings,
 * saves 400KB network overhead, zero latency, 100% offline capable).
 */

let audioCtx = null;

/**
 * Lazily retrieves or instantiates the global native AudioContext.
 * @returns {AudioContext|null}
 */
export function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    return audioCtx;
}

/**
 * Resumes suspended AudioContext after user gesture.
 * @returns {Promise<void>}
 */
export async function resumeAudioContext() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        try {
            await ctx.resume().catch(() => {});
        } catch (e) {}
    }
}

/**
 * Maps standard note names (e.g. 'C4', 'A2', 'E4') to exact frequencies in Hz.
 * @param {string} note
 * @returns {number} Frequency in Hz
 */
export function noteToFrequency(note) {
    if (typeof note === 'number') return note;
    if (!note || typeof note !== 'string') return 261.63; // Default C4

    const noteMap = {
        'c': 0, 'c#': 1, 'db': 1,
        'd': 2, 'd#': 3, 'eb': 3,
        'e': 4,
        'f': 5, 'f#': 6, 'gb': 6,
        'g': 7, 'g#': 8, 'ab': 8,
        'a': 9, 'a#': 10, 'bb': 10,
        'b': 11
    };

    const match = note.trim().toLowerCase().match(/^([a-g][#b]?)(-?\d+)$/);
    if (!match) return 261.63;

    const pitch = match[1];
    const octave = parseInt(match[2], 10);
    const semitone = noteMap[pitch];
    if (semitone === undefined) return 261.63;

    // MIDI note number: C4 is 60, A4 is 69 (440 Hz)
    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Converts standard Tone.js duration strings to seconds.
 * @param {string|number} duration
 * @returns {number} Duration in seconds
 */
export function durationToSeconds(duration) {
    if (typeof duration === 'number') return Math.max(0.05, duration);
    if (!duration || typeof duration !== 'string') return 0.25;

    switch (duration.trim().toLowerCase()) {
        case '16n': return 0.125;
        case '8n': return 0.25;
        case '4n': return 0.5;
        case '2n': return 1.0;
        case '1m': return 2.0;
        default: {
            const parsed = parseFloat(duration);
            return !isNaN(parsed) && parsed > 0 ? parsed : 0.25;
        }
    }
}

/**
 * Plays a musical tone using native OscillatorNode and GainNode with smooth exponential decay.
 * @param {number|string} pitch - Frequency in Hz or note string (e.g. 'C4', 'A2')
 * @param {'sine'|'square'|'triangle'|'sawtooth'} type - Oscillator wave shape
 * @param {string|number} duration - Tone duration ('8n', 0.25s, etc.)
 * @param {number} targetVolume - Peak gain volume (0.0 to 1.0)
 */
export function playTone(pitch, type = 'sine', duration = '8n', targetVolume = 0.2) {
    if (state.isMuted) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    try {
        const freq = typeof pitch === 'number' ? pitch : noteToFrequency(pitch);
        const durationSec = durationToSeconds(duration);
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        // Natural exponential envelope: instant attack (5ms), sustain, smooth release
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(targetVolume, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + durationSec + 0.05);
    } catch (e) {
        // Silently catch audio buffer/context errors
    }
}

/**
 * Creates a synthetic voice object compatible with Tone.js Synth interface.
 * @param {'sine'|'square'} type
 * @param {string} defaultNote
 * @param {number} defaultVolume
 * @returns {{ triggerAttackRelease: Function, toDestination: Function }}
 */
export function createSynthVoice(type, defaultNote, defaultVolume) {
    return {
        triggerAttackRelease: (note = defaultNote, duration = '8n', time) => {
            playTone(note || defaultNote, type, duration, defaultVolume);
        },
        toDestination() {
            return this;
        }
    };
}

/**
 * Initializes the audio subsystem, binding compatible synth voices and Tone.js shims.
 */
export function initializeAudio() {
    if (state.correctSound && state.incorrectSound) return;

    try {
        // Native Web Audio Synthesizer voices
        state.correctSound = createSynthVoice('sine', 'C4', 0.25);
        state.incorrectSound = createSynthVoice('square', 'A2', 0.12);

        // Provide seamless global Tone.js compatibility shim so existing calls
        // (Tone.start, Tone.now, Tone.context.resume) resolve without external script
        if (typeof window !== 'undefined') {
            window.Tone = window.Tone || {};
            window.Tone.start = async () => resumeAudioContext();
            window.Tone.now = () => (getAudioContext()?.currentTime || (Date.now() / 1000));
            window.Tone.context = {
                get state() {
                    return getAudioContext()?.state || 'suspended';
                },
                resume: async () => resumeAudioContext()
            };
            window.Tone.Synth = function(opts = {}) {
                const waveType = opts.oscillator?.type || 'sine';
                return createSynthVoice(waveType, 'C4', 0.2);
            };
        }
    } catch (e) {
        // Silently catch audio initialization issues
    }
}
