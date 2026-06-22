import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import PwaStatus from './components/PwaStatus';
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
      <BrowserRouter>
        <RoutedApp />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
