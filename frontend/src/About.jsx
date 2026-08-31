import { useEffect, useState } from 'react';
import { getRuntimeConfig, apiUrl, API_BASE_URL } from './config';
import Header from './components/Header';

const GITHUB_REPO = 'https://github.com/FinesseStudioLab/Trivela';
const GITHUB_ISSUES = 'https://github.com/FinesseStudioLab/Trivela/issues';
const FREIGHTER_URL = 'https://www.freighter.app';
const STELLAR_DOCS = 'https://developers.stellar.org/docs/build/smart-contracts';

const STACK = [
  {
    icon: '⚙️',
    name: 'Soroban Smart Contracts',
    desc: 'Two Rust contracts: a campaign contract managing participants and Merkle allowlists, and a rewards contract tracking points and claims — deployed on Stellar testnet.',
  },
  {
    icon: '🗄️',
    name: 'Node.js REST API',
    desc: 'Express backend with SQLite (dev) or PostgreSQL (production), OpenTelemetry tracing, rate limiting, S3/local image storage, and webhook delivery.',
  },
  {
    icon: '⚛️',
    name: 'React Frontend',
    desc: 'Vite-powered SPA with Freighter wallet integration, campaign browsing, leaderboards, tiered rewards claiming, analytics, and an embedded widget mode.',
  },
];

const HOW_TO = [
  {
    step: '01',
    title: 'Install Freighter',
    desc: 'Add the Freighter browser extension and create or import a Stellar wallet.',
    href: FREIGHTER_URL,
    cta: 'Get Freighter',
  },
  {
    step: '02',
    title: 'Browse campaigns',
    desc: 'Explore active campaigns on the home page. Each campaign shows its reward pool, participant count, and registration status.',
    href: '/',
    cta: 'View campaigns',
  },
  {
    step: '03',
    title: 'Connect & register',
    desc: 'Connect your wallet, register for a campaign you qualify for, and earn on-chain points automatically.',
    href: '/',
    cta: 'Connect wallet',
  },
  {
    step: '04',
    title: 'Claim rewards',
    desc: 'Once points are awarded, use the rewards panel to claim XLM or token payouts directly to your wallet via the Soroban contract.',
    href: '/',
    cta: 'Open rewards',
  },
];

function ConfigRow({ label, value, mono = true }) {
  return (
    <tr>
      <td
        style={{
          padding: '10px 16px',
          color: 'var(--color-text-secondary, #94a3b8)',
          whiteSpace: 'nowrap',
          fontWeight: 500,
          width: '220px',
          verticalAlign: 'top',
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '10px 16px',
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: mono ? '0.85rem' : 'inherit',
          wordBreak: 'break-all',
          color: 'var(--color-text, #e2e8f0)',
        }}
      >
        {value || <span style={{ color: '#64748b', fontStyle: 'italic' }}>not configured</span>}
      </td>
    </tr>
  );
}

function ConfigSection({ title, children }) {
  return (
    <section style={{ marginBottom: '24px' }}>
      <h3
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary, #64748b)',
          marginBottom: '8px',
          paddingLeft: '16px',
        }}
      >
        {title}
      </h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
        }}
      >
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

export default function About({
  theme,
  onToggleTheme,
  stellarNetwork,
  onChangeStellarNetwork,
  walletAddress,
  walletBalance,
  isWalletLoading,
  isWalletBalanceLoading,
  onConnectWallet,
  onDisconnectWallet,
}) {
  const [config, setConfig] = useState(() => getRuntimeConfig());
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    setConfig(getRuntimeConfig());
  }, [stellarNetwork]);

  const { stellar, contracts, sources } = config;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg, #0f172a)',
        color: 'var(--color-text, #e2e8f0)',
      }}
    >
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        stellarNetwork={stellarNetwork}
        onChangeStellarNetwork={onChangeStellarNetwork}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        isWalletLoading={isWalletLoading}
        isWalletBalanceLoading={isWalletBalanceLoading}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
      />

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '72px 24px 80px' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', marginBottom: '72px' }}>
          <p
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-accent, #6366f1)',
              marginBottom: '12px',
            }}
          >
            Open source · Stellar ecosystem
          </p>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: '20px',
            }}
          >
            On-chain campaigns,
            <br />
            real rewards
          </h1>
          <p
            style={{
              fontSize: '1.1rem',
              color: 'var(--color-text-secondary, #94a3b8)',
              maxWidth: '560px',
              margin: '0 auto 32px',
              lineHeight: 1.7,
            }}
          >
            Trivela lets projects create Stellar Soroban campaigns, allowlist participants via
            Merkle proofs, award on-chain points, and pay out rewards automatically — no centralised
            intermediary.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/" className="btn btn-primary">
              Browse campaigns
            </a>
            <a
              href={GITHUB_REPO}
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>
          </div>
        </section>

        {/* Tech stack */}
        <section style={{ marginBottom: '72px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '24px' }}>The stack</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            {STACK.map((s) => (
              <div
                key={s.name}
                style={{
                  background: 'var(--color-surface, #1e293b)',
                  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
                  borderRadius: '14px',
                  padding: '24px',
                }}
              >
                <p style={{ fontSize: '1.6rem', marginBottom: '10px' }}>{s.icon}</p>
                <h3 style={{ fontWeight: 700, marginBottom: '8px', fontSize: '1rem' }}>{s.name}</h3>
                <p
                  style={{
                    color: 'var(--color-text-secondary, #94a3b8)',
                    fontSize: '0.9rem',
                    lineHeight: 1.6,
                  }}
                >
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ marginBottom: '72px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '24px' }}>
            How to get started
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
            }}
          >
            {HOW_TO.map((step) => (
              <div
                key={step.step}
                style={{
                  background: 'var(--color-surface, #1e293b)',
                  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
                  borderRadius: '14px',
                  padding: '24px',
                  position: 'relative',
                }}
              >
                <p
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: 'var(--color-accent, #6366f1)',
                    marginBottom: '10px',
                  }}
                >
                  {step.step}
                </p>
                <h3 style={{ fontWeight: 700, marginBottom: '8px', fontSize: '0.95rem' }}>
                  {step.title}
                </h3>
                <p
                  style={{
                    color: 'var(--color-text-secondary, #94a3b8)',
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    marginBottom: '16px',
                  }}
                >
                  {step.desc}
                </p>
                <a
                  href={step.href}
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-accent, #6366f1)',
                    textDecoration: 'none',
                  }}
                  {...(step.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {step.cta} →
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Contribute */}
        <section
          style={{
            background: 'var(--color-surface, #1e293b)',
            border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
            borderRadius: '16px',
            padding: '36px',
            marginBottom: '72px',
            display: 'flex',
            gap: '32px',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>
              Contribute to Trivela
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary, #94a3b8)',
                fontSize: '0.9rem',
                maxWidth: '420px',
                lineHeight: 1.6,
              }}
            >
              Trivela is part of the{' '}
              <a
                href="https://www.drips.network/wave/stellar"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                Stellar Wave on Drips
              </a>
              . Open issues span smart contracts, the backend API, and this React frontend.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={GITHUB_ISSUES}
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse issues
            </a>
            <a
              href={STELLAR_DOCS}
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stellar docs
            </a>
          </div>
        </section>

        {/* Dev config — collapsed by default */}
        <section>
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            style={{
              background: 'none',
              border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '10px 18px',
              color: 'var(--color-text-secondary, #94a3b8)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
            aria-expanded={showConfig}
          >
            <span>{showConfig ? '▲' : '▼'}</span> Developer config
          </button>

          {showConfig && (
            <div>
              <ConfigSection title="API">
                <ConfigRow label="API Base URL" value={API_BASE_URL || window.location.origin} />
                <ConfigRow label="Campaigns endpoint" value={apiUrl('/api/v1/campaigns')} />
              </ConfigSection>
              <ConfigSection title="Stellar Network">
                <ConfigRow label="Network" value={stellar.network} mono={false} />
                <ConfigRow label="Soroban RPC URL" value={stellar.sorobanRpcUrl} />
                <ConfigRow label="Horizon URL" value={stellar.horizonUrl} />
                <ConfigRow label="Source" value={sources.stellar} mono={false} />
              </ConfigSection>
              <ConfigSection title="Contract IDs">
                <ConfigRow label="Rewards contract" value={contracts.rewards} />
                <ConfigRow label="Campaign contract" value={contracts.campaign} />
                <ConfigRow label="Source" value={sources.contracts} mono={false} />
              </ConfigSection>
            </div>
          )}
        </section>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--color-border, rgba(255,255,255,0.08))',
          padding: '32px 24px',
          textAlign: 'center',
          color: 'var(--color-text-secondary, #64748b)',
          fontSize: '0.85rem',
        }}
      >
        <p>Trivela · Apache-2.0 · Built on Stellar Soroban</p>
      </footer>
    </div>
  );
}
