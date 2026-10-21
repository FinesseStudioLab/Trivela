/**
 * Optional success chime (#1234).
 *
 * A short two-note tone synthesized with the Web Audio API, so no audio asset
 * ships with the bundle. Off by default; users opt in from Notification
 * settings and the choice is kept in localStorage.
 */

export const SUCCESS_CHIME_STORAGE_KEY = 'trivela:success-chime';

let audioContext = null;

export function isSuccessChimeEnabled() {
  try {
    return window.localStorage.getItem(SUCCESS_CHIME_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSuccessChimeEnabled(enabled) {
  try {
    window.localStorage.setItem(SUCCESS_CHIME_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode etc.) — the preference just won't persist.
  }
}

/**
 * Plays the chime if the user enabled it. Never throws: audio is a nicety and
 * must not break the success flow.
 *
 * @param {{ force?: boolean }} [options] - `force` skips the preference check
 *   (used by the settings "preview" button).
 * @returns {boolean} whether a chime was scheduled.
 */
export function playSuccessChime({ force = false } = {}) {
  if (!force && !isSuccessChimeEnabled()) return false;
  if (typeof window === 'undefined') return false;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    audioContext = audioContext ?? new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume?.();

    const now = audioContext.currentTime;
    // C6 then E6 — short, soft, and clearly "positive".
    [1046.5, 1318.5].forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
    return true;
  } catch {
    return false;
  }
}

/** Test helper: drop the cached AudioContext. */
export function __resetSuccessChimeForTests() {
  audioContext = null;
}
