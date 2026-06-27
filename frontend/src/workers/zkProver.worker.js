/**
 * zkProver.worker.ts — Web Worker for client-side ZK proof generation.
 *
 * Receives proving inputs from the main thread, generates a proof off-thread,
 * and returns the proof + nullifier. The UI thread stays responsive while
 * the worker handles the CPU-intensive proving.
 *
 * Message contract:
 *   IN:  { type: 'prove', secret, path, publicSignals, provingKeyUrl }
 *   OUT: { type: 'progress', percent, phase }
 *   OUT: { type: 'result', proof, nullifier }
 *   OUT: { type: 'error', message }
 *   OUT: { type: 'cancelled' }
 */

let cancelled = false;

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    cancelled = true;
    self.postMessage({ type: 'cancelled' });
    return;
  }

  if (msg.type !== 'prove') return;

  cancelled = false;
  const { secret, path, publicSignals, provingKeyUrl } = msg;

  try {
    if (!secret || typeof secret !== 'string') {
      throw new Error('Missing or invalid secret');
    }
    if (!Array.isArray(path)) {
      throw new Error('Invalid Merkle path');
    }
    if (!publicSignals || typeof publicSignals !== 'object') {
      throw new Error('Invalid public signals');
    }

    self.postMessage({ type: 'progress', percent: 5, phase: 'initializing' });

    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    self.postMessage({ type: 'progress', percent: 15, phase: 'loading_proving_key' });

    let provingKeyData = null;
    if (provingKeyUrl) {
      try {
        const response = await fetch(provingKeyUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch proving key: ${response.status}`);
        }
        provingKeyData = await response.arrayBuffer();
      } catch {
        self.postMessage({
          type: 'error',
          message: 'Failed to load proving key. Please check your connection.',
        });
        return;
      }
    }

    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    self.postMessage({ type: 'progress', percent: 30, phase: 'generating_proof' });

    const nullifierHash = await computeNullifier(secret);

    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    self.postMessage({ type: 'progress', percent: 60, phase: 'building_witness' });

    const witness = buildWitness({
      secret,
      merklePath: path,
      publicSignals,
      nullifierHash,
    });

    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    self.postMessage({ type: 'progress', percent: 80, phase: 'proving' });

    const proof = await generateProof(witness, provingKeyData);

    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    self.postMessage({ type: 'progress', percent: 100, phase: 'complete' });

    self.postMessage({
      type: 'result',
      proof: proof.proof,
      nullifier: nullifierHash,
      publicSignals: proof.publicSignals,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown proving error',
    });
  }
};

/**
 * Compute nullifier hash from the user's secret.
 * In production, this uses the circuit's nullifier derivation.
 */
async function computeNullifier(secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`nullifier:${secret}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the witness object for the ZK circuit.
 */
function buildWitness({ secret, merklePath, publicSignals, nullifierHash }) {
  return {
    secret,
    merklePath,
    merkleRoot: publicSignals.merkleRoot || '',
    commitment: publicSignals.commitment || '',
    nullifierHash,
    externalData: publicSignals.externalData || '',
  };
}

/**
 * Generate a ZK proof from the witness.
 *
 * In production, this calls the WASM prover loaded via the service worker.
 * For now, this is a placeholder that simulates the proving process.
 */
async function generateProof(witness, provingKeyData) {
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    if (cancelled) throw new Error('cancelled');

    await new Promise((resolve) => setTimeout(resolve, 50));
    const percent = 80 + Math.floor((i / steps) * 20);
    self.postMessage({ type: 'progress', percent, phase: 'proving' });
  }

  const proofBytes = new Uint8Array(128);
  crypto.getRandomValues(proofBytes);

  const publicSignals = [
    witness.merkleRoot,
    witness.commitment,
    witness.nullifierHash,
  ];

  return {
    proof: Array.from(proofBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    publicSignals,
  };
}
