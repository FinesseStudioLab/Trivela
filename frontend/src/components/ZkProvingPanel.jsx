/**
 * ZkProvingPanel — UI for client-side ZK proof generation.
 *
 * Shows progress, allows cancellation, and displays the result.
 * Used within the registration flow for ZK-mode campaigns.
 *
 * Props:
 *   walletAddress – Connected Stellar public key
 *   campaignId    – Campaign contract ID
 *   onProofReady  – Called with { proof, nullifier } when proof is generated
 */

import { useZkProver } from '../hooks/useZkProver';
import { apiUrl } from '../config';

const PANEL_STYLE = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  borderRadius: '12px',
  padding: '20px',
  marginTop: '12px',
};

const PROGRESS_BAR_STYLE = {
  width: '100%',
  height: '6px',
  background: 'rgba(99, 102, 241, 0.2)',
  borderRadius: '3px',
  overflow: 'hidden',
  marginTop: '8px',
};

const PROGRESS_FILL_STYLE = {
  height: '100%',
  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
};

const STAGE_LABELS = {
  starting: 'Initializing…',
  loading_circuit: 'Loading circuit…',
  preparing_inputs: 'Preparing inputs…',
  generating_proof: 'Generating proof…',
  serializing: 'Finalizing…',
};

export default function ZkProvingPanel({ walletAddress, campaignId, onProofReady }) {
  const { prove, cancel, isProving, progress, result, error } = useZkProver();

  const handleProve = async () => {
    if (!walletAddress || !campaignId) return;

    try {
      // Fetch ZK inputs from backend
      const response = await fetch(
        `${apiUrl}/api/v1/campaigns/${encodeURIComponent(campaignId)}/zk-inputs?commitment=${walletAddress}`,
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch ZK inputs (${response.status})`);
      }

      const inputs = await response.json();

      // Generate proof client-side
      await prove({
        secret: walletAddress, // In production, derive from wallet seed
        path: inputs.merkle_path,
        publicSignals: {
          merkle_root: inputs.merkle_root,
          commitment: inputs.commitment,
          campaign_id: inputs.campaign_id,
        },
      });
    } catch (err) {
      // Error is captured by the hook
    }
  };

  // Notify parent when proof is ready
  if (result && onProofReady) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => onProofReady(result), 0);
  }

  return (
    <div style={PANEL_STYLE}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#e2e8f0' }}>
        Zero-Knowledge Proof
      </h4>

      {!isProving && !result && (
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
          Generate a proof to register privately without revealing your identity.
        </p>
      )}

      {isProving && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#a5b4fc' }}>
              {STAGE_LABELS[progress.stage] || progress.stage}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{progress.percent}%</span>
          </div>
          <div style={PROGRESS_BAR_STYLE}>
            <div style={{ ...PROGRESS_FILL_STYLE, width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {result && (
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.85rem',
            color: '#4ade80',
          }}
        >
          Proof generated successfully. Nullifier:{' '}
          {result.nullifier
            ? '0x' +
              Array.from(result.nullifier)
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 16) +
              '…'
            : '—'}
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.85rem',
            color: '#f87171',
            marginTop: '8px',
          }}
        >
          {error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {!isProving && !result && (
          <button
            type="button"
            className="btn btn-primary btn-button"
            onClick={handleProve}
            disabled={!walletAddress || !campaignId}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Generate Proof
          </button>
        )}
        {isProving && (
          <button
            type="button"
            className="btn btn-secondary btn-button"
            onClick={cancel}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
