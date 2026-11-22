import { useEffect, useRef } from 'react';
import './StreakCelebrationModal.css';

const MILESTONES = {
  7: { title: '7-Day Streak!', emoji: '🔥', message: 'You have kept your streak alive for a week. Keep going!' },
  30: { title: '30-Day Streak!', emoji: '🏆', message: 'Incredible dedication — a full month of activity. Legendary status unlocked!' },
};

export default function StreakCelebrationModal({ streakDays, onClose }) {
  const closeRef = useRef(null);
  const milestone = MILESTONES[streakDays];

  useEffect(() => {
    if (milestone) closeRef.current?.focus();
  }, [milestone]);

  useEffect(() => {
    if (!milestone) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [milestone, onClose]);

  if (!milestone) return null;

  return (
    <div
      className="streak-celebration-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-celebration-title"
      data-testid="streak-celebration-modal"
    >
      <div className="streak-celebration" onClick={(e) => e.stopPropagation()}>
        <div className="streak-celebration-emoji" aria-hidden="true">
          {milestone.emoji}
        </div>
        <h2 id="streak-celebration-title" className="streak-celebration-title">
          {milestone.title}
        </h2>
        <p className="streak-celebration-message">{milestone.message}</p>
        <button
          type="button"
          className="btn btn-primary streak-celebration-close"
          ref={closeRef}
          onClick={onClose}
        >
          Keep it up!
        </button>
      </div>
    </div>
  );
}
