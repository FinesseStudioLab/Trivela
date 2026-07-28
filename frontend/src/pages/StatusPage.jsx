import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageMeta from '../components/PageMeta';

const STATUS_COLORS = {
  operational: 'bg-green-500',
  degraded: 'bg-yellow-500',
  outage: 'bg-red-500',
};

const STATUS_TEXT = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
};

const IMPACT_COLORS = {
  none: 'text-gray-500',
  minor: 'text-yellow-600',
  major: 'text-orange-600',
  critical: 'text-red-600',
};

const IMPACT_BADGES = {
  none: 'bg-gray-100 text-gray-800',
  minor: 'bg-yellow-100 text-yellow-800',
  major: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const INCIDENT_STATUS_COLORS = {
  investigating: 'bg-yellow-100 text-yellow-800',
  identified: 'bg-orange-100 text-orange-800',
  monitoring: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
};

export default function StatusPage() {
  const { t } = useTranslation();
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatusData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email) return;

    setSubscribing(true);
    setSubscribeMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/status/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Subscription failed');
      }

      setSubscribeMessage({ type: 'success', message: 'Successfully subscribed to status updates!' });
      setEmail('');
    } catch (err) {
      setSubscribeMessage({ type: 'error', message: err.message });
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading status page</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const overallStatus = statusData?.status || 'operational';

  return (
    <>
      <PageMeta
        title="System Status"
        description="Real-time status of Trivela platform services and components"
      />
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
                <p className="text-gray-600 mt-1">Real-time service availability and incident updates</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${STATUS_COLORS[overallStatus]}`}></span>
                <span className={`font-semibold ${IMPACT_COLORS[overallStatus]}`}>
                  {STATUS_TEXT[overallStatus]}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Components */}
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Components</h2>
            </div>
            <div className="divide-y">
              {statusData?.components?.map((component) => (
                <div key={component.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{component.name}</h3>
                    <p className="text-sm text-gray-500">{component.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {component.latency && (
                      <span className="text-sm text-gray-500">{component.latency}ms</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[component.status]}`}></span>
                      <span className={`text-sm font-medium ${IMPACT_COLORS[component.status]}`}>
                        {STATUS_TEXT[component.status]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Incidents */}
          {statusData?.incidents && statusData.incidents.length > 0 && (
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Active Incidents</h2>
              </div>
              <div className="divide-y">
                {statusData.incidents.map((incident) => (
                  <div key={incident.id} className="px-6 py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{incident.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${INCIDENT_STATUS_COLORS[incident.status]}`}>
                            {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${IMPACT_BADGES[incident.impact]}`}>
                            {incident.impact.charAt(0).toUpperCase() + incident.impact.slice(1)} Impact
                          </span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(incident.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-3">{incident.description}</p>
                    {incident.updates && incident.updates.length > 0 && (
                      <div className="bg-gray-50 rounded p-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Updates</h4>
                        <div className="space-y-2">
                          {incident.updates.map((update, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="text-gray-500">
                                {new Date(update.timestamp).toLocaleString()} -{' '}
                              </span>
                              <span className="text-gray-700">{update.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Maintenance */}
          {statusData?.maintenance && statusData.maintenance.length > 0 && (
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Scheduled Maintenance</h2>
              </div>
              <div className="divide-y">
                {statusData.maintenance.map((maintenance) => (
                  <div key={maintenance.id} className="px-6 py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{maintenance.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(maintenance.scheduledStart).toLocaleString()} -{' '}
                          {new Date(maintenance.scheduledEnd).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(maintenance.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-600">{maintenance.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {maintenance.components.map((comp) => (
                        <span
                          key={comp}
                          className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                        >
                          {comp}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscribe */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscribe to Updates</h2>
            <p className="text-gray-600 mb-4">
              Get notified about incidents and maintenance windows via email.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={subscribing}
              />
              <button
                type="submit"
                disabled={subscribing || !email}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {subscribing ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
            {subscribeMessage && (
              <p
                className={`mt-2 text-sm ${
                  subscribeMessage.type === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {subscribeMessage.message}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Last updated: {statusData?.lastUpdated ? new Date(statusData.lastUpdated).toLocaleString() : 'N/A'}</p>
            <p className="mt-1">Page refreshes automatically every 30 seconds</p>
          </div>
        </div>
      </div>
    </>
  );
}
