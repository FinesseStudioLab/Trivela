import './SkeletonLoader.css';

function clampCount(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 12);
}

function SkeletonBlock({ className = '', style }) {
  return <span className={`skeleton-loader-block ${className}`.trim()} style={style} />;
}

function TextSkeleton({ lines }) {
  const count = clampCount(lines, 3);
  return (
    <div className="skeleton-loader-text" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBlock
          key={index}
          className="skeleton-loader-line"
          style={{ width: `${index === count - 1 ? 68 : 100}%` }}
        />
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="skeleton-loader-card" aria-hidden="true">
      <div className="skeleton-loader-card-header">
        <SkeletonBlock className="skeleton-loader-avatar" />
        <div className="skeleton-loader-card-title">
          <SkeletonBlock className="skeleton-loader-line skeleton-loader-line--short" />
          <SkeletonBlock className="skeleton-loader-line skeleton-loader-line--tiny" />
        </div>
      </div>
      <SkeletonBlock className="skeleton-loader-media" />
      <TextSkeleton lines={3} />
    </div>
  );
}

function TableSkeleton({ rows }) {
  const count = clampCount(rows, 5);
  return (
    <div className="skeleton-loader-table" aria-hidden="true">
      <div className="skeleton-loader-table-row skeleton-loader-table-row--header">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-loader-table-row" key={index}>
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-loader-dashboard" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="skeleton-loader-dashboard-card" key={index}>
          <SkeletonBlock className="skeleton-loader-line skeleton-loader-line--tiny" />
          <SkeletonBlock className="skeleton-loader-metric" />
          <SkeletonBlock className="skeleton-loader-line skeleton-loader-line--short" />
        </div>
      ))}
    </div>
  );
}

export default function SkeletonLoader({
  variant = 'text',
  lines = 3,
  rows = 5,
  label = 'Loading content',
  className = '',
}) {
  const classes = ['skeleton-loader', `skeleton-loader--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return <CardSkeleton />;
      case 'table':
        return <TableSkeleton rows={rows} />;
      case 'dashboard':
        return <DashboardSkeleton />;
      case 'text':
      default:
        return <TextSkeleton lines={lines} />;
    }
  };

  return (
    <div className={classes} role="status" aria-busy="true" aria-label={label}>
      {renderSkeleton()}
      <span className="sr-only">{label}</span>
    </div>
  );
}
