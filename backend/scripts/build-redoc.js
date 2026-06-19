import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const root = process.cwd();

const output = path.resolve(root, '../frontend/public/api-docs.html');

fs.mkdirSync(path.dirname(output), {
  recursive: true,
});

execSync(`npx redoc-cli bundle openapi.yaml -o "${output}"`, {
  stdio: 'inherit',
});

console.log('✓ Static Redoc generated');
