(async function () {
  var d = document.getElementById('active-frame').contentDocument;
  var box = d.getElementById('__tocnav');
  if (!box) return 'no-nav';
  var dots = Array.prototype.slice.call(box.querySelectorAll('.__tocnav_dot'));
  var out = [];

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  for (var i = 0; i < dots.length; i++) {
    var k = +dots[i].getAttribute('data-turn');
    dots[i].click();
    await wait(1000);
    var sc = d.querySelector('[data-testid="virtuoso-scroller"]');
    var el = d.querySelector('[data-index="' + k + '"]');
    var scRect = sc.getBoundingClientRect();
    var rect = el ? el.getBoundingClientRect() : null;
    out.push({
      turn: k + 1,
      rendered: !!el,
      inViewport: !!rect && rect.bottom > scRect.top && rect.top < scRect.bottom,
      topOffset: rect ? Math.round(rect.top - scRect.top) : null,
      text: el ? (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 22) : '',
    });
  }

  // leave the view at the newest turn
  if (dots.length) { dots[dots.length - 1].click(); await wait(600); }
  return out;
})()
