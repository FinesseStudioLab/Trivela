/**
 * Privacy-Respecting Analytics Client
 *
 * Tracks user funnel progression without collecting PII.
 * Respects DNT header and user consent preferences.
 */

import { safeLocalStorage } from './safeAnalytics';

const SESSION_STORAGE_KEY = 'trivela_analytics_session';
const CONSENT_STORAGE_KEY = 'trivela_analytics_consent';
const EVENT_BUFFER_KEY = 'trivela_analytics_buffer';
const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 5000;

let sessionId = null;
let consentGiven = null;
let eventBuffer = [];
let batchTimer = null;

/**
 * Check if user has DNT enabled
 */
function isDNTEnabled() {
  return (
    navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || window.doNotTrack === '1'
  );
}

/**
 * Get or create anonymized session ID
 */
function getSessionId() {
  if (sessionId) return sessionId;

  // Try to get existing session from storage
  const stored = safeLocalStorage.getItem(SESSION_STORAGE_KEY);
  if (stored) {
    sessionId = stored;
    return sessionId;
  }

  // Generate new session ID
  sessionId = `anon_${generateRandomId()}`;
  safeLocalStorage.setItem(SESSION_STORAGE_KEY, sessionId);

  return sessionId;
}

/**
 * Generate random ID for session
 */
function generateRandomId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

/**
 * Check if analytics is enabled
 */
function isAnalyticsEnabled() {
  // Check DNT
  if (isDNTEnabled()) {
    return false;
  }

  // Check consent
  if (consentGiven === null) {
    const stored = safeLocalStorage.getItem(CONSENT_STORAGE_KEY);
    consentGiven = stored === 'true';
  }

  // Default to true if no explicit opt-out (can be changed based on region)
  return consentGiven !== false;
}

/**
 * Set user consent preference
 */
export function setAnalyticsConsent(consent) {
  consentGiven = consent;
  safeLocalStorage.setItem(CONSENT_STORAGE_KEY, consent.toString());

  if (!consent) {
    // Clear all analytics data
    clearAnalyticsData();
  }
}

/**
 * Get user consent status
 */
export function getAnalyticsConsent() {
  if (consentGiven === null) {
    const stored = safeLocalStorage.getItem(CONSENT_STORAGE_KEY);
    consentGiven = stored ? stored === 'true' : null;
  }
  return consentGiven;
}

/**
 * Clear all analytics data
 */
function clearAnalyticsData() {
  safeLocalStorage.removeItem(SESSION_STORAGE_KEY);
  safeLocalStorage.removeItem(EVENT_BUFFER_KEY);
  sessionId = null;
  eventBuffer = [];

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

/**
 * Get UTM parameters from URL
 */
function getUTMParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('utm_source') || undefined,
    medium: params.get('utm_medium') || undefined,
    campaign: params.get('utm_campaign') || undefined,
  };
}

/**
 * Track an analytics event
 */
export async function trackEvent(eventName, properties = {}, options = {}) {
  if (!isAnalyticsEnabled()) {
    return;
  }

  const utm = getUTMParams();

  const event = {
    event_name: eventName,
    session_id: getSessionId(),
    campaign_id: options.campaignId || properties.campaign_id,
    source: utm.source,
    medium: utm.medium,
    campaign: utm.campaign,
    properties: sanitizeProperties(properties),
    timestamp: new Date().toISOString(),
  };

  // Add to buffer
  eventBuffer.push(event);

  // Save buffer to storage (for offline support)
  saveBufferToStorage();

  // Send batch if buffer is full
  if (eventBuffer.length >= BATCH_SIZE) {
    await flushEventBuffer();
  } else {
    // Schedule batch send
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(() => flushEventBuffer(), BATCH_TIMEOUT_MS);
  }
}

/**
 * Sanitize event properties to ensure no PII
 */
function sanitizeProperties(properties) {
  const sanitized = { ...properties };

  // Remove PII fields
  const piiFields = ['wallet_address', 'ip', 'email', 'name', 'address'];
  for (const field of piiFields) {
    delete sanitized[field];
  }

  // Round numeric values for privacy
  if (sanitized.balance_points) {
    sanitized.balance_points = Math.floor(sanitized.balance_points / 100) * 100;
  }
  if (sanitized.amount_requested) {
    sanitized.amount_requested = Math.floor(sanitized.amount_requested / 100) * 100;
  }
  if (sanitized.amount_claimed) {
    sanitized.amount_claimed = Math.floor(sanitized.amount_claimed / 100) * 100;
  }

  return sanitized;
}

/**
 * Save event buffer to local storage
 */
function saveBufferToStorage() {
  try {
    safeLocalStorage.setItem(EVENT_BUFFER_KEY, JSON.stringify(eventBuffer));
  } catch (error) {
    console.warn('Failed to save analytics buffer:', error);
  }
}

/**
 * Load event buffer from local storage
 */
function loadBufferFromStorage() {
  try {
    const stored = safeLocalStorage.getItem(EVENT_BUFFER_KEY);
    if (stored) {
      eventBuffer = JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load analytics buffer:', error);
    eventBuffer = [];
  }
}

/**
 * Flush event buffer to server
 */
async function flushEventBuffer() {
  if (eventBuffer.length === 0) return;

  const eventsToSend = [...eventBuffer];
  eventBuffer = [];
  saveBufferToStorage();

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  try {
    const response = await fetch('/api/v1/analytics/events/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: eventsToSend }),
    });

    if (!response.ok) {
      // Re-add events to buffer on failure
      eventBuffer.unshift(...eventsToSend);
      saveBufferToStorage();
    }
  } catch (error) {
    // Network error - re-add events to buffer
    eventBuffer.unshift(...eventsToSend);
    saveBufferToStorage();
  }
}

/**
 * Flush any pending events before page unload
 */
function handleBeforeUnload() {
  if (eventBuffer.length > 0) {
    // Use sendBeacon for reliable delivery
    const blob = new Blob([JSON.stringify({ events: eventBuffer })], { type: 'application/json' });
    navigator.sendBeacon('/api/v1/analytics/events/batch', blob);
    eventBuffer = [];
    safeLocalStorage.removeItem(EVENT_BUFFER_KEY);
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  // Load any buffered events
  loadBufferFromStorage();

  // Send buffered events if any
  if (eventBuffer.length > 0) {
    flushEventBuffer();
  }

  // Set up beforeunload handler
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Set up page visibility handler for mobile
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleBeforeUnload();
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Convenience functions for common events
// ───────────────────────────────────────────────────────────────────────────

export const analytics = {
  // Wallet connection
  trackWalletConnectInitiated: (provider, page, campaignId) =>
    trackEvent('wallet_connect_initiated', { provider, page, campaign_id: campaignId }),

  trackWalletConnectSuccess: (provider, network, timeToConnectMs) =>
    trackEvent('wallet_connect_success', {
      provider,
      network,
      time_to_connect_ms: timeToConnectMs,
    }),

  trackWalletConnectFailed: (provider, errorType, timeToFailureMs) =>
    trackEvent('wallet_connect_failed', {
      provider,
      error_type: errorType,
      time_to_failure_ms: timeToFailureMs,
    }),

  // Registration
  trackRegistrationViewed: (campaignId, privacyMode, isRegistered, timeRemainingHours) =>
    trackEvent('registration_viewed', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      is_registered: isRegistered,
      time_remaining_hours: timeRemainingHours,
    }),

  trackRegistrationInitiated: (campaignId, privacyMode, hasAllowlistProof) =>
    trackEvent('registration_initiated', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      has_allowlist_proof: hasAllowlistProof,
    }),

  trackRegistrationTxSigned: (campaignId, privacyMode, timeToSignMs) =>
    trackEvent('registration_tx_signed', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      time_to_sign_ms: timeToSignMs,
    }),

  trackRegistrationSuccess: (
    campaignId,
    privacyMode,
    txFeeXlm,
    timeToConfirmMs,
    alreadyRegistered,
  ) =>
    trackEvent('registration_success', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      tx_fee_xlm: txFeeXlm,
      time_to_confirm_ms: timeToConfirmMs,
      already_registered: alreadyRegistered,
    }),

  trackRegistrationFailed: (campaignId, privacyMode, errorType, stage) =>
    trackEvent('registration_failed', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      error_type: errorType,
      stage,
    }),

  // Claim/Redeem
  trackRewardsViewed: (campaignId, balancePoints, hasPayoutAsset) =>
    trackEvent('rewards_viewed', {
      campaign_id: campaignId,
      balance_points: balancePoints,
      has_payout_asset: hasPayoutAsset,
    }),

  trackClaimInitiated: (campaignId, claimType, amountRequested) =>
    trackEvent('claim_initiated', {
      campaign_id: campaignId,
      claim_type: claimType,
      amount_requested: amountRequested,
    }),

  trackClaimTxSigned: (campaignId, claimType, timeToSignMs) =>
    trackEvent('claim_tx_signed', {
      campaign_id: campaignId,
      claim_type: claimType,
      time_to_sign_ms: timeToSignMs,
    }),

  trackClaimSuccess: (campaignId, claimType, amountClaimed, txFeeXlm, timeToConfirmMs) =>
    trackEvent('claim_success', {
      campaign_id: campaignId,
      claim_type: claimType,
      amount_claimed: amountClaimed,
      tx_fee_xlm: txFeeXlm,
      time_to_confirm_ms: timeToConfirmMs,
    }),

  trackClaimFailed: (campaignId, claimType, errorType, stage) =>
    trackEvent('claim_failed', {
      campaign_id: campaignId,
      claim_type: claimType,
      error_type: errorType,
      stage,
    }),

  // Campaign discovery
  trackCampaignListViewed: (filterStatus, filterCategory, campaignsVisible) =>
    trackEvent('campaign_list_viewed', {
      filter_status: filterStatus,
      filter_category: filterCategory,
      campaigns_visible: campaignsVisible,
    }),

  trackCampaignCardClicked: (campaignId, campaignStatus, position, sourcePage) =>
    trackEvent('campaign_card_clicked', {
      campaign_id: campaignId,
      campaign_status: campaignStatus,
      position,
      source_page: sourcePage,
    }),

  trackCampaignDetailViewed: (
    campaignId,
    campaignStatus,
    hasPayoutAsset,
    privacyMode,
    daysRemaining,
  ) =>
    trackEvent('campaign_detail_viewed', {
      campaign_id: campaignId,
      campaign_status: campaignStatus,
      has_payout_asset: hasPayoutAsset,
      privacy_mode: privacyMode,
      days_remaining: daysRemaining,
    }),

  // Campaign creation
  trackCampaignCreateStarted: (isAdmin, hasCreatedBefore) =>
    trackEvent('campaign_create_started', {
      is_admin: isAdmin,
      has_created_before: hasCreatedBefore,
    }),

  trackCampaignCreateStepCompleted: (step, stepNumber, timeOnStepMs) =>
    trackEvent('campaign_create_step_completed', {
      step,
      step_number: stepNumber,
      time_on_step_ms: timeOnStepMs,
    }),

  trackCampaignCreateSuccess: (
    campaignId,
    privacyMode,
    hasPayoutAsset,
    totalTimeMs,
    stepsVisited,
  ) =>
    trackEvent('campaign_create_success', {
      campaign_id: campaignId,
      privacy_mode: privacyMode,
      has_payout_asset: hasPayoutAsset,
      total_time_ms: totalTimeMs,
      steps_visited: stepsVisited,
    }),

  trackCampaignCreateAbandoned: (lastStep, timeSpentMs) =>
    trackEvent('campaign_create_abandoned', { last_step: lastStep, time_spent_ms: timeSpentMs }),

  // Session
  trackSessionStarted: (entryPage, source, medium, campaign, referrerDomain) =>
    trackEvent('session_started', {
      entry_page: entryPage,
      source,
      medium,
      campaign,
      referrer_domain: referrerDomain,
    }),

  trackPageViewed: (pagePath, pageTitle, previousPage) =>
    trackEvent('page_viewed', {
      page_path: pagePath,
      page_title: pageTitle,
      previous_page: previousPage,
    }),
};

export default analytics;
