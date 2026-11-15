// shot.mjs — Screenshot a CDP target (used for visual verification).
// Usage: node shot.mjs [port] [urlSubstring] [outFile]
import { listTargets, Session, DEFAULT_PORT } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.CDP_PORT || DEFAULT_PORT);
const NEEDLE = process.argv[3] || 'workbench';
const OUT = process.argv[4] || 'shot.png';

const targets = await listTargets(PORT);
const t = targets.find((x) => ((x.url || '').includes(NEEDLE) || (x.title || '').includes(NEEDLE)) && x.webSocketDebuggerUrl);
if (!t) {
  console.error(`[FAIL] 没有匹配 "${NEEDLE}" 的 target`);
  console.error(targets.map((x) => `  ${x.type} ${x.url}`).join('\n'));
  process.exit(2);
}

const s = await Session.connect(t.webSocketDebuggerUrl, 6000);
try {
  await s.send('Page.enable');
  await new Promise((r) => setTimeout(r, 800));
  const res = await s.send('Page.captureScreenshot', { format: 'png' }, 20000);
  const file = join(HERE, OUT);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(res.data, 'base64'));
  console.log(`[OK] ${file}`);
  console.log(`     target: ${t.title} | ${t.url.slice(0, 80)}`);
} finally {
  s.close();
}
