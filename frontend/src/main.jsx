import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import PwaStatus from './components/PwaStatus';
import { I18nProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast/ToastProvider';
import ToastViewport from './lib/toast/ToastViewport';
import './i18n/index.js';
import './index.css';

function RoutedApp() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <App />
      <PwaStatus />
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <RoutedApp />
          </BrowserRouter>
          <ToastViewport />
        </ToastProvider>
      </I18nProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
