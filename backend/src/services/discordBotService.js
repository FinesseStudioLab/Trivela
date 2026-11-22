/**
 * Discord bot service for `/trivela-stats` (#1349).
 *
 * Builds a real-time campaign metrics summary suitable for a Discord
 * slash-command response. Data is read from the campaign repository so
 * results stay consistent with the REST API.
 */

/**
 * @typedef {{ active: number, total: number, participants: number, rewardPool: number }} CampaignMetrics
 */

/**
 * @param {{
 *   campaignRepository: {
 *     list?: (opts?: object) => Array<any> | { data: Array<any> },
 *     getAll?: () => Array<any>,
 *   },
 *   rewardPoolResolver?: (campaign: any) => number,
 * }} deps
 */
export function createDiscordBotService({
  campaignRepository,
  rewardPoolResolver = defaultRewardPool,
} = {}) {
  /**
   * Return aggregate campaign metrics for the `/trivela-stats` command.
   * @returns {CampaignMetrics}
   */
  function getTrivelaStats() {
    const campaigns = normalizeList(
      campaignRepository?.list?.() ?? campaignRepository?.getAll?.() ?? [],
    );

    let active = 0;
    let participants = 0;
    let rewardPool = 0;

    for (const campaign of campaigns) {
      const isActive = isCampaignActive(campaign);
      if (isActive) active += 1;
      participants += Number(campaign.participants ?? campaign.participantCount ?? 0);
      rewardPool += rewardPoolResolver(campaign);
    }

    return {
      active,
      total: campaigns.length,
      participants,
      rewardPool: Math.round(rewardPool * 100) / 100,
    };
  }

  /**
   * Format metrics as a Discord interaction response payload.
   * @returns {{ type: 4, data: { content: string } }}
   */
  function buildStatsResponse() {
    const stats = getTrivelaStats();
    const content = [
      '**Trivela Campaign Stats**',
      `Active campaigns: **${stats.active}**`,
      `Total campaigns: **${stats.total}**`,
      `Total participants: **${stats.participants.toLocaleString()}**`,
      `Reward pool: **${stats.rewardPool.toLocaleString()}**`,
    ].join('\n');

    return { type: 4, data: { content } };
  }

  return { getTrivelaStats, buildStatsResponse };
}

function isCampaignActive(campaign) {
  const status = String(campaign.status ?? '').toLowerCase();
  if (status) return status === 'active' || status === 'published';
  const end = campaign.endDate ?? campaign.end_date;
  return end ? new Date(end).getTime() > Date.now() : false;
}

function defaultRewardPool(campaign) {
  const per = Number(campaign.rewardPerAction ?? campaign.reward_per_action ?? 0);
  const max = Number(campaign.maxParticipants ?? campaign.max_participants ?? 0);
  return per * max;
}

function normalizeList(list) {
  if (Array.isArray(list)) return list;
  if (Array.isArray(list?.data)) return list.data;
  return [];
}
