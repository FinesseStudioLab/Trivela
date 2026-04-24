import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = "active" | "paused" | "ended" | "draft";

interface RewardConfig {
  token: string;
  perQuestion: number;
  maxPerUser: number;
  totalPool: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  reward: RewardConfig;
  questionCount: number;
  participantCount: number;
  startsAt: string;
  endsAt: string | null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error(`Failed to fetch campaign: ${res.statusText}`);
  return res.json();
}

class NotFoundError extends Error {
  constructor() {
    super("Campaign not found");
    this.name = "NotFoundError";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
  draft: "Draft",
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  active: "status-active",
  paused: "status-paused",
  ended: "status-ended",
  draft: "status-draft",
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`status-badge ${STATUS_COLORS[status]}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function RewardCard({ reward }: { reward: RewardConfig }) {
  return (
    <section className="card reward-card" aria-label="Reward configuration">
      <h2 className="card-title">Rewards</h2>
      <dl className="reward-grid">
        <div className="reward-row">
          <dt>Token</dt>
          <dd>
            <code>{reward.token}</code>
          </dd>
        </div>
        <div className="reward-row">
          <dt>Per question</dt>
          <dd>
            {reward.perQuestion} {reward.token}
          </dd>
        </div>
        <div className="reward-row">
          <dt>Max per user</dt>
          <dd>
            {reward.maxPerUser} {reward.token}
          </dd>
        </div>
        <div className="reward-row">
          <dt>Total pool</dt>
          <dd>
            {reward.totalPool.toLocaleString()} {reward.token}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function StatGrid({ campaign }: { campaign: Campaign }) {
  const now = new Date();
  const start = new Date(campaign.startsAt);
  const end = campaign.endsAt ? new Date(campaign.endsAt) : null;

  return (
    <section className="stat-grid" aria-label="Campaign statistics">
      <div className="stat-card">
        <span className="stat-value">{campaign.questionCount}</span>
        <span className="stat-label">Questions</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">
          {campaign.participantCount.toLocaleString()}
        </span>
        <span className="stat-label">Participants</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">
          {start.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="stat-label">Started</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">
          {end
            ? end.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Ongoing"}
        </span>
        <span className="stat-label">Ends</span>
      </div>
    </section>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function CampaignSkeleton() {
  return (
    <div
      className="campaign-skeleton"
      aria-busy="true"
      aria-label="Loading campaign"
    >
      <div className="skeleton-header">
        <div className="skeleton-title" />
        <div className="skeleton-badge" />
      </div>
      <div className="skeleton-body">
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
      <div className="skeleton-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-stat" />
        ))}
      </div>
      <div className="skeleton-card" />
    </div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────

function CampaignNotFound({ id }: { id: string }) {
  const navigate = useNavigate();
  return (
    <div className="not-found" role="alert">
      <span className="not-found-icon" aria-hidden="true">
        ◎
      </span>
      <h1>Campaign not found</h1>
      <p>
        No campaign with ID <code>{id}</code> exists, or it may have been
        removed.
      </p>
      <button className="btn-primary" onClick={() => navigate("/campaigns")}>
        Browse campaigns
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "not-found" }
  | { phase: "ready"; campaign: Campaign };

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ phase: "not-found" });
      return;
    }

    setState({ phase: "loading" });

    fetchCampaign(id)
      .then((campaign) => setState({ phase: "ready", campaign }))
      .catch((err) => {
        if (err instanceof NotFoundError) {
          setState({ phase: "not-found" });
        } else {
          setState({ phase: "error", message: err.message });
        }
      });
  }, [id]);

  if (state.phase === "loading") return <CampaignSkeleton />;
  if (state.phase === "not-found") return <CampaignNotFound id={id ?? ""} />;
  if (state.phase === "error") {
    return (
      <div role="alert" className="error-banner">
        <strong>Something went wrong</strong>
        <p>{state.message}</p>
      </div>
    );
  }

  const { campaign } = state;

  return (
    <main className="campaign-detail" aria-labelledby="campaign-name">
      <header className="campaign-header">
        <div className="campaign-header-top">
          <h1 id="campaign-name" className="campaign-name">
            {campaign.name}
          </h1>
          <StatusBadge status={campaign.status} />
        </div>
        <p className="campaign-description">{campaign.description}</p>
      </header>

      <StatGrid campaign={campaign} />
      <RewardCard reward={campaign.reward} />
    </main>
  );
}
