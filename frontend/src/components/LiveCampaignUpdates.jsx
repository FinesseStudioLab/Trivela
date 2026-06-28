import { useEffect, useState } from 'react';
import { getWebSocketClient } from '../lib/websocket';

/**
 * Component to display live campaign updates via WebSocket
 */
export default function LiveCampaignUpdates({ campaignId }) {
  const [updates, setUpdates] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    const wsClient = getWebSocketClient();

    // Handle connection status
    const handleConnected = () => {
      setConnectionStatus('connected');
    };

    const handleDisconnected = () => {
      setConnectionStatus('disconnected');
    };

    const handleError = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    // Handle campaign updates
    const handleCampaignUpdate = (data) => {
      if (data.campaignId === campaignId) {
        setUpdates((prev) => [
          {
            id: Date.now(),
            type: 'update',
            message: `Campaign updated: ${data.update.changes.join(', ')}`,
            timestamp: data.timestamp,
          },
          ...prev.slice(0, 9), // Keep only last 10 updates
        ]);
      }
    };

    // Handle new participants
    const handleNewParticipant = (data) => {
      if (data.campaignId === campaignId) {
        setParticipantCount((prev) => prev + 1);
        setUpdates((prev) => [
          {
            id: Date.now(),
            type: 'participant',
            message: `New participant: ${data.participant.walletAddress.slice(0, 8)}...`,
            timestamp: data.timestamp,
          },
          ...prev.slice(0, 9),
        ]);
      }
    };

    // Register event handlers
    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    wsClient.on('error', handleError);
    wsClient.on('campaign_update', handleCampaignUpdate);
    wsClient.on('new_participant', handleNewParticipant);

    // Connect and subscribe
    wsClient.connect();
    wsClient.subscribeToCampaign(campaignId);

    // Cleanup
    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
      wsClient.off('error', handleError);
      wsClient.off('campaign_update', handleCampaignUpdate);
      wsClient.off('new_participant', handleNewParticipant);
      wsClient.unsubscribe(`campaigns:campaign:${campaignId}`);
    };
  }, [campaignId]);

  return (
    <div className="live-updates">
      <div className="live-updates-header">
        <h3>Live Updates</h3>
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' && (
            <>
              <span className="status-indicator"></span>
              Connected
            </>
          )}
          {connectionStatus === 'disconnected' && 'Disconnected'}
          {connectionStatus === 'error' && 'Connection Error'}
        </div>
      </div>

      {participantCount > 0 && (
        <div className="participant-count">
          <strong>{participantCount}</strong> new participant{participantCount !== 1 ? 's' : ''} since you joined
        </div>
      )}

      {updates.length > 0 ? (
        <ul className="update-list">
          {updates.map((update) => (
            <li key={update.id} className={`update-item update-type-${update.type}`}>
              <span className="update-message">{update.message}</span>
              <span className="update-time">
                {new Date(update.timestamp).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="no-updates">No updates yet. Changes will appear here in real-time.</p>
      )}

      <style>{`
        .live-updates {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
          background: #f9f9f9;
        }

        .live-updates-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .live-updates-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-weight: 500;
        }

        .connection-status.connected {
          background: #e7f5ec;
          color: #2d8147;
        }

        .connection-status.disconnected {
          background: #f0f0f0;
          color: #666;
        }

        .connection-status.error {
          background: #fdecea;
          color: #c41e3a;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #2d8147;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .participant-count {
          padding: 0.75rem;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          margin-bottom: 1rem;
          text-align: center;
        }

        .participant-count strong {
          color: #856404;
        }

        .update-list {
          list-style: none;
          padding: 0;
          margin: 0;
          max-height: 300px;
          overflow-y: auto;
        }

        .update-item {
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: white;
          border-radius: 4px;
          border-left: 3px solid #007bff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.9rem;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .update-type-participant {
          border-left-color: #28a745;
        }

        .update-message {
          flex: 1;
          color: #333;
        }

        .update-time {
          color: #999;
          font-size: 0.8rem;
          margin-left: 1rem;
        }

        .no-updates {
          text-align: center;
          color: #999;
          padding: 2rem;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
