// probe.mjs — Scan every CDP target of CodeBuddy IDE and report the real DOM
// shape of the chat panel, so the navigator can be built against facts instead
// of guesses. Read-only: it never clicks, types or scrolls anything.
//
// Usage:  node probe.mjs [port]
import { listTargets, Session, DEFAULT_PORT, sleep } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CDP_PORT || process.argv[2] || DEFAULT_PORT);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------- runs INSIDE the page: must be fully self-contained ---------- */
function pageProbe() {
  const out = {
    href: location.href,
    title: document.title,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    elementCount: 0,
    shadowRoots: 0,
    bodyChildren: [],
    scrollers: [],
    dataAttrs: {},
    classHits: [],
    userLike: [],
    messageCandidates: [],
    notes: [],
  };

  const cls = (el) => {
    try {
      const c = el.className;
      if (typeof c === 'string') return c;
      if (c && typeof c.baseVal === 'string') return c.baseVal;
      return '';
    } catch { return ''; }
  };

  const pathOf = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 5; i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const c = cls(n).trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (c.length) s += '.' + c.join('.');
      const parent = n.parentElement;
      if (parent) s += ':nth-child(' + (Array.prototype.indexOf.call(parent.children, n) + 1) + ')';
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };

  const txt = (el, n) => ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, n);

  const all = Array.prototype.slice.call(document.querySelectorAll('*'));
  out.elementCount = all.length;

  for (const el of all) if (el.shadowRoot) out.shadowRoots++;

  out.bodyChildren = Array.prototype.slice.call(document.body.children, 0, 12).map((e) =>
    e.tagName + ' [' + cls(e).slice(0, 80) + '] id=' + (e.id || ''));

  const dataCount = {};
  for (const el of all) {
    for (const a of el.attributes) {
      if (a.name.indexOf('data-') === 0) dataCount[a.name] = (dataCount[a.name] || 0) + 1;
    }
  }
  out.dataAttrs = Object.fromEntries(
    Object.entries(dataCount).sort((a, b) => b[1] - a[1]).slice(0, 40));

  for (const el of all) {
    let cs;
    try { cs = getComputedStyle(el); } catch { continue; }
    if (!/auto|scroll/.test(cs.overflowY)) continue;
    if (el.clientHeight < 120) continue;
    if (el.scrollHeight < el.clientHeight + 150) continue;
    const kids = Array.prototype.slice.call(el.children);
    const deep = kids.length ? Array.prototype.slice.call(kids[0].children, 0, 6) : [];
    out.scrollers.push({
      path: pathOf(el),
      tag: el.tagName,
      cls: cls(el).slice(0, 100),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      childCount: kids.length,
      childSample: kids.slice(0, 6).map((k) => ({
        tag: k.tagName, cls: cls(k).slice(0, 90),
        h: Math.round(k.getBoundingClientRect().height), text: txt(k, 80),
      })),
      grandSample: deep.map((k) => ({
        tag: k.tagName, cls: cls(k).slice(0, 70),
        h: Math.round(k.getBoundingClientRect().height), text: txt(k, 50),
      })),
    });
    if (out.scrollers.length >= 8) break;
  }

  const kw = /(message|msg|chat|turn|bubble|user|assistant|reply|request|response|conversation|markdown|avatar|content|round|session)/i;
  const hit = {};
  for (const el of all) {
    const c = cls(el);
    if (!c || c.length > 300) continue;
    for (const t of c.split(/\s+/)) {
      if (!kw.test(t)) continue;
      hit[t] = (hit[t] || 0) + 1;
    }
  }
  out.classHits = Object.entries(hit).sort((a, b) => b[1] - a[1]).slice(0, 50);

  for (const el of all) {
    if (!el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 16 || r.width < 60) continue;
    if (!txt(el, 20)) continue;
    let cs;
    try { cs = getComputedStyle(el); } catch { continue; }
    const isFlex = cs.display.indexOf('flex') >= 0;
    const flag = (isFlex && cs.justifyContent === 'flex-end') ||
                 cs.flexDirection === 'row-reverse' ||
                 cs.alignSelf === 'flex-end' || cs.textAlign === 'right';
    if (!flag) continue;
    out.userLike.push({ path: pathOf(el), cls: cls(el).slice(0, 80), h: Math.round(r.height), text: txt(el, 60) });
    if (out.userLike.length >= 20) break;
  }

  const shapes = {};
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.height < 30 || r.width < 150) continue;
    if (!txt(el, 10)) continue;
    const c = cls(el);
    if (!c) continue;
    const shape = el.tagName + '.' + c.split(/\s+/).slice(0, 2).join('.');
    if (!shapes[shape]) shapes[shape] = { shape, count: 0, heightSum: 0, sample: txt(el, 70) };
    shapes[shape].count++;
    shapes[shape].heightSum += r.height;
  }
  out.messageCandidates = Object.values(shapes)
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
    .map((s) => ({ shape: s.shape, count: s.count, avgH: Math.round(s.heightSum / s.count), sample: s.sample }));

  out.notes.push('navAlreadyInjected: ' + (document.getElementById('__tocnav') ? 'YES' : 'NO'));
  return out;
}

/* ---------- main ---------- */
const ts = stamp();
const outDir = join(HERE, 'probe_' + ts);
mkdirSync(outDir, { recursive: true });

let targets;
try {
  targets = await listTargets(PORT);
} catch (e) {
  console.error(`[FAIL] 连不上 127.0.0.1:${PORT} —— ${e.message}`);
  console.error('       请先用 launch_debug.cmd（或带 --remote-debugging-port 的快捷方式）启动 CodeBuddy。');
  process.exit(2);
}

const skipTypes = new Set(['service_worker', 'shared_worker', 'browser', 'worker']);
const picked = targets.filter((t) => {
  const url = t.url || '';
  if (url.startsWith('devtools://')) return false;
  if (skipTypes.has(t.type)) return false;
  return Boolean(t.webSocketDebuggerUrl);
});

console.log(`[INFO] 端口 ${PORT} 共 ${targets.length} 个 target，可连 ${picked.length} 个`);
console.log('');

const report = { port: PORT, time: ts, targets: [] };
let idx = 0;

for (const t of picked) {
  idx++;
  const label = `${t.type || '?'} :: ${(t.title || '').slice(0, 60)} :: ${(t.url || '').slice(0, 90)}`;
  console.log(`[${idx}/${picked.length}] ${label}`);

  let s;
  try {
    s = await Session.connect(t.webSocketDebuggerUrl, 5000);
  } catch (e) {
    console.log(`       连接失败: ${e.message}`);
    report.targets.push({ index: idx, type: t.type, url: t.url, title: t.title, error: e.message });
    continue;
  }

  try {
    const info = await s.evaluate(`(${pageProbe.toString()})()`, { timeoutMs: 25000 });

    let html = '';
    try {
      html = await s.evaluate(`(function(){
        var els = Array.prototype.slice.call(document.querySelectorAll('*'));
        var best = null;
        for (var i = 0; i < els.length; i++) {
          var el = els[i]; var cs;
          try { cs = getComputedStyle(el); } catch (e) { continue; }
          if (!/auto|scroll/.test(cs.overflowY)) continue;
          if (el.clientHeight < 120) continue;
          if (el.scrollHeight < el.clientHeight + 150) continue;
          if (!best || el.scrollHeight > best.scrollHeight) best = el;
        }
        return (best || document.body).outerHTML.slice(0, 90000);
      })()`, { timeoutMs: 30000 });
    } catch (e) {
      html = '<!-- html snapshot failed: ' + e.message + ' -->';
    }

    const slug = (t.url || 'target').replace(/[^a-zA-Z0-9]+/g, '_').slice(-40);
    const htmlFile = join(outDir, `${idx}_${slug}.html`);
    writeFileSync(htmlFile, html, 'utf8');

    report.targets.push({ index: idx, type: t.type, url: t.url, title: t.title, info, htmlFile });

    console.log(`       elements=${info.elementCount}  shadowRoots=${info.shadowRoots}  nav=${info.notes.join(';')}`);
    for (const sc of info.scrollers.slice(0, 3)) {
      console.log(`       scroller: ${sc.path}`);
      console.log(`                 scrollH=${sc.scrollHeight} clientH=${sc.clientHeight} children=${sc.childCount}`);
      sc.childSample.slice(0, 3).forEach((k) => {
        console.log(`                   - ${k.tag} [${k.cls.slice(0, 60)}] h=${k.h} "${k.text.slice(0, 50)}"`);
      });
    }
    if (info.classHits.length) {
      console.log(`       classes: ${info.classHits.slice(0, 10).map((x) => x[0] + '(' + x[1] + ')').join(' ')}`);
    }
    if (Object.keys(info.dataAttrs).length) {
      console.log(`       data-*: ${Object.entries(info.dataAttrs).slice(0, 8).map((x) => x[0] + '(' + x[1] + ')').join(' ')}`);
    }
    if (info.userLike.length) {
      console.log(`       right-aligned blocks: ${info.userLike.length}, e.g. "${info.userLike[0].text.slice(0, 40)}"`);
    }
    if (info.messageCandidates.length) {
      console.log(`       repeated shapes: ${info.messageCandidates.slice(0, 5).map((m) => m.shape + 'x' + m.count).join(' | ')}`);
    }
    console.log(`       html -> ${htmlFile}`);
  } catch (e) {
    console.log(`       探测失败: ${e.message}`);
    report.targets.push({ index: idx, type: t.type, url: t.url, title: t.title, error: e.message });
  } finally {
    s.close();
  }
  console.log('');
  await sleep(300);
}

const jsonFile = join(outDir, 'report.json');
writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf8');
console.log(`[DONE] 报告: ${jsonFile}`);
