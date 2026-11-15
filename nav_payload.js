/*
 * nav_payload.js — Injected into the CodeBuddy chat webview.
 *
 * Draws a vertical turn navigator on the right edge of the chat panel:
 * one tick per conversation turn (one user question + its answer),
 * click a tick -> jump straight to that turn.
 *
 * Everything is feature-detected, nothing is hard-coded to a specific
 * conversation: turn count comes from the virtual list's React props,
 * turn titles are read from the message objects, and jumping uses the
 * list's own imperative handle with a scroll-based fallback.
 *
 * Returns (must stay JSON-serializable):
 *   { ok:false, reason:'no-chat' }        -> not a chat webview
 *   { ok:true, injected:false, already:true, anchors:N }
 *   { ok:true, injected:true, anchors:N, strategy:'handle'|'scroll' }
 */
(function () {
  var ID = '__tocnav';
  var DOT_CLASS = '__tocnav_dot';
  var SLOT_CLASS = '__tocnav_slot';

  // The chat lives in an inner iframe of the webview; the host document only
  // contains the shell, so all real work happens in the inner document.
  var frame = document.getElementById('active-frame');
  var doc = frame && frame.contentDocument;
  if (!doc) return { ok: false, reason: 'no-chat' };

  function findScroller() { return doc.querySelector('[data-testid="virtuoso-scroller"]'); }
  if (!findScroller()) return { ok: false, reason: 'no-chat' };

  var VERSION = '2.0';
  var prev = doc.getElementById(ID);
  if (prev) {
    if (prev.getAttribute('data-v') === VERSION) {
      return { ok: true, injected: false, already: true, anchors: prev.querySelectorAll('.' + DOT_CLASS).length };
    }
    // Bump VERSION to hot-swap the injected UI without reloading the webview.
    prev.remove();
    var oldStyle = doc.getElementById(ID + '_style');
    if (oldStyle) oldStyle.remove();
    var oldTip = doc.getElementById(ID + '_tip');
    if (oldTip) oldTip.remove();
  }

  function fiberOf(el) {
    if (!el) return null;
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0) return el[keys[i]];
    }
    return null;
  }

  function readState() {
    var sc = findScroller();
    if (!sc) return null;

    var f = fiberOf(sc);
    var virt = null, timeline = null, handle = null;
    var guard = 0;
    while (f && guard < 50) {
      var p = f.memoizedProps;
      if (p) {
        if (!virt && typeof p.totalCount === 'number' && typeof p.firstItemIndex === 'number') virt = p;
        if (!timeline && Array.isArray(p.messages)) timeline = p;
      }
      if (!handle && f.ref && f.ref.current && typeof f.ref.current.scrollToIndex === 'function') {
        handle = f.ref.current;
      }
      f = f.return;
      guard++;
    }

    var rendered = Array.prototype.map.call(doc.querySelectorAll('[data-index]'), function (e) {
      return +e.getAttribute('data-index');
    });

    var total = virt ? virt.totalCount : (rendered.length ? Math.max.apply(null, rendered) + 1 : 0);

    var users = [];
    if (timeline) {
      for (var i = 0; i < timeline.messages.length; i++) {
        var m = timeline.messages[i];
        if (m.messageType !== 'user') continue;
        var text = '';
        if (Array.isArray(m.content)) {
          for (var j = 0; j < m.content.length; j++) {
            var c = m.content[j];
            if (c && c.type === 'text' && c.text) text += c.text + ' ';
          }
        } else if (typeof m.content === 'string') {
          text = m.content;
        }
        users.push(text.replace(/\s+/g, ' ').trim());
      }
    }

    return { sc: sc, total: total, rendered: rendered, users: users, handle: handle, fiberOk: !!virt };
  }

  var st = readState();
  if (!st) return { ok: false, reason: 'no-chat' };
  if (st.total < 2) {
    // A single turn needs no navigator; report no-chat so the daemon retries
    // later once the conversation grows.
    return { ok: false, reason: 'no-chat' };
  }

  var strategy = st.handle ? 'handle' : 'scroll';

  // ---------- styles ----------
  var style = doc.createElement('style');
  style.id = ID + '_style';
  style.textContent = [
    // Fully transparent by default: the ticks must not hide the text behind
    // them. Only a very light tint appears while hovering the strip.
    // Anchored to the upper part of the panel on purpose: the chat has its own
    // floating "scroll to bottom" button near the lower right, which the
    // navigator must never cover.
    '#' + ID + '{position:fixed;right:12px;top:8%;',
    'display:flex;flex-direction:column;align-items:flex-end;gap:0;',
    'z-index:2147483000;padding:4px 0;border-radius:6px;pointer-events:auto;',
    'background:transparent;transition:background .15s;}',
    '#' + ID + ':hover{background:rgba(127,127,127,.12);}',
    '.' + SLOT_CLASS + '{display:flex;align-items:center;justify-content:flex-end;',
    'width:18px;cursor:pointer;flex:0 0 auto;}',
    // Ticks are ~2/3 of the previous size and sit at ~40% opacity by default,
    // so they stay readable without competing with the text behind them.
    '.' + DOT_CLASS + '{width:11px;height:2px;border-radius:1px;',
    'background:rgba(215,215,225,.72);opacity:.42;',
    'transition:width .1s,opacity .1s,background .1s;}',
    '.' + SLOT_CLASS + '.__on .' + DOT_CLASS + '{width:15px;opacity:.9;background:#79aaff;}',
    '.' + SLOT_CLASS + ':hover .' + DOT_CLASS + '{width:16px;opacity:1;background:#a8c8ff;}',
    '#' + ID + '_tip{position:fixed;transform:translateY(-50%);max-width:280px;',
    'padding:4px 8px;border-radius:4px;font:12px/1.5 var(--vscode-font-family,sans-serif);',
    'color:var(--vscode-editorHoverWidget-foreground,#ddd);',
    'background:var(--vscode-editorHoverWidget-background,#252526);',
    'border:1px solid var(--vscode-editorHoverWidget-border,#454545);',
    'z-index:2147483001;pointer-events:none;display:none;white-space:nowrap;',
    'overflow:hidden;text-overflow:ellipsis;}',
  ].join('');
  doc.head.appendChild(style);

  var box = doc.createElement('div');
  box.id = ID;
  box.setAttribute('data-v', VERSION);
  var tip = doc.createElement('div');
  tip.id = ID + '_tip';
  doc.body.appendChild(tip);
  doc.body.appendChild(box);

  var dots = [];

  function render() {
    var s = readState();
    if (!s || s.total < 1) return;
    var total = s.total;

    // Sit just inside the chat's own scrollbar: hugging the edge but never on
    // top of it, so the scrollbar stays draggable.
    var sbw = 9;
    try {
      sbw = Math.max(0, s.sc.offsetWidth - s.sc.clientWidth) || 9;
    } catch (e) { /* keep default */ }
    box.style.right = (sbw + 2) + 'px';

    // Each tick sits in a slot that fills the whole vertical gap, so the cursor
    // never lands "between two ticks with nothing highlighted": whatever slot
    // it is in, that slot lights up.
    var availH = Math.min((doc.documentElement.clientHeight || 700) * 0.40, 420);
    var MIN_STEP = 6;
    var MAX_STEP = 10;
    var stride = 1;
    if (total * MIN_STEP > availH) stride = Math.ceil(total * MIN_STEP / availH);
    var shown = Math.ceil(total / stride);
    var step = Math.max(MIN_STEP, Math.min(MAX_STEP, availH / shown));

    box.textContent = '';
    box.setAttribute('data-stride', String(stride));
    dots = [];

    for (var i = 0; i < total; i += stride) {
      (function (index) {
        var slot = doc.createElement('div');
        slot.className = SLOT_CLASS;
        slot.setAttribute('data-turn', String(index));
        slot.style.height = step + 'px';

        var line = doc.createElement('div');
        line.className = DOT_CLASS;
        slot.appendChild(line);

        slot.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          jumpTo(index);
        });
        slot.addEventListener('mouseenter', function () { showTip(index, slot); });
        slot.addEventListener('mouseleave', hideTip);
        box.appendChild(slot);
        dots.push(slot);
      })(i);
    }
    syncActive();
  }

  function showTip(index, slot) {
    var s = readState();
    var label = '第 ' + (index + 1) + ' 轮';
    var text = s && s.users[index] ? s.users[index] : '';
    if (!text) {
      var el = doc.querySelector('[data-index="' + index + '"]');
      if (el) text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    }
    tip.textContent = text ? label + ' · ' + text.slice(0, 60) : label;
    tip.style.display = 'block';
    var r = (slot || box).getBoundingClientRect();
    var vh = doc.documentElement.clientHeight || 700;
    tip.style.right = (doc.documentElement.clientWidth - r.left + 8) + 'px';
    tip.style.top = Math.max(18, Math.min(vh - 18, r.top + r.height / 2)) + 'px';
  }

  function hideTip() { tip.style.display = 'none'; }

  function jumpTo(index) {
    var s = readState();
    if (!s) return;

    // 1) preferred: the list's own imperative API
    if (s.handle && typeof s.handle.scrollToIndex === 'function') {
      try {
        s.handle.scrollToIndex({ index: index, align: 'start', behavior: 'auto' });
        afterJump(index);
        return;
      } catch (e) { /* fall through to scroll math */ }
    }

    // 2) fallback: proportional scroll + synthetic scroll event so the
    //    virtual list recalculates which rows to render
    var sc = s.sc;
    var span = Math.max(0, sc.scrollHeight - sc.clientHeight);
    var frac = s.total > 1 ? index / (s.total - 1) : 0;
    sc.scrollTop = Math.max(0, Math.min(span, frac * span));
    sc.dispatchEvent(new Event('scroll', { bubbles: true }));
    afterJump(index);
  }

  function afterJump(index) {
    hideTip();
    // Align by adjusting the scroller's own offset instead of calling
    // scrollIntoView: the row may sit inside a virtualized list whose
    // estimated height was still wrong when scrollToIndex ran.
    var tries = 0;
    (function align() {
      var s = readState();
      if (!s) return;
      var scRect = s.sc.getBoundingClientRect();
      var el = doc.querySelector('[data-index="' + index + '"]');
      if (!el) {
        if (tries++ < 8) setTimeout(align, 90);
        return;
      }
      var r = el.getBoundingClientRect();
      var delta = r.top - scRect.top - 1;
      if (Math.abs(delta) > 3 && tries < 4) {
        tries++;
        s.sc.scrollTop += delta;
        s.sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        setTimeout(align, 130);
        return;
      }
      flash(el);
      syncActive();
    })();
  }

  function s_size() {
    return { top: 0, height: doc.documentElement.clientHeight || 700 };
  }

  function flash(el) {
    var old = el.style.outline;
    el.style.outline = '2px solid rgba(120,170,255,.85)';
    el.style.outlineOffset = '-2px';
    setTimeout(function () {
      el.style.outline = old || '';
      el.style.outlineOffset = '';
    }, 1100);
  }

  function syncActive() {
    var s = readState();
    if (!s || !dots.length) return;
    var scRect = s.sc.getBoundingClientRect();
    var mid = scRect.top + scRect.height * 0.45;
    var active = -1;
    var rendered = doc.querySelectorAll('[data-index]');
    for (var i = 0; i < rendered.length; i++) {
      var r = rendered[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) {
        active = +rendered[i].getAttribute('data-index');
        break;
      }
    }
    for (var k = 0; k < dots.length; k++) {
      var idx = +dots[k].getAttribute('data-turn');
      dots[k].classList.toggle('__on', active >= 0 && idx === active);
    }
  }

  var pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; render(); }, 220);
  }

  var mo = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].target === box || box.contains(records[i].target)) continue;
      scheduleRender();
      return;
    }
  });
  try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }

  var scForScroll = findScroller();
  if (scForScroll) {
    scForScroll.addEventListener('scroll', function () {
      if (pending) return;
      scheduleRender();
    }, { passive: true });
  }

  // Chromium throttles timers in background webviews, so also refresh when the
  // panel becomes visible again, not only on the interval.
  window.__tocnavRefresh = function () { render(); return dots.length; };
  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') scheduleRender();
  });

  setInterval(function () {
    if (!doc.getElementById(ID)) return;
    var s = readState();
    if (!s) return;
    var stride = +(box.getAttribute('data-stride') || 1);
    var expect = Math.max(1, Math.ceil(s.total / stride));
    if (expect !== dots.length) scheduleRender();
    else syncActive();
  }, 1200);

  /* ---- preload older history ----
     The chat keeps only the most recent turns in memory and loads older ones
     when the list is scrolled to the top. Without preloading, the navigator
     would show 4-5 ticks while the conversation actually has 10+ turns. */
  var preloading = false;
  function preloadHistory() {
    if (preloading) return;
    preloading = true;
    var last = -1, stable = 0, rounds = 0;

    function step() {
      var st = readState();
      if (!st) { preloading = false; return; }
      if (st.total === last) stable++; else stable = 0;
      last = st.total;

      if (stable >= 2 || rounds >= 40) {
        var sc = st.sc;
        sc.scrollTop = sc.scrollHeight;
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        preloading = false;
        setTimeout(function () { render(); }, 400);
        return;
      }
      rounds++;
      var s2 = st.sc;
      s2.scrollTop = 0;
      s2.dispatchEvent(new Event('scroll', { bubbles: true }));
      setTimeout(step, 700);
    }
    step();
  }

  render();
  setTimeout(preloadHistory, 400);
  window.__tocnavPreload = preloadHistory;

  return {
    ok: true,
    injected: true,
    anchors: dots.length,
    total: st.total,
    strategy: strategy,
    fiberOk: st.fiberOk,
  };
})()
