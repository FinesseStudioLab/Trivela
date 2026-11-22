import { useMemo, useState } from 'react';
import './CampaignRoiCalculator.css';

const number = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function CampaignRoiCalculator({ rewardCurrency = 'XLM' }) {
  const [budget, setBudget] = useState('');
  const [rewardPerAction, setRewardPerAction] = useState('');
  const [expectedParticipants, setExpectedParticipants] = useState('');
  const [conversionRate, setConversionRate] = useState('');

  const results = useMemo(() => {
    const b = number(budget);
    const rpa = number(rewardPerAction);
    const participants = number(expectedParticipants);
    const conversion = number(conversionRate) / 100;

    const totalCost = rpa * participants;
    const costPerParticipant = participants > 0 ? totalCost / participants : 0;
    const remainingBudget = b - totalCost;
    const convertedUsers = Math.round(participants * conversion);
    const estimatedRevenue = convertedUsers * costPerParticipant * 3;
    const roi = totalCost > 0 ? ((estimatedRevenue - totalCost) / totalCost) * 100 : 0;

    return {
      totalCost: round2(totalCost),
      costPerParticipant: round2(costPerParticipant),
      remainingBudget: round2(remainingBudget),
      convertedUsers,
      estimatedRevenue: round2(estimatedRevenue),
      roi: round2(roi),
    };
  }, [budget, rewardPerAction, expectedParticipants, conversionRate]);

  return (
    <div className="roi-calculator" data-testid="roi-calculator">
      <h2 className="roi-calculator-title">Campaign ROI Calculator</h2>
      <p className="roi-calculator-subtitle">
        Estimate engagement and retention ROI for your campaign sponsorship.
      </p>

      <div className="roi-calculator-form">
        <label className="roi-field">
          <span>Total budget ({rewardCurrency})</span>
          <input
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="1000"
          />
        </label>
        <label className="roi-field">
          <span>Reward per action ({rewardCurrency})</span>
          <input
            type="number"
            min="0"
            value={rewardPerAction}
            onChange={(e) => setRewardPerAction(e.target.value)}
            placeholder="5"
          />
        </label>
        <label className="roi-field">
          <span>Expected participants</span>
          <input
            type="number"
            min="0"
            value={expectedParticipants}
            onChange={(e) => setExpectedParticipants(e.target.value)}
            placeholder="200"
          />
        </label>
        <label className="roi-field">
          <span>Retention conversion (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            value={conversionRate}
            onChange={(e) => setConversionRate(e.target.value)}
            placeholder="15"
          />
        </label>
      </div>

      <div className="roi-calculator-results" data-testid="roi-results">
        <div className="roi-result-row">
          <span>Total campaign cost</span>
          <strong>{results.totalCost.toLocaleString()} {rewardCurrency}</strong>
        </div>
        <div className="roi-result-row">
          <span>Cost per participant</span>
          <strong>{results.costPerParticipant.toLocaleString()} {rewardCurrency}</strong>
        </div>
        <div className="roi-result-row">
          <span>Remaining budget</span>
          <strong className={results.remainingBudget < 0 ? 'roi-negative' : ''}>
            {results.remainingBudget.toLocaleString()} {rewardCurrency}
          </strong>
        </div>
        <div className="roi-result-row">
          <span>Estimated converted users</span>
          <strong>{results.convertedUsers.toLocaleString()}</strong>
        </div>
        <div className="roi-result-row">
          <span>Estimated revenue</span>
          <strong>{results.estimatedRevenue.toLocaleString()} {rewardCurrency}</strong>
        </div>
        <div className="roi-result-row roi-result-highlight">
          <span>Estimated ROI</span>
          <strong className={results.roi < 0 ? 'roi-negative' : 'roi-positive'}>
            {results.roi.toLocaleString()}%
          </strong>
        </div>
      </div>
    </div>
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
