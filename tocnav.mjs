// tocnav.mjs — Resident injector for the CodeBuddy turn navigator.
//
// Watches the IDE's CDP debug ports, connects to every page/webview target and
// (re)injects nav_payload.js. The payload itself decides whether a target is a
// chat panel; this process only handles connection lifecycle, re-injection,
// logging and single-instance locking.
//
// Usage:  node tocnav.mjs [ports]
//         ports = comma separated, default "9333,9334,9335"
import { listTargets, Session, sleep } from './cdp.mjs';
import {
  readFileSync, appendFileSync, writeFileSync, existsSync, statSync, unlinkSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAYLOAD_FILE = join(HERE, 'nav_payload.js');
const LOG_FILE = join(HERE, 'tocnav.log');
const LOCK_FILE = join(HERE, 'tocnav.pid');
const LOG_MAX_BYTES = 2 * 1024 * 1024;

const PORTS = String(process.env.CDP_PORTS || process.argv[2] || '9333,9334,9335')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);

const POLL_MS = 2500;
const RETRY_NO_CHAT_MS = 30000;
const skipTypes = new Set(['service_worker', 'shared_worker', 'browser', 'worker']);

/* ---------------- single instance ---------------- */
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const old = parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (old && old !== process.pid && pidAlive(old)) {
        console.log(`[SKIP] injector already running (pid ${old})`);
        process.exit(0);
      }
    }
  } catch { /* ignore */ }
  try { writeFileSync(LOCK_FILE, String(process.pid), 'utf8'); } catch { /* ignore */ }
  const release = () => { try { unlinkSync(LOCK_FILE); } catch { /* ignore */ } };
  process.on('exit', release);
  process.on('SIGINT', () => { closeEverything(); release(); process.exit(0); });
  process.on('SIGTERM', () => { closeEverything(); release(); process.exit(0); });
}

/* ---------------- logging ---------------- */
function log(line) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  try {
    if (!existsSync(LOG_FILE) || statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      // start a fresh file with a BOM so Windows tools decode UTF-8 correctly
      writeFileSync(LOG_FILE, '\uFEFF', 'utf8');
    }
    appendFileSync(LOG_FILE, msg + '\n', 'utf8');
  } catch { /* ignore */ }
}

/* ---------------- payload hot reload ---------------- */
if (!existsSync(PAYLOAD_FILE)) {
  console.error(`[FAIL] missing payload: ${PAYLOAD_FILE}`);
  process.exit(1);
}
let PAYLOAD = readFileSync(PAYLOAD_FILE, 'utf8');
let payloadMtime = statSync(PAYLOAD_FILE).mtimeMs;

function currentPayload() {
  try {
    const m = statSync(PAYLOAD_FILE).mtimeMs;
    if (m !== payloadMtime) {
      PAYLOAD = readFileSync(PAYLOAD_FILE, 'utf8');
      payloadMtime = m;
      log('nav_payload.js changed, hot reloaded');
    }
  } catch { /* keep last good copy */ }
  return PAYLOAD;
}

/* ---------------- per-port state ---------------- */
/** port -> { live: Map<targetId, {session, noChatAt, reported}>, down: boolean } */
const state = new Map(PORTS.map((p) => [p, { live: new Map(), down: true }]));

function closeEverything() {
  for (const st of state.values()) {
    for (const rec of st.live.values()) rec.session.close();
    st.live.clear();
  }
}

async function tickPort(port) {
  const st = state.get(port);
  let targets;
  try {
    targets = await listTargets(port);
  } catch {
    if (!st.down) {
      log(`port ${port} gone, waiting for the IDE to start with the debug flag`);
      st.down = true;
    }
    for (const rec of st.live.values()) rec.session.close();
    st.live.clear();
    return;
  }

  if (st.down) {
    log(`connected to port ${port} (${targets.length} targets)`);
    st.down = false;
  }

  const seen = new Set(targets.map((t) => t.id));
  for (const [id, rec] of st.live) {
    if (!seen.has(id)) {
      rec.session.close();
      st.live.delete(id);
    }
  }

  for (const t of targets) {
    const url = t.url || '';
    if (url.startsWith('devtools://')) continue;
    if (skipTypes.has(t.type)) continue;
    if (!t.webSocketDebuggerUrl) continue;

    const now = Date.now();
    let rec = st.live.get(t.id);
    if (rec && rec.noChatAt && now - rec.noChatAt < RETRY_NO_CHAT_MS) continue;

    if (!rec) {
      try {
        const session = await Session.connect(t.webSocketDebuggerUrl, 4000);
        rec = { session, noChatAt: 0, reported: false };
        st.live.set(t.id, rec);
      } catch {
        continue;
      }
    }

    try {
      const r = await rec.session.evaluate(currentPayload(), { timeoutMs: 25000 });
      if (r && r.ok) {
        if (r.injected && !rec.reported) {
          log(`injected [${port}] ${(t.title || t.type || '').slice(0, 28)} | turns ${r.anchors} | ${r.strategy || ''}`);
          rec.reported = true;
        }
        rec.noChatAt = 0;
      } else if (r && r.reason === 'no-chat') {
        rec.noChatAt = now;
      }
    } catch (e) {
      rec.session.close();
      st.live.delete(t.id);
      log(`target lost [${port}], will retry: ${e.message}`);
    }
  }
}

/* ---------------- main loop ---------------- */
acquireLock();
log(`turn navigator injector started, ports ${PORTS.join(',')}, pid ${process.pid}`);

for (;;) {
  for (const port of PORTS) {
    try {
      await tickPort(port);
    } catch (e) {
      log(`tick error on port ${port}: ${e.message}`);
    }
  }
  await sleep(POLL_MS);
}
