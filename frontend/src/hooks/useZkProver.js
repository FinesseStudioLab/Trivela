/**
 * useZkProver — React hook for client-side ZK proof generation via Web Worker.
 *
 * Manages the worker lifecycle, progress tracking, and cancellation.
 * Secrets never leave the main thread — they're passed to the worker
 * which performs the proof generation and returns only the proof + nullifier.
 *
 * Usage:
 *   const { prove, cancel, isProving, progress, result, error } = useZkProver();
 *   await prove({ secret, path, publicSignals });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useZkProver() {
  const workerRef = useRef(null);
  const [isProving, setIsProving] = useState(false);
  const [progress, setProgress] = useState({ stage: '', percent: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Initialize worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/zkProver.worker.js', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'progress':
          setProgress(payload);
          break;
        case 'result':
          setResult(payload);
          setIsProving(false);
          break;
        case 'error':
          setError(payload);
          setIsProving(false);
          break;
        case 'cancelled':
          setIsProving(false);
          setProgress({ stage: '', percent: 0 });
          break;
        case 'proverLoaded':
          break;
      }
    };

    worker.onerror = (err) => {
      setError({ message: err?.message || 'Worker error', code: 'WORKER_ERROR' });
      setIsProving(false);
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Start proof generation.
   * @param {{ secret: string, path: string[], publicSignals: object }} inputs
   */
  const prove = useCallback(async (inputs) => {
    if (!workerRef.current) {
      setError({ message: 'Worker not initialized', code: 'NO_WORKER' });
      return;
    }

    setIsProving(true);
    setProgress({ stage: 'starting', percent: 0 });
    setResult(null);
    setError(null);

    workerRef.current.postMessage({
      type: 'prove',
      payload: inputs,
    });
  }, []);

  /**
   * Cancel an in-progress proof generation.
   */
  const cancel = useCallback(() => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({ type: 'cancel' });
    setIsProving(false);
    setProgress({ stage: '', percent: 0 });
  }, []);

  /**
   * Load the WASM prover + proving key (call once on ZK campaign mount).
   * @param {{ proverUrl: string, provingKeyUrl: string }} urls
   */
  const loadProver = useCallback((urls) => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({
      type: 'loadProver',
      payload: urls,
    });
  }, []);

  /**
   * Clear the current result/error state.
   */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress({ stage: '', percent: 0 });
  }, []);

  return {
    prove,
    cancel,
    loadProver,
    reset,
    isProving,
    progress,
    result,
    error,
  };
}
