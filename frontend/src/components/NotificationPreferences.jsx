import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

const CHANNELS = ['in_app', 'email', 'push'];

const CHANNEL_LABELS = {
  in_app: 'In-App',
  email: 'Email',
  push: 'Web Push',
};

const EVENT_TYPES = [
  { id: 'credit_received', label: 'Credit received', critical: false },
  { id: 'claim_ready', label: 'Claim ready', critical: false },
  { id: 'campaign_update', label: 'Campaign update', critical: false },
  { id: 'campaign_ended', label: 'Campaign ended', critical: false },
  { id: 'reward_expiring', label: 'Reward expiring', critical: false },
  { id: 'security_alert', label: 'Security alert', critical: true },
  { id: 'account_change', label: 'Account change', critical: true },
];

const DEFAULT_PREFS = Object.fromEntries(
  EVENT_TYPES.flatMap((e) =>
    CHANNELS.map((ch) => [`${e.id}:${ch}`, !e.critical || ch === 'in_app']),
  ),
);

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.getNotificationPreferences();
      const items = Array.isArray(data) ? data : (data.preferences ?? data.data ?? []);
      const map = { ...DEFAULT_PREFS };
      for (const pref of items) {
        map[`${pref.event_type}:${pref.channel}`] = pref.enabled;
      }
      setPrefs(map);
    } catch {
      setError('Could not load preferences.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const handleToggle = async (eventType, channel, isCritical) => {
    if (isCritical) return;
    const key = `${eventType}:${channel}`;
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setSaving(key);
    try {
      await apiClient.updateNotificationPreference(eventType, channel, next);
    } catch {
      setPrefs((p) => ({ ...p, [key]: !next }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="notif-prefs-heading">
      <div style={{ marginBottom: 20 }}>
        <h2
          id="notif-prefs-heading"
          style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700 }}
        >
          Notification Preferences
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Choose which events trigger notifications and on which channels.
          Security-critical notices cannot be disabled.
        </p>
      </div>

      {error && (
        <div className="detail-error" role="alert" style={{ marginBottom: 16 }}>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={loadPrefs}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" style={{ color: 'var(--text-muted)' }}>Loading preferences…</p>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        >
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
            aria-label="Notification preference matrix"
          >
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <th
                  scope="col"
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Event
                </th>
                {CHANNELS.map((ch) => (
                  <th
                    key={ch}
                    scope="col"
                    style={{
                      textAlign: 'center',
                      padding: '10px 16px',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {CHANNEL_LABELS[ch]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENT_TYPES.map((event, idx) => (
                <tr
                  key={event.id}
                  style={{
                    background: idx % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                  }}
                >
                  <td
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    <span>{event.label}</span>
                    {event.critical && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'rgba(255,142,142,0.15)',
                          color: 'var(--danger)',
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Required
                      </span>
                    )}
                  </td>
                  {CHANNELS.map((ch) => {
                    const key = `${event.id}:${ch}`;
                    const enabled = prefs[key] ?? true;
                    const isSaving = saving === key;
                    const disabled = event.critical;
                    return (
                      <td
                        key={ch}
                        style={{
                          textAlign: 'center',
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                          }}
                          aria-label={`${event.label} via ${CHANNEL_LABELS[ch]}`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={disabled || isSaving}
                            onChange={() => handleToggle(event.id, ch, disabled)}
                            style={{ width: 16, height: 16, cursor: disabled ? 'not-allowed' : 'pointer' }}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
