// eval_all.mjs — Run a JS expression inside every reachable CDP target.
// Usage: node eval_all.mjs [port] <jsFile> [urlNeedle]
import { listTargets, Session, DEFAULT_PORT } from './cdp.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.CDP_PORT || DEFAULT_PORT);
const JS_FILE = process.argv[3];
const NEEDLE = process.argv[4] || '';

if (!JS_FILE) {
  console.error('用法: node eval_all.mjs [port] <jsFile> [urlNeedle]');
  process.exit(1);
}
const EXPR = readFileSync(join(HERE, JS_FILE), 'utf8');
const skip = new Set(['service_worker', 'shared_worker', 'browser', 'worker']);

const targets = await listTargets(PORT);
const picked = targets.filter((t) =>
  t.webSocketDebuggerUrl && !skip.has(t.type) &&
  !(t.url || '').startsWith('devtools://') &&
  (!NEEDLE || (t.url || '').includes(NEEDLE) || (t.title || '').includes(NEEDLE)));

console.log(`[INFO] ${picked.length} 个 target`);
for (const t of picked) {
  console.log('');
  console.log(`--- ${t.type} | ${(t.title || '').slice(0, 50)} | ${(t.url || '').slice(0, 70)}`);
  let s;
  try {
    s = await Session.connect(t.webSocketDebuggerUrl, 4000);
    const r = await s.evaluate(EXPR, { timeoutMs: 90000 });
    console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
  } catch (e) {
    console.log(`[ERR] ${e.message}`);
  } finally {
    if (s) s.close();
  }
}
