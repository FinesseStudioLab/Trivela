import { useCallback } from 'react';
import { RECOVERY_ACTION } from '../lib/errorMapping';

const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer';
const GITHUB_ISSUES_URL = 'https://github.com/FinesseStudioLab/Trivela/issues/new';

/**
 * useTransactionRecovery — wires the concrete side-effects for each
 * RECOVERY_ACTION shown by TransactionStatus on a failed transaction.
 *
 * @param {{
 *   onRetry?: () => void,
 *   onSwitchWallet?: () => void,
 *   onTopUp?: () => void,
 *   network?: string,
 *   hash?: string,
 * }} options
 *
 * @returns {{
 *   handlers: Record<string, () => void>,
 *   getExplorerUrl: (hash?: string) => string,
 *   getReportUrl: (errorCode?: number|null) => string,
 * }}
 */
export function useTransactionRecovery({
  onRetry,
  onSwitchWallet,
  onTopUp,
  network = 'testnet',
  hash,
} = {}) {
  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleReSign = useCallback(() => {
    // Re-sign follows the same path as retry (re-invoke the action), but
    // the label differs in the UI to reflect "wallet was cancelled" semantics.
    onRetry?.();
  }, [onRetry]);

  const handleSwitchWallet = useCallback(() => {
    onSwitchWallet?.();
  }, [onSwitchWallet]);

  const handleTopUp = useCallback(() => {
    onTopUp?.();
  }, [onTopUp]);

  const getExplorerUrl = useCallback(
    (txHash) => {
      const h = txHash ?? hash;
      if (!h) return `${STELLAR_EXPERT_BASE}/${network}`;
      return `${STELLAR_EXPERT_BASE}/${network}/tx/${h}`;
    },
    [network, hash],
  );

  const getReportUrl = useCallback((errorCode = null) => {
    const params = new URLSearchParams({
      labels: 'bug',
      title: `Transaction error${errorCode != null ? ` (code ${errorCode})` : ''}`,
    });
    return `${GITHUB_ISSUES_URL}?${params.toString()}`;
  }, []);

  const handleViewExplorer = useCallback(() => {
    window.open(getExplorerUrl(), '_blank', 'noopener,noreferrer');
  }, [getExplorerUrl]);

  const handleReport = useCallback(
    (errorCode = null) => {
      window.open(getReportUrl(errorCode), '_blank', 'noopener,noreferrer');
    },
    [getReportUrl],
  );

  const handlers = {
    [RECOVERY_ACTION.RETRY]: handleRetry,
    [RECOVERY_ACTION.RE_SIGN]: handleReSign,
    [RECOVERY_ACTION.SWITCH_WALLET]: handleSwitchWallet,
    [RECOVERY_ACTION.TOP_UP]: handleTopUp,
    [RECOVERY_ACTION.VIEW_EXPLORER]: handleViewExplorer,
    [RECOVERY_ACTION.REPORT]: handleReport,
  };

  return { handlers, getExplorerUrl, getReportUrl };
}
