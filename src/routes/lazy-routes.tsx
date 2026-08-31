import React, { lazy, Suspense } from 'react';

// Loading fallback component
const LoadingFallback = () => (
  <div className="loading-container">
    <div className="spinner" role="status" aria-label="Loading">
      <span className="sr-only">Loading...</span>
    </div>
  </div>
);

// Lazy-loaded routes for code splitting
export const DashboardPage = lazy(() => import('../pages/Dashboard'));
export const AdminPage = lazy(() => import('../pages/Admin'));
export const ZKProverPage = lazy(() => import('../pages/ZKProver'));
export const AnalyticsPage = lazy(() => import('../pages/Analytics'));

// HOC to wrap lazy components with Suspense
export const withSuspense = <P extends object>(
  Component: React.ComponentType<P>,
) => {
  return (props: P) => (
    <Suspense fallback={<LoadingFallback />}>
      <Component {...props} />
    </Suspense>
  );
};

// Pre-wrapped lazy routes
export const LazyDashboard = withSuspense(DashboardPage);
export const LazyAdmin = withSuspense(AdminPage);
export const LazyZKProver = withSuspense(ZKProverPage);
export const LazyAnalytics = withSuspense(AnalyticsPage);
