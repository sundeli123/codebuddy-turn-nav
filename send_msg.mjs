// send_msg.mjs — Type a message into the CodeBuddy chat box and press Enter.
// Used only to generate enough turns for testing the navigator.
// Usage: node send_msg.mjs <port> "<text>"
import { listTargets, Session, sleep } from './cdp.mjs';

const PORT = Number(process.argv[2] || 9334);
const MSG = process.argv[3] || '测试消息';

const targets = await listTargets(PORT);
const t = targets.find((x) => (x.url || '').includes('purpose=webviewView'));
if (!t) {
  console.error('[FAIL] 没找到 chat webview target');
  process.exit(2);
}

const s = await Session.connect(t.webSocketDebuggerUrl, 6000);
try {
  const focus = await s.evaluate(`(function(){
    var f = document.getElementById('active-frame');
    var d = f && f.contentDocument;
    if (!d) return 'no-frame';
    var ed = d.querySelector('[contenteditable="true"], [role="textbox"]');
    if (!ed) return 'no-editor';
    ed.focus();
    var sel = d.getSelection(); var range = d.createRange();
    range.selectNodeContents(ed); range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
    return 'focused';
  })()`, { timeoutMs: 10000 });
  console.log(`focus -> ${focus}`);
  if (focus !== 'focused') process.exit(3);

  await sleep(300);
  await s.send('Input.insertText', { text: MSG });
  await sleep(400);

  const len = await s.evaluate(`(function(){
    var d = document.getElementById('active-frame').contentDocument;
    var ed = d.querySelector('[contenteditable="true"], [role="textbox"]');
    return (ed.innerText || '').length;
  })()`);
  console.log(`editor length after insert -> ${len}`);

  await s.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await s.send('Input.dispatchKeyEvent', {
    type: 'char', text: '\r', unmodifiedText: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await s.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await sleep(1200);

  const after = await s.evaluate(`(function(){
    var d = document.getElementById('active-frame').contentDocument;
    var ed = d.querySelector('[contenteditable="true"], [role="textbox"]');
    return {
      editorLen: (ed.innerText || '').length,
      userMsgs: d.querySelectorAll('[class*="userMessage_"]').length,
      items: d.querySelectorAll('[data-index]').length,
    };
  })()`);
  console.log(`after send -> ${JSON.stringify(after)}`);
} finally {
  s.close();
}
