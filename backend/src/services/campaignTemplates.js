/**
 * Campaign templates service
 * Provides curated templates for common campaign patterns.
 */

const TEMPLATES = [
  {
    id: 'referral-basic',
    name: 'Basic Referral',
    description: 'Reward users for referring friends. Simple two-tier structure.',
    category: 'referral',
    icon: '🔗',
    config: {
      type: 'referral',
      rewardPerReferral: 100,
      maxReferrals: 50,
      tiers: [
        { name: 'Bronze', minReferrals: 0, bonusPercent: 0 },
        { name: 'Silver', minReferrals: 10, bonusPercent: 10 },
        { name: 'Gold', minReferrals: 25, bonusPercent: 25 },
      ],
      windowDays: 30,
      rules: {
        requireVerification: true,
        minAccountAge: 7,
      },
    },
  },
  {
    id: 'leaderboard-weekly',
    name: 'Weekly Leaderboard',
    description: 'Points-based leaderboard with weekly resets and tiered rewards.',
    category: 'leaderboard',
    icon: '🏆',
    config: {
      type: 'leaderboard',
      scoringMethod: 'points',
      resetPeriod: 'weekly',
      tiers: [
        { name: 'Top 3', rankStart: 1, rankEnd: 3, rewardPercent: 50 },
        { name: 'Top 10', rankStart: 4, rankEnd: 10, rewardPercent: 30 },
        { name: 'Top 25', rankStart: 11, rankEnd: 25, rewardPercent: 20 },
      ],
      windowDays: 7,
      rules: {
        minActivity: 1,
        antiSybil: true,
      },
    },
  },
  {
    id: 'tiered-rewards',
    name: 'Tiered Rewards',
    description: 'Escalating rewards based on cumulative engagement milestones.',
    category: 'engagement',
    icon: '🎯',
    config: {
      type: 'milestone',
      milestones: [
        { name: 'Starter', threshold: 1, reward: 10 },
        { name: 'Active', threshold: 10, reward: 50 },
        { name: 'Power User', threshold: 50, reward: 200 },
        { name: 'Champion', threshold: 100, reward: 500 },
      ],
      windowDays: 90,
      rules: {
        trackCumulative: true,
        allowRetroactive: false,
      },
    },
  },
  {
    id: 'airdrop-registration',
    name: 'Registration Airdrop',
    description: 'Reward early registrants with a fixed token airdrop.',
    category: 'airdrop',
    icon: '🎁',
    config: {
      type: 'airdrop',
      rewardPerParticipant: 50,
      maxParticipants: 1000,
      windowDays: 14,
      rules: {
        requireVerification: true,
        firstComeFirstServed: true,
      },
    },
  },
  {
    id: 'community-engagement',
    name: 'Community Engagement',
    description: 'Multi-action campaign rewarding diverse engagement activities.',
    category: 'engagement',
    icon: '💬',
    config: {
      type: 'multi-action',
      actions: [
        { name: 'Register', points: 10, oneTime: true },
        { name: 'Daily Check-in', points: 5, oneTime: false },
        { name: 'Refer a Friend', points: 25, oneTime: false },
        { name: 'Complete Profile', points: 15, oneTime: true },
      ],
      windowDays: 30,
      rules: {
        maxDailyPoints: 50,
        antiSybil: true,
      },
    },
  },
];

/**
 * Get all available templates.
 * @returns {Array} List of template summaries (without full config).
 */
export function getTemplateCatalog() {
  return TEMPLATES.map(({ id, name, description, category, icon }) => ({
    id,
    name,
    description,
    category,
    icon,
  }));
}

/**
 * Get a single template by ID.
 * @param {string} templateId
 * @returns {object|null} Full template including config.
 */
export function getTemplateById(templateId) {
  return TEMPLATES.find((t) => t.id === templateId) ?? null;
}

/**
 * Clone a template into a campaign-ready config.
 * Applies overrides and validates the result.
 * @param {string} templateId
 * @param {object} overrides - User-provided overrides (name, dates, etc.)
 * @returns {{ valid: boolean, config?: object, errors?: string[] }}
 */
export function cloneTemplate(templateId, overrides = {}) {
  const template = getTemplateById(templateId);
  if (!template) {
    return { valid: false, errors: [`Template "${templateId}" not found`] };
  }

  const config = {
    ...structuredClone(template.config),
    name: overrides.name ?? template.name,
    description: overrides.description ?? template.description,
    startDate: overrides.startDate ?? null,
    endDate: overrides.endDate ?? null,
    ...overrides,
  };

  const errors = validateClonedConfig(config);
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, config };
}

/**
 * Save an existing campaign as a reusable template.
 * @param {object} campaign - The campaign to save as template.
 * @returns {object} A template object.
 */
export function saveAsTemplate(campaign) {
  return {
    id: `custom-${Date.now()}`,
    name: campaign.name ?? 'Custom Template',
    description: campaign.description ?? '',
    category: 'custom',
    icon: '⭐',
    config: {
      type: campaign.type ?? 'referral',
      ...campaign.config,
    },
  };
}

/**
 * Validate a cloned config before publish.
 * @param {object} config
 * @returns {string[]} List of validation errors (empty if valid).
 */
function validateClonedConfig(config) {
  const errors = [];

  if (!config.name || typeof config.name !== 'string') {
    errors.push('Campaign name is required');
  }

  if (config.startDate && config.endDate) {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push('Invalid date format');
    } else if (end <= start) {
      errors.push('End date must be after start date');
    }
  }

  if (config.windowDays !== undefined) {
    if (typeof config.windowDays !== 'number' || config.windowDays <= 0) {
      errors.push('windowDays must be a positive number');
    }
  }

  if (config.maxParticipants !== undefined) {
    if (typeof config.maxParticipants !== 'number' || config.maxParticipants <= 0) {
      errors.push('maxParticipants must be a positive number');
    }
  }

  return errors;
}
