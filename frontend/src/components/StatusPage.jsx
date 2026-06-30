/**
 * StatusPage - Public status page with component health and incident communication
 * Displays real-time component status, active incidents, and maintenance notices
 */

import { useState, useEffect } from 'react';

export default function StatusPage() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/v1/status');
      if (response.ok) {
        const data = await response.json();
        setStatusData(data);
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/v1/status/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        alert('Subscribed to status updates!');
        setShowSubscribe(false);
        setEmail('');
      } else {
        const err = await response.json();
        alert(err.error || 'Subscription failed');
      }
    } catch (err) {
      alert('Subscription failed');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'operational':
        return '#10b981';
      case 'degraded':
        return '#f59e0b';
      case 'outage':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'operational':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'outage':
        return '✗';
      default:
        return '○';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
        <p>Loading status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '16px' }}>❌</div>
        <p style={{ color: '#ef4444' }}>{error}</p>
        <button
          onClick={fetchStatus}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!statusData) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: 'white', padding: '32px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '2rem' }}>Trivela Status</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: getStatusColor(statusData.status),
                }}
              />
              <span style={{ fontWeight: 600, color: getStatusColor(statusData.status) }}>
                {statusData.status.charAt(0).toUpperCase() + statusData.status.slice(1)}
              </span>
            </div>
          </div>
          <p style={{ color: '#64748b', margin: 0 }}>
            Real-time status of Trivela services and infrastructure
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        {/* Components */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Components</h2>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
          >
            {statusData.components.map((component, index) => (
              <div
                key={component.id}
                style={{
                  padding: '16px 24px',
                  borderBottom:
                    index < statusData.components.length - 1 ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{component.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {component.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {component.latency && (
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {component.latency}ms
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{getStatusIcon(component.status)}</span>
                    <span style={{ fontWeight: 600, color: getStatusColor(component.status) }}>
                      {component.status.charAt(0).toUpperCase() + component.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Active Incidents */}
        {statusData.incidents && statusData.incidents.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Active Incidents</h2>
            {statusData.incidents.map((incident) => (
              <div
                key={incident.id}
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fcd34d',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{incident.title}</h3>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background:
                        incident.impact === 'critical'
                          ? '#fee2e2'
                          : incident.impact === 'major'
                            ? '#fef3c7'
                            : '#f1f5f9',
                      color:
                        incident.impact === 'critical'
                          ? '#991b1b'
                          : incident.impact === 'major'
                            ? '#92400e'
                            : '#64748b',
                    }}
                  >
                    {incident.impact.toUpperCase()}
                  </span>
                </div>
                <p style={{ color: '#64748b', marginBottom: '12px' }}>{incident.description}</p>
                <div style={{ fontSize: '0.85rem', color: '#92400e' }}>
                  Status: <strong>{incident.status}</strong> • Started{' '}
                  {new Date(incident.createdAt).toLocaleString()}
                </div>
                {incident.updates && incident.updates.length > 1 && (
                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#64748b' }}>
                      View updates ({incident.updates.length})
                    </summary>
                    <div style={{ marginTop: '8px', paddingLeft: '16px' }}>
                      {incident.updates.map((update, i) => (
                        <div key={i} style={{ marginBottom: '8px', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 600 }}>{update.status}</div>
                          <div style={{ color: '#64748b' }}>{update.message}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {new Date(update.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Scheduled Maintenance */}
        {statusData.maintenance && statusData.maintenance.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Scheduled Maintenance</h2>
            {statusData.maintenance.map((maintenance) => (
              <div
                key={maintenance.id}
                style={{
                  background: '#e0f2fe',
                  border: '1px solid #7dd3fc',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>{maintenance.title}</h3>
                <p style={{ color: '#64748b', marginBottom: '8px' }}>{maintenance.description}</p>
                <div style={{ fontSize: '0.85rem', color: '#0369a1' }}>
                  <strong>{new Date(maintenance.scheduledStart).toLocaleString()}</strong> →{' '}
                  <strong>{new Date(maintenance.scheduledEnd).toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Subscribe */}
        <section style={{ marginBottom: '32px' }}>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0' }}>Subscribe to Updates</h3>
            <p style={{ color: '#64748b', marginBottom: '16px' }}>
              Get notified when incidents occur or maintenance is scheduled
            </p>
            {!showSubscribe ? (
              <button
                onClick={() => setShowSubscribe(true)}
                style={{
                  padding: '10px 20px',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Subscribe
              </button>
            ) : (
              <form
                onSubmit={handleSubscribe}
                style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    minWidth: '250px',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Subscribe
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubscribe(false)}
                  style={{
                    padding: '10px 16px',
                    background: '#e2e8f0',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            Last updated: {new Date(statusData.lastUpdated).toLocaleString()}
          </p>
          <p style={{ margin: 0 }}>
            Powered by Trivela •{' '}
            <a
              href="https://github.com/FinesseStudioLab/Trivela"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#6366f1' }}
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
