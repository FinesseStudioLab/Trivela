import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const source = readFileSync('public/embed.js', 'utf8');

function load() {
  delete window.TrivelaWidget;
  window.eval(source);
  return window.TrivelaWidget;
}

describe('embed.js leaderboard widget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('builds a leaderboard URL with a clamped limit', () => {
    const W = load();
    const w = new W({
      campaign: 'c 1',
      widget: 'leaderboard',
      limit: '500',
      origin: 'https://t.app',
    });
    expect(w._buildSrc()).toBe('https://t.app/embed/v1/leaderboard/c%201?limit=50');
  });

  it('defaults to the card endpoint and ignores unknown widget types', () => {
    const W = load();
    expect(new W({ campaign: 'a', origin: 'https://t.app' })._buildSrc()).toBe(
      'https://t.app/embed/campaign/a',
    );
    expect(new W({ campaign: 'a', widget: 'evil', origin: 'https://t.app' })._buildSrc()).toBe(
      'https://t.app/embed/campaign/a',
    );
  });

  it('refreshes the iframe on an interval (min 30s) and stops on destroy', () => {
    const W = load();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const w = new W({
      campaign: 'a',
      widget: 'leaderboard',
      refresh: '5',
      origin: 'https://t.app',
    });
    w.mount(host);
    const iframe = host.querySelector('iframe');
    const spy = vi.spyOn(iframe, 'src', 'set');
    vi.advanceTimersByTime(29_000);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(spy).toHaveBeenCalledTimes(1);
    w.destroy();
    vi.advanceTimersByTime(120_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
