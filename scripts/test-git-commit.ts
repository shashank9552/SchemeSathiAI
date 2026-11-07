import { execSync } from 'node:child_process';

function getGitCommit(): string {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return status ? `${commit}-dirty` : commit;
  } catch {
    return 'unknown';
  }
}

console.log('Evaluated getGitCommit():', getGitCommit());
console.log('Tracked changes detected (excluding untracked scripts):');
console.log(execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim());
