(function () {
  var out = { href: (location.href || '').slice(0, 70), hasFrame: false };
  var f = document.getElementById('active-frame');
  out.hasFrame = !!f;
  if (!f) return out;

  var d = f.contentDocument;
  out.hasDoc = !!d;
  if (!d) return out;

  out.frameTitle = d.title;
  out.bodyText = ((d.body && d.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 60);
  out.navPresent = !!d.getElementById('__tocnav');

  var sc = d.querySelector('[data-testid="virtuoso-scroller"]');
  out.hasScroller = !!sc;
  if (!sc) return out;

  var k = Object.keys(sc).filter(function (x) { return x.indexOf('__reactFiber$') === 0; })[0];
  out.hasFiber = !!k;
  var fb = k ? sc[k] : null;
  var total = null, hasHandle = false, guard = 0;
  while (fb && guard < 50) {
    var p = fb.memoizedProps;
    if (p && typeof p.totalCount === 'number') total = p.totalCount;
    if (fb.ref && fb.ref.current && typeof fb.ref.current.scrollToIndex === 'function') hasHandle = true;
    fb = fb.return;
    guard++;
  }
  out.total = total;
  out.hasHandle = hasHandle;
  out.rendered = d.querySelectorAll('[data-index]').length;
  return out;
})()
