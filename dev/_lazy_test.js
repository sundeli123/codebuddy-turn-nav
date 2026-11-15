(async function () {
  var d = document.getElementById('active-frame').contentDocument;
  var sc = d.querySelector('[data-testid="virtuoso-scroller"]');
  if (!sc) return 'no-scroller';

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function read() {
    var s = d.querySelector('[data-testid="virtuoso-scroller"]');
    var key = Object.keys(s).filter(function (x) { return x.indexOf('__reactFiber$') === 0; })[0];
    var fb = key ? s[key] : null;
    var total = null, msgs = null, users = null, guard = 0;
    while (fb && guard < 60) {
      var p = fb.memoizedProps;
      if (p) {
        if (total === null && typeof p.totalCount === 'number') total = p.totalCount;
        if (msgs === null && Array.isArray(p.messages)) {
          msgs = p.messages.length;
          users = p.messages.filter(function (m) { return m.messageType === 'user'; }).length;
        }
      }
      fb = fb.return;
      guard++;
    }
    var idx = Array.prototype.map.call(d.querySelectorAll('[data-index]'), function (e) { return +e.getAttribute('data-index'); });
    return {
      total: total, msgs: msgs, users: users,
      scrollTop: Math.round(s.scrollTop),
      scrollHeight: s.scrollHeight,
      rendered: idx.length,
      idxMax: idx.length ? Math.max.apply(null, idx) : -1,
    };
  }

  var out = { start: read() };

  // scroll to top repeatedly: lazy history usually loads on reaching the top
  for (var i = 0; i < 4; i++) {
    var s = d.querySelector('[data-testid="virtuoso-scroller"]');
    s.scrollTop = 0;
    s.dispatchEvent(new Event('scroll', { bubbles: true }));
    await wait(1400);
    out['top' + (i + 1)] = read();
  }

  // restore to bottom
  var s2 = d.querySelector('[data-testid="virtuoso-scroller"]');
  s2.scrollTop = s2.scrollHeight;
  s2.dispatchEvent(new Event('scroll', { bubbles: true }));
  await wait(800);
  out.restored = read();

  return out;
})()
