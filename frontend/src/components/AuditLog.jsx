import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

const ACTION_OPTIONS = [
  '',
  'campaign.create',
  'campaign.update',
  'campaign.delete',
  'member.invite',
  'member.remove',
  'member.role_change',
  'key.rotate',
  'key.revoke',
  'abuse.flag',
  'abuse.resolve',
];

const PAGE_SIZE = 20;

function formatDate(str) {
  if (!str) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(str));
  } catch {
    return str;
  }
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [cursors, setCursors] = useState([null]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    actor: '',
    action: '',
    resource: '',
    date_from: '',
    date_to: '',
  });
  const [pendingFilters, setPendingFilters] = useState(filters);

  const load = useCallback(
    async (cursor, activeFilters) => {
      setLoading(true);
      setError('');
      try {
        const params = { limit: PAGE_SIZE, ...activeFilters };
        if (cursor) params.cursor = cursor;
        const data = await apiClient.getAuditLog(params);
        const items = Array.isArray(data) ? data : (data.entries ?? data.data ?? []);
        const nextCursor = data.next_cursor ?? data.pagination?.next_cursor ?? null;
        setEntries(items);
        setHasNext(!!nextCursor);
        setCursors((prev) => {
          const next = [...prev];
          if (nextCursor && !next.includes(nextCursor)) {
            next[page + 1] = nextCursor;
          }
          return next;
        });
      } catch {
        setError('Could not load audit log.');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [page],
  );

  useEffect(() => {
    load(cursors[page] ?? null, filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  const applyFilters = (e) => {
    e.preventDefault();
    setFilters(pendingFilters);
    setCursors([null]);
    setPage(0);
  };

  const resetFilters = () => {
    const empty = { actor: '', action: '', resource: '', date_from: '', date_to: '' };
    setPendingFilters(empty);
    setFilters(empty);
    setCursors([null]);
    setPage(0);
  };

  const exportUrl = apiClient.exportAuditLog(filters, 'csv');

  return (
    <section aria-labelledby="audit-log-heading">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <h2
            id="audit-log-heading"
            style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700 }}
          >
            Org Activity Feed
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            All privileged actions taken by org members.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={exportUrl}
            download="audit-log.csv"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 14px', textDecoration: 'none' }}
          >
            Export CSV
          </a>
          <a
            href={apiClient.exportAuditLog(filters, 'json')}
            download="audit-log.json"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 14px', textDecoration: 'none' }}
          >
            Export JSON
          </a>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={applyFilters}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 20,
          padding: 16,
          background: 'var(--bg-elevated)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
        aria-label="Filter audit log"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Actor
          </label>
          <input
            type="text"
            value={pendingFilters.actor}
            onChange={(e) => setPendingFilters((p) => ({ ...p, actor: e.target.value }))}
            placeholder="Wallet or user ID"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Action
          </label>
          <select
            value={pendingFilters.action}
            onChange={(e) => setPendingFilters((p) => ({ ...p, action: e.target.value }))}
            style={inputStyle}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a || 'All actions'}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Resource
          </label>
          <input
            type="text"
            value={pendingFilters.resource}
            onChange={(e) => setPendingFilters((p) => ({ ...p, resource: e.target.value }))}
            placeholder="campaign/member/key…"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            From
          </label>
          <input
            type="date"
            value={pendingFilters.date_from}
            onChange={(e) => setPendingFilters((p) => ({ ...p, date_from: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            To
          </label>
          <input
            type="date"
            value={pendingFilters.date_to}
            onChange={(e) => setPendingFilters((p) => ({ ...p, date_to: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>
            Apply
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetFilters}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            Reset
          </button>
        </div>
      </form>

      {error && (
        <div className="detail-error" role="alert" style={{ marginBottom: 16 }}>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => load(cursors[page] ?? null, filters)}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" style={{ color: 'var(--text-muted)' }}>Loading audit log…</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
              aria-label="Audit log entries"
            >
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Timestamp', 'Actor', 'Action', 'Resource', 'Details'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: '32px 16px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      No audit entries match your filters.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, idx) => (
                    <tr
                      key={entry.id ?? idx}
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}
                    >
                      <td style={cellStyle}>{formatDate(entry.timestamp ?? entry.created_at)}</td>
                      <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {entry.actor ?? '—'}
                      </td>
                      <td style={cellStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.action ?? '—'}
                        </span>
                      </td>
                      <td style={cellStyle}>{entry.resource ?? '—'}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.details ? JSON.stringify(entry.details) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cursor pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 12,
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              style={{ fontSize: '0.8rem', padding: '5px 14px' }}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              style={{ fontSize: '0.8rem', padding: '5px 14px' }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const inputStyle = {
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '5px 10px',
  color: 'var(--text)',
  fontSize: '0.85rem',
  width: '100%',
};

const cellStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  verticalAlign: 'middle',
};
