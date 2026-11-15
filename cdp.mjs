// cdp.mjs — Minimal Chrome DevTools Protocol client.
// Zero dependencies: Node >= 21 ships a global WebSocket + fetch.
import { setTimeout as sleep } from 'node:timers/promises';

export { sleep };

export const DEFAULT_PORT = 9333;

/** List CDP targets exposed by the IDE's debug port. */
export async function listTargets(port = DEFAULT_PORT, host = '127.0.0.1', timeoutMs = 4000) {
  const ac = new AbortController();
  const timer = globalThis.setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`http://${host}:${port}/json/list`, { signal: ac.signal });
    if (!r.ok) throw new Error(`GET /json/list -> HTTP ${r.status}`);
    const list = await r.json();
    return Array.isArray(list) ? list : [];
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** True when something is listening on the debug port. */
export async function portAlive(port = DEFAULT_PORT, host = '127.0.0.1') {
  try {
    await listTargets(port, host, 1500);
    return true;
  } catch {
    return false;
  }
}

export class Session {
  #ws;
  #id = 0;
  #pending = new Map();
  #closed = false;
  #onEvent;

  constructor(ws, onEvent) {
    this.#ws = ws;
    this.#onEvent = onEvent;
    ws.addEventListener('message', (ev) => this.#handle(ev));
    ws.addEventListener('close', () => {
      this.#closed = true;
      for (const p of this.#pending.values()) p.reject(new Error('CDP 连接已关闭'));
      this.#pending.clear();
    });
  }

  static async connect(wsUrl, timeoutMs = 6000, onEvent) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => reject(new Error('WebSocket 连接超时')), timeoutMs);
      ws.addEventListener('open', () => { globalThis.clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { globalThis.clearTimeout(timer); reject(new Error('WebSocket 连接失败')); }, { once: true });
    });
    return new Session(ws, onEvent);
  }

  #toText(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    return String(data);
  }

  #handle(ev) {
    const raw = this.#toText(ev.data);
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.id && this.#pending.has(msg.id)) {
      const p = this.#pending.get(msg.id);
      this.#pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message || 'CDP 错误'}${msg.error.data ? ' | ' + msg.error.data : ''}`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method && this.#onEvent) {
      try { this.#onEvent(msg); } catch { /* ignore listener errors */ }
    }
  }

  send(method, params = {}, timeoutMs = 15000) {
    if (this.#closed) return Promise.reject(new Error('CDP 连接已关闭'));
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP 调用超时: ${method}`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => { globalThis.clearTimeout(timer); resolve(v); },
        reject: (e) => { globalThis.clearTimeout(timer); reject(e); },
      });
      try {
        this.#ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        this.#pending.delete(id);
        globalThis.clearTimeout(timer);
        reject(e);
      }
    });
  }

  /** Evaluate JS inside the target and return the JSON-serializable value. */
  async evaluate(expression, { awaitPromise = true, timeoutMs = 20000 } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      allowUnsafeEvalBlockedByCSP: true,
      timeout: timeoutMs,
    }, timeoutMs + 3000);

    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`页面内异常: ${d.exception?.description || d.text || 'unknown'}`);
    }
    return r.result?.value;
  }

  close() {
    try { this.#ws.close(); } catch { /* ignore */ }
  }
}
