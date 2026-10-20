import { useMemo, useState } from 'react';

export const REGIONS = [
  { id: 'north-america', label: 'North America', x: 18, y: 32 },
  { id: 'south-america', label: 'South America', x: 28, y: 68 },
  { id: 'europe', label: 'Europe', x: 50, y: 28 },
  { id: 'africa', label: 'Africa', x: 52, y: 58 },
  { id: 'asia', label: 'Asia', x: 72, y: 36 },
  { id: 'oceania', label: 'Oceania', x: 84, y: 72 },
];

const ALL = 'all';

/**
 * Interactive world map of campaign participation hotspots, filterable by
 * geographic region. Markers are sized relative to participation counts.
 *
 * @param {object} props
 * @param {{ region: string, count: number }[]} [props.hotspots]
 * @param {(region: string) => void} [props.onRegionChange]
 */
export default function CampaignMap({ hotspots = [], onRegionChange }) {
  const [activeRegion, setActiveRegion] = useState(ALL);

  const counts = useMemo(() => {
    const map = new Map();
    for (const spot of hotspots) {
      map.set(spot.region, (map.get(spot.region) ?? 0) + (spot.count ?? 0));
    }
    return map;
  }, [hotspots]);

  const maxCount = useMemo(
    () => Math.max(1, ...REGIONS.map((r) => counts.get(r.id) ?? 0)),
    [counts],
  );

  const visible = activeRegion === ALL ? REGIONS : REGIONS.filter((r) => r.id === activeRegion);

  function selectRegion(regionId) {
    setActiveRegion(regionId);
    onRegionChange?.(regionId);
  }

  return (
    <div className="campaign-map" data-testid="campaign-map">
      <div
        role="group"
        aria-label="Filter by region"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}
      >
        {[{ id: ALL, label: 'All regions' }, ...REGIONS].map((r) => (
          <button
            key={r.id}
            type="button"
            className={`btn btn-button${activeRegion === r.id ? ' btn-primary' : ' btn-secondary'}`}
            aria-pressed={activeRegion === r.id}
            onClick={() => selectRegion(r.id)}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <svg
        viewBox="0 0 100 90"
        role="img"
        aria-label="Campaign participation hotspots world map"
        style={{ width: '100%', height: 'auto', background: 'var(--bg-elevated)', borderRadius: 12 }}
      >
        <rect x="0" y="0" width="100" height="90" fill="var(--bg-subtle, #1a2332)" rx="4" />
        {visible.map((region) => {
          const count = counts.get(region.id) ?? 0;
          const intensity = count / maxCount;
          const radius = 3 + intensity * 7;
          return (
            <g key={region.id} data-region={region.id}>
              <circle
                cx={region.x}
                cy={region.y}
                r={radius}
                fill="var(--accent, #4f8cff)"
                fillOpacity={0.25 + intensity * 0.65}
                stroke="var(--accent, #4f8cff)"
                strokeWidth="0.4"
              />
              <text
                x={region.x}
                y={region.y + radius + 3.2}
                textAnchor="middle"
                fontSize="2.6"
                fill="var(--text-secondary, #9fb0c3)"
              >
                {region.label}
              </text>
              <text
                x={region.x}
                y={region.y + 1}
                textAnchor="middle"
                fontSize="3"
                fontWeight="600"
                fill="var(--text-primary, #e8eef5)"
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>

      <p style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {activeRegion === ALL
          ? `${hotspots.reduce((sum, s) => sum + (s.count ?? 0), 0)} total participants across ${REGIONS.length} regions`
          : `${counts.get(activeRegion) ?? 0} participants in ${REGIONS.find((r) => r.id === activeRegion)?.label}`}
      </p>
    </div>
  );
}
