/**
 * Error code to user-friendly message mapping
 * Maps contract error codes and HTTP status codes to clear, actionable messages
 */

export const ERROR_MESSAGES = {
  // Campaign contract errors (100-106)
  100: "You don't have permission to perform this action",
  101: "This campaign is not currently accepting registrations",
  102: "This campaign has reached its participant limit",
  103: "This campaign is not active",
  104: "Your address is not eligible for this campaign",
  105: "Contract migration failed or this action has already been processed",
  106: "This action has already been processed",

  // Rewards contract errors (1-7)
  1: "Balance calculation error. Please contact support",
  2: "Insufficient balance to claim this amount",
  3: "You don't have permission to perform this action",
  4: "The rewards contract is temporarily unavailable",
  5: "Credit amount exceeds the maximum allowed per transaction",
  6: "Invalid reward configuration. Please contact support",
  7: "Invalid reward multiplier configuration. Please contact support",

  // HTTP status codes
  400: "Invalid input. Please check your data and try again",
  401: "API key is required or invalid",
  404: "The requested resource was not found",
  429: "Too many requests. Please wait before trying again",
  500: "An unexpected error occurred. Please try again later",
  503: "The blockchain service is temporarily unavailable",
};

/**
 * Get user-friendly error message from error object or code
 * @param {Error|number|string} error - Error object, code, or status
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  if (!error) {
    return "An unknown error occurred";
  }

  // Extract error code from various error formats
  let errorCode = null;

  if (typeof error === "number") {
    errorCode = error;
  } else if (typeof error === "string") {
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
  if (error.message && typeof error.message === "string") {
    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Get recovery suggestion based on error code
 * @param {number} errorCode - Error code
 * @returns {string|null} Recovery suggestion or null
 */
export function getRecoverySuggestion(errorCode) {
  const suggestions = {
    100: "Use an admin account to perform this action",
    101: "Check the campaign details for registration dates",
    102: "Try registering for another campaign",
    103: "Wait for the campaign to be activated",
    104: "Contact the campaign operator for eligibility",
    105: "Retry the action with a new transaction",
    1: "Contact support if the issue persists",
    2: "Earn more rewards before claiming",
    3: "Use the correct account for this action",
    4: "Try again in a few moments",
    5: "Split your credit into multiple transactions",
    6: "Contact support for configuration help",
    429: "Wait a moment and try again",
    503: "Try again in a few moments",
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
    message: error?.message || "Unknown error",
    code: error?.code || error?.status,
    timestamp: new Date().toISOString(),
    stack: error?.stack,
  };
}
