// Client-side validation for the CreateCampaign form (issue #1230).
// Pure function so it can be unit tested without rendering the form.

const STELLAR_CONTRACT_RE = /^C[A-Z2-7]{55}$/;

/**
 * @param {object} values - raw form values (strings as held in state)
 * @param {object} [options]
 * @param {boolean} [options.isEditMode] - skip "end date in the past" for existing campaigns
 * @param {Date}    [options.now]
 * @returns {Record<string, string>} map of field -> error message (empty when valid)
 */
export function validateCampaignForm(values, { isEditMode = false, now = new Date() } = {}) {
  const errors = {};
  const name = (values.name || '').trim();

  if (!name) {
    errors.name = 'Campaign name is required.';
  } else if (name.length < 3 || name.length > 80) {
    errors.name = 'Campaign name must be 3–80 characters.';
  }

  if (values.rewardPerAction !== '' && values.rewardPerAction != null) {
    const reward = Number(values.rewardPerAction);
    if (!Number.isFinite(reward) || reward <= 0) {
      errors.rewardPerAction = 'Reward amount must be a positive number.';
    } else if (!Number.isInteger(reward)) {
      errors.rewardPerAction = 'Reward amount must be a whole number of token units.';
    }
  }

  if (values.maxParticipants !== '' && values.maxParticipants != null) {
    const max = Number(values.maxParticipants);
    if (!Number.isInteger(max) || max < 0) {
      errors.maxParticipants = 'Max participants must be a whole number (0 = unlimited).';
    }
  }

  const token = (values.rewardToken || '').trim();
  if (token && !STELLAR_CONTRACT_RE.test(token)) {
    errors.rewardToken = 'Reward token must be a Stellar contract address (C…, 56 characters).';
  }

  const contractId = (values.contractId || '').trim();
  if (contractId && !STELLAR_CONTRACT_RE.test(contractId)) {
    errors.contractId = 'Contract ID must be a Stellar contract address (C…, 56 characters).';
  }

  const start = values.startDate ? new Date(values.startDate) : null;
  const end = values.endDate ? new Date(values.endDate) : null;
  if (start && Number.isNaN(start.getTime())) errors.startDate = 'Start date is invalid.';
  if (end && Number.isNaN(end.getTime())) {
    errors.endDate = 'End date is invalid.';
  } else if (end) {
    if (!isEditMode && end.getTime() <= now.getTime()) {
      errors.endDate = 'End date must be in the future.';
    } else if (start && !errors.startDate && end.getTime() <= start.getTime()) {
      errors.endDate = 'End date must be after the start date.';
    }
  }

  return errors;
}
