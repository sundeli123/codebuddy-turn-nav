(function () {
  var d = document.getElementById('active-frame').contentDocument;
  var box = d.getElementById('__tocnav');
  if (!box) return { box: false };
  return {
    box: true,
    version: box.getAttribute('data-v'),
    children: box.children.length,
    slotClassCount: box.querySelectorAll('.__tocnav_slot').length,
    dotClassCount: box.querySelectorAll('.__tocnav_dot').length,
    firstChildClass: box.firstElementChild ? (box.firstElementChild.className || '') : '',
    boxRect: (function () {
      var r = box.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
    })(),
  };
})()
