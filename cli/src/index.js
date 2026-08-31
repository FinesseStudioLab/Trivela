#!/usr/bin/env node
/**
 * trivela CLI — campaign & contract lifecycle management for the Trivela platform.
 *
 * Usage:
 *   trivela contracts deploy|init
 *   trivela campaign  create|activate|close|list|get
 *   trivela allowlist import
 *   trivela rewards   fund|credit
 *   trivela stats
 *   trivela config    get|set|clear
 */

import { Command } from 'commander';
import { makeContractsCommand } from './commands/contracts.js';
import { makeCampaignCommand } from './commands/campaign.js';
import { makeAllowlistCommand } from './commands/allowlist.js';
import { makeRewardsCommand } from './commands/rewards.js';
import { makeStatsCommand } from './commands/stats.js';
import { makeConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('trivela')
  .description('Trivela CLI — campaign & contract lifecycle management')
  .version('0.1.0');

program.addCommand(makeContractsCommand());
program.addCommand(makeCampaignCommand());
program.addCommand(makeAllowlistCommand());
program.addCommand(makeRewardsCommand());
program.addCommand(makeStatsCommand());
program.addCommand(makeConfigCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
