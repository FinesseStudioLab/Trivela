/**
 * WebhookManagement - Partner webhook subscription management UI
 * Provides endpoint registration, event subscriptions, delivery logs, and replay functionality
 */

import { useState, useEffect } from 'react';

const AVAILABLE_EVENTS = [
  'campaign.created',
  'campaign.updated',
  'participant.registered',
  'reward.claimed',
];

export default function WebhookManagement() {
  const [webhooks, setWebhooks] = useState([]);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [newWebhook, setNewWebhook] = useState({
    url: '',
    events: [],
    description: '',
    secret: '',
  });

  const [testEvent, setTestEvent] = useState('campaign.created');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const response = await fetch('/api/v1/webhooks');
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data);
      }
    } catch (err) {
      setError('Failed to fetch webhooks');
    }
  };

  const fetchDeliveryLogs = async (webhookId) => {
    try {
      const response = await fetch(`/api/v1/webhooks/${webhookId}/deliveries`);
      if (response.ok) {
        const data = await response.json();
        setDeliveryLogs(data);
      }
    } catch (err) {
      setError('Failed to fetch delivery logs');
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWebhook),
      });

      if (response.ok) {
        const data = await response.json();
        setWebhooks([...webhooks, data]);
        setShowCreateModal(false);
        setNewWebhook({ url: '', events: [], description: '', secret: '' });
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to create webhook');
      }
    } catch (err) {
      setError('Failed to create webhook');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`/api/v1/webhooks/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setWebhooks(webhooks.filter((w) => w.id !== id));
        if (selectedWebhook?.id === id) {
          setSelectedWebhook(null);
          setDeliveryLogs([]);
        }
      }
    } catch (err) {
      setError('Failed to delete webhook');
    }
  };

  const handleRotateSecret = async (id) => {
    if (!confirm('This will generate a new secret. The old secret will no longer work. Continue?'))
      return;

    try {
      const response = await fetch(`/api/v1/webhooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotateSecret: true }),
      });

      if (response.ok) {
        const data = await response.json();
        setWebhooks(webhooks.map((w) => (w.id === id ? { ...w, secret: data.secret } : w)));
        alert('New secret generated. Save it securely: ' + data.secret);
      }
    } catch (err) {
      setError('Failed to rotate secret');
    }
  };

  const handleReplayDelivery = async (webhookId, deliveryId) => {
    try {
      const response = await fetch(
        `/api/v1/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
        {
          method: 'POST',
        },
      );

      if (response.ok) {
        const data = await response.json();
        alert('Replay initiated: ' + data.id);
        fetchDeliveryLogs(webhookId);
      }
    } catch (err) {
      setError('Failed to replay delivery');
    }
  };

  const handleTestWebhook = async () => {
    if (!selectedWebhook) return;

    setLoading(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/v1/webhooks/${selectedWebhook.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: testEvent }),
      });

      const data = await response.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: 'Test failed' });
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = (event) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Webhook Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          + New Webhook
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* Webhook List */}
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Your Webhooks</h2>
          {webhooks.length === 0 ? (
            <div
              style={{
                padding: '24px',
                background: '#f1f5f9',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              No webhooks configured
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  onClick={() => {
                    setSelectedWebhook(webhook);
                    fetchDeliveryLogs(webhook.id);
                  }}
                  style={{
                    padding: '16px',
                    background: selectedWebhook?.id === webhook.id ? '#e0e7ff' : '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {webhook.description || webhook.url}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {webhook.url}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                    {webhook.events.length} events • {webhook.active ? 'Active' : 'Inactive'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Webhook Details */}
        <div>
          {selectedWebhook ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
                  {selectedWebhook.description || 'Webhook Details'}
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleRotateSecret(selectedWebhook.id)}
                    style={{
                      padding: '6px 12px',
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Rotate Secret
                  </button>
                  <button
                    onClick={() => handleDeleteWebhook(selectedWebhook.id)}
                    style={{
                      padding: '6px 12px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <strong>URL:</strong>
                  <div
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}
                  >
                    {selectedWebhook.url}
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Events:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {selectedWebhook.events.map((event) => (
                      <span
                        key={event}
                        style={{
                          background: '#e0e7ff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                        }}
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Created: {new Date(selectedWebhook.createdAt).toLocaleString()}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Delivery Logs</h3>
                <button
                  onClick={() => setShowTestModal(true)}
                  style={{
                    padding: '6px 12px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Test Webhook
                </button>
              </div>

              {deliveryLogs.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#64748b',
                  }}
                >
                  No delivery logs yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {deliveryLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{log.eventType}</span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            background:
                              log.status === 'success'
                                ? '#dcfce7'
                                : log.status === 'failed'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              log.status === 'success'
                                ? '#166534'
                                : log.status === 'failed'
                                  ? '#991b1b'
                                  : '#92400e',
                          }}
                        >
                          {log.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      {log.statusCode && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          Status: {log.statusCode}
                        </div>
                      )}
                      {log.status === 'failed' && (
                        <button
                          onClick={() => handleReplayDelivery(selectedWebhook.id, log.id)}
                          style={{
                            marginTop: '8px',
                            padding: '4px 8px',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Replay
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                padding: '48px',
                background: '#f1f5f9',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              Select a webhook to view details
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
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
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Create Webhook</h2>
            <form onSubmit={handleCreateWebhook}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  URL
                </label>
                <input
                  type="url"
                  required
                  value={newWebhook.url}
                  onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                  placeholder="https://your-server.com/webhook"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Description
                </label>
                <input
                  type="text"
                  value={newWebhook.description}
                  onChange={(e) => setNewWebhook({ ...newWebhook, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                  placeholder="My webhook"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Events
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {AVAILABLE_EVENTS.map((event) => (
                    <label
                      key={event}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.9rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newWebhook.events.includes(event)}
                        onChange={() => toggleEvent(event)}
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Secret (optional)
                </label>
                <input
                  type="text"
                  value={newWebhook.secret}
                  onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                  placeholder="Leave empty to auto-generate"
                />
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                  Used to verify webhook signatures
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#e2e8f0',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    disabled: loading ? 'opacity: 0.5' : undefined,
                  }}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {showTestModal && selectedWebhook && (
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
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Test Webhook</h2>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                Event Type
              </label>
              <select
                value={testEvent}
                onChange={(e) => setTestEvent(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                }}
              >
                {AVAILABLE_EVENTS.map((event) => (
                  <option key={event} value={event}>
                    {event}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
                marginBottom: '16px',
              }}
            >
              <button
                onClick={handleTestWebhook}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  disabled: loading ? 'opacity: 0.5' : undefined,
                }}
              >
                {loading ? 'Sending...' : 'Send Test'}
              </button>
              <button
                onClick={() => setShowTestModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
            {testResult && (
              <div
                style={{
                  background: testResult.success ? '#dcfce7' : '#fee2e2',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                  {testResult.success ? '✓ Test Successful' : '✗ Test Failed'}
                </div>
                {testResult.statusCode && <div>Status Code: {testResult.statusCode}</div>}
                {testResult.response && (
                  <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {testResult.response}
                  </div>
                )}
                {testResult.signature && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>
                    <strong>Signature:</strong> {testResult.signature.slice(0, 32)}...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
