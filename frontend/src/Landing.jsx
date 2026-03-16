import { useState, useEffect } from 'react';
import './Landing.css';

const GITHUB_REPO = 'https://github.com/FinesseStudioLab/Trivela';
const GITHUB_ISSUES = 'https://github.com/FinesseStudioLab/Trivela/issues';
const STELLAR_DOCS = 'https://developers.stellar.org/docs';
const DRIP_WAVE = 'https://www.drips.network/wave/stellar';

export default function Landing() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    const api = import.meta.env.VITE_API_URL || '';
    fetch(`${api}/api/campaigns`)
      .then((r) => r.json())
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, []);

  return (
    <div className="landing">
      <nav className="nav">
        <a href="/" className="nav-logo">
          <span className="nav-logo-icon">◇</span>
          Trivela
        </a>
        <div className="nav-links">
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={GITHUB_ISSUES} target="_blank" rel="noopener noreferrer">Contribute</a>
          <a href={STELLAR_DOCS} target="_blank" rel="noopener noreferrer">Stellar</a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-badge">
          Open source · Built for <a href={DRIP_WAVE} target="_blank" rel="noopener noreferrer">Stellar Wave</a>
        </div>
        <h1 className="hero-title">
          Campaigns & rewards
          <br />
          <span className="hero-title-accent">on Stellar Soroban</span>
        </h1>
        <p className="hero-subtitle">
          Create on-chain campaigns, award points via smart contracts, and let users claim rewards.
          Full stack: Rust contracts, Node API, React frontend — ready for contributors.
        </p>
        <div className="hero-cta">
          <a href={GITHUB_REPO} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
            View repository
          </a>
          <a href={GITHUB_ISSUES} className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
            Pick an issue · Contribute
          </a>
        </div>
        <div className="hero-stats">
          <span><strong>50</strong> open issues</span>
          <span className="hero-stats-dot">·</span>
          <span><strong>3</strong> stacks</span>
          <span className="hero-stats-dot">·</span>
          <span>Rust · Node · React</span>
        </div>
      </header>

      <section className="section features">
        <h2 className="section-title">What’s in the stack</h2>
        <p className="section-subtitle">Soroban contracts, API, and frontend — all open for contribution.</p>
        <div className="features-grid">
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
            </div>
            <h3>Soroban contracts</h3>
            <p>Rust rewards & campaign contracts: points, credit, claim, participant registration. Deploy on Stellar testnet or mainnet.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            </div>
            <h3>Backend API</h3>
            <p>Node.js + Express: campaigns CRUD, health checks, config for Soroban RPC. Ready for a database and production.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            </div>
            <h3>React frontend</h3>
            <p>Vite + Stellar SDK. Landing, campaign list, and hooks for wallet connect and contract calls.</p>
          </article>
        </div>
      </section>

      <section className="section how">
        <h2 className="section-title">How it works</h2>
        <div className="how-grid">
          <div className="how-step">
            <span className="how-num">1</span>
            <h3>Deploy contracts</h3>
            <p>Build and deploy the rewards and campaign contracts to Stellar (testnet or mainnet).</p>
          </div>
          <div className="how-step">
            <span className="how-num">2</span>
            <h3>Run API & frontend</h3>
            <p>Start the backend and frontend locally or in the cloud. Connect to your Soroban RPC.</p>
          </div>
          <div className="how-step">
            <span className="how-num">3</span>
            <h3>Contribute</h3>
            <p>Pick an issue from the repo — backend, frontend, or smart contract — and open a PR.</p>
          </div>
        </div>
      </section>

      {campaigns.length > 0 && (
        <section className="section campaigns-preview">
          <h2 className="section-title">Live campaigns</h2>
          <ul className="campaigns-list">
            {campaigns.slice(0, 3).map((c) => (
              <li key={c.id} className="campaign-item">
                <strong>{c.name}</strong>
                <span className="campaign-meta">{c.active ? 'Active' : 'Inactive'} · {c.rewardPerAction} pts</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cta-band">
        <div className="cta-band-inner">
          <h2 className="cta-band-title">Ready to contribute?</h2>
          <p className="cta-band-text">50 labeled issues across smart contracts, backend, and frontend. Part of the Stellar Wave on Drips.</p>
          <a href={GITHUB_ISSUES} className="btn btn-primary btn-large" target="_blank" rel="noopener noreferrer">
            Browse issues on GitHub
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="nav-logo-icon">◇</span>
            <span>Trivela</span>
          </div>
          <div className="footer-links">
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">Repository</a>
            <a href={GITHUB_ISSUES} target="_blank" rel="noopener noreferrer">Issues</a>
            <a href={STELLAR_DOCS} target="_blank" rel="noopener noreferrer">Stellar</a>
            <a href={DRIP_WAVE} target="_blank" rel="noopener noreferrer">Drip Wave</a>
          </div>
          <p className="footer-legal">
            Part of the Stellar ecosystem. Apache-2.0.
          </p>
        </div>
      </footer>
    </div>
  );
}
