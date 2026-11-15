// hover_probe.mjs — Move the real mouse (via CDP) into the gap between two
// ticks and verify the nearest slot highlights and the tooltip shows.
// Usage: node hover_probe.mjs [port]
import { listTargets, Session, sleep } from './cdp.mjs';

const PORT = Number(process.argv[2] || 9334);
const targets = await listTargets(PORT);
const t = targets.find((x) => (x.url || '').includes('purpose=webviewView'));
if (!t) { console.error('[FAIL] no chat target'); process.exit(2); }

const s = await Session.connect(t.webSocketDebuggerUrl, 6000);
try {
  const geo = await s.evaluate(`(function(){
    var d = document.getElementById('active-frame').contentDocument;
    var box = d.getElementById('__tocnav');
    var slots = box.querySelectorAll('.__tocnav_slot');
    if (slots.length < 3) return null;
    var a = slots[1].getBoundingClientRect();
    var b = slots[2].getBoundingClientRect();
    return {
      x: Math.round(a.left + a.width / 2),
      yLine: Math.round(a.top + a.height / 2),
      yGap: Math.round((a.bottom + b.top) / 2),
      slotH: Math.round(a.height),
      gap: Math.round(b.top - a.bottom),
    };
  })()`);
  if (!geo) { console.error('[FAIL] not enough slots'); process.exit(3); }
  console.log('geometry:', JSON.stringify(geo));

  const read = () => s.evaluate(`(function(){
    var d = document.getElementById('active-frame').contentDocument;
    var slots = Array.prototype.slice.call(d.querySelectorAll('.__tocnav_slot'));
    var hovered = slots.filter(function (x) { return x.matches(':hover'); }).map(function (x) { return x.getAttribute('data-turn'); });
    var tip = d.getElementById('__tocnav_tip');
    var dot = d.querySelectorAll('.__tocnav_dot');
    var widths = Array.prototype.map.call(dot, function (x) { return Math.round(x.getBoundingClientRect().width); });
    return {
      hoveredTurns: hovered,
      tipVisible: !!(tip && tip.style.display !== 'none'),
      tipText: tip ? tip.textContent : '',
      wideTicks: widths.filter(function (w) { return w > 15; }).length,
    };
  })()`);

  // 1) on the line itself
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x, y: geo.yLine, button: 'none' });
  await sleep(500);
  console.log('on line   :', JSON.stringify(await read()));

  // 2) in the empty space between two lines
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x, y: geo.yGap, button: 'none' });
  await sleep(600);
  console.log('in gap    :', JSON.stringify(await read()));

  // 3) far outside the navigator (skip with "keep" to leave the cursor in the gap)
  if (process.argv[3] !== 'keep') {
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x - 300, y: geo.yGap, button: 'none' });
    await sleep(400);
    console.log('outside   :', JSON.stringify(await read()));
  }
} finally {
  s.close();
}
