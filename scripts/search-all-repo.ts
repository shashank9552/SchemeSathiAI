import fs from 'node:fs';
import path from 'node:path';

function searchInDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      searchInDir(full);
    } else if (e.isFile() && (full.endsWith('.json') || full.endsWith('.ts') || full.endsWith('.md'))) {
      try {
        const text = fs.readFileSync(full, 'utf8');
        if (/dynamic\s+sector/i.test(text) || /vibrant\s+sector/i.test(text)) {
          console.log(`MATCH found in file: ${full}`);
          const lines = text.split('\n');
          lines.forEach((l, idx) => {
            if (/dynamic\s+sector/i.test(l) || /vibrant\s+sector/i.test(l)) {
              console.log(`  Line ${idx + 1}: ${l.trim().slice(0, 150)}`);
            }
          });
        }
      } catch {}
    }
  }
}

searchInDir('.');
