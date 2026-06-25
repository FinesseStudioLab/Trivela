/**
 * trivela rewards fund|credit — manage reward reserves via the API.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ApiClient } from '../lib/api.js';
import { getConfig } from '../lib/config.js';
import { requireMainnetConfirmation } from '../lib/prompt.js';

export function makeRewardsCommand() {
  const cmd = new Command('rewards');
  cmd.description('Fund reward reserves or credit individual participants');

  cmd
    .command('fund <campaign-id> <amount>')
    .description('Fund the reward reserve for a campaign')
    .option('--dry-run', 'Print without sending')
    .action(async (campaignId, amount, opts) => {
      const cfg = getConfig();
      const body = { campaignId, amount: parseFloat(amount) };

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), 'Would fund reserve:', body);
        return;
      }
      const proceed = await requireMainnetConfirmation(`fund reserve for campaign ${campaignId}`, cfg, false);
      if (!proceed) return;

      const api = new ApiClient({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey });
      // Endpoint may vary by backend implementation
      const res = await api.post(`/api/v1/campaigns/${campaignId}/fund`, body);
      console.log(chalk.green('✔'), 'Reserve funded:', res);
    });

  cmd
    .command('credit <campaign-id> <address> <amount>')
    .description('Credit reward points to a participant address')
    .option('--dry-run', 'Print without sending')
    .action(async (campaignId, address, amount, opts) => {
      const cfg = getConfig();
      const body = { address, amount: parseFloat(amount) };

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would credit ${amount} to ${address} on campaign ${campaignId}`);
        return;
      }
      const proceed = await requireMainnetConfirmation('credit rewards', cfg, false);
      if (!proceed) return;

      const api = new ApiClient({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey });
      const res = await api.post(`/api/v1/campaigns/${campaignId}/credit`, body);
      console.log(chalk.green('✔'), 'Credits applied:', res);
    });

  return cmd;
}
