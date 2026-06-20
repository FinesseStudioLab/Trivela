import React from 'react';
import './StatusBadge.css';

/**
 * StatusBadge component to display campaign status (upcoming, active, ended)
 * with consistent styling and accessible colors.
 */
const StatusBadge = ({ status }) => {
  const normalizedStatus = status?.toLowerCase() || 'active';

  const getStatusLabel = (status) => {
    switch (status) {
      case 'upcoming':
        return 'Upcoming';
      case 'ended':
        return 'Ended';
      case 'active':
      default:
        return 'Active';
    }
  };

  return (
    <span className={`status-badge status-${normalizedStatus}`}>
      <span className="status-dot"></span>
      {getStatusLabel(normalizedStatus)}
    </span>
  );
};

export default StatusBadge;
