(function () {
  var f = document.getElementById('active-frame');
  var d = f && f.contentDocument;
  if (!d) return { error: 'no active-frame' };

  var cls = function (el) { var c = el.className; return (typeof c === 'string' ? c : (c && c.baseVal) || ''); };
  var txt = function (el, n) { return ((el.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, n); };

  var out = {};

  // 1) scroll container + its inline tree
  var sc = d.querySelector('[class*="chatMessage_"]');
  out.scrollContainer = null;
  if (sc) {
    out.scrollContainer = {
      cls: cls(sc).slice(0, 80),
      tag: sc.tagName,
      scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight,
    };
    var tree = [];
    (function walk(el, depth) {
      if (depth > 5) return;
      Array.prototype.slice.call(el.children, 0, 6).forEach(function (k) {
        var r = k.getBoundingClientRect();
        var attrs = '';
        ['data-index', 'data-item-index', 'data-known-size', 'data-testid', 'role'].forEach(function (a) {
          var v = k.getAttribute(a); if (v !== null) attrs += ' ' + a + '=' + v;
        });
        tree.push('  '.repeat(depth) + k.tagName + ' [' + cls(k).slice(0, 70) + ']' + attrs +
          ' h=' + Math.round(r.height) + ' top=' + Math.round(r.top) + ' "' + txt(k, 30) + '"');
        walk(k, depth + 1);
      });
    })(sc, 0);
    out.tree = tree;
  }

  // 2) message items
  function collect(sel) {
    return Array.prototype.slice.call(d.querySelectorAll(sel)).map(function (el) {
      var r = el.getBoundingClientRect();
      return { cls: cls(el).slice(0, 70), h: Math.round(r.height), top: Math.round(r.top), text: txt(el, 50) };
    });
  }
  out.userMessages = collect('[class*="userMessage_"]');
  out.assistantMessages = collect('[class*="assistantMessage_"]');
  out.groups = collect('[class*="group-messages"]');
  out.avatars = collect('[class*="avatar-container"]');

  // 3) virtualization markers
  out.virtualItems = Array.prototype.slice.call(d.querySelectorAll('[data-item-index], [data-index]')).map(function (el) {
    var r = el.getBoundingClientRect();
    return {
      attrs: 'item-index=' + el.getAttribute('data-item-index') + ' index=' + el.getAttribute('data-index') +
        ' known=' + el.getAttribute('data-known-size'),
      h: Math.round(r.height), top: Math.round(r.top),
      cls: cls(el).slice(0, 60), text: txt(el, 40),
    };
  }).slice(0, 20);

  // 4) counts
  out.counts = {
    user: d.querySelectorAll('[class*="userMessage_"]').length,
    assistant: d.querySelectorAll('[class*="assistantMessage_"]').length,
    groups: d.querySelectorAll('[class*="group-messages"]').length,
  };

  return out;
})()
