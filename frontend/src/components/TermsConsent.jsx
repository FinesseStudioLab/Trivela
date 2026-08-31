/**
 * TermsConsent — UI for recording versioned terms acceptance.
 *
 * Features:
 *   - Displays current terms version
 *   - Records consent with audit trail
 *   - Shows consent history
 *   - Exportable audit log
 *
 * Usage:
 *   <TermsConsent
 *     userId={currentUser.id}
 *     onAccept={() => navigate('/dashboard')}
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useI18n } from '../lib/i18n';
import Modal, { ConfirmDialog } from './ui/Modal.jsx';

export default function TermsConsent({ userId, onAccept, required = false }) {
  const { t } = useI18n();
  const [terms, setTerms] = useState(null);
  const [consentHistory, setConsentHistory] = useState([]);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Load terms and consent status
  useEffect(() => {
    async function loadTerms() {
      try {
        const [termsData, historyData, acceptedData] = await Promise.all([
          apiClient.getCurrentTerms(),
          apiClient.getConsentHistory(userId),
          apiClient.hasAcceptedCurrentTerms(userId),
        ]);

        setTerms(termsData);
        setConsentHistory(historyData);
        setHasAccepted(acceptedData.accepted);
      } catch (err) {
        setError(err.message || 'Failed to load terms');
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      loadTerms();
    }
  }, [userId]);

  const handleAccept = useCallback(async () => {
    if (!terms || accepting) return;

    setAccepting(true);
    setError('');

    try {
      await apiClient.recordConsent(userId, terms.version, {
        consentType: 'terms',
      });

      setHasAccepted(true);
      setConsentHistory((prev) => [
        {
          terms_version: terms.version,
          accepted_at: new Date().toISOString(),
          consent_type: 'terms',
        },
        ...prev,
      ]);

      onAccept?.();
    } catch (err) {
      setError(err.message || 'Failed to record consent');
    } finally {
      setAccepting(false);
    }
  }, [userId, terms, accepting, onAccept]);

  const handleExport = useCallback(async (format = 'json') => {
    try {
      const blob = await apiClient.exportConsentAudit(userId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consent-audit-${userId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export');
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="terms-consent terms-consent--loading">
        <p>{t('terms.loading') || 'Loading terms...'}</p>
      </div>
    );
  }

  if (error && !terms) {
    return (
      <div className="terms-consent terms-consent--error">
        <p className="error">{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
          {t('common.retry') || 'Retry'}
        </button>
      </div>
    );
  }

  // User has already accepted current terms
  if (hasAccepted && !required) {
    return (
      <div className="terms-consent terms-consent--accepted">
        <div className="terms-consent__status">
          <span className="terms-consent__check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span>
            {t('terms.alreadyAccepted') || `You have accepted the current terms (version ${terms?.version})`}
          </span>
        </div>
        <div className="terms-consent__actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowTerms(true)}>
            {t('terms.viewCurrent') || 'View Terms'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowHistory(true)}>
            {t('terms.viewHistory') || 'View History'}
          </button>
        </div>

        <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Consent History" size="md">
          {consentHistory.length === 0 ? (
            <p className="terms-consent__empty">{t('terms.noHistory') || 'No consent history found.'}</p>
          ) : (
            <table className="terms-consent__table">
              <thead>
                <tr>
                  <th>{t('terms.version') || 'Version'}</th>
                  <th>{t('terms.type') || 'Type'}</th>
                  <th>{t('terms.acceptedAt') || 'Accepted'}</th>
                </tr>
              </thead>
              <tbody>
                {consentHistory.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{entry.terms_version}</td>
                    <td>{entry.consent_type}</td>
                    <td>{formatDate(entry.accepted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Modal.Actions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowHistory(false)}>
              {t('common.close') || 'Close'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => handleExport('json')}>
              Export JSON
            </button>
            <button type="button" className="btn btn-primary" onClick={() => handleExport('csv')}>
              Export CSV
            </button>
          </Modal.Actions>
        </Modal>

        <Modal isOpen={showTerms} onClose={() => setShowTerms(false)} title={`Terms of Service - ${terms?.version}`} size="lg">
          <div className="terms-consent__content">
            {terms?.content || <p>Terms content will be loaded here.</p>}
          </div>
          <Modal.Actions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowTerms(false)}>
              {t('common.close') || 'Close'}
            </button>
          </Modal.Actions>
        </Modal>
      </div>
    );
  }

  // User needs to accept terms (required or not yet accepted)
  return (
    <div className="terms-consent terms-consent--required">
      <div className="terms-consent__header">
        <h2>{t('terms.title') || 'Terms of Service & Privacy Policy'}</h2>
        <p className="terms-consent__version">
          {t('terms.versionLabel') || 'Version'}: {terms?.version}
        </p>
      </div>

      <div className="terms-consent__content">
        {terms?.content || (
          <p>
            Please review and accept our Terms of Service and Privacy Policy to continue using Trivela.
          </p>
        )}
      </div>

      {error && (
        <div className="terms-consent__error" role="alert">
          {error}
        </div>
      )}

      <div className="terms-consent__actions">
        <label className="terms-consent__checkbox">
          <input type="checkbox" id="terms-agree" required />
          <span>
            {t('terms.agreeLabel') || 'I have read and agree to the Terms of Service and Privacy Policy'}
          </span>
        </label>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? (
            <span className="terms-consent__loading">
              <span className="terms-consent__spinner" aria-hidden="true" />
              {t('terms.accepting') || 'Accepting...'}
            </span>
          ) : (
            t('terms.accept') || 'Accept & Continue'
          )}
        </button>
      </div>

      <p className="terms-consent__audit-note">
        <small>
          {t('terms.auditNote') || 'Your acceptance will be recorded in a tamper-evident audit trail for compliance purposes.'}
        </small>
      </p>
    </div>
  );
}

/**
 * formatDate helper
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
