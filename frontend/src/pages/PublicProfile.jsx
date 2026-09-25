/**
 * Public participant achievement profile — /u/:address (#605)
 *
 * Renders badges, streaks, reputation, and campaign history for a
 * Trivela participant. Server-side OG tags (via PageMeta) make shared
 * links show a rich preview card.
 *
 * Privacy model:
 *   • isPublic === false  → minimal anonymous card (no badge/history leak)
 *   • No profile found    → graceful 404 empty state
 *   • Profile exists but empty campaigns/badges → graceful empty state
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta';
import { apiUrl, SITE_URL } from '../config';
import { isFederatedAddress, resolveFederatedAddress } from '../lib/federation';

// ── Badge emoji map — extended as NEW-071 types grow ────────────────────────
const BADGE_ICONS = {
  'early-adopter': '🌱',
  'top-contributor': '🏆',
  'streak-7': '🔥',
  'streak-30': '⚡',
  soulbound: '💎',
  'campaign-winner': '🥇',
  verified: '✅',
};

function badgeIcon(id) {
  return BADGE_ICONS[id] ?? '🎖️';
}

function shortenAddress(addr) {
  if (!addr || addr.length < 10) return addr ?? '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div className="profile-stat-card">
      <span className="profile-stat-value">{value}</span>
      <span className="profile-stat-label">{label}</span>
      {sub && <span className="profile-stat-sub">{sub}</span>}
    </div>
  );
}

function BadgeChip({ badge }) {
  return (
    <div className="profile-badge" title={badge.description ?? badge.name}>
      <span className="profile-badge-icon" aria-hidden="true">
        {badgeIcon(badge.id)}
      </span>
      <span className="profile-badge-name">{badge.name}</span>
    </div>
  );
}

function CampaignRow({ campaign }) {
  const joined = campaign.joinedAt
    ? new Date(campaign.joinedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';

  return (
    <Link to={`/campaign/${campaign.id}`} className="profile-campaign-row">
      <span className="profile-campaign-name">{campaign.name}</span>
      <span className="profile-campaign-meta">
        {joined}
        {campaign.rewardEarned != null && (
          <span className="profile-campaign-reward">+{campaign.rewardEarned} pts</span>
        )}
      </span>
    </Link>
  );
}

// ── Private / anonymous view ─────────────────────────────────────────────────

function PrivateProfile({ address }) {
  return (
    <div className="profile-private" data-testid="profile-private">
      <span className="profile-private-icon" aria-hidden="true">
        🔒
      </span>
      <h2>This profile is private</h2>
      <p>
        <strong>{shortenAddress(address)}</strong> has not enabled public visibility.
      </p>
      <p className="profile-private-hint">
        If this is your wallet, you can make your profile public from your dashboard.
      </p>
    </div>
  );
}

// ── Empty / no-activity view ─────────────────────────────────────────────────

function EmptyProfile({ address }) {
  return (
    <div className="profile-empty" data-testid="profile-empty">
      <span className="profile-empty-icon" aria-hidden="true">
        🌑
      </span>
      <h2>No activity yet</h2>
      <p>
        <strong>{shortenAddress(address)}</strong> hasn&apos;t joined any campaigns yet.
      </p>
      <Link to="/" className="btn btn-primary">
        Browse campaigns
      </Link>
    </div>
  );
}

// ── Federation resolution failed ─────────────────────────────────────────────

function FederationError({ address }) {
  return (
    <div className="profile-federation-error" data-testid="profile-federation-error">
      <span className="profile-not-found-icon" aria-hidden="true">
        🔗
      </span>
      <h2>Couldn&apos;t resolve address</h2>
      <p>
        <strong>{address}</strong> doesn&apos;t resolve to a Stellar account. Double-check the
        federated address, or use the account&apos;s G... address directly.
      </p>
      <Link to="/" className="btn btn-primary">
        Back to campaigns
      </Link>
    </div>
  );
}

// ── Not-found view ────────────────────────────────────────────────────────────

function NotFound({ address }) {
  return (
    <div className="profile-not-found" data-testid="profile-not-found">
      <span className="profile-not-found-icon" aria-hidden="true">
        🔍
      </span>
      <h2>Profile not found</h2>
      <p>No participant found for address {shortenAddress(address)}.</p>
      <Link to="/" className="btn btn-primary">
        Back to campaigns
      </Link>
    </div>
  );
}

// ── Main profile view ─────────────────────────────────────────────────────────

function ProfileView({ profile, address }) {
  const hasActivity = (profile.campaigns?.length ?? 0) > 0 || (profile.badges?.length ?? 0) > 0;

  if (!hasActivity) return <EmptyProfile address={address} />;

  const displayName = profile.handle ?? shortenAddress(address);
  const joinedYear = profile.joinedAt ? new Date(profile.joinedAt).getFullYear() : null;

  return (
    <div className="profile-view" data-testid="profile-view">
      {/* Avatar + identity */}
      <div className="profile-identity">
        <div className="profile-avatar" aria-hidden="true">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="profile-identity-text">
          <h1 className="profile-handle">{displayName}</h1>
          {profile.handle && (
            <p className="profile-address-sub" title={address}>
              {shortenAddress(address)}
            </p>
          )}
          {joinedYear && <p className="profile-joined">Member since {joinedYear}</p>}
        </div>
      </div>

      {/* Stats row */}
      <div className="profile-stats" data-testid="profile-stats">
        <StatCard label="Reputation" value={profile.reputation ?? 0} />
        <StatCard
          label="Current streak"
          value={`${profile.streak?.current ?? 0} 🔥`}
          sub={`Longest: ${profile.streak?.longest ?? 0}`}
        />
        <StatCard label="Campaigns" value={profile.campaigns?.length ?? 0} sub="participated" />
        <StatCard label="Badges" value={profile.badges?.length ?? 0} />
      </div>

      {/* Badges */}
      {profile.badges?.length > 0 && (
        <section className="profile-section" aria-label="Badges">
          <h2 className="profile-section-title">Badges &amp; Achievements</h2>
          <div className="profile-badges-grid" data-testid="profile-badges">
            {profile.badges.map((b) => (
              <BadgeChip key={b.id} badge={b} />
            ))}
          </div>
        </section>
      )}

      {/* Campaign history */}
      {profile.campaigns?.length > 0 && (
        <section className="profile-section" aria-label="Campaign history">
          <h2 className="profile-section-title">Campaign History</h2>
          <div className="profile-campaigns" data-testid="profile-campaigns">
            {profile.campaigns.map((c) => (
              <CampaignRow key={c.id} campaign={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicProfile() {
  const { address } = useParams();
  // loading | resolving | ok | private | notfound | federation-error | error
  const [status, setStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  // The account ID actually used to fetch the profile — same as `address`
  // unless it was a federated (`name*domain`) address that got resolved.
  const [resolvedAddress, setResolvedAddress] = useState(null);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    setProfile(null);
    setResolvedAddress(null);

    async function loadProfile() {
      let accountId = address;

      // SEP-0002 federated address (#1225), e.g. `alice*trivela.network`.
      if (isFederatedAddress(address)) {
        setStatus('resolving');
        try {
          accountId = await resolveFederatedAddress(address);
        } catch {
          if (!cancelled) setStatus('federation-error');
          return;
        }
      }

      if (cancelled) return;
      setResolvedAddress(accountId);
      setStatus('loading');

      try {
        const res = await fetch(apiUrl(`/api/v1/participants/${encodeURIComponent(accountId)}/profile`));
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notfound');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.isPublic === false) {
          setStatus('private');
          setProfile(data);
        } else {
          setStatus('ok');
          setProfile(data);
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const displayAddress = resolvedAddress ?? address;

  // ── OG meta ────────────────────────────────────────────────────────────────
  const isPublicProfile = status === 'ok' && profile;
  const metaTitle = isPublicProfile
    ? `${profile.handle ?? shortenAddress(displayAddress)} on Trivela`
    : 'Participant Profile — Trivela';
  const metaDescription = isPublicProfile
    ? `${profile.handle ?? shortenAddress(address)} has earned ${profile.reputation ?? 0} reputation, ${profile.badges?.length ?? 0} badge${(profile.badges?.length ?? 0) !== 1 ? 's' : ''}, and joined ${profile.campaigns?.length ?? 0} campaign${(profile.campaigns?.length ?? 0) !== 1 ? 's' : ''} on Trivela.`
    : 'View participant achievements, badges, and campaign history on Trivela.';

  return (
    <>
      <PageMeta
        title={metaTitle}
        description={metaDescription}
        path={`/u/${address}`}
        type="profile"
      />

      <div className="profile-page">
        <header className="profile-page-header">
          <Link to="/" className="profile-back-link" aria-label="Back to campaigns">
            ← Trivela
          </Link>
        </header>

        <main className="profile-main" aria-live="polite">
          {status === 'resolving' && (
            <div className="profile-loading" data-testid="profile-resolving">
              <div className="spinner" aria-label="Resolving address…" />
              <p>Resolving {address}…</p>
            </div>
          )}

          {status === 'loading' && (
            <div className="profile-loading" data-testid="profile-loading">
              <div className="spinner" aria-label="Loading profile…" />
              <p>Loading profile…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="profile-error" data-testid="profile-error">
              <p>Failed to load profile. Please try again.</p>
              <button className="btn btn-secondary" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          {status === 'federation-error' && <FederationError address={address} />}

          {status === 'notfound' && <NotFound address={displayAddress} />}

          {status === 'private' && <PrivateProfile address={displayAddress} />}

          {status === 'ok' && profile && (
            <ProfileView profile={profile} address={displayAddress} />
          )}
        </main>
      </div>
    </>
  );
}
