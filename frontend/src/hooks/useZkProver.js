import { useCallback, useRef, useState } from 'react';

/**
 * useZkProver — React hook for client-side ZK proof generation in a Web Worker.
 *
 * Returns a `prove` function, progress state, and cancellation support.
 * The worker runs off the main thread so the UI stays responsive during proving.
 */
export function useZkProver() {
  const [progress, setProgress] = useState({ percent: 0, phase: '' });
  const [isProving, setIsProving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const workerRef = useRef(null);
  const abortRef = useRef(false);

  const prove = useCallback(
    async ({ secret, path, publicSignals, provingKeyUrl }) => {
      if (isProving) return;

      setIsProving(true);
      setResult(null);
      setError(null);
      setProgress({ percent: 0, phase: 'starting' });
      abortRef.current = false;

      return new Promise((resolve, reject) => {
        let worker;
        try {
          worker = new Worker(
            new URL('../workers/zkProver.worker.js', import.meta.url),
            { type: 'module' },
          );
        } catch {
          setError(new Error('Web Workers are not supported in this browser'));
          setIsProving(false);
          reject(new Error('Web Workers are not supported'));
          return;
        }

        workerRef.current = worker;

        worker.onmessage = (event) => {
          const msg = event.data;

          if (abortRef.current) return;

          switch (msg.type) {
            case 'progress':
              setProgress({ percent: msg.percent, phase: msg.phase });
              break;
            case 'result':
              setResult(msg);
              setIsProving(false);
              setProgress({ percent: 100, phase: 'complete' });
              worker.terminate();
              workerRef.current = null;
              resolve(msg);
              break;
            case 'error':
              setError(new Error(msg.message));
              setIsProving(false);
              setProgress({ percent: 0, phase: '' });
              worker.terminate();
              workerRef.current = null;
              reject(new Error(msg.message));
              break;
            case 'cancelled':
              setIsProving(false);
              setProgress({ percent: 0, phase: '' });
              worker.terminate();
              workerRef.current = null;
              resolve(null);
              break;
          }
        };

        worker.onerror = () => {
          const err = new Error('ZK prover worker crashed');
          setError(err);
          setIsProving(false);
          setProgress({ percent: 0, phase: '' });
          worker.terminate();
          workerRef.current = null;
          reject(err);
        };

        worker.postMessage({
          type: 'prove',
          secret,
          path,
          publicSignals,
          provingKeyUrl,
        });
      });
    },
    [isProving],
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel' });
    }
    setIsProving(false);
    setProgress({ percent: 0, phase: '' });
  }, []);

  const reset = useCallback(() => {
    cancel();
    setResult(null);
    setError(null);
    setProgress({ percent: 0, phase: '' });
  }, [cancel]);

  return { prove, cancel, reset, progress, isProving, result, error };
}
