import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl, getStellarNetwork } from './config';
import { logSafeEvent } from './lib/safeAnalytics';
import { initializeCampaignContract, getWalletAddress, isWalletConnected } from './stellar';
import TransactionStatus from './components/TransactionStatus';

/**
 * CreateCampaign — form that submits a new campaign to POST /api/campaigns
 * and optionally deploys it on-chain with contract initialization.
 *
 * Props
 * ─────
 * @param {function} onCampaignCreated – Called after a campaign is successfully created
 *                                       so the parent can refetch the list.
 */
export default function CreateCampaign({ onCampaignCreated, campaigns = [] }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPerAction, setRewardPerAction] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [deployOnChain, setDeployOnChain] = useState(false);
  const [contractIdInput, setContractIdInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const headingId = useId();
  const nameId = useId();
  const descId = useId();
  const rewardId = useId();
  const apiKeyId = useId();
  const editSelectId = useId();
  const deployToggleId = useId();
  const contractIdInputId = useId();
  const isEditMode = selectedId !== '';
  const isBrowser = typeof window !== 'undefined';
  const storedApiKey = isBrowser
    ? window.sessionStorage.getItem('trivela_admin_api_key') || ''
    : '';
  const effectiveApiKey = apiKeyInput || storedApiKey;

  const isValid = name.trim().length > 0;

  const loadCampaignForEdit = (campaignId) => {
    setSelectedId(campaignId);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      setName('');
      setDescription('');
      setRewardPerAction('');
      setContractIdInput('');
      return;
    }
    setName(campaign.name || '');
    setDescription(campaign.description || '');
    setRewardPerAction(String(campaign.rewardPerAction ?? ''));
    setContractIdInput(campaign.contractId || '');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid) return;
    if (!effectiveApiKey) {
      setError('Admin API key is required. It is stored in session only.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');
    setDeploymentStatus('');
    setTxHash('');

    try {
      if (isBrowser && apiKeyInput) {
        window.sessionStorage.setItem('trivela_admin_api_key', apiKeyInput);
      }

      /* Step 1: Create off-chain campaign record */
      setDeploymentStatus('Creating campaign record...');
      const endpoint = isEditMode
        ? apiUrl(`/api/v1/campaigns/${selectedId}`)
        : apiUrl('/api/v1/campaigns');
      const method = isEditMode ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          rewardPerAction: Number(rewardPerAction) || 0,
          contractId: contractIdInput.trim() || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `API returned ${response.status}`);
      }

      let campaign = await response.json();

      /* Step 2: Deploy on-chain if enabled and contract ID provided */
      if (deployOnChain && contractIdInput.trim() && !isEditMode) {
        setDeploymentStatus('Checking wallet connection...');
        const walletConnected = await isWalletConnected();
        if (!walletConnected) {
          throw new Error('Wallet not connected. Please connect your wallet to deploy on-chain.');
        }

        const walletAddress = await getWalletAddress();
        setDeploymentStatus('Initializing contract on-chain...');

        const { hash } = await initializeCampaignContract(walletAddress, contractIdInput.trim());
        setTxHash(hash);
        setDeploymentStatus('Contract initialized successfully!');

        /* Step 3: Update campaign record with deployment confirmation */
        const updateResponse = await fetch(apiUrl(`/api/v1/campaigns/${campaign.id}`), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': effectiveApiKey,
          },
          body: JSON.stringify({
            contractId: contractIdInput.trim(),
          }),
        });

        if (updateResponse.ok) {
          campaign = await updateResponse.json();
        }

        logSafeEvent('admin_campaign_deployed', {
          campaignId: campaign.id,
          contractId: contractIdInput.trim(),
          txHash: hash,
        });
      }

      setSuccess(
        isEditMode
          ? `Campaign "${campaign.name}" updated successfully.`
          : deployOnChain && contractIdInput.trim()
            ? `Campaign "${campaign.name}" created and deployed on-chain successfully!`
            : `Campaign "${campaign.name}" created successfully.`,
      );

      logSafeEvent(isEditMode ? 'admin_campaign_updated' : 'admin_campaign_created', {
        campaignId: campaign.id,
      });

      setName('');
      setDescription('');
      setRewardPerAction('');
      setContractIdInput('');
      setSelectedId('');
      setDeployOnChain(false);

      if (onCampaignCreated) {
        onCampaignCreated(campaign);
      }

      // Redirect to campaign detail page after successful deployment
      if (deployOnChain && contractIdInput.trim() && !isEditMode) {
        setTimeout(() => {
          navigate(`/campaigns/${campaign.id}`);
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to create campaign.');
      setDeploymentStatus('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="create-campaign-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="create-campaign-heading">
        Admin campaign manager
      </h3>
      <p className="create-campaign-description">
        Protected admin form for creating and updating campaigns.
      </p>

      <form className="create-campaign-form" onSubmit={handleSubmit}>
        <div className="create-campaign-field">
          <label htmlFor={apiKeyId} className="create-campaign-label">
            Admin API key
          </label>
          <input
            id={apiKeyId}
            type="password"
            className="create-campaign-input"
            placeholder={storedApiKey ? 'Using key from current session' : 'Enter API key'}
            value={apiKeyInput}
            disabled={isSubmitting}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
        </div>

        <div className="create-campaign-field">
          <label htmlFor={editSelectId} className="create-campaign-label">
            Edit existing campaign (optional)
          </label>
          <select
            id={editSelectId}
            className="create-campaign-input"
            value={selectedId}
            disabled={isSubmitting}
            onChange={(e) => loadCampaignForEdit(e.target.value)}
          >
            <option value="">Create new campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        <div className="create-campaign-field">
          <label htmlFor={nameId} className="create-campaign-label">
            Campaign name <span aria-hidden="true">*</span>
          </label>
          <input
            id={nameId}
            type="text"
            className="create-campaign-input"
            placeholder="e.g. Onboarding Rewards"
            value={name}
            disabled={isSubmitting}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="create-campaign-field">
          <label htmlFor={descId} className="create-campaign-label">
            Description
          </label>
          <textarea
            id={descId}
            className="create-campaign-input create-campaign-textarea"
            placeholder="Describe the campaign goals and rules"
            rows={3}
            value={description}
            disabled={isSubmitting}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="create-campaign-field">
          <label htmlFor={rewardId} className="create-campaign-label">
            Reward per action (points)
          </label>
          <input
            id={rewardId}
            type="number"
            min="0"
            step="1"
            className="create-campaign-input"
            placeholder="e.g. 10"
            value={rewardPerAction}
            disabled={isSubmitting}
            onChange={(e) => setRewardPerAction(e.target.value)}
          />
        </div>

        <div className="create-campaign-field">
          <label htmlFor={contractIdInputId} className="create-campaign-label">
            Contract ID (optional)
          </label>
          <input
            id={contractIdInputId}
            type="text"
            className="create-campaign-input"
            placeholder="C... (Stellar contract address)"
            value={contractIdInput}
            disabled={isSubmitting}
            onChange={(e) => setContractIdInput(e.target.value)}
          />
          <small className="create-campaign-hint">
            Enter a deployed campaign contract ID to link this campaign to on-chain state.
          </small>
        </div>

        {!isEditMode && contractIdInput.trim() && (
          <div className="create-campaign-field">
            <label className="create-campaign-checkbox-label">
              <input
                id={deployToggleId}
                type="checkbox"
                checked={deployOnChain}
                disabled={isSubmitting}
                onChange={(e) => setDeployOnChain(e.target.checked)}
              />
              <span>Initialize contract on-chain after creation</span>
            </label>
            <small className="create-campaign-hint">
              When enabled, the contract will be initialized with your wallet as admin. Requires
              wallet connection.
            </small>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-button"
          disabled={!isValid || isSubmitting || !effectiveApiKey}
        >
          {isSubmitting
            ? isEditMode
              ? 'Updating…'
              : 'Creating…'
            : isEditMode
              ? 'Update campaign'
              : 'Create campaign'}
        </button>
      </form>

      {deploymentStatus && (
        <p className="create-campaign-status" role="status" aria-live="polite">
          {deploymentStatus}
        </p>
      )}

      {txHash && <TransactionStatus hash={txHash} network={getStellarNetwork()} status="Success" />}

      {success && (
        <p className="create-campaign-success" role="status" aria-live="polite">
          {success}
        </p>
      )}
      {error && (
        <p className="create-campaign-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
