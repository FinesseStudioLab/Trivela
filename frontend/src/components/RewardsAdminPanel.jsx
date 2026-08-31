import { useEffect, useState, useId } from 'react';
import { Client as RewardsClient } from '../contracts/rewards';
import { getSorobanRpcUrl, getNetworkPassphrase, getRewardsContractId } from '../config';
import { getWalletAddress, isWalletConnected } from '../stellar';
import { walletManager } from '../lib/wallet/index.js';
import TransactionStatus from './TransactionStatus';
import ConfirmationDialog from './ConfirmationDialog';
import { logSafeEvent } from '../lib/safeAnalytics';
import { useToast } from '../lib/toast/ToastProvider';
import './RewardsAdminPanel.css';

export default function RewardsAdminPanel() {
  const toast = useToast();
  const [walletAddress, setWalletAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');

  const [rewardsState, setRewardsState] = useState({
    isPaused: false,
    isPausedCredit: false,
    isPausedClaim: false,
    isPausedRedeem: false,
    redemptionReserve: 0n,
    rateLimit: [0, 0],
    maxCreditPerCall: 0n,
    multisigThreshold: 0,
  });

  const [pauseCredit, setPauseCredit] = useState(false);
  const [pauseClaim, setPauseClaim] = useState(false);
  const [pauseRedeem, setPauseRedeem] = useState(false);
  const [maxCalls, setMaxCalls] = useState('');
  const [windowLedgers, setWindowLedgers] = useState('');
  const [maxCreditInput, setMaxCreditInput] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [multisigRequired, setMultisigRequired] = useState('');
  const [coAdminAddress, setCoAdminAddress] = useState('');

  const [confirmationDialog, setConfirmationDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
  });

  const pauseCreditId = useId();
  const pauseClaimId = useId();
  const pauseRedeemId = useId();
  const maxCallsId = useId();
  const windowLedgersId = useId();
  const maxCreditId = useId();
  const fundAmountId = useId();
  const withdrawAmountId = useId();
  const multisigRequiredId = useId();
  const coAdminAddressId = useId();

  const loadWalletAddress = async () => {
    try {
      const connected = await isWalletConnected();
      if (connected) {
        const address = await getWalletAddress();
        setWalletAddress(address);
      }
    } catch (err) {
      console.warn('Failed to load wallet address:', err);
    }
  };

  const loadRewardsState = async () => {
    const contractId = getRewardsContractId();
    if (!contractId) return;

    setIsLoading(true);
    setError('');

    try {
      const client = new RewardsClient({
        rpcUrl: getSorobanRpcUrl(),
        networkPassphrase: getNetworkPassphrase(),
        contractId,
      });

      const [
        isPaused,
        isPausedCredit,
        isPausedClaim,
        isPausedRedeem,
        redemptionReserve,
        rateLimit,
        maxCreditPerCall,
        multisigThreshold,
      ] = await Promise.all([
        client.is_paused().then((tx) => tx.simulate()),
        client.is_paused_credit().then((tx) => tx.simulate()),
        client.is_paused_claim().then((tx) => tx.simulate()),
        client.is_paused_redeem().then((tx) => tx.simulate()),
        client.redemption_reserve().then((tx) => tx.simulate()),
        client.get_credit_rate_limit().then((tx) => tx.simulate()),
        client.max_credit_per_call().then((tx) => tx.simulate()),
        client.multisig_threshold().then((tx) => tx.simulate()),
      ]);

      setRewardsState({
        isPaused,
        isPausedCredit,
        isPausedClaim,
        isPausedRedeem,
        redemptionReserve,
        rateLimit,
        maxCreditPerCall,
        multisigThreshold,
      });

      setPauseCredit(isPausedCredit);
      setPauseClaim(isPausedClaim);
      setPauseRedeem(isPausedRedeem);
      setMaxCalls(rateLimit[0] === 0 ? '' : rateLimit[0].toString());
      setWindowLedgers(rateLimit[1] === 0 ? '' : rateLimit[1].toString());
      setMaxCreditInput(maxCreditPerCall === 0n ? '' : maxCreditPerCall.toString());
      setMultisigRequired(multisigThreshold === 0 ? '' : multisigThreshold.toString());
    } catch (err) {
      setError(`Failed to load rewards state: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWalletAddress();
    loadRewardsState();
  }, []);

  const createClient = () => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const contractId = getRewardsContractId();
    return new RewardsClient({
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
      contractId,
      publicKey: walletAddress,
      signTransaction: async (txXdr) => {
        const signedTxXdr = await walletManager.signTransaction(txXdr, {
          networkPassphrase: getNetworkPassphrase(),
          address: walletAddress,
        });
        return { signedTxXdr };
      },
    });
  };

  const executeAdminTransaction = async (transactionFn, successMessage, isDestructive = false) => {
    if (isDestructive) {
      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Destructive Action',
        message: `Are you sure you want to proceed with: ${successMessage}?`,
        onConfirm: async () => {
          setConfirmationDialog({ isOpen: false, title: '', message: '', onConfirm: null });
          await executeTransaction(transactionFn, successMessage);
        },
      });
      return;
    }
    await executeTransaction(transactionFn, successMessage);
  };

  const executeTransaction = async (transactionFn, successMessage) => {
    setIsLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const connected = await isWalletConnected();
      if (!connected) {
        throw new Error('Please connect your wallet to perform admin operations');
      }

      const client = createClient();
      const tx = await transactionFn(client);
      await tx.signAndSend();

      const hash = tx.signed.hash().toString('hex');
      setTxHash(hash);
      setSuccess(successMessage);
      toast.success(successMessage);

      setTimeout(() => {
        loadRewardsState();
      }, 2000);
    } catch (err) {
      const message = err.message || 'Transaction failed';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPausedCredit = async () => {
    await executeAdminTransaction(
      (client) =>
        client.set_paused_credit({
          admin: walletAddress,
          paused: pauseCredit,
        }),
      `Credit operations ${pauseCredit ? 'paused' : 'unpaused'}`,
    );
    logSafeEvent('admin_set_paused_credit', { paused: pauseCredit, walletAddress });
  };

  const handleSetPausedClaim = async () => {
    await executeAdminTransaction(
      (client) =>
        client.set_paused_claim({
          admin: walletAddress,
          paused: pauseClaim,
        }),
      `Claim operations ${pauseClaim ? 'paused' : 'unpaused'}`,
    );
    logSafeEvent('admin_set_paused_claim', { paused: pauseClaim, walletAddress });
  };

  const handleSetPausedRedeem = async () => {
    await executeAdminTransaction(
      (client) =>
        client.set_paused_redeem({
          admin: walletAddress,
          paused: pauseRedeem,
        }),
      `Redeem operations ${pauseRedeem ? 'paused' : 'unpaused'}`,
    );
    logSafeEvent('admin_set_paused_redeem', { paused: pauseRedeem, walletAddress });
  };

  const handleSetCreditRateLimit = async () => {
    const max = maxCalls ? parseInt(maxCalls, 10) : 0;
    const window = windowLedgers ? parseInt(windowLedgers, 10) : 0;

    await executeAdminTransaction(
      (client) =>
        client.set_credit_rate_limit({
          admin: walletAddress,
          max_calls: max,
          window_ledgers: window,
        }),
      max === 0
        ? 'Credit rate limit disabled'
        : `Credit rate limit set to ${max} calls per ${window} ledgers`,
    );
    logSafeEvent('admin_set_credit_rate_limit', {
      max_calls: max,
      window_ledgers: window,
      walletAddress,
    });
  };

  const handleSetMaxCreditPerCall = async () => {
    const maxAmount = maxCreditInput ? BigInt(maxCreditInput) : 0n;

    await executeAdminTransaction(
      (client) =>
        client.set_max_credit_per_call({
          admin: walletAddress,
          max_amount: maxAmount,
        }),
      maxAmount === 0n ? 'Max credit per call disabled' : `Max credit per call set to ${maxAmount}`,
    );
    logSafeEvent('admin_set_max_credit_per_call', {
      max_amount: maxAmount.toString(),
      walletAddress,
    });
  };

  const handleFundReserve = async () => {
    const amount = fundAmount ? BigInt(fundAmount) : 0n;
    if (amount <= 0n) {
      setError('Amount must be greater than 0');
      return;
    }

    await executeAdminTransaction(
      (client) =>
        client.fund_reserve({
          from: walletAddress,
          amount,
        }),
      `Reserve funded with ${amount} tokens`,
      true,
    );
    logSafeEvent('admin_fund_reserve', { amount: amount.toString(), walletAddress });
  };

  const handleWithdrawReserve = async () => {
    const amount = withdrawAmount ? BigInt(withdrawAmount) : 0n;
    if (amount <= 0n) {
      setError('Amount must be greater than 0');
      return;
    }

    await executeAdminTransaction(
      (client) =>
        client.withdraw_reserve({
          admin: walletAddress,
          nonce: 0n,
          amount,
        }),
      `Withdrew ${amount} tokens from reserve`,
      true,
    );
    logSafeEvent('admin_withdraw_reserve', { amount: amount.toString(), walletAddress });
  };

  const handleSetMultisigThreshold = async () => {
    const required = multisigRequired ? parseInt(multisigRequired, 10) : 0;

    await executeAdminTransaction(
      (client) =>
        client.set_multisig_threshold({
          admin: walletAddress,
          required,
        }),
      required === 0 ? 'Multisig disabled' : `Multisig threshold set to ${required}`,
    );
    logSafeEvent('admin_set_multisig_threshold', { required, walletAddress });
  };

  const handleAddCoAdmin = async () => {
    if (!coAdminAddress.trim()) {
      setError('Co-admin address is required');
      return;
    }

    await executeAdminTransaction(
      (client) =>
        client.add_co_admin({
          admin: walletAddress,
          co_admin: coAdminAddress.trim(),
          pubkey: new Uint8Array(32),
        }),
      `Co-admin ${coAdminAddress.trim()} added`,
    );
    logSafeEvent('admin_add_co_admin', { co_admin: coAdminAddress.trim(), walletAddress });
  };

  const handleRemoveCoAdmin = async () => {
    if (!coAdminAddress.trim()) {
      setError('Co-admin address is required');
      return;
    }

    await executeAdminTransaction(
      (client) =>
        client.remove_co_admin({
          admin: walletAddress,
          co_admin: coAdminAddress.trim(),
        }),
      `Co-admin ${coAdminAddress.trim()} removed`,
      true,
    );
    logSafeEvent('admin_remove_co_admin', { co_admin: coAdminAddress.trim(), walletAddress });
  };

  const contractId = getRewardsContractId();

  if (!contractId) {
    return (
      <div className="rewards-admin-panel">
        <h3>Rewards Admin Panel</h3>
        <div className="admin-warning">
          <p>No rewards contract configured. Set VITE_REWARDS_CONTRACT_ID environment variable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rewards-admin-panel">
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
        onConfirm={confirmationDialog.onConfirm}
        onCancel={() =>
          setConfirmationDialog({ isOpen: false, title: '', message: '', onConfirm: null })
        }
      />

      <div className="admin-header">
        <h3>Rewards Contract Admin</h3>
        <p className="admin-subtitle">Manage rewards contract settings</p>
        <div className="admin-contract-info">
          <strong>Contract:</strong> <code>{contractId}</code>
          {walletAddress && (
            <>
              <br />
              <strong>Admin:</strong> <code>{walletAddress}</code>
            </>
          )}
        </div>
      </div>

      {!walletAddress && (
        <div className="admin-warning">
          <p>Please connect your wallet to access admin functions</p>
        </div>
      )}

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="admin-success" role="status">
          {success}
        </div>
      )}

      {txHash && (
        <TransactionStatus
          hash={txHash}
          network={getSorobanRpcUrl().includes('testnet') ? 'testnet' : 'mainnet'}
          status="Success"
        />
      )}

      <div className="admin-sections">
        <section className="admin-section">
          <h4>Contract Status</h4>
          <div className="admin-status-grid">
            <div className="status-item">
              <label>Global Pause</label>
              <span className={`status-badge ${rewardsState.isPaused ? 'active' : 'inactive'}`}>
                {rewardsState.isPaused ? 'Paused' : 'Active'}
              </span>
            </div>
            <div className="status-item">
              <label>Credit Paused</label>
              <span
                className={`status-badge ${rewardsState.isPausedCredit ? 'active' : 'inactive'}`}
              >
                {rewardsState.isPausedCredit ? 'Paused' : 'Active'}
              </span>
            </div>
            <div className="status-item">
              <label>Claim Paused</label>
              <span
                className={`status-badge ${rewardsState.isPausedClaim ? 'active' : 'inactive'}`}
              >
                {rewardsState.isPausedClaim ? 'Paused' : 'Active'}
              </span>
            </div>
            <div className="status-item">
              <label>Redeem Paused</label>
              <span
                className={`status-badge ${rewardsState.isPausedRedeem ? 'active' : 'inactive'}`}
              >
                {rewardsState.isPausedRedeem ? 'Paused' : 'Active'}
              </span>
            </div>
            <div className="status-item">
              <label>Redemption Reserve</label>
              <span>{rewardsState.redemptionReserve.toString()}</span>
            </div>
            <div className="status-item">
              <label>Rate Limit</label>
              <span>
                {rewardsState.rateLimit[0] === 0
                  ? 'Disabled'
                  : `${rewardsState.rateLimit[0]} calls / ${rewardsState.rateLimit[1]} ledgers`}
              </span>
            </div>
            <div className="status-item">
              <label>Max Credit/Call</label>
              <span>
                {rewardsState.maxCreditPerCall === 0n
                  ? 'Unlimited'
                  : rewardsState.maxCreditPerCall.toString()}
              </span>
            </div>
            <div className="status-item">
              <label>Multisig Threshold</label>
              <span>
                {rewardsState.multisigThreshold === 0
                  ? 'Disabled'
                  : `${rewardsState.multisigThreshold}-of-N`}
              </span>
            </div>
          </div>

          <button onClick={loadRewardsState} disabled={isLoading} className="btn btn-secondary">
            {isLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </section>

        <section className="admin-section">
          <h4>Pause Controls</h4>
          <p className="section-description">
            Independently pause or unpause specific operations. Global pause affects all operations.
          </p>
          <div className="admin-field-group">
            <div className="admin-field">
              <label className="admin-checkbox-label">
                <input
                  id={pauseCreditId}
                  type="checkbox"
                  checked={pauseCredit}
                  onChange={(e) => setPauseCredit(e.target.checked)}
                  disabled={isLoading || !walletAddress}
                />
                <span>Pause Credit Operations</span>
              </label>
              <small>Blocks credit, batch_credit, credit_vested, credit_by_rank</small>
              <button
                onClick={handleSetPausedCredit}
                disabled={
                  isLoading || !walletAddress || pauseCredit === rewardsState.isPausedCredit
                }
                className="btn btn-primary"
              >
                {pauseCredit ? 'Pause Credit' : 'Unpause Credit'}
              </button>
            </div>

            <div className="admin-field">
              <label className="admin-checkbox-label">
                <input
                  id={pauseClaimId}
                  type="checkbox"
                  checked={pauseClaim}
                  onChange={(e) => setPauseClaim(e.target.checked)}
                  disabled={isLoading || !walletAddress}
                />
                <span>Pause Claim Operations</span>
              </label>
              <small>Blocks claim, claim_vested</small>
              <button
                onClick={handleSetPausedClaim}
                disabled={isLoading || !walletAddress || pauseClaim === rewardsState.isPausedClaim}
                className="btn btn-primary"
              >
                {pauseClaim ? 'Pause Claim' : 'Unpause Claim'}
              </button>
            </div>

            <div className="admin-field">
              <label className="admin-checkbox-label">
                <input
                  id={pauseRedeemId}
                  type="checkbox"
                  checked={pauseRedeem}
                  onChange={(e) => setPauseRedeem(e.target.checked)}
                  disabled={isLoading || !walletAddress}
                />
                <span>Pause Redeem Operations</span>
              </label>
              <small>Blocks redeem</small>
              <button
                onClick={handleSetPausedRedeem}
                disabled={
                  isLoading || !walletAddress || pauseRedeem === rewardsState.isPausedRedeem
                }
                className="btn btn-primary"
              >
                {pauseRedeem ? 'Pause Redeem' : 'Unpause Redeem'}
              </button>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <h4>Rate Limits</h4>
          <p className="section-description">Control credit call frequency to prevent abuse.</p>
          <div className="admin-field-group">
            <div className="admin-field">
              <label htmlFor={maxCallsId}>Max Calls Per Window</label>
              <input
                id={maxCallsId}
                type="number"
                min="0"
                value={maxCalls}
                onChange={(e) => setMaxCalls(e.target.value)}
                disabled={isLoading || !walletAddress}
                placeholder="0 to disable"
                className="admin-input"
              />
              <small>Number of credit calls allowed per window. 0 to disable.</small>
            </div>
            <div className="admin-field">
              <label htmlFor={windowLedgersId}>Window (Ledgers)</label>
              <input
                id={windowLedgersId}
                type="number"
                min="0"
                value={windowLedgers}
                onChange={(e) => setWindowLedgers(e.target.value)}
                disabled={isLoading || !walletAddress}
                placeholder="e.g. 100"
                className="admin-input"
              />
              <small>Number of ledgers for the rate limit window.</small>
            </div>
          </div>
          <button
            onClick={handleSetCreditRateLimit}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            Update Rate Limit
          </button>
        </section>

        <section className="admin-section">
          <h4>Max Credit Per Call</h4>
          <div className="admin-field">
            <label htmlFor={maxCreditId}>Maximum Amount</label>
            <input
              id={maxCreditId}
              type="number"
              min="0"
              value={maxCreditInput}
              onChange={(e) => setMaxCreditInput(e.target.value)}
              disabled={isLoading || !walletAddress}
              placeholder="0 for unlimited"
              className="admin-input"
            />
            <small>Maximum points allowed per single credit call. 0 for unlimited.</small>
          </div>
          <button
            onClick={handleSetMaxCreditPerCall}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            Update Max Credit
          </button>
        </section>

        <section className="admin-section">
          <h4>Reserve Management</h4>
          <p className="section-description">
            Manage the redemption reserve for points-to-asset conversion.
          </p>
          <div className="admin-status-grid" style={{ marginBottom: '1rem' }}>
            <div className="status-item">
              <label>Current Reserve</label>
              <span>{rewardsState.redemptionReserve.toString()} tokens</span>
            </div>
          </div>
          <div className="admin-field-group">
            <div className="admin-field">
              <label htmlFor={fundAmountId}>Fund Amount</label>
              <input
                id={fundAmountId}
                type="number"
                min="0"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                disabled={isLoading || !walletAddress}
                placeholder="Amount to deposit"
                className="admin-input"
              />
              <small>Deposit asset tokens into the redemption reserve.</small>
              <button
                onClick={handleFundReserve}
                disabled={isLoading || !walletAddress || !fundAmount}
                className="btn btn-primary"
              >
                Fund Reserve
              </button>
            </div>
            <div className="admin-field">
              <label htmlFor={withdrawAmountId}>Withdraw Amount</label>
              <input
                id={withdrawAmountId}
                type="number"
                min="0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isLoading || !walletAddress}
                placeholder="Amount to withdraw"
                className="admin-input"
              />
              <small>Withdraw asset tokens from the redemption reserve.</small>
              <button
                onClick={handleWithdrawReserve}
                disabled={isLoading || !walletAddress || !withdrawAmount}
                className="btn btn-primary btn-danger"
              >
                Withdraw Reserve
              </button>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <h4>Multisig Configuration</h4>
          <p className="section-description">
            Configure multisig threshold for critical operations.
          </p>
          <div className="admin-field">
            <label htmlFor={multisigRequiredId}>Required Signatures (M-of-N)</label>
            <input
              id={multisigRequiredId}
              type="number"
              min="0"
              value={multisigRequired}
              onChange={(e) => setMultisigRequired(e.target.value)}
              disabled={isLoading || !walletAddress}
              placeholder="0 to disable"
              className="admin-input"
            />
            <small>Number of required co-admin signatures. 0 disables multisig.</small>
          </div>
          <button
            onClick={handleSetMultisigThreshold}
            disabled={isLoading || !walletAddress}
            className="btn btn-primary"
          >
            Update Multisig Threshold
          </button>
        </section>

        <section className="admin-section">
          <h4>Co-Admin Management</h4>
          <div className="admin-field">
            <label htmlFor={coAdminAddressId}>Co-Admin Address</label>
            <input
              id={coAdminAddressId}
              type="text"
              value={coAdminAddress}
              onChange={(e) => setCoAdminAddress(e.target.value)}
              disabled={isLoading || !walletAddress}
              placeholder="Enter Stellar address (G...)"
              className="admin-input"
            />
            <small>Stellar address of the co-admin to add or remove.</small>
          </div>
          <div className="admin-button-group">
            <button
              onClick={handleAddCoAdmin}
              disabled={isLoading || !walletAddress || !coAdminAddress.trim()}
              className="btn btn-primary"
            >
              Add Co-Admin
            </button>
            <button
              onClick={handleRemoveCoAdmin}
              disabled={isLoading || !walletAddress || !coAdminAddress.trim()}
              className="btn btn-primary btn-danger"
            >
              Remove Co-Admin
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
