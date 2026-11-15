(function () {
  var f = document.getElementById('active-frame');
  var d = f && f.contentDocument;
  if (!d) return { error: 'no active-frame', ownText: (document.body.innerText || '').slice(0, 200) };

  var cls = function (el) {
    var c = el.className;
    if (typeof c === 'string') return c;
    if (c && typeof c.baseVal === 'string') return c.baseVal;
    return '';
  };
  var txt = function (el, n) { return ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, n); };

  var out = {
    title: d.title,
    href: d.location.href,
    bodyText: (d.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    editables: [],
    scrollers: [],
    topTree: [],
    classHits: [],
    dataAttrs: {},
    repeated: [],
  };

  Array.prototype.slice.call(d.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]')).forEach(function (e) {
    out.editables.push({
      tag: e.tagName, cls: cls(e).slice(0, 90), role: e.getAttribute('role') || '',
      ph: e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || '',
      h: Math.round(e.getBoundingClientRect().height),
    });
  });

  function walk(root, depth, prefix, arr) {
    if (!root || depth < 0) return;
    Array.prototype.slice.call(root.children, 0, 8).forEach(function (el) {
      var r = el.getBoundingClientRect();
      arr.push(prefix + el.tagName + ' [' + cls(el).slice(0, 70) + '] ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + txt(el, 40) + '"');
      if (depth > 0) walk(el, depth - 1, prefix + '  ', arr);
    });
  }
  walk(d.body, 2, '', out.topTree);

  var all = Array.prototype.slice.call(d.querySelectorAll('*'));
  out.elementCount = all.length;

  all.forEach(function (el) {
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return; }
    if (!/auto|scroll/.test(cs.overflowY)) return;
    if (el.clientHeight < 100) return;
    out.scrollers.push({
      cls: cls(el).slice(0, 90), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      children: el.children.length,
      childSample: Array.prototype.slice.call(el.children, 0, 5).map(function (k) {
        return k.tagName + ' [' + cls(k).slice(0, 60) + '] h=' + Math.round(k.getBoundingClientRect().height) + ' "' + txt(k, 50) + '"';
      }),
    });
  });
  out.scrollers = out.scrollers.slice(0, 6);

  var kw = /(message|msg|chat|turn|bubble|user|assistant|reply|request|response|conversation|markdown|avatar|content)/i;
  var hit = {};
  all.forEach(function (el) {
    var c = cls(el); if (!c || c.length > 300) return;
    c.split(/\s+/).forEach(function (t) { if (kw.test(t)) hit[t] = (hit[t] || 0) + 1; });
  });
  out.classHits = Object.keys(hit).map(function (k) { return k + '(' + hit[k] + ')'; }).sort().slice(0, 40);

  var dc = {};
  all.forEach(function (el) {
    Array.prototype.forEach.call(el.attributes, function (a) {
      if (a.name.indexOf('data-') === 0) dc[a.name] = (dc[a.name] || 0) + 1;
    });
  });
  out.dataAttrs = Object.keys(dc).sort(function (a, b) { return dc[b] - dc[a]; }).slice(0, 20).map(function (k) { return k + '(' + dc[k] + ')'; });

  var shapes = {};
  all.forEach(function (el) {
    var r = el.getBoundingClientRect(); if (r.height < 30 || r.width < 120) return;
    var c = cls(el); if (!c) return;
    var s = el.tagName + '.' + c.split(/\s+/).slice(0, 1).join('.');
    shapes[s] = (shapes[s] || 0) + 1;
  });
  out.repeated = Object.keys(shapes).filter(function (k) { return shapes[k] >= 3; })
    .sort(function (a, b) { return shapes[b] - shapes[a]; }).slice(0, 20).map(function (k) { return k + ' x' + shapes[k]; });

  return out;
})()
