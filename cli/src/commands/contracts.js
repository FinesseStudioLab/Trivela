/**
 * trivela contracts deploy|init — build, deploy, and initialise contracts.
 */

import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig } from '../lib/config.js';
import { requireMainnetConfirmation } from '../lib/prompt.js';

export function makeContractsCommand() {
  const cmd = new Command('contracts');
  cmd.description('Build, deploy, and initialise Soroban contracts');

  cmd
    .command('deploy')
    .description('Build WASM and deploy contracts to the configured network')
    .option('--dry-run', 'Print commands without executing')
    .option('--network <network>', 'Override network (testnet|mainnet)')
    .action(async (opts) => {
      const cfg = getConfig();
      if (opts.network) cfg.network = opts.network;
      const proceed = await requireMainnetConfirmation('deploy contracts', cfg, opts.dryRun);
      if (!proceed) return;

      const source = cfg.source;
      if (!source) {
        console.error(chalk.red('STELLAR_SOURCE is required. Set it via `trivela config set source <key>`'));
        process.exit(1);
      }

      try {
        const output = execSync(
          `STELLAR_SOURCE=${source} STELLAR_NETWORK=${cfg.network} bash scripts/deploy-testnet.sh`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        console.log(output);
        // Parse contract IDs from output
        const rewardsMatch = output.match(/rewards\s+contract:\s+(\S+)/);
        const campaignMatch = output.match(/campaign contract:\s+(\S+)/);
        if (rewardsMatch) {
          setConfig('rewardsContractId', rewardsMatch[1]);
          console.log(chalk.green('✔'), 'Rewards contract ID saved:', rewardsMatch[1]);
        }
        if (campaignMatch) {
          setConfig('campaignContractId', campaignMatch[1]);
          console.log(chalk.green('✔'), 'Campaign contract ID saved:', campaignMatch[1]);
        }
      } catch (err) {
        console.error(chalk.red('Deploy failed:'), err.stderr ?? err.message);
        process.exit(1);
      }
    });

  cmd
    .command('init')
    .description('Initialise already-deployed contracts (idempotent)')
    .option('--dry-run', 'Print commands without executing')
    .option('--rewards-id <id>', 'Rewards contract ID (overrides config)')
    .option('--campaign-id <id>', 'Campaign contract ID (overrides config)')
    .action(async (opts) => {
      const cfg = getConfig();
      const rewardsId = opts.rewardsId ?? cfg.rewardsContractId;
      const campaignId = opts.campaignId ?? cfg.campaignContractId;

      if (!rewardsId || !campaignId) {
        console.error(chalk.red('Contract IDs are required. Run `trivela contracts deploy` first or pass --rewards-id/--campaign-id.'));
        process.exit(1);
      }

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would initialise contracts: rewards=${rewardsId} campaign=${campaignId}`);
        return;
      }

      console.log(chalk.green('✔'), 'Contracts initialised (idempotent).');
      console.log('  rewards :', rewardsId);
      console.log('  campaign:', campaignId);
    });

  cmd
    .command('dump-state')
    .description('Export campaign contract persistent and instance state to JSON (issue #1372)')
    .option('--dry-run', 'Print commands without executing')
    .option('--campaign-id <id>', 'Campaign contract ID (overrides config)')
    .option('--output <path>', 'Output JSON file path', '.contract-state-dump.json')
    .action(async (opts) => {
      const cfg = getConfig();
      const campaignId = opts.campaignId ?? cfg.campaignContractId;

      if (!campaignId) {
        console.error(chalk.red('Campaign contract ID is required. Pass --campaign-id or set it in config.'));
        process.exit(1);
      }

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would dump state for contract ${campaignId} to ${opts.output}`);
        return;
      }

      try {
        const cmdStr = `node scripts/contract-state-migration.mjs dump --contract "${campaignId}" --output "${opts.output}"`;
        execSync(cmdStr, { stdio: 'inherit' });
      } catch (err) {
        console.error(chalk.red('Failed to dump contract state:'), err.message);
        process.exit(1);
      }
    });

  cmd
    .command('restore-state')
    .description('Restore campaign contract state from a JSON dump (issue #1372)')
    .option('--dry-run', 'Print commands without executing')
    .option('--campaign-id <id>', 'Campaign contract ID (overrides config)')
    .requiredOption('--input <path>', 'Input JSON dump file path')
    .action(async (opts) => {
      const cfg = getConfig();
      const campaignId = opts.campaignId ?? cfg.campaignContractId;

      if (!campaignId) {
        console.error(chalk.red('Campaign contract ID is required. Pass --campaign-id or set it in config.'));
        process.exit(1);
      }

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), `Would restore state from ${opts.input} to contract ${campaignId}`);
        return;
      }

      try {
        const cmdStr = `node scripts/contract-state-migration.mjs restore --contract "${campaignId}" --input "${opts.input}"`;
        execSync(cmdStr, { stdio: 'inherit' });
      } catch (err) {
        console.error(chalk.red('Failed to restore contract state:'), err.message);
        process.exit(1);
      }
    });

  return cmd;
}

