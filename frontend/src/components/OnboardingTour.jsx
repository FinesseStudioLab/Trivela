import { useEffect, useRef, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'trivela:tour_completed';

const TOUR_STEPS = [
  {
    popover: {
      title: 'Welcome to Trivela',
      description:
        'Trivela is a Stellar-powered campaign platform where you can discover, register, and earn rewards. Let us show you around.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="campaigns"]',
    popover: {
      title: 'Browse Campaigns',
      description:
        'Explore active campaigns here. Filter by category, sort by newest or reward size, and find ones that match your interests.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="connect-wallet"]',
    popover: {
      title: 'Connect Your Wallet',
      description:
        'Connect your Freighter wallet to participate in campaigns and track your XLM balance and reward points.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="campaigns"]',
    popover: {
      title: 'Register & Earn',
      description:
        'Click any campaign card to see details and register. Each action you complete earns reward points recorded on the Stellar blockchain.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="rewards"]',
    popover: {
      title: 'Track Your Rewards',
      description:
        'Your accumulated reward points are shown here once your wallet is connected. You can claim them via the smart contract at any time.',
      side: 'bottom',
      align: 'end',
    },
  },
];

export default function OnboardingTour({ onRestart }) {
  const driverRef = useRef(null);
  const [ready, setReady] = useState(false);

  const startTour = () => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const d = driver({
      animate: true,
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      steps: TOUR_STEPS,
      onDestroyed: () => {
        localStorage.setItem(TOUR_KEY, 'true');
      },
    });

    driverRef.current = d;
    d.drive();
  };

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      const timeout = setTimeout(() => {
        setReady(true);
        startTour();
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (onRestart) {
      onRestart.current = startTour;
    }
  }, [onRestart]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!driverRef.current) return;
      if (e.key === 'ArrowRight') driverRef.current.moveNext();
      else if (e.key === 'ArrowLeft') driverRef.current.movePrevious();
      else if (e.key === 'Escape') driverRef.current.destroy();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (!ready) return null;

  return null;
}

export function useRestartTour() {
  const restartRef = useRef(null);
  const restart = () => {
    if (restartRef.current) restartRef.current();
  };
  return { restartRef, restart };
}
