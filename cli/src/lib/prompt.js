/**
 * Mainnet guardrail — confirm destructive operations on mainnet.
 */

import readline from 'readline';
import chalk from 'chalk';

export function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${chalk.yellow('⚠')}  ${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function requireMainnetConfirmation(action, cfg, dryRun) {
  if (dryRun) {
    console.log(chalk.cyan('[dry-run]'), `Would ${action} on ${cfg.network}`);
    return false;
  }
  if (cfg.network === 'mainnet') {
    console.log(chalk.red('WARNING: You are operating on MAINNET.'));
    const ok = await confirm(`Confirm: ${action} on mainnet?`);
    if (!ok) {
      console.log('Aborted.');
      return false;
    }
  }
  return true;
}
