import { useId } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function CampaignCard({ campaign }) {
  const titleId = useId();
  const formattedDate = formatDate(campaign?.createdAt);
  const rewardPerAction = campaign?.rewardPerAction ?? 0;
  const description = campaign?.description || 'No campaign description has been added yet.';
  const status = campaign?.status || (campaign?.active ? 'active' : 'ended');

  return (
    <article className="campaign-card" aria-labelledby={titleId}>
      <Link to={`/campaign/${campaign?.id}`} className="campaign-card-link">
        <div className="campaign-card-header">
          <div>
            <p className="campaign-card-eyebrow">Campaign #{campaign?.id || '—'}</p>
            <h3 id={titleId} className="campaign-card-title">
              {campaign?.name || 'Untitled campaign'}
            </h3>
          </div>

          <StatusBadge status={status} />
        </div>

        <p className="campaign-card-description">{description}</p>

        <dl className="campaign-card-metadata">
          <div className="campaign-card-metadata-item">
            <dt>Reward</dt>
            <dd>{rewardPerAction} pts</dd>
          </div>

          {formattedDate && (
            <div className="campaign-card-metadata-item">
              <dt>Created</dt>
              <dd>{formattedDate}</dd>
            </div>
          )}
        </dl>
      </Link>
    </article>
  );
}
