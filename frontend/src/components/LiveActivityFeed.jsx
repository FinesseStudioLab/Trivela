import { useEffect, useState } from 'react';
import { getWebSocketClient } from '../lib/websocket';
import {
  ACTIVITY_CHANNEL,
  addActivity,
  describeActivity,
  formatRelativeTime,
  normalizeActivity,
} from '../lib/activityFeed';
import './LiveActivityFeed.css';

/**
 * LiveActivityFeed — platform-wide ticker of recent registrations and reward
 * claims, streamed over the `activity` WebSocket channel (#1201).
 *
 * @param {object}   props
 * @param {object}   [props.client]   WebSocket client (defaults to the app singleton; injectable for tests)
 * @param {number}   [props.maxItems] Items kept in the feed (default 20)
 */
export default function LiveActivityFeed({ client, maxItems }) {
  const [items, setItems] = useState([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let ws;
    try {
      ws = client || getWebSocketClient();
    } catch {
      return undefined;
    }
    const offs = [
      ws.on('connected', () => setConnected(true)),
      ws.on('disconnected', () => setConnected(false)),
      ws.on('activity', (message) => {
        const item = normalizeActivity(message);
        if (item) setItems((prev) => addActivity(prev, item, maxItems));
      }),
    ];
    if (ws.isConnected) setConnected(true);
    else ws.connect?.();
    ws.subscribe(ACTIVITY_CHANNEL);

    return () => {
      offs.forEach((off) => off());
      ws.unsubscribe?.(ACTIVITY_CHANNEL);
    };
  }, [client, maxItems]);

  // Keep relative timestamps fresh without re-rendering on every frame.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="live-activity" aria-labelledby="live-activity-title">
      <header className="live-activity__header">
        <h2 id="live-activity-title" className="live-activity__title">
          Live activity
        </h2>
        <span
          className={`live-activity__status ${connected ? 'is-live' : 'is-offline'}`}
          aria-live="polite"
        >
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="live-activity__empty">
          Waiting for registrations and reward claims across Trivela…
        </p>
      ) : (
        <ul className="live-activity__list" aria-live="polite" aria-relevant="additions">
          {items.map((item) => (
            <li key={item.id} className={`live-activity__item live-activity__item--${item.kind}`}>
              <span className="live-activity__icon" aria-hidden="true">
                {item.kind === 'claim' ? '🎁' : '✨'}
              </span>
              <span className="live-activity__text">{describeActivity(item)}</span>
              <time
                className="live-activity__time"
                dateTime={new Date(item.timestamp).toISOString()}
              >
                {formatRelativeTime(item.timestamp, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
