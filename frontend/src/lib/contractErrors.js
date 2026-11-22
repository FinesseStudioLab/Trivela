/**
 * Contract error code mapping (#864)
 * Maps Soroban contract error codes to human-readable messages
 */

export const REWARDS_CONTRACT_ERRORS = {
  1: {
    code: 'Overflow',
    message: 'The operation would exceed numerical limits. Please try a smaller amount.',
    userMessage: 'Amount too large',
  },
  2: {
    code: 'InsufficientBalance',
    message: 'You do not have enough points to perform this action.',
    userMessage: 'Insufficient points',
  },
  3: {
    code: 'Unauthorized',
    message: 'You are not authorized to perform this action.',
    userMessage: 'Permission denied',
  },
  4: {
    code: 'ContractPaused',
    message: 'This operation is temporarily paused for maintenance.',
    userMessage: 'Service temporarily unavailable',
  },
  5: {
    code: 'CreditLimitExceeded',
    message: 'You have reached your credit limit for this period.',
    userMessage: 'Daily limit reached',
  },
  8: {
    code: 'RateLimitExceeded',
    message: 'Too many requests. Please wait a moment before trying again.',
    userMessage: 'Too many requests',
  },
  9: {
    code: 'VestingNotFound',
    message: 'The vesting schedule for this reward was not found.',
    userMessage: 'Vesting not found',
  },
  11: {
    code: 'InsufficientReserve',
    message: 'The reward reserve does not have enough assets to fulfill this redemption.',
    userMessage: 'Insufficient reserves',
  },
  12: {
    code: 'InvalidRedemptionRate',
    message: 'The redemption rate is not properly configured.',
    userMessage: 'Invalid configuration',
  },
  14: {
    code: 'SelfReferral',
    message: 'You cannot refer yourself.',
    userMessage: 'Cannot self-refer',
  },
  15: {
    code: 'CircularReferral',
    message: 'This referral creates a circular dependency.',
    userMessage: 'Invalid referral',
  },
  16: {
    code: 'ReferralAlreadyRewarded',
    message: 'This referral has already been rewarded.',
    userMessage: 'Already rewarded',
  },
  17: {
    code: 'ReferralCapExceeded',
    message: 'The referrer has reached their referral bonus cap.',
    userMessage: 'Referral cap reached',
  },
  18: {
    code: 'ReferralNotConfigured',
    message: 'Referral rewards are not enabled for this campaign.',
    userMessage: 'Referrals not available',
  },
  20: {
    code: 'ZeroReferralBonus',
    message: 'The referral bonus is too small and rounds to zero.',
    userMessage: 'Bonus too small',
  },
  21: {
    code: 'TokenModeNotEnabled',
    message: 'SEP-41 token mode is not enabled for this campaign.',
    userMessage: 'Feature not available',
  },
  22: {
    code: 'AllowanceExceeded',
    message: 'Your token allowance is insufficient for this transaction.',
    userMessage: 'Allowance exceeded',
  },
  30: {
    code: 'ZeroAmount',
    message: 'The amount must be greater than zero.',
    userMessage: 'Invalid amount',
  },
  31: {
    code: 'SelfTransfer',
    message: 'You cannot transfer to the same address.',
    userMessage: 'Invalid recipient',
  },
  32: {
    code: 'ClawbackNotFound',
    message: 'The requested clawback was not found.',
    userMessage: 'Clawback not found',
  },
  33: {
    code: 'ClawbackTimelocked',
    message: 'The clawback is still locked. Please wait before trying again.',
    userMessage: 'Still locked',
  },
};

/**
 * Get user-friendly error message from contract error code
 * @param {number|string} errorCode - The error code from the contract
 * @returns {string} User-friendly error message
 */
export function getContractErrorMessage(errorCode) {
  const error = REWARDS_CONTRACT_ERRORS[errorCode];
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }
  return error.userMessage || error.message;
}

/**
 * Get detailed error info for logging/debugging
 * @param {number|string} errorCode - The error code from the contract
 * @returns {Object} Detailed error info
 */
export function getContractErrorInfo(errorCode) {
  return REWARDS_CONTRACT_ERRORS[errorCode] || {
    code: 'UnknownError',
    message: `Unknown error code: ${errorCode}`,
    userMessage: 'An unexpected error occurred',
  };
}

/**
 * Extract error code from contract transaction error
 * @param {Error} error - The error object from Soroban
 * @returns {number|null} The extracted error code or null
 */
export function extractContractErrorCode(error) {
  if (!error) return null;

  // Try to parse from error message or error code
  const message = error.message || String(error);

  // Format: "Error: Host error: InvalidAction (code: 1)" or similar
  const codeMatch = message.match(/code[:\s]*(\d+)/i);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }

  // Try direct error code property
  if (error.code && typeof error.code === 'number') {
    return error.code;
  }

  return null;
}
