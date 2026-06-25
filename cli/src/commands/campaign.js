/**
 * trivela campaign create|activate|close — manage campaigns via the REST API.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ApiClient } from '../lib/api.js';
import { getConfig } from '../lib/config.js';
import { requireMainnetConfirmation } from '../lib/prompt.js';

function makeClient(cfg) {
  return new ApiClient({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey });
}

export function makeCampaignCommand() {
  const cmd = new Command('campaign');
  cmd.description('Create, activate, or close campaigns');

  cmd
    .command('create')
    .description('Create a new campaign')
    .requiredOption('--name <name>', 'Campaign name')
    .requiredOption('--reward <amount>', 'Reward per action (number)', parseFloat)
    .option('--description <desc>', 'Campaign description')
    .option('--slug <slug>', 'URL-friendly slug (auto-generated if omitted)')
    .option('--start <date>', 'Start date (ISO 8601)')
    .option('--end <date>', 'End date (ISO 8601)')
    .option('--category <cat>', 'Category')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--dry-run', 'Print request body without sending')
    .action(async (opts) => {
      const cfg = getConfig();
      const body = {
        name: opts.name,
        rewardPerAction: opts.reward,
        active: true,
      };
      if (opts.description) body.description = opts.description;
      if (opts.slug) body.slug = opts.slug;
      if (opts.start) body.startDate = opts.start;
      if (opts.end) body.endDate = opts.end;
      if (opts.category) body.category = opts.category;
      if (opts.tags) body.tags = opts.tags.split(',').map((t) => t.trim());

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run] POST /api/v1/campaigns'));
        console.log(JSON.stringify(body, null, 2));
        return;
      }

      const proceed = await requireMainnetConfirmation('create campaign', cfg, false);
      if (!proceed) return;

      const api = makeClient(cfg);
      const campaign = await api.post('/api/v1/campaigns', body);
      console.log(chalk.green('✔'), `Campaign created: ${campaign.id}`);
      console.log(`  name  : ${campaign.name}`);
      console.log(`  slug  : ${campaign.slug}`);
      console.log(`  status: ${campaign.status}`);
    });

  cmd
    .command('activate <id>')
    .description('Activate a campaign by ID')
    .option('--dry-run', 'Print without sending')
    .action(async (id, opts) => {
      const cfg = getConfig();
      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would PATCH /api/v1/campaigns/${id} {active: true}`);
        return;
      }
      const api = makeClient(cfg);
      const campaign = await api.put(`/api/v1/campaigns/${id}`, { active: true });
      console.log(chalk.green('✔'), `Campaign ${campaign.id} activated (status: ${campaign.status})`);
    });

  cmd
    .command('close <id>')
    .description('Close (deactivate) a campaign by ID')
    .option('--dry-run', 'Print without sending')
    .action(async (id, opts) => {
      const cfg = getConfig();
      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would PATCH /api/v1/campaigns/${id} {active: false}`);
        return;
      }
      const proceed = await requireMainnetConfirmation(`close campaign ${id}`, cfg, false);
      if (!proceed) return;
      const api = makeClient(cfg);
      const campaign = await api.put(`/api/v1/campaigns/${id}`, { active: false });
      console.log(chalk.green('✔'), `Campaign ${campaign.id} closed (status: ${campaign.status})`);
    });

  cmd
    .command('list')
    .description('List campaigns')
    .option('--page <n>', 'Page number', '1')
    .option('--limit <n>', 'Items per page', '20')
    .option('--search <q>', 'Search query')
    .action(async (opts) => {
      const cfg = getConfig();
      const api = makeClient(cfg);
      const params = new URLSearchParams({ page: opts.page, limit: opts.limit });
      if (opts.search) params.append('search', opts.search);
      const data = await api.get(`/api/v1/campaigns?${params}`);
      const campaigns = data.data ?? [];
      if (campaigns.length === 0) {
        console.log('No campaigns found.');
        return;
      }
      for (const c of campaigns) {
        console.log(`${chalk.bold(c.id)}  ${c.name}  [${c.status}]`);
      }
      const p = data.pagination;
      if (p) console.log(`\nPage ${p.page}/${p.totalPages} — ${p.total} total`);
    });

  cmd
    .command('get <id>')
    .description('Get campaign details')
    .action(async (id) => {
      const cfg = getConfig();
      const api = makeClient(cfg);
      const c = await api.get(`/api/v1/campaigns/${id}`);
      console.log(JSON.stringify(c, null, 2));
    });

  return cmd;
}
