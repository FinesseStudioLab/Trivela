/**
 * trivela config — view and set CLI configuration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, store } from '../lib/config.js';

export function makeConfigCommand() {
  const cmd = new Command('config');
  cmd.description('View or set CLI configuration (network, API key, contracts, etc.)');

  cmd
    .command('get [key]')
    .description('Print current config (or a specific key)')
    .action((key) => {
      const cfg = getConfig();
      if (key) {
        console.log(cfg[key] ?? store.get(key) ?? '(not set)');
      } else {
        for (const [k, v] of Object.entries(cfg)) {
          const display = k.toLowerCase().includes('key') ? (v ? '***' : '(not set)') : (v || '(not set)');
          console.log(`${chalk.bold(k)}: ${display}`);
        }
      }
    });

  cmd
    .command('set <key> <value>')
    .description('Persist a config value')
    .action((key, value) => {
      setConfig(key, value);
      console.log(chalk.green('✔'), `${key} saved.`);
    });

  cmd
    .command('clear')
    .description('Clear all persisted config')
    .action(() => {
      store.clear();
      console.log(chalk.green('✔'), 'Config cleared.');
    });

  return cmd;
}
