/**
 * ZK Prover Web Worker.
 *
 * Generates zero-knowledge proofs client-side so secrets never leave the device.
 * Loads the WASM prover lazily and caches the proving key after first use.
 *
 * Messages IN:
 *   { type: 'prove', payload: { secret, path, publicSignals, provingKeyUrl } }
 *   { type: 'cancel' }
 *   { type: 'loadProver', payload: { proverUrl, provingKeyUrl } }
 *
 * Messages OUT:
 *   { type: 'progress', payload: { stage, percent } }
 *   { type: 'result', payload: { proof, nullifier } }
 *   { type: 'error', payload: { message, code } }
 *   { type: 'cancelled' }
 *   { type: 'proverLoaded' }
 */

let provingKey = null;
let proverModule = null;
let currentProof = null;
let cancelled = false;

/**
 * Hash a secret with the Merkle path to derive a nullifier.
 * This is a simplified version — real circuits use poseidon/sha256 inside the circuit.
 */
function deriveNullifier(secret, path) {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + JSON.stringify(path));
  return crypto.subtle.digest('SHA-256', data).then((hash) => {
    return new Uint8Array(hash);
  });
}

/**
 * Simulate proof generation with progress updates.
 * In production, this would call the actual WASM prover.
 */
async function generateProof(secret, path, publicSignals) {
  const stages = [
    { name: 'loading_circuit', duration: 200 },
    { name: 'preparing_inputs', duration: 300 },
    { name: 'generating_proof', duration: 1500 },
    { name: 'serializing', duration: 200 },
  ];

  let totalDuration = stages.reduce((sum, s) => sum + s.duration, 0);
  let elapsed = 0;

  for (const stage of stages) {
    if (cancelled) return null;

    const steps = 10;
    const stepDuration = stage.duration / steps;

    for (let i = 0; i < steps; i++) {
      if (cancelled) return null;

      await new Promise((resolve) => setTimeout(resolve, stepDuration));
      elapsed += stepDuration;

      self.postMessage({
        type: 'progress',
        payload: {
          stage: stage.name,
          percent: Math.round((elapsed / totalDuration) * 100),
        },
      });
    }
  }

  if (cancelled) return null;

  // Derive nullifier from secret
  const nullifierBytes = await deriveNullifier(secret, path);

  // Generate a mock proof (in production, this would be the actual SNARK proof)
  const proof = {
    pi_a: Array.from(nullifierBytes.slice(0, 32)),
    pi_b: Array.from(nullifierBytes.slice(0, 32)),
    pi_c: Array.from(nullifierBytes.slice(0, 32)),
    protocol: 'groth16',
    curve: 'bn128',
  };

  return { proof, nullifier: Array.from(nullifierBytes) };
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'loadProver': {
      try {
        // In production, dynamically import the WASM prover module
        // proverModule = await import(payload.proverUrl);
        // provingKey = await fetch(payload.provingKeyUrl).then(r => r.arrayBuffer());
        provingKey = true; // Placeholder
        proverModule = true; // Placeholder
        self.postMessage({ type: 'proverLoaded' });
      } catch (err) {
        self.postMessage({
          type: 'error',
          payload: { message: err?.message || 'Failed to load prover', code: 'PROVER_LOAD_FAILED' },
        });
      }
      break;
    }

    case 'prove': {
      cancelled = false;
      const { secret, path, publicSignals } = payload;

      if (!secret || !path || !publicSignals) {
        self.postMessage({
          type: 'error',
          payload: { message: 'Missing required inputs: secret, path, publicSignals', code: 'INVALID_INPUTS' },
        });
        return;
      }

      try {
        currentProof = await generateProof(secret, path, publicSignals);

        if (cancelled || !currentProof) {
          self.postMessage({ type: 'cancelled' });
          return;
        }

        self.postMessage({
          type: 'result',
          payload: currentProof,
        });
      } catch (err) {
        self.postMessage({
          type: 'error',
          payload: { message: err?.message || 'Proof generation failed', code: 'PROOF_FAILED' },
        });
      } finally {
        currentProof = null;
      }
      break;
    }

    case 'cancel': {
      cancelled = true;
      if (currentProof) {
        currentProof = null;
      }
      self.postMessage({ type: 'cancelled' });
      break;
    }

    default:
      self.postMessage({
        type: 'error',
        payload: { message: `Unknown message type: ${type}`, code: 'UNKNOWN_TYPE' },
      });
  }
};
