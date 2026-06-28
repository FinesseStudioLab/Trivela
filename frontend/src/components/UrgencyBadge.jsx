import { useEffect, useState } from 'react';
import { getUrgencyBadge, BADGE_TYPES, getTimeRemaining, formatCountdown } from '../utils/urgencyUtils';
import './UrgencyBadge.css';

/**
 * UrgencyBadge component displays time-sensitive signals for campaigns
 * @param {object} props
 * @param {object} props.campaign - Campaign data
 */
export default function UrgencyBadge({ campaign }) {
  const [badge, setBadge] = useState(() => getUrgencyBadge(campaign));

  useEffect(() => {
    // Update badge immediately
    const updateBadge = () => {
      setBadge(getUrgencyBadge(campaign));
    };

    updateBadge();

    // For "Ending Soon" badges, update every minute
    const initialBadge = getUrgencyBadge(campaign);
    if (initialBadge?.type === BADGE_TYPES.ENDING_SOON) {
      const intervalId = setInterval(updateBadge, 60_000); // 60 seconds
      return () => clearInterval(intervalId);
    }

    return undefined;
  }, [campaign]);

  if (!badge) return null;

  // Render badge based on type
  switch (badge.type) {
    case BADGE_TYPES.ENDING_SOON:
      return (
        <span className="urgency-badge urgency-badge--ending-soon" role="status" aria-live="polite">
          <span className="urgency-badge-icon" aria-hidden="true">⏱</span>
          {badge.data.label}
        </span>
      );

    case BADGE_TYPES.FILLING_FAST:
      return (
        <span className="urgency-badge urgency-badge--filling-fast" role="status">
          <span className="urgency-badge-icon" aria-hidden="true">🔥</span>
          {badge.data.label}
        </span>
      );

    case BADGE_TYPES.JUST_LAUNCHED:
      return (
        <span className="urgency-badge urgency-badge--just-launched" role="status">
          <span className="urgency-badge-icon" aria-hidden="true">✨</span>
          {badge.data.label}
        </span>
      );

    default:
      return null;
  }
}
