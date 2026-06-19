import { useEffect, useState, useId } from 'react';
import { Client as CampaignClient } from '../contracts/campaign';
import { getSorobanRpcUrl, getNetworkPassphrase, getCampaignContractId } from '../config';
import { getWalletAddress, isWalletConnected } from '../stellar';
import { walletManager } from '../lib/wallet/index.js';
import TransactionStatus from './TransactionStatus';
import { logSafeEvent } from '../lib/safeAnalytics';
import './AdminControlPanel.css';

/**
 * AdminControlPanel - On-chain campaign administration interface
 *
 * Provides admin controls for:
 * - set_active: Enable/disable campaign registration
 * - set_window: Set registration time window
 * - set_max_cap: Set maximum participant limit
 * - set_merkle_root: Set allowlist Merkle root
 */
export default function AdminControlPanel({ contractId: propContractId }) {
  const [contractId, setContractId] = useState(propContractId || getCampaignContractId() || '');
  const [walletAddress, setWalletAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');

  // Campaign state
  const [campaignState, setCampaignState] = useState({
    isActive: false,
    window: { start: 0n, end: 0n },
    maxCap: 0n,
    merkleRoot: null,
    participantCount: 0n,
    adminNonce: 0n,
  });

  // Form states
  const [activeToggle, setActiveToggle] = useState(false);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [maxCapInput, setMaxCapInput] = useState('');
  const [merkleRootInput, setMerkleRootInput] = useState('');

  // IDs for accessibility
  const contractIdId = useId();
  const activeToggleId = useId();
  const windowStartId = useId();
  const windowEndId = useId();
  const maxCapId = useId();
  const merkleRootId = useId();

  // Load campaign state
  const loadCampaignState = async () => {
    if (!contractId) return;

    setIsLoading(true);
    setError('');

    try {
      const client = new CampaignClient({
        rpcUrl: getSorobanRpcUrl(),
        networkPassphrase: getNetworkPassphrase(),
        contractId,
      });

      const [isActive, window, maxCap, merkleRoot, participantCount, adminNonce] =
        await Promise.all([
          client.is_active().then((tx) => tx.simulate()),
          client.get_window().then((tx) => tx.simulate()),
          client.get_max_cap().then((tx) => tx.simulate()),
          client.get_merkle_root().then((tx) => tx.simulate()),
          client.get_participant_count().then((tx) => tx.simulate()),
          client.admin_nonce().then((tx) => tx.simulate()),
        ]);

      const state = {
        isActive,
        window: { start: window[0], end: window[1] },
        maxCap,
        merkleRoot,
        participantCount,
        adminNonce,
      };

      setCampaignState(state);

      // Update form values
      setActiveToggle(isActive);
      setWindowStart(
        window[0] === 0n ? '' : new Date(Number(window[0]) * 1000).toISOString().slice(0, 16),
      );
      setWindowEnd(
        window[1] === 18446744073709551615n
          ? ''
          : new Date(Number(window[1]) * 1000).toISOString().slice(0, 16),
      );
      setMaxCapInput(maxCap === 0n ? '' : maxCap.toString());
      setMerkleRootInput(
        merkleRoot
          ? Array.from(merkleRoot)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
          : '',
      );
    } catch (err) {
      setError(`Failed to load campaign state: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Load wallet address
  const loadWalletAddress = async () => {
    try {
      const connected = await isWalletConnected();
      if (connected) {
        const address = await getWalletAddress();
        setWalletAddress(address);
      }
    } catch (err) {
      console.warn('Failed to load wallet address:', err);
    }
  };

  useEffect(() => {
    loadWalletAddress();
    if (contractId) {
      loadCampaignState();
    }
  }, [contractId]);

  // Create campaign client for transactions
  const createClient = () => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    return new CampaignClient({
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
      contractId,
      publicKey: walletAddress,
      signTransaction: async (txXdr) => {
        const signedTxXdr = await walletManager.signTransaction(txXdr, {
          networkPassphrase: getNetworkPassphrase(),
          address: walletAddress,
        });
        return { signedTxXdr };
      },
    });
  };

  // Execute admin transaction
  const executeAdminTransaction = async (transactionFn, successMessage) => {
    setIsLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const connected = await isWalletConnected();
      if (!connected) {
        throw new Error('Please connect your wallet to perform admin operations');
      }

      const client = createClient();
      const tx = await transactionFn(client);
      await tx.signAndSend();

      const hash = tx.signed.hash().toString('hex');
      setTxHash(hash);
      setSuccess(successMessage);

      // Reload campaign state
      setTimeout(() => {
        loadCampaignState();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Transaction failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Admin action handlers
  const handleSetActive = async () => {
    await executeAdminTransaction(
      (client) =>
        client.set_active({
          admin: walletAddress,
          nonce: campaignState.adminNonce,
          active: activeToggle,
        }),
      `Campaign ${activeToggle ? 'activated' : 'deactivated'} successfully`,
    );

    logSafeEvent('admin_set_active', {
      contractId,
      active: activeToggle,
      walletAddress,
    });
  };

  const handleSetWindow = async () => {
    const start = windowStart ? Math.floor(new Date(windowStart).getTime() / 1000) : 0;
    const end = windowEnd
      ? Math.floor(new Date(windowEnd).getTime() / 1000)
      : Number.MAX_SAFE_INTEGER;

    if (start > end) {
      setError('Start time must be before end time');
      return;
    }

    await executeAdminTransaction(
      (client) =>
        client.set_window({
          admin: walletAddress,
          nonce: campaignState.adminNonce,
          start: BigInt(start),
          end: BigInt(end),
        }),
      'Registration window updated successfully',
    );

    logSafeEvent('admin_set_window', {
      contractId,
      start,
      end,
      walletAddress,
    });
  };

  const handleSetMaxCap = async () => {
    const maxCap = maxCapInput ? BigInt(maxCapInput) : 0n;

    await executeAdminTransaction(
      (client) =>
        client.set_max_cap({
          admin: walletAddress,
          nonce: campaignState.adminNonce,
          max_cap: maxCap,
        }),
      `Maximum participant cap ${maxCap === 0n ? 'removed' : `set to ${maxCap}`}`,
    );

    logSafeEvent('admin_set_max_cap', {
      contractId,
      maxCap: maxCap.toString(),
      walletAddress,
    });
  };

  const handleSetMerkleRoot = async () => {
    let rootBytes;

    if (!merkleRootInput.trim()) {
      // Empty root (disable allowlist)
      rootBytes = new Uint8Array(32);
    } else {
      // Parse hex string
      const hex = merkleRootInput.replace(/^0x/, '').replace(/\s/g, '');
      if (hex.length !== 64) {
        setError('Merkle root must be 32 bytes (64 hex characters)');
        return;
      }

      try {
        rootBytes = new Uint8Array(hex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
      } catch (err) {
        setError('Invalid hex format for Merkle root');
        return;
      }
    }

    await executeAdminTransaction(
      (client) =>
        client.set_merkle_root({
          admin: walletAddress,
          nonce: campaignState.adminNonce,
          root: rootBytes,
        }),
      merkleRootInput.trim() ? 'Merkle root allowlist enabled' : 'Merkle root allowlist disabled',
    );

    logSafeEvent('admin_set_merkle_root', {
      contractId,
      hasRoot: !!merkleRootInput.trim(),
      walletAddress,
    });
  };

  const formatTimestamp = (timestamp) => {
    if (timestamp === 0n) return 'No limit';
    if (timestamp === 18446744073709551615n) return 'No limit';
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  const formatMerkleRoot = (root) => {
    if (!root) return 'None (open registration)';
    const hex = Array.from(root)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `0x${hex.slice(0, 8)}...${hex.slice(-8)}`;
  };

  if (!contractId) {
    return (
      <div className="admin-control-panel">
        <h3>Admin Control Panel</h3>
        <div className="admin-field">
          <label htmlFor={contractIdId}>Campaign Contract ID</label>
          <input
            id={contractIdId}
            type="text"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            placeholder="Enter contract ID (C...)"
            className="admin-input"
          />
          <small>Enter a campaign contract ID to access admin controls</small>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-control-panel">
      <div className="admin-header">
        <h3>Admin Control Panel</h3>
        <p className="admin-subtitle">On-chain campaign administration</p>
        <div className="admin-contract-info">
          <strong>Contract:</strong> <code>{contractId}</code>
          {walletAddress && (
            <>
              <br />
              <strong>Admin:</strong> <code>{walletAddress}</code>
            </>
          )}
        </div>
      </div>

      {!walletAddress && (
        <div className="admin-warning">
          <p>⚠️ Please connect your wallet to access admin functions</p>
        </div>
      )}

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="admin-success" role="status">
          {success}
        </div>
      )}

      {txHash && (
        <TransactionStatus
          hash={txHash}
          network={getSorobanRpcUrl().includes('testnet') ? 'testnet' : 'mainnet'}
          status="Success"
        />
      )}

      <div className="admin-sections">
        {/* Campaign Status Section */}
        <section className="admin-section">
          <h4>Campaign Status</h4>
          <div className="admin-status-grid">
            <div className="status-item">
              <label>Active</label>
              <span className={`status-badge ${campaignState.isActive ? 'active' : 'inactive'}`}>
                {campaignState.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="status-item">
              <label>Participants</label>
              <span>{campaignState.participantCount.toString()}</span>
            </div>
            <div className="status-item">
              <label>Max Cap</label>
              <span>
                {campaignState.maxCap === 0n ? 'Unlimited' : campaignState.maxCap.toString()}
              </span>
            </div>
            <div className="status-item">
              <label>Registration Window</label>
              <span>
                {formatTimestamp(campaignState.window.start)} -{' '}
                {formatTimestamp(campaignState.window.end)}
              </span>
            </div>
            <div className="status-item">
              <label>Allowlist</label>
              <span>{formatMerkleRoot(campaignState.merkleRoot)}</span>
            </div>
            <div className="status-item">
              <label>Admin Nonce</label>
              <span>{campaignState.adminNonce.toString()}</span>
            </div>
          </div>

          <button onClick={loadCampaignState} disabled={isLoading} className="btn btn-secondary">
            {isLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </section>

        {/* Campaign Activation */}
        <section className="admin-section">
          <h4>Campaign Activation</h4>
          <div className="admin-field">
            <label className="admin-checkbox-label">
              <input
                id={activeToggleId}
                type="checkbox"
                checked={activeToggle}
                onChange={(e) => setActiveToggle(e.target.checked)}
                disabled={isLoading || !walletAddress}
              />
              <span>Campaign is active for registration</span>
            </label>
            <small>When inactive, no new registrations are allowed</small>
          </div>
          <button
            onClick={handleSetActive}
            disabled={isLoading || !walletAddress || activeToggle === campaignState.isActive}
            className="btn btn-primary"
          >
            {activeToggle ? 'Activate Campaign' : 'Deactivate Campaign'}
          </button>
        </section>

        {/* Registration Window */}
        <section className="admin-section">
          <h4>Registration Window</h4>
          <div className="admin-field-group">
            <div className="admin-field">
              <label htmlFor={windowStartId}>Start Time</label>
              <input
                id={windowStartId}
                type="datetime-local"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                disabled={isLoading || !walletAddress}
                className="admin-input"
              />
              <small>Leave empty for no start limit</small>
            </div>
            <div className="admin-field">
              <label htmlFor={windowEndId}>End Time</label>
              <input
                id={windowEndId}
                type="datetime-local"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                disabled={isLoading || !walletAddress}
                className="admin-input"
              />
              <small>Leave empty for no end limit</small>
            </div>
          </div>
          <button
            onClick={handleSetWindow}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            Update Registration Window
          </button>
        </section>

        {/* Participant Cap */}
        <section className="admin-section">
          <h4>Participant Cap</h4>
          <div className="admin-field">
            <label htmlFor={maxCapId}>Maximum Participants</label>
            <input
              id={maxCapId}
              type="number"
              min="0"
              value={maxCapInput}
              onChange={(e) => setMaxCapInput(e.target.value)}
              disabled={isLoading || !walletAddress}
              placeholder="0 for unlimited"
              className="admin-input"
            />
            <small>Set to 0 or leave empty for unlimited participants</small>
          </div>
          <button
            onClick={handleSetMaxCap}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            Update Participant Cap
          </button>
        </section>

        {/* Merkle Root Allowlist */}
        <section className="admin-section">
          <h4>Allowlist (Merkle Root)</h4>
          <div className="admin-field">
            <label htmlFor={merkleRootId}>Merkle Root (32 bytes hex)</label>
            <input
              id={merkleRootId}
              type="text"
              value={merkleRootInput}
              onChange={(e) => setMerkleRootInput(e.target.value)}
              disabled={isLoading || !walletAddress}
              placeholder="0x1234... or leave empty to disable allowlist"
              className="admin-input"
            />
            <small>
              32-byte hex string (64 characters). Leave empty to allow open registration.
              <br />
              When set, users must provide valid Merkle proofs to register.
            </small>
          </div>
          <button
            onClick={handleSetMerkleRoot}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            {merkleRootInput.trim() ? 'Enable Allowlist' : 'Disable Allowlist'}
          </button>
        </section>
      </div>
    </div>
  );
}
