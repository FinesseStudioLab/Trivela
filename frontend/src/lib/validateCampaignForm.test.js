import { describe, expect, it } from 'vitest';
import { validateCampaignForm } from './validateCampaignForm';

const NOW = new Date('2026-01-01T00:00:00Z');
const CONTRACT = `C${'A'.repeat(55)}`;
const valid = {
  name: 'Onboarding Rewards',
  rewardPerAction: '10',
  maxParticipants: '0',
  rewardToken: '',
  contractId: '',
  startDate: '2026-02-01T00:00',
  endDate: '2026-03-01T00:00',
};
const run = (overrides, opts = {}) => validateCampaignForm({ ...valid, ...overrides }, { now: NOW, ...opts });

describe('validateCampaignForm', () => {
  it('accepts a valid form', () => {
    expect(run({})).toEqual({});
  });

  it('accepts empty optional fields', () => {
    expect(run({ rewardPerAction: '', maxParticipants: '', startDate: '', endDate: '' })).toEqual({});
  });

  it('requires a 3–80 character name', () => {
    expect(run({ name: '   ' }).name).toMatch(/required/);
    expect(run({ name: 'ab' }).name).toMatch(/3–80/);
    expect(run({ name: 'x'.repeat(81) }).name).toMatch(/3–80/);
  });

  it('rejects zero, negative, fractional and non-numeric token amounts', () => {
    expect(run({ rewardPerAction: '0' }).rewardPerAction).toMatch(/positive/);
    expect(run({ rewardPerAction: '-5' }).rewardPerAction).toMatch(/positive/);
    expect(run({ rewardPerAction: 'abc' }).rewardPerAction).toMatch(/positive/);
    expect(run({ rewardPerAction: '1.5' }).rewardPerAction).toMatch(/whole/);
  });

  it('rejects negative or fractional max participants', () => {
    expect(run({ maxParticipants: '-1' }).maxParticipants).toBeDefined();
    expect(run({ maxParticipants: '2.5' }).maxParticipants).toBeDefined();
  });

  it('validates Stellar contract addresses', () => {
    expect(run({ rewardToken: 'GABC' }).rewardToken).toBeDefined();
    expect(run({ contractId: 'nope' }).contractId).toBeDefined();
    expect(run({ rewardToken: CONTRACT, contractId: CONTRACT })).toEqual({});
  });

  it('rejects end dates in the past when creating', () => {
    expect(run({ startDate: '', endDate: '2025-06-01T00:00' }).endDate).toMatch(/future/);
  });

  it('allows past end dates when editing an existing campaign', () => {
    expect(run({ startDate: '', endDate: '2025-06-01T00:00' }, { isEditMode: true })).toEqual({});
  });

  it('requires end date after start date', () => {
    expect(run({ startDate: '2026-03-01T00:00', endDate: '2026-02-01T00:00' }).endDate).toMatch(
      /after the start/,
    );
  });
});
