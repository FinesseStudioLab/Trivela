export default function EmptyState({
  eyebrow = 'Nothing here yet',
  title,
  description,
  actionLabel = '',
  onAction,
}) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <p className="empty-state-eyebrow">{eyebrow}</p>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-copy">{description}</p>

      {actionLabel && onAction && (
        <button
          type="button"
          className="btn btn-secondary btn-button empty-state-action"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
