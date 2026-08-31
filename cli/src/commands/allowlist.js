/**
 * trivela allowlist import — import a CSV/text allowlist and generate Merkle proof.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../lib/config.js';
import { requireMainnetConfirmation } from '../lib/prompt.js';

export function makeAllowlistCommand() {
  const cmd = new Command('allowlist');
  cmd.description('Manage campaign allowlists and Merkle proofs');

  cmd
    .command('import <file>')
    .description('Import a list of addresses from a file (one address per line or CSV)')
    .option('--dry-run', 'Parse file and print summary without writing')
    .option('--campaign-id <id>', 'Associate with a campaign')
    .action(async (file, opts) => {
      const cfg = getConfig();
      let raw;
      try {
        raw = readFileSync(file, 'utf8');
      } catch (err) {
        console.error(chalk.red('Cannot read file:'), err.message);
        process.exit(1);
      }

      const addresses = raw
        .split('\n')
        .map((l) => l.split(',')[0].trim())
        .filter((a) => a && a.startsWith('G') && a.length === 56);

      console.log(`Parsed ${chalk.bold(addresses.length)} valid Stellar addresses from ${file}.`);

      if (opts.dryRun) {
        console.log(chalk.cyan('[dry-run]'), 'First 5 addresses:', addresses.slice(0, 5));
        return;
      }

      // Generate Merkle root via the existing script
      const listPath = `/tmp/trivela-allowlist-${Date.now()}.txt`;
      require('fs').writeFileSync(listPath, addresses.join('\n'));
      try {
        const out = execSync(`node scripts/generate-merkle.mjs ${listPath}`, { encoding: 'utf8' });
        console.log(chalk.green('✔'), 'Merkle root generated:');
        console.log(out);
      } catch (err) {
        console.error(chalk.red('Merkle generation failed:'), err.message);
        process.exit(1);
      }
    });

  return cmd;
}
