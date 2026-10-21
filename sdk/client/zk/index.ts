/**
 * ZK Proof SDK — issue #847
 *
 * Browser/Node SDK for generating the zero-knowledge proofs users need
 * to submit private claims. Proving runs in a Web Worker so the UI
 * stays responsive during computation.
 *
 * @example
 * ```ts
 * import { generateClaimProof } from '@trivela/sdk/zk';
 *
 * const proof = await generateClaimProof(inputs, {
 *   onProgress: (pct) => setProgress(pct),
 * });
 * await trivelaCampaign.registerPrivate(proof.nullifier, proof.proofBytes);
 * ```
 */

export type { ClaimProofInputs, ClaimProof, ProofGenerationProgress } from './types.js';
import type { ClaimProofInputs, ClaimProof } from './types.js';

export interface GenerateClaimProofOptions {
  /** Called with 0-100 progress updates while the prover runs. */
  onProgress?: (pct: number) => void;
  /** Override the worker script URL (useful for bundler integration). */
  workerUrl?: string;
}

/**
 * Generate a ZK claim proof for the given inputs.
 *
 * Spawns a dedicated Web Worker to run the WASM prover off the main thread.
 * The returned proof is ready to pass to the Trivela campaign contract's
 * `register_private` entry point.
 *
 * Throws if the prover fails or the inputs are invalid.
 */
export async function generateClaimProof(
  inputs: ClaimProofInputs,
  options: GenerateClaimProofOptions = {},
): Promise<ClaimProof> {
  const { onProgress } = options;

  return new Promise<ClaimProof>((resolve, reject) => {
    const workerUrl =
      options.workerUrl ??
      new URL('./proof.worker.js', import.meta.url).href;

    const worker = new Worker(workerUrl, { type: 'module' });
    const id = Math.random().toString(36).slice(2);

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type: 'progress'; id: string; pct: number }
        | { type: 'result'; id: string; proof: ClaimProof }
        | { type: 'error'; id: string; message: string };

      if (msg.id !== id) return;

      if (msg.type === 'progress') {
        onProgress?.(msg.pct);
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.proof);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ type: 'generate', id, inputs });
  });
}

/**
 * Check whether the current environment supports Web Workers and WASM —
 * required for `generateClaimProof` to work.
 */
export function isZkSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  );
}
