/**
 * ZK Proof Web Worker — issue #847
 *
 * Runs the WASM prover off the main thread so the UI stays responsive
 * during proof generation (which can take 1-10 s depending on circuit size).
 *
 * Message protocol (main → worker):
 *   { type: 'generate', id: string, inputs: ClaimProofInputs }
 *
 * Message protocol (worker → main):
 *   { type: 'progress', id: string, pct: number }          — 0-100 progress
 *   { type: 'result',   id: string, proof: ClaimProof }    — success
 *   { type: 'error',    id: string, message: string }      — failure
 */

import type { ClaimProofInputs, ClaimProof } from './types.js';

// The WASM prover module is loaded lazily on first use so the worker
// script itself loads instantly — WASM init can take ~200 ms.
let proverReady: Promise<WasmProver> | null = null;

interface WasmProver {
  generateProof(inputs: ClaimProofInputs): Promise<ClaimProof>;
}

async function loadProver(): Promise<WasmProver> {
  if (!proverReady) {
    proverReady = (async () => {
      // Replace with the real WASM prover import once compiled:
      //   const wasm = await import('@trivela/zk-prover-wasm');
      //   await wasm.default();   // run WASM init
      //   return wasm;
      //
      // Stub implementation used until the circom/snarkjs WASM build is
      // wired in. It returns a plausibly-shaped proof so downstream
      // contract call code can be developed and tested independently.
      return {
        async generateProof(inputs: ClaimProofInputs): Promise<ClaimProof> {
          // Simulate proving time proportional to input size
          const steps = 10;
          for (let i = 0; i < steps; i++) {
            await new Promise((r) => setTimeout(r, 50));
            self.postMessage({ type: 'progress', pct: Math.round(((i + 1) / steps) * 100) });
          }
          return {
            proofBytes: new Uint8Array(256).fill(0xab),
            nullifier: new Uint8Array(32).fill(0xcd),
            publicSignals: [inputs.merkleRoot, inputs.campaignId],
          };
        },
      };
    })();
  }
  return proverReady;
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, inputs } = event.data as {
    type: string;
    id: string;
    inputs: ClaimProofInputs;
  };

  if (type !== 'generate') return;

  try {
    const prover = await loadProver();
    const proof = await prover.generateProof(inputs);
    self.postMessage({ type: 'result', id, proof });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', id, message });
  }
};

export {};
