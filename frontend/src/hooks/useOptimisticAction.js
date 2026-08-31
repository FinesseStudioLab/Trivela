import { useCallback, useRef, useState } from 'react';
import { mapError as defaultMapError } from '../lib/errorMapping';

/**
 * useOptimisticAction — drives an "optimistic UI" lifecycle for an async,
 * chain-backed action (register, claim, …):
 *
 *   submit → apply optimistic state immediately
 *          → await the real action
 *          → success: reconcile with chain truth
 *          → failure: roll back the optimistic state + surface a mapped error
 *
 * It also guards against double-submit (a second `run` while one is in flight
 * is ignored) so a double-click can't fire two transactions.
 *
 * State machine: 'idle' → 'pending' → 'success' | 'error'.
 *
 * @param {{ mapError?: (error: unknown) => object }} [options]
 *   `mapError` converts a thrown error into the structured shape from
 *   lib/errorMapping (overridable for testing). Defaults to the shared mapper.
 */
export function useOptimisticAction({ mapError = defaultMapError } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  // Synchronous in-flight latch: state updates are async, so a ref is what
  // actually prevents a same-tick double-submit.
  const inFlight = useRef(false);

  /**
   * @template T
   * @param {() => Promise<T>} action  The real async action (e.g. submit tx).
   * @param {{
   *   optimistic?: () => void,   // apply expected state right away
   *   rollback?: () => void,     // undo the optimistic state on failure
   *   reconcile?: (result: T) => void, // align local state with chain truth
   * }} [handlers]
   * @returns {Promise<{ ok: boolean, skipped?: boolean, result?: T, error?: object }>}
   */
  const run = useCallback(
    async (action, { optimistic, rollback, reconcile } = {}) => {
      if (inFlight.current) {
        return { ok: false, skipped: true };
      }
      inFlight.current = true;
      setStatus('pending');
      setError(null);

      let appliedOptimistic = false;
      try {
        if (optimistic) {
          optimistic();
          appliedOptimistic = true;
        }

        const result = await action();

        reconcile?.(result);
        setStatus('success');
        return { ok: true, result };
      } catch (err) {
        // Only undo what we actually applied — keeps rollback idempotent and
        // correct even if the failure happened before the optimistic step.
        if (appliedOptimistic) {
          rollback?.();
        }
        const mapped = mapError(err);
        setError(mapped);
        setStatus('error');
        return { ok: false, error: mapped };
      } finally {
        inFlight.current = false;
      }
    },
    [mapError],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    isPending: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    run,
    reset,
  };
}

export default useOptimisticAction;
