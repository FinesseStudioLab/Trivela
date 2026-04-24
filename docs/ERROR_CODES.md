# Error Codes Reference

This document defines all error codes returned by Trivela smart contracts and provides frontend-friendly message mappings.

## Campaign Contract Errors

| Code | Name                   | Cause                                     | Frontend Message                                         | Recovery                      |
| ---- | ---------------------- | ----------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| 100  | `Unauthorized`         | Caller is not the admin                   | "You don't have permission to perform this action"       | Use admin account             |
| 101  | `OutsideTimeWindow`    | Registration outside campaign time window | "This campaign is not currently accepting registrations" | Check campaign dates          |
| 102  | `CapacityReached`      | Campaign has reached max participants     | "This campaign has reached its participant limit"        | Try another campaign          |
| 103  | `CampaignInactive`     | Campaign is not active                    | "This campaign is not active"                            | Wait for campaign to activate |
| 104  | `NotInAllowlist`       | Address not in Merkle allowlist           | "Your address is not eligible for this campaign"         | Contact campaign operator     |
| 105  | `UnsupportedMigration` | Migration to unsupported version          | "Contract migration failed"                              | Contact support               |
| 106  | `InvalidAdminNonce`    | Admin nonce replay protection triggered   | "This action has already been processed"                 | Retry with new nonce          |

## Rewards Contract Errors

| Code | Name                   | Cause                                      | Frontend Message                                            | Recovery                    |
| ---- | ---------------------- | ------------------------------------------ | ----------------------------------------------------------- | --------------------------- |
| 1    | `Overflow`             | Arithmetic overflow in balance calculation | "Balance calculation overflow"                              | Contact support             |
| 2    | `InsufficientBalance`  | User balance too low to claim              | "Insufficient balance to claim this amount"                 | Earn more rewards           |
| 3    | `Unauthorized`         | Caller is not authorized                   | "You don't have permission to perform this action"          | Use correct account         |
| 4    | `ContractPaused`       | Contract is paused                         | "The rewards contract is temporarily unavailable"           | Try again later             |
| 5    | `CreditLimitExceeded`  | Credit amount exceeds per-call limit       | "Credit amount exceeds the maximum allowed per transaction" | Split into multiple credits |
| 6    | `UnsupportedMigration` | Migration to unsupported version           | "Contract migration failed"                                 | Contact support             |
| 7    | `InvalidMultiplier`    | Campaign multiplier is invalid             | "Invalid reward multiplier configuration"                   | Contact support             |

## Backend API Errors

| Status | Error                   | Cause                              | Frontend Message                                       |
| ------ | ----------------------- | ---------------------------------- | ------------------------------------------------------ |
| 400    | `Bad Request`           | Invalid request body or parameters | "Invalid input. Please check your data and try again"  |
| 401    | `Unauthorized`          | Missing or invalid API key         | "API key is required or invalid"                       |
| 404    | `Not Found`             | Campaign or resource not found     | "The requested campaign was not found"                 |
| 429    | `Too Many Requests`     | Rate limit exceeded                | "Too many requests. Please wait before trying again"   |
| 500    | `Internal Server Error` | Server error                       | "An unexpected error occurred. Please try again later" |
| 503    | `Service Unavailable`   | Soroban RPC unavailable            | "The blockchain service is temporarily unavailable"    |

## Frontend Error Mapping

Use this mapping to display user-friendly error messages:

```javascript
// Error code to user message mapping
const ERROR_MESSAGES = {
  // Campaign contract errors
  100: "You don't have permission to perform this action",
  101: "This campaign is not currently accepting registrations",
  102: "This campaign has reached its participant limit",
  103: "This campaign is not active",
  104: "Your address is not eligible for this campaign",
  105: "This action has already been processed or contract migration failed",

  // Rewards contract errors
  1: "Balance calculation error. Please contact support",
  2: "Insufficient balance to claim this amount",
  3: "You don't have permission to perform this action",
  4: "The rewards contract is temporarily unavailable",
  5: "Credit amount exceeds the maximum allowed per transaction",
  6: "Invalid reward configuration. Please contact support",

  // HTTP status codes
  400: "Invalid input. Please check your data and try again",
  401: "API key is required or invalid",
  404: "The requested resource was not found",
  429: "Too many requests. Please wait before trying again",
  500: "An unexpected error occurred. Please try again later",
  503: "The blockchain service is temporarily unavailable",
};

// Usage in React component
function handleContractError(error) {
  const errorCode = error.code || error.status;
  const message = ERROR_MESSAGES[errorCode] || "An error occurred";
  return message;
}
```

## Error Handling Best Practices

### Smart Contracts

1. **Always return specific error codes** – Use enum values, not generic errors
2. **Document error conditions** – Add comments explaining when each error occurs
3. **Validate early** – Check preconditions before state changes
4. **Atomic operations** – Ensure all-or-nothing semantics for multi-step operations

### Backend

1. **Validate input** – Return 400 with detailed error array
2. **Log errors** – Include error code and context for debugging
3. **Rate limit gracefully** – Return 429 with `Retry-After` header
4. **Health checks** – Return 503 when dependencies unavailable

### Frontend

1. **Catch and map errors** – Use `ERROR_MESSAGES` mapping
2. **Show context** – Display what action failed and why
3. **Provide recovery** – Suggest next steps (retry, contact support, etc.)
4. **Log for debugging** – Send error details to monitoring service

## Example: Handling a Registration Error

### Contract returns error code 104 (NotInAllowlist)

```javascript
// Frontend receives error from Soroban RPC
try {
  await registerInCampaign(address, proof);
} catch (error) {
  const message = ERROR_MESSAGES[104];
  // "Your address is not eligible for this campaign"
  showErrorToast(message);
  // Suggest: "Contact the campaign operator for eligibility"
}
```

### Contract returns error code 101 (OutsideTimeWindow)

```javascript
try {
  await registerInCampaign(address, proof);
} catch (error) {
  const message = ERROR_MESSAGES[101];
  // "This campaign is not currently accepting registrations"
  showErrorToast(message);
  // Suggest: "Check the campaign details for registration dates"
}
```

## Adding New Error Codes

When adding new error codes:

1. **Update contract enum** – Add to `Error` enum in contract
2. **Document in this file** – Add row to appropriate table
3. **Update frontend mapping** – Add entry to `ERROR_MESSAGES`
4. **Test error flow** – Verify frontend displays correct message
5. **Update CHANGELOG** – Note new error code in release notes

## Support

For questions about error codes, open an issue on [GitHub](https://github.com/FinesseStudioLab/Trivela/issues).
