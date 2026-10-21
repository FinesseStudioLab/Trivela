/**
 * trivela state dump|restore — export/import contract state as JSON.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../lib/config.js';
import { buildStateDump, parseStateDump } from '../lib/stateDump.js';

export function makeStateCommand() {
  const cmd = new Command('state');
  cmd.description('Export and restore contract state as JSON (issue #1372)');

  cmd
    .command('dump')
    .description('Export campaign contract state to a JSON file')
    .argument('<contractId>', 'Campaign contract id')
    .option('-o, --output <file>', 'Output JSON file', 'contract-state.json')
    .action((contractId, opts) => {
      const cfg = getConfig();
      // `export_state` is invoked via the Soroban CLI so this stays a thin,
      // dependency-free wrapper. The raw JSON of the invocation is captured
      // and normalised into the portable dump document.
      const raw = execSync(
        `stellar contract invoke --id ${contractId} --network ${cfg.network ?? 'testnet'} -- export_state`,
        { encoding: 'utf8' }
      );
      const state = JSON.parse(raw);
      const dump = buildStateDump(contractId, state, { network: cfg.network ?? 'testnet' });
      writeFileSync(opts.output, `${JSON.stringify(dump, null, 2)}\n`);
      console.log(chalk.green(`Wrote state dump to ${opts.output}`));
    });

  cmd
    .command('restore')
    .description('Restore campaign contract state from a JSON dump (admin only)')
    .argument('<file>', 'State dump JSON file')
    .option('--nonce <nonce>', 'Admin nonce', '0')
    .action((file, opts) => {
      const cfg = getConfig();
      const dump = JSON.parse(readFileSync(file, 'utf8'));
      const parsed = parseStateDump(dump);
      const payload = {
        admin: parsed.state.admin,
        nonce: Number(opts.nonce),
        state: parsed.state,
      };
      console.log(chalk.bold('Import payload for `import_state`:'));
      console.log(JSON.stringify(payload, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
      console.log(
        chalk.yellow(
          `\nApply with:\n  stellar contract invoke --id ${parsed.contractId} --network ${cfg.network ?? 'testnet'} -- import_state ${JSON.stringify(payload)}`
        )
      );
    });

  return cmd;
}
