import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUCCESS_CHIME_STORAGE_KEY,
  __resetSuccessChimeForTests,
  isSuccessChimeEnabled,
  playSuccessChime,
  setSuccessChimeEnabled,
} from './successChime';

function makeFakeAudioContext() {
  const node = () => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn() },
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  });
  return vi.fn(function FakeAudioContext() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = vi.fn(node);
    this.createGain = vi.fn(node);
  });
}

describe('successChime', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSuccessChimeForTests();
  });

  afterEach(() => {
    delete window.AudioContext;
  });

  it('is disabled by default', () => {
    expect(isSuccessChimeEnabled()).toBe(false);
  });

  it('persists the preference', () => {
    setSuccessChimeEnabled(true);
    expect(window.localStorage.getItem(SUCCESS_CHIME_STORAGE_KEY)).toBe('on');
    expect(isSuccessChimeEnabled()).toBe(true);
    setSuccessChimeEnabled(false);
    expect(isSuccessChimeEnabled()).toBe(false);
  });

  it('does not play when disabled', () => {
    window.AudioContext = makeFakeAudioContext();
    expect(playSuccessChime()).toBe(false);
    expect(window.AudioContext).not.toHaveBeenCalled();
  });

  it('plays two notes when enabled', () => {
    const Ctx = makeFakeAudioContext();
    window.AudioContext = Ctx;
    setSuccessChimeEnabled(true);
    expect(playSuccessChime()).toBe(true);
    const ctx = Ctx.mock.instances[0];
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('force plays even when disabled (settings preview)', () => {
    window.AudioContext = makeFakeAudioContext();
    expect(playSuccessChime({ force: true })).toBe(true);
  });

  it('fails quietly when Web Audio is unavailable', () => {
    setSuccessChimeEnabled(true);
    expect(playSuccessChime()).toBe(false);
  });
});
