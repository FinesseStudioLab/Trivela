/**
 * Admin allowlist upload widget (#294).
 *
 * Accepts a CSV / newline-delimited file of Stellar G-addresses,
 * computes the Merkle root client-side, surfaces it, and lets the
 * admin download the full proofs JSON so they can distribute
 * per-participant proofs.
 *
 * Calling `set_merkle_root` on-chain is intentionally NOT wired in
 * here — that flow lives in the existing AdminControlPanel and is
 * gated behind admin auth + nonce. This component covers the
 * client-side computation half of the contract; the admin pastes
 * the computed `root` into the existing setter.
 */

import { useState } from 'react';
import { generateAllowlist } from '../lib/merkle';

function downloadAsJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AllowlistUpload() {
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState('idle'); // idle | parsing | done | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { root, proofs, count }

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setStatus('parsing');
    setError('');
    setResult(null);
    try {
      const text = await file.text();
      const addresses = text
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (addresses.length === 0) {
        throw new Error('file has no addresses');
      }
      const doc = await generateAllowlist(addresses);
      setResult({ ...doc, count: addresses.length });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err?.message ?? 'failed to process allowlist');
    }
  };

  const onDownload = () => {
    if (!result) return;
    downloadAsJson('trivela-allowlist-proofs.json', {
      root: result.root,
      leafFormat: result.leafFormat,
      proofs: result.proofs,
    });
  };

  return (
    <div className="allowlist-upload" aria-busy={status === 'parsing'}>
      <h3>Merkle allowlist</h3>
      <p className="muted">
        Upload a CSV or newline-delimited file of Stellar G-addresses. The Merkle root is computed
        in your browser using the same leaf and pair-hashing conventions as the campaign contract.
      </p>

      <label htmlFor="allowlist-file" className="allowlist-upload__file-label">
        <input
          id="allowlist-file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={handleFile}
          aria-describedby="allowlist-upload-help"
        />
        <span>Choose addresses file</span>
      </label>
      <span id="allowlist-upload-help" className="sr-only">
        CSV or newline-delimited list of Stellar G-addresses
      </span>

      {status === 'parsing' && <p>Computing Merkle tree from {filename}…</p>}
      {status === 'error' && (
        <p role="alert" className="error">
          Error: {error}
        </p>
      )}
      {status === 'done' && result && (
        <div className="allowlist-upload__result">
          <p>
            <strong>Built tree from {result.count} addresses.</strong>
          </p>
          <p>
            <span>Root: </span>
            <code>{result.root}</code>
          </p>
          <p className="muted">
            Paste the root into the campaign's <code>set_merkle_root</code> admin call. Distribute
            the proofs JSON to participants so they can pass <code>(leaf, siblings)</code>
            into their <code>register</code> call.
          </p>
          <button type="button" onClick={onDownload}>
            Download proofs JSON
          </button>
        </div>
      )}
    </div>
  );
}
