import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts(isAdmin = false) {
  const navigate = useNavigate();
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e) => {
      // Ignore if user is typing in input, textarea, or contenteditable
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const now = Date.now();

      // Escape key closes modals
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('close-modals'));
        setShowHelpModal(false);
        setAnnouncement('Closed modals');
        return;
      }

      // Help shortcut
      if (key === '?') {
        setShowHelpModal(true);
        setAnnouncement('Opened keyboard shortcuts help');
        return;
      }

      // Search focus shortcut
      if (key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"], .search-input, input[placeholder*="search" i]');
        if (searchInput) {
          searchInput.focus();
          setAnnouncement('Focused search input');
        }
        return;
      }

      // Navigate to create campaign
      if (key === 'n') {
        navigate('/create');
        setAnnouncement('Navigated to Create Campaign');
        return;
      }

      // Sequence shortcuts: "g" followed by another key within 1 second
      if (lastKey === 'g' && now - lastKeyTime < 1000) {
        if (key === 'h') {
          navigate('/');
          setAnnouncement('Navigated to Home');
        } else if (key === 'p') {
          navigate('/profile');
          setAnnouncement('Navigated to Profile');
        } else if (key === 'a') {
          if (isAdmin) {
            navigate('/admin');
            setAnnouncement('Navigated to Admin Dashboard');
          } else {
            setAnnouncement('Admin access required');
          }
        }
        lastKey = '';
        return;
      }

      if (key === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate, isAdmin]);

  return { showHelpModal, setShowHelpModal, announcement };
}
