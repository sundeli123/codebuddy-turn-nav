// batch_send.mjs — Send N short messages to generate enough chat turns for
// testing the navigator. Waits for each assistant reply before sending next.
// Usage: node batch_send.mjs <port> <count> [intervalMs]
import { listTargets, Session, sleep } from './cdp.mjs';

const PORT = Number(process.argv[2] || 9334);
const COUNT = Number(process.argv[3] || 10);
const GAP = Number(process.argv[4] || 1500);

const targets = await listTargets(PORT);
const t = targets.find((x) => (x.url || '').includes('purpose=webviewView'));
if (!t) { console.error('[FAIL] 没找到 chat webview target'); process.exit(2); }

const s = await Session.connect(t.webSocketDebuggerUrl, 6000);

const stats = () => s.evaluate(`(function(){
  var d = document.getElementById('active-frame').contentDocument;
  var ids = Array.prototype.map.call(d.querySelectorAll('[data-index]'), function(e){ return +e.getAttribute('data-index'); });
  return {
    users: d.querySelectorAll('[class*="userMessage_"]').length,
    assistants: d.querySelectorAll('[class*="assistantMessage_"]').length,
    items: ids.length,
    idx: ids,
    idsMax: ids.length ? Math.max.apply(null, ids) : -1,
    scrollTop: (function(){ var sc = d.querySelector('[data-testid="virtuoso-scroller"]'); return sc ? Math.round(sc.scrollTop) : -1; })(),
    scrollHeight: (function(){ var sc = d.querySelector('[data-testid="virtuoso-scroller"]'); return sc ? sc.scrollHeight : -1; })(),
    clientHeight: (function(){ var sc = d.querySelector('[data-testid="virtuoso-scroller"]'); return sc ? sc.clientHeight : -1; })(),
  };
})()`, { timeoutMs: 15000 });

const clearAndType = (text) => s.evaluate(`(function(){
  var d = document.getElementById('active-frame').contentDocument;
  var ed = d.querySelector('[contenteditable="true"], [role="textbox"]');
  if (!ed) return 'no-editor';
  ed.focus();
  var sel = d.getSelection(); var range = d.createRange();
  range.selectNodeContents(ed); sel.removeAllRanges(); sel.addRange(range);
  d.execCommand('delete');
  return 'cleared';
})()`, { timeoutMs: 10000 });

try {
  const before = await stats();
  console.log(`[START] users=${before.users} items=${before.items} idx=[${before.idx}]`);

  for (let i = 1; i <= COUNT; i++) {
    const prev = await stats();
    const text = `第${prev.users + 1}轮测试，请只回复：收到${i}`;

    await clearAndType(text);
    await sleep(200);
    await s.send('Input.insertText', { text });
    await sleep(350);
    await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await s.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });

    // wait briefly: with a virtualized list the rendered count stops growing,
    // so a short fixed wait is enough to keep the queue moving
    let ok = false;
    for (let w = 0; w < 6; w++) {
      await sleep(1000);
      const now = await stats();
      if (now.idsMax > prev.idsMax) { ok = true; break; }
    }
    const now = await stats();
    console.log(`[${i}/${COUNT}] sent, reply=${ok ? 'ok' : 'timeout'} users=${now.users} items=${now.items} idx=[${now.idx}] scrollTop=${now.scrollTop}/${now.scrollHeight - now.clientHeight}`);
    await sleep(GAP);
  }

  const end = await stats();
  console.log(`[DONE] users=${end.users} items=${end.items} idx=[${end.idx}]`);
} finally {
  s.close();
}
