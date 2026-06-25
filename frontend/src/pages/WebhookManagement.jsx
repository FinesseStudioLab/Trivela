import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

const SUPPORTED_EVENTS = [
  'campaign.created',
  'campaign.updated',
  'campaign.deleted',
  'campaign.activated',
  'campaign.deactivated',
  'participant.registered',
  'participant.deregistered',
  'reward.claimed',
  'reward.credited',
];

function formatDate(str) {
  if (!str) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(str),
    );
  } catch {
    return str;
  }
}

function StatusBadge({ code }) {
  const ok = code >= 200 && code < 300;
  const style = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    background: ok ? '#d1fae5' : code === 0 ? '#fee2e2' : '#fef3c7',
    color: ok ? '#065f46' : code === 0 ? '#991b1b' : '#92400e',
  };
  return <span style={style}>{code === 0 ? 'ERR' : code}</span>;
}

function DeliveryHistory({ webhookId, apiKey, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replayingId, setReplayingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.listWebhookDeliveries(webhookId, apiKey, { limit: 50 });
      const items = Array.isArray(data) ? data : (data.data ?? data.items ?? []);
      setDeliveries(items);
    } catch (err) {
      setError(err.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [webhookId, apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReplay(delivery) {
    setReplayingId(delivery.id);
    try {
      await apiClient.replayDelivery(webhookId, delivery.id, apiKey);
      await load();
    } catch (err) {
      alert(`Replay failed: ${err.message}`);
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface, #fff)',
          borderRadius: 8,
          padding: 24,
          width: '90%',
          maxWidth: 800,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Delivery History</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && deliveries.length === 0 && (
          <p style={{ color: 'var(--color-muted, #666)' }}>No deliveries yet.</p>
        )}
        {!loading && deliveries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <th style={{ padding: '6px 8px' }}>Event</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Attempts</th>
                <th style={{ padding: '6px 8px' }}>Error</th>
                <th style={{ padding: '6px 8px' }}>Time</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr
                  key={d.id}
                  style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}
                >
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{d.event}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <StatusBadge code={d.statusCode} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>{d.attempts}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--color-muted, #666)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.error || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {formatDate(d.createdAt)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {(d.statusCode === 0 || d.statusCode >= 400) && (
                      <button
                        onClick={() => handleReplay(d)}
                        disabled={replayingId === d.id}
                        style={{
                          padding: '3px 10px',
                          fontSize: 12,
                          cursor: 'pointer',
                          borderRadius: 4,
                          border: '1px solid var(--color-border, #d1d5db)',
                          background: 'none',
                        }}
                      >
                        {replayingId === d.id ? 'Replaying…' : 'Replay'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WebhookForm({ initial, onSave, onCancel }) {
  const [url, setUrl] = useState(initial?.url || '');
  const [events, setEvents] = useState(initial?.events || []);
  const [description, setDescription] = useState(initial?.description || '');
  const [active, setActive] = useState(initial?.active !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleEvent(evt) {
    setEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return setError('URL is required');
    if (events.length === 0) return setError('Select at least one event');
    setSaving(true);
    setError('');
    try {
      await onSave({ url: url.trim(), events, description: description.trim(), active });
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Endpoint URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          required
          style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Events</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUPPORTED_EVENTS.map((evt) => (
            <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={events.includes(evt)}
                onChange={() => toggleEvent(evt)}
              />
              <span style={{ fontFamily: 'monospace' }}>{evt}</span>
            </label>
          ))}
        </div>
      </div>
      {initial && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active</span>
        </label>
      )}
      {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={saving}
          style={{ padding: '8px 16px', borderRadius: 4, background: 'var(--color-primary, #3b82f6)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
        >
          {saving ? 'Saving…' : initial ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', background: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function WebhookManagement() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('trivela_api_key') || '');
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newSecret, setNewSecret] = useState(null);
  const [historyWebhookId, setHistoryWebhookId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testEvent, setTestEvent] = useState('campaign.created');

  function saveApiKey(key) {
    setApiKey(key);
    sessionStorage.setItem('trivela_api_key', key);
  }

  const load = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.listWebhooks(apiKey);
      const items = Array.isArray(data) ? data : (data.data ?? data.items ?? []);
      setWebhooks(items);
    } catch (err) {
      setError(err.message || 'Failed to load webhooks');
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(data) {
    const created = await apiClient.createWebhook(data, apiKey);
    setNewSecret({ id: created.id, secret: created.secret });
    setShowCreate(false);
    await load();
  }

  async function handleUpdate(id, data) {
    await apiClient.updateWebhook(id, data, apiKey);
    setEditingId(null);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this webhook?')) return;
    await apiClient.deleteWebhook(id, apiKey);
    await load();
  }

  async function handleTest(id) {
    setTestingId(id);
    try {
      await apiClient.testWebhook(id, testEvent, apiKey);
      alert('Test event sent successfully.');
    } catch (err) {
      alert(`Test failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginTop: 0 }}>Webhook Management</h2>

      <div style={{ marginBottom: 20, padding: 16, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, background: 'var(--color-surface-secondary, #f9fafb)' }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>API Key</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
            placeholder="Enter your API key"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)' }}
          />
          <button
            onClick={load}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', background: 'none', cursor: 'pointer' }}
          >
            Load
          </button>
        </div>
      </div>

      {newSecret && (
        <div style={{ padding: 16, marginBottom: 16, background: '#d1fae5', borderRadius: 8, border: '1px solid #6ee7b7' }}>
          <strong>Webhook created.</strong> Copy your signing secret now — it won&apos;t be shown again.
          <div style={{ fontFamily: 'monospace', marginTop: 8, wordBreak: 'break-all', fontSize: 13 }}>
            {newSecret.secret}
          </div>
          <button
            onClick={() => setNewSecret(null)}
            style={{ marginTop: 8, padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', fontSize: 12 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          style={{ marginBottom: 20, padding: '8px 16px', borderRadius: 4, background: 'var(--color-primary, #3b82f6)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
        >
          + New Webhook
        </button>
      )}

      {showCreate && (
        <div style={{ marginBottom: 20, padding: 16, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>New Webhook</h3>
          <WebhookForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {loading && <p>Loading webhooks…</p>}
      {!loading && apiKey && webhooks.length === 0 && !error && (
        <p style={{ color: 'var(--color-muted, #666)' }}>No webhooks registered yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {webhooks.map((wh) => (
          <div
            key={wh.id}
            style={{
              border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: 8,
              padding: 16,
              background: wh.active ? 'var(--color-surface, #fff)' : 'var(--color-surface-secondary, #f9fafb)',
            }}
          >
            {editingId === wh.id ? (
              <>
                <h4 style={{ marginTop: 0 }}>Edit Webhook</h4>
                <WebhookForm
                  initial={wh}
                  onSave={(data) => handleUpdate(wh.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wh.url}
                    </div>
                    {wh.description && (
                      <div style={{ fontSize: 13, color: 'var(--color-muted, #666)', marginTop: 2 }}>
                        {wh.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: wh.active ? '#d1fae5' : '#fee2e2',
                          color: wh.active ? '#065f46' : '#991b1b',
                          fontWeight: 600,
                        }}
                      >
                        {wh.active ? 'active' : 'inactive'}
                      </span>
                      {(wh.events || []).map((evt) => (
                        <span
                          key={evt}
                          style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--color-surface-secondary, #f3f4f6)', fontFamily: 'monospace' }}
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted, #9ca3af)', marginTop: 6 }}>
                      Created {formatDate(wh.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setHistoryWebhookId(wh.id)}
                      style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', background: 'none', cursor: 'pointer' }}
                    >
                      Deliveries
                    </button>
                    <select
                      value={testEvent}
                      onChange={(e) => setTestEvent(e.target.value)}
                      style={{ fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', padding: '4px 6px' }}
                    >
                      {SUPPORTED_EVENTS.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleTest(wh.id)}
                      disabled={testingId === wh.id}
                      style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', background: 'none', cursor: 'pointer' }}
                    >
                      {testingId === wh.id ? 'Sending…' : 'Test'}
                    </button>
                    <button
                      onClick={() => setEditingId(wh.id)}
                      style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border, #d1d5db)', background: 'none', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(wh.id)}
                      style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #fca5a5', color: '#dc2626', background: 'none', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {historyWebhookId && (
        <DeliveryHistory
          webhookId={historyWebhookId}
          apiKey={apiKey}
          onClose={() => setHistoryWebhookId(null)}
        />
      )}
    </div>
  );
}
