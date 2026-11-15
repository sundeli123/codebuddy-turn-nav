// click.mjs — Click a button by its visible text inside any CDP target.
// Handles both the workbench DOM and webview inner iframe (#active-frame).
// Usage: node click.mjs <port> <text> [urlNeedle]
import { listTargets, Session } from './cdp.mjs';

const PORT = Number(process.argv[2] || 9334);
const TEXT = process.argv[3];
const NEEDLE = process.argv[4] || '';

if (!TEXT) {
  console.error('用法: node click.mjs <port> <text> [urlNeedle]');
  process.exit(1);
}

const skip = new Set(['service_worker', 'shared_worker', 'browser', 'worker']);
const targets = await listTargets(PORT);
const picked = targets.filter((t) =>
  t.webSocketDebuggerUrl && !skip.has(t.type) &&
  !(t.url || '').startsWith('devtools://') &&
  (!NEEDLE || (t.url || '').includes(NEEDLE)));

const expr = `(function(){
  var want = ${JSON.stringify(TEXT)};
  function find(root) {
    if (!root) return null;
    var els = Array.prototype.slice.call(root.querySelectorAll('button, a, [role="button"], [tabindex]'));
    var exact = els.find(function (b) { return ((b.innerText || '').trim()) === want; });
    if (exact) return exact;
    return els.find(function (b) { return ((b.innerText || '').trim()).indexOf(want) >= 0; });
  }
  var doc = document;
  var hit = find(doc);
  if (!hit) {
    var f = doc.getElementById('active-frame');
    if (f && f.contentDocument) { doc = f.contentDocument; hit = find(doc); }
  }
  if (!hit) return { ok: false, where: doc === document ? 'outer' : 'frame' };
  hit.scrollIntoView({ block: 'center' });
  hit.click();
  return { ok: true, where: doc === document ? 'outer' : 'frame', text: (hit.innerText || '').trim().slice(0, 40) };
})()`;

for (const t of picked) {
  let s;
  try {
    s = await Session.connect(t.webSocketDebuggerUrl, 4000);
    const r = await s.evaluate(expr, { timeoutMs: 15000 });
    console.log(`${(t.title || t.type).slice(0, 40)} -> ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`${(t.title || t.type).slice(0, 40)} -> [ERR] ${e.message}`);
  } finally {
    if (s) s.close();
  }
}
