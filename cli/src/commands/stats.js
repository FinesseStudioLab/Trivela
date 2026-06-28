/**
 * trivela stats — show platform and campaign statistics.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ApiClient } from '../lib/api.js';
import { getConfig } from '../lib/config.js';

export function makeStatsCommand() {
  const cmd = new Command('stats');
  cmd
    .description('Show platform health and campaign statistics')
    .option('--campaign <id>', 'Show stats for a specific campaign')
    .action(async (opts) => {
      const cfg = getConfig();
      const api = new ApiClient({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey });

      try {
        const health = await api.get('/health');
        console.log(chalk.bold('Platform health:'));
        console.log(`  status    : ${health.status === 'ok' ? chalk.green(health.status) : chalk.red(health.status)}`);
        console.log(`  rpc       : ${health.rpc?.status ?? 'unknown'}`);
        console.log(`  timestamp : ${health.timestamp}`);
      } catch (err) {
        console.error(chalk.red('Health check failed:'), err.message);
      }

      if (opts.campaign) {
        try {
          const c = await api.get(`/api/v1/campaigns/${opts.campaign}`);
          console.log(chalk.bold('\nCampaign:'));
          console.log(`  name            : ${c.name}`);
          console.log(`  status          : ${c.status}`);
          console.log(`  active          : ${c.active}`);
          console.log(`  rewardPerAction : ${c.rewardPerAction}`);
        } catch (err) {
          console.error(chalk.red('Campaign fetch failed:'), err.message);
        }
      } else {
        try {
          const data = await api.get('/api/v1/campaigns?limit=5');
          const campaigns = data.data ?? [];
          console.log(chalk.bold(`\nCampaigns (${data.pagination?.total ?? campaigns.length} total):`));
          for (const c of campaigns) {
            console.log(`  ${c.id}  ${c.name}  [${c.status}]`);
          }
        } catch (err) {
          console.error(chalk.red('Campaign list failed:'), err.message);
        }
      }
    });

  return cmd;
}
