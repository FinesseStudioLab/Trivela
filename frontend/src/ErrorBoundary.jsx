import React from 'react';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
          <h1>Oops, something went wrong</h1>
          <button onClick={() => window.location.href = '/'}>Go home</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
