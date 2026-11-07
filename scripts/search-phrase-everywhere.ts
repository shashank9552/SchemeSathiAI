import fs from 'node:fs';
import path from 'node:path';

function searchString(target: string) {
  const normTarget = target.toLowerCase().replace(/\s+/g, ' ');
  console.log(`Searching for "${normTarget}"...`);

  function walk(dir: string) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name === 'node_modules' || f.name === '.git') continue;
        walk(full);
      } else if (f.isFile() && (full.endsWith('.json') || full.endsWith('.txt') || full.endsWith('.ts') || full.endsWith('.md'))) {
        try {
          const content = fs.readFileSync(full, 'utf8').toLowerCase().replace(/\s+/g, ' ');
          if (content.includes(normTarget)) {
            console.log(`FOUND in file: ${full}`);
          }
        } catch {}
      }
    }
  }
  walk('.');
}

searchString('highly vibrant');
