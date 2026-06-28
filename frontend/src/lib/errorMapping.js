/**
 * Error code to user-friendly message mapping + recovery action classification.
 * Maps contract error codes and HTTP status codes to clear, actionable messages
 * and surfaces a typed recovery action for the TransactionStatus UI.
 */

/**
 * Recovery action types — each maps to a concrete UI button in TransactionStatus.
 *
 * RETRY          — re-submit the same transaction (network/RPC hiccup or expired).
 * RE_SIGN        — re-open the wallet signing prompt (user cancelled).
 * SWITCH_WALLET  — prompt the user to change their connected wallet/address.
 * TOP_UP         — navigate the user to a fund/deposit flow (insufficient balance).
 * VIEW_EXPLORER  — open the Stellar Expert link for the failed transaction.
 * REPORT         — surface a "report this issue" link for truly unknown errors.
 */
export const RECOVERY_ACTION = {
  RETRY: 'retry',
  RE_SIGN: 're_sign',
  SWITCH_WALLET: 'switch_wallet',
  TOP_UP: 'top_up',
  VIEW_EXPLORER: 'view_explorer',
  REPORT: 'report',
};

/**
 * Per-error-class default recovery actions.
 * Code-level overrides in CODE_RECOVERY take precedence.
 */
const CLASS_RECOVERY = {
  // User-rejected: re-prompt signing — do NOT say "error", say "cancelled".
  wallet: [RECOVERY_ACTION.RE_SIGN],
  // Transport failure: safe to retry without a new auth entry.
  network: [RECOVERY_ACTION.RETRY],
  // RPC/Horizon degraded: retry after a moment.
  rpc: [RECOVERY_ACTION.RETRY],
  // Validation: nothing to retry — user fixes input themselves.
  validation: [],
  // Contract reverts without a code-level override → show explorer.
  contract: [RECOVERY_ACTION.VIEW_EXPLORER],
  // Catch-all: retry + report.
  unknown: [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.REPORT],
};

/**
 * Per error code recovery action overrides.
 * These replace (not augment) the class-level default.
 */
const CODE_RECOVERY = {
  // Insufficient rewards balance → top-up
  2: [RECOVERY_ACTION.TOP_UP],
  // Permission errors → switch wallet / account
  100: [RECOVERY_ACTION.SWITCH_WALLET],
  104: [RECOVERY_ACTION.SWITCH_WALLET],
  3: [RECOVERY_ACTION.SWITCH_WALLET],
  // Expired / already-processed → retry with a fresh tx
  105: [RECOVERY_ACTION.RETRY],
  106: [RECOVERY_ACTION.RETRY],
  // Transient service issues
  4: [RECOVERY_ACTION.RETRY],
  429: [RECOVERY_ACTION.RETRY],
  500: [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.REPORT],
  503: [RECOVERY_ACTION.RETRY],
  // Campaign state errors: nothing the user can do except view status
  101: [RECOVERY_ACTION.VIEW_EXPLORER],
  102: [RECOVERY_ACTION.VIEW_EXPLORER],
  103: [RECOVERY_ACTION.VIEW_EXPLORER],
};

/**
 * Human-readable labels and descriptions for each recovery action,
 * used by TransactionStatus to render the correct button text and aria-label.
 */
export const RECOVERY_ACTION_META = {
  [RECOVERY_ACTION.RETRY]: {
    label: 'Try again',
    description: 'Resubmit the transaction',
  },
  [RECOVERY_ACTION.RE_SIGN]: {
    label: 'Sign again',
    description: 'Re-open your wallet to sign the transaction',
  },
  [RECOVERY_ACTION.SWITCH_WALLET]: {
    label: 'Switch wallet',
    description: 'Connect a different wallet or account',
  },
  [RECOVERY_ACTION.TOP_UP]: {
    label: 'Add funds',
    description: 'Add XLM or tokens to your wallet',
  },
  [RECOVERY_ACTION.VIEW_EXPLORER]: {
    label: 'View on explorer',
    description: 'Open the transaction on Stellar Expert',
  },
  [RECOVERY_ACTION.REPORT]: {
    label: 'Report issue',
    description: 'Open a support request for this error',
  },
};

export const ERROR_MESSAGES = {
  // Campaign contract errors (100-106)
  100: "You don't have permission to perform this action",
  101: 'This campaign is not currently accepting registrations',
  102: 'This campaign has reached its participant limit',
  103: 'This campaign is not active',
  104: 'Your address is not eligible for this campaign',
  105: 'Contract migration failed or this action has already been processed',
  106: 'This action has already been processed',

  // Rewards contract errors (1-7)
  1: 'Balance calculation error. Please contact support',
  2: 'Insufficient balance to claim this amount',
  3: "You don't have permission to perform this action",
  4: 'The rewards contract is temporarily unavailable',
  5: 'Credit amount exceeds the maximum allowed per transaction',
  6: 'Invalid reward configuration. Please contact support',
  7: 'Invalid reward multiplier configuration. Please contact support',

  // HTTP status codes
  400: 'Invalid input. Please check your data and try again',
  401: 'API key is required or invalid',
  404: 'The requested resource was not found',
  429: 'Too many requests. Please wait before trying again',
  500: 'An unexpected error occurred. Please try again later',
  503: 'The blockchain service is temporarily unavailable',
};

/**
 * Coarse error classes used to give register/claim failures distinct messaging
 * and to decide how the optimistic UI should recover (see useOptimisticAction).
 *
 * - `contract`   — the contract reverted with a known/mapped error code.
 * - `wallet`     — the user rejected/closed the signing prompt.
 * - `network`    — request never reached the chain (offline, DNS, timeout).
 * - `rpc`        — Soroban RPC / Horizon reachable but failing (5xx, simulate).
 * - `validation` — client-side input problem.
 * - `unknown`    — anything we can't confidently bucket.
 */
export const ERROR_CLASS = {
  CONTRACT: 'contract',
  WALLET: 'wallet',
  NETWORK: 'network',
  RPC: 'rpc',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
};

/** Per-class fallback copy used when no specific contract message applies. */
const CLASS_MESSAGES = {
  [ERROR_CLASS.WALLET]: 'Signing was cancelled in your wallet. Nothing was submitted.',
  [ERROR_CLASS.NETWORK]:
    'Network problem reaching the blockchain — your action was not submitted. Check your connection and try again.',
  [ERROR_CLASS.RPC]:
    'The Soroban network is temporarily unavailable. Your action was not applied; please try again in a moment.',
  [ERROR_CLASS.VALIDATION]: 'Please check your input and try again.',
  [ERROR_CLASS.UNKNOWN]: 'An unexpected error occurred. Your action was not applied.',
};

/**
 * Extract a numeric contract/HTTP error code from any error shape.
 * @param {Error|number|string|object} error
 * @returns {number|null}
 */
export function extractErrorCode(error) {
  if (error === null || error === undefined) return null;
  if (typeof error === 'number') return Number.isFinite(error) ? error : null;
  if (typeof error === 'string') {
    const fromString = error.match(/(?:Error\(Contract,\s*#|contract.*?#|code[:\s]+)(\d+)/i);
    return fromString ? Number(fromString[1]) : null;
  }
  if (typeof error.code === 'number') return error.code;
  if (typeof error.status === 'number') return error.status;
  const text = error.message || error.toString?.() || '';
  const match = text.match(/(?:Error\(Contract,\s*#|contract.*?#|code[:\s]+)(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Classify an error so the UI can show class-specific messaging and decide
 * recovery. Order matters: a contract revert with a real code is the most
 * specific signal, a rejected wallet prompt next, then transport problems.
 * @param {Error|number|string|object} error
 * @returns {string} one of ERROR_CLASS
 */
export function classifyError(error) {
  if (!error) return ERROR_CLASS.UNKNOWN;

  const code = extractErrorCode(error);
  const text = (
    typeof error === 'string' ? error : error.message || error.toString?.() || ''
  ).toLowerCase();

  // A decoded contract revert (e.g. `Error(Contract, #103)`) is unambiguous.
  if (/error\(contract|contract.*?#\d+/i.test(text)) return ERROR_CLASS.CONTRACT;

  // User-driven wallet rejections must not look like a system failure.
  if (
    /user (rejected|declined)|reject|declin|denied|cancel|freighter|wallet|not allowed/.test(text)
  )
    return ERROR_CLASS.WALLET;

  // Transport: never reached the chain.
  if (
    /failed to fetch|networkerror|offline|timeout|timed out|enotfound|econnrefused|etimedout|dns/.test(
      text,
    )
  )
    return ERROR_CLASS.NETWORK;

  // RPC/Horizon reachable but erroring.
  if (/rpc|simulat|soroban|horizon|gateway|bad gateway|service unavailable|50[023]/.test(text))
    return ERROR_CLASS.RPC;

  if (/invalid|required|must be|too large|not a number/.test(text)) return ERROR_CLASS.VALIDATION;

  // A bare contract code with no transport hints is still a contract error.
  if (typeof code === 'number' && code >= 1 && code <= 199) return ERROR_CLASS.CONTRACT;

  return ERROR_CLASS.UNKNOWN;
}

/**
 * Resolve the ordered list of recovery actions for a classified error.
 * Code-level overrides win; class-level defaults are used otherwise.
 *
 * @param {string} errorClass - one of ERROR_CLASS values
 * @param {number|null} code - extracted contract/HTTP code, or null
 * @returns {string[]} ordered list of RECOVERY_ACTION values
 */
export function getRecoveryActions(errorClass, code) {
  if (code !== null && CODE_RECOVERY[code]) return CODE_RECOVERY[code];
  return CLASS_RECOVERY[errorClass] ?? CLASS_RECOVERY[ERROR_CLASS.UNKNOWN];
}

/**
 * Map any error to a structured, user-facing shape for the optimistic UI.
 * @param {Error|number|string|object} error
 * @returns {{
 *   class: string,
 *   code: number|null,
 *   message: string,
 *   recovery: string|null,
 *   recoveryActions: string[],
 *   retryable: boolean
 * }}
 */
export function mapError(error) {
  const errorClass = classifyError(error);
  const code = extractErrorCode(error);

  // Contract reverts get the precise per-code copy; everything else uses the
  // class-level message so network/RPC failures read differently from reverts.
  const message =
    errorClass === ERROR_CLASS.CONTRACT && code && ERROR_MESSAGES[code]
      ? getErrorMessage(code)
      : CLASS_MESSAGES[errorClass] || getErrorMessage(error);

  const recoveryActions = getRecoveryActions(errorClass, code ?? null);

  return {
    class: errorClass,
    code: code ?? null,
    message,
    recovery: code ? getRecoverySuggestion(code) : null,
    recoveryActions,
    retryable:
      errorClass === ERROR_CLASS.NETWORK ||
      errorClass === ERROR_CLASS.RPC ||
      (code ? isRetryableError(code) : false),
  };
}

/**
 * Get user-friendly error message from error object or code
 * @param {Error|number|string} error - Error object, code, or status
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  if (!error) {
    return 'An unknown error occurred';
  }

  // Extract error code from various error formats
  let errorCode = null;

  if (typeof error === 'number') {
    errorCode = error;
  } else if (typeof error === 'string') {
    errorCode = parseInt(error, 10);
  } else if (error.code !== undefined) {
    errorCode = error.code;
  } else if (error.status !== undefined) {
    errorCode = error.status;
  } else if (error.message) {
    // Try to extract code from error message
    const match = error.message.match(/code[:\s]+(\d+)/i);
    if (match) {
      errorCode = parseInt(match[1], 10);
    }
  }

  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }

  // Fallback to error message if available
  if (error.message && typeof error.message === 'string') {
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Get recovery suggestion based on error code
 * @param {number} errorCode - Error code
 * @returns {string|null} Recovery suggestion or null
 */
export function getRecoverySuggestion(errorCode) {
  const suggestions = {
    100: 'Use an admin account to perform this action',
    101: 'Check the campaign details for registration dates',
    102: 'Try registering for another campaign',
    103: 'Wait for the campaign to be activated',
    104: 'Contact the campaign operator for eligibility',
    105: 'Retry the action with a new transaction',
    1: 'Contact support if the issue persists',
    2: 'Earn more rewards before claiming',
    3: 'Use the correct account for this action',
    4: 'Try again in a few moments',
    5: 'Split your credit into multiple transactions',
    6: 'Contact support for configuration help',
    429: 'Wait a moment and try again',
    503: 'Try again in a few moments',
  };

  return suggestions[errorCode] || null;
}

/**
 * Check if error is retryable
 * @param {number} errorCode - Error code
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(errorCode) {
  const retryableErrors = [4, 429, 500, 503];
  return retryableErrors.includes(errorCode);
}

/**
 * Format error for logging/debugging
 * @param {Error|object} error - Error object
 * @returns {object} Formatted error object
 */
export function formatErrorForLogging(error) {
  return {
    message: error?.message || 'Unknown error',
    code: error?.code || error?.status,
    timestamp: new Date().toISOString(),
    stack: error?.stack,
  };
}
