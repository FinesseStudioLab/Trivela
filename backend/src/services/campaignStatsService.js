function parseDateParam(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function eachDayInRange(from, to) {
  const days = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor <= end) {
    days.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function tableExists(db, name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return Boolean(row);
}

function resolveRange(query, campaign) {
  const now = new Date();
  const range = String(query.range || '').toLowerCase();
  let from = parseDateParam(query.from);
  let to = parseDateParam(query.to) || now;

  if (!from) {
    if (range === '30d') {
      from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 30);
    } else if (range === 'all') {
      from = campaign.createdAt ? new Date(campaign.createdAt) : new Date(0);
    } else {
      from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 7);
    }
  }

  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }

  return { from, to };
}

export function buildCampaignStats({
  db,
  campaign,
  referralRepository,
  indexerCursor,
  query = {},
}) {
  const { from, to } = resolveRange(query, campaign);
  return buildCampaignStatsForRange({
    db,
    campaign,
    referralRepository,
    indexerCursor,
    from,
    to,
  });
}

export function buildCampaignStatsForRange({
  db,
  campaign,
  referralRepository,
  indexerCursor,
  from,
  to,
}) {
  const campaignId = String(campaign.id);
  const referrals = referralRepository.listByCampaign(campaignId) || [];
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const registrationsInRange = referrals.filter((row) => {
    const created = new Date(row.createdAt).getTime();
    return created >= fromMs && created <= toMs;
  });

  const registrationsByDayMap = new Map();
  for (const row of registrationsInRange) {
    const key = toDateKey(new Date(row.createdAt));
    registrationsByDayMap.set(key, (registrationsByDayMap.get(key) || 0) + 1);
  }

  const dayKeys = eachDayInRange(from, to);
  const registrationsByDay = dayKeys.map((date) => ({
    date,
    count: registrationsByDayMap.get(date) || 0,
  }));

  let totalCredited = 0;
  let totalClaimed = 0;
  const pointsByDayMap = new Map();
  const hasCreditEvents = tableExists(db, 'credit_events');
  const hasClaimEvents = tableExists(db, 'claim_events');

  if (hasCreditEvents) {
    const creditRows = db
      .prepare(
        `SELECT amount, ledger FROM credit_events WHERE ledger IS NOT NULL ORDER BY ledger ASC`,
      )
      .all();
    for (const row of creditRows) {
      const amount = Number(row.amount) || 0;
      totalCredited += amount;
      const key = toDateKey(new Date(Number(row.ledger) * 1000));
      if (!pointsByDayMap.has(key)) {
        pointsByDayMap.set(key, { credited: 0, claimed: 0 });
      }
      pointsByDayMap.get(key).credited += amount;
    }
  }

  if (hasClaimEvents) {
    const claimRows = db
      .prepare(
        `SELECT amount, ledger FROM claim_events WHERE ledger IS NOT NULL ORDER BY ledger ASC`,
      )
      .all();
    for (const row of claimRows) {
      const amount = Number(row.amount) || 0;
      totalClaimed += amount;
      const key = toDateKey(new Date(Number(row.ledger) * 1000));
      if (!pointsByDayMap.has(key)) {
        pointsByDayMap.set(key, { credited: 0, claimed: 0 });
      }
      pointsByDayMap.get(key).claimed += amount;
    }
  }

  if (!hasCreditEvents && !hasClaimEvents) {
    const estimatedCredits = registrationsInRange.length * (campaign.rewardPerAction ?? 0);
    totalCredited = estimatedCredits;
    for (const entry of registrationsByDay) {
      if (entry.count > 0) {
        pointsByDayMap.set(entry.date, {
          credited: entry.count * (campaign.rewardPerAction ?? 0),
          claimed: 0,
        });
      }
    }
  }

  const pointsByDay = dayKeys.map((date) => {
    const bucket = pointsByDayMap.get(date) || { credited: 0, claimed: 0 };
    return { date, credited: bucket.credited, claimed: bucket.claimed };
  });

  const totalParticipants = referrals.length;
  const totalPoints = totalCredited;
  const claimRate = totalCredited > 0 ? Math.round((totalClaimed / totalCredited) * 1000) / 10 : 0;

  let timeRemainingMs = 0;
  if (campaign.endDate) {
    timeRemainingMs = Math.max(0, new Date(campaign.endDate).getTime() - Date.now());
  }

  const onChainSynced = Boolean(campaign.contractId && indexerCursor?.cursor);

  return {
    campaignId,
    onChainSynced,
    range: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      totalParticipants,
      totalPoints,
      claimRate,
      timeRemainingMs,
    },
    registrationsByDay,
    pointsByDay,
  };
}
