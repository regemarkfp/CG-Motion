/* CG Motion - the update timeline: a short timeline of its own per layer that plays when the layer's field changes.
   Channels are offsets from the layer's normal look; the blue update marker is the frame where the new value appears. */
var UpdAnim = {
  CH: [
    ['dx', 'Position X', 'px', 0, 1], ['dy', 'Position Y', 'px', 0, 1], ['sc', 'Scale', '%', 100, 1], ['scy', 'Scale Y', '%', 100, 1],
    ['rot', 'Rotation', '°', 0, 1], ['op', 'Opacity', '%', 100, 1], ['blur', 'Blur', 'px', 0, 0.5]
  ],
  EASES: [['ease', 'Ease in and out'], ['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out'], ['hold', 'Hold (jump)']],
  win: null
};

/* keyframes that reproduce the presets, as a starting point */
UpdAnim.fromPreset = function (name, len, dist) {
  var h = Math.round(len / 2), k = {}, sw = h;
  dist = dist == null ? 40 : dist;
  function ch(c, keys) { k[c] = keys.map(function (q) { return { t: q[0], v: q[1], e: q[2] || 'ease' }; }); }
  var slide = { slideUp: ['dy', -1], slideDown: ['dy', 1], slideLeft: ['dx', -1], slideRight: ['dx', 1] }[name];
  if (slide) {
    ch(slide[0], [[0, 0], [h, slide[1] * dist, 'hold'], [h, -slide[1] * dist], [len, 0]]);
    ch('op', [[0, 100], [h, 0, 'hold'], [h, 0], [len, 100]]);
  } else if (name === 'fade') ch('op', [[0, 100], [h, 0], [len, 100]]);
  else if (name === 'pop') { ch('sc', [[0, 100], [h, 118], [len, 100]]); sw = 0; }
  else if (name === 'flip') ch('scy', [[0, 100], [h, 0], [len, 100]]);
  else if (name === 'flash') { var q = Math.round(len / 4); ch('op', [[0, 100], [q, 15], [h, 100], [h + q, 15], [len, 100]]); sw = 0; }
  else if (name === 'spin') { ch('rot', [[0, 0], [len, 360]]); ch('sc', [[0, 100], [h, 80], [len, 100]]); }
  else if (name === 'blur') { ch('blur', [[0, 0], [h, 12], [len, 0]]); ch('op', [[0, 100], [h, 40], [len, 100]]); }
  return { len: len, swap: sw, k: k };
};

UpdAnim.layer = function (id) { var f = null; App.allLayers(function (L) { if (L.id === id) f = L; }); return f; };
UpdAnim.tl = function (L) {
  L.upd = L.upd || { preset: 'custom', dur: 15 };
  if (!L.upd.tl) L.upd.tl = UpdAnim.fromPreset('slideUp', 25, 40);
  L.upd.tl.k = L.upd.tl.k || {};
  return L.upd.tl;
};
UpdAnim.value = function (tl, c, f) { var d = UpdAnim.CH.filter(function (x) { return x[0] === c; })[0]; return RT.updKey((tl.k || {})[c], f, d ? d[3] : 0); };

UpdAnim.close = function () {
  if (UpdAnim.win && UpdAnim.win.parentNode) UpdAnim.win.parentNode.removeChild(UpdAnim.win);
  UpdAnim.win = null;
  if (Stage.player) { Stage.player.updScrub = null; }
  Stage.render();
};

UpdAnim.open = function (layerId) {
  UpdAnim.close();
  var L = UpdAnim.layer(layerId); if (!L || !L.key) return;
  var tl = UpdAnim.tl(L), f = 0, sel = null, playing = false;
  var win = h('div', { class: 'upd-win' }), body = h('div', { class: 'upd-body' });
  UpdAnim.win = win;
  function lay() { return UpdAnim.layer(layerId); }
  function T() { var l = lay(); return l ? UpdAnim.tl(l) : tl; }
  function scrub() { if (Stage.player && !playing) { Stage.player.updScrub = { id: layerId, frame: f }; Stage.render(); } }
  function changed(commit) { if (commit) App.commit(); else App.touch(); scrub(); }

  /* header: drag to move */
  var head = h('div', { class: 'upd-head' }, [h('b', { text: 'Update animation: ' + L.name }), h('span', { class: 'hint', text: '  plays when ' + L.key + ' changes' }), h('span', { class: 'grow' }), h('button', { text: '×', title: 'Close', onclick: UpdAnim.close })]);
  head.addEventListener('mousedown', function (e) {
    if (e.target.tagName === 'BUTTON') return;
    var r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    function mv(ev) { win.style.left = (ev.clientX - dx) + 'px'; win.style.top = (ev.clientY - dy) + 'px'; win.style.bottom = 'auto'; win.style.transform = 'none'; }
    function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });

  function draw() {
    var t = T(), len = Math.max(1, Math.round(+t.len || 25));
    f = Math.max(0, Math.min(len, f));
    body.innerHTML = '';
    /* tools */
    var lenIn = h('input', { type: 'number', value: len, min: 1, step: 1, title: 'Length of the update animation in frames' });
    lenIn.addEventListener('change', function () { var v = Math.max(1, Math.round(+lenIn.value || 25)), old = len; T().len = v; var sc = v / old; for (var c in T().k) T().k[c].forEach(function (q) { q.t = Math.round(q.t * sc * 10) / 10; }); T().swap = Math.round((+T().swap || 0) * sc); changed(true); draw(); });
    var pre = h('select', { title: 'Replace the keyframes with a preset, then adjust them' }, [['', 'Start from a preset...'], ['slideUp', 'Slide up'], ['slideDown', 'Slide down'], ['slideLeft', 'Slide left'], ['slideRight', 'Slide right'], ['fade', 'Fade out and in'], ['pop', 'Pop'], ['flip', 'Flip'], ['flash', 'Flash'], ['spin', 'Spin'], ['blur', 'Blur through']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    pre.addEventListener('change', function () { if (!pre.value) return; var n = UpdAnim.fromPreset(pre.value, len, 40), l = lay(); l.upd.tl = n; sel = null; changed(true); draw(); });
    var play = h('button', { class: 'primary', text: '▶ Play', title: 'Send a new value in the viewer and play the whole animation, as CasparCG will' });
    play.addEventListener('click', function () { UpdAnim.play(layerId); });
    body.appendChild(h('div', { class: 'upd-tools' }, [h('label', { text: 'Length' }), lenIn, h('span', { class: 'hint', text: 'frames' }), pre, h('span', { class: 'grow' }), play]));

    /* the timeline */
    var grid = h('div', { class: 'upd-grid' }), W = 460;
    function px(fr) { return fr / len * W; }
    function frAt(ev, el) { var r = el.getBoundingClientRect(); return Math.max(0, Math.min(len, Math.round((ev.clientX - r.left) / r.width * len))); }
    var ruler = h('div', { class: 'upd-ruler', style: 'width:' + W + 'px' });
    var step = len > 60 ? 10 : 5;
    for (var q = 0; q <= len; q += step) ruler.appendChild(h('span', { class: 'upd-tick', style: 'left:' + px(q) + 'px', text: String(q) }));
    var mark = h('span', { class: 'upd-mark', style: 'left:' + px(+t.swap || 0) + 'px', title: 'Update marker: the new value appears at this frame. Drag to move.', text: 'update' });
    ruler.appendChild(mark);
    var ph = h('div', { class: 'upd-ph', style: 'left:' + px(f) + 'px' });
    ruler.addEventListener('mousedown', function (e) {
      if (e.target === mark) {
        var mv0 = function (ev) { T().swap = frAt(ev, ruler); mark.style.left = px(T().swap) + 'px'; App.touch(); };
        var up0 = function () { window.removeEventListener('mousemove', mv0); window.removeEventListener('mouseup', up0); App.commit(); draw(); };
        window.addEventListener('mousemove', mv0); window.addEventListener('mouseup', up0); return;
      }
      f = frAt(e, ruler); draw(); scrub();
      var mv = function (ev) { f = frAt(ev, ruler); draw(); scrub(); };
      var up = function () { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    grid.appendChild(h('div', { class: 'upd-row upd-rhead' }, [h('span', { class: 'upd-name', text: 'Frame ' + f }), h('span', { class: 'upd-val' }), h('span', { class: 'upd-kb' }), h('div', { class: 'upd-trackwrap' }, [ruler])]));

    UpdAnim.CH.forEach(function (d) {
      var c = d[0], keys = (t.k[c] = t.k[c] || []), cur = UpdAnim.value(t, c, f);
      var atKey = keys.findIndex(function (q) { return Math.abs(q.t - f) < 0.05; });
      var vin = h('input', { type: 'number', value: Math.round(cur * 10) / 10, step: d[4], title: d[1] + ' at frame ' + f + ' (' + d[2] + '). Typing a value adds a keyframe here.' });
      vin.addEventListener('change', function () {
        var v = parseFloat(vin.value); if (isNaN(v)) return;
        var i = keys.findIndex(function (q) { return Math.abs(q.t - f) < 0.05; });
        if (i >= 0) keys[i].v = v; else { keys.push({ t: f, v: v, e: 'ease' }); keys.sort(function (a, b) { return a.t - b.t; }); }
        changed(true); draw();
      });
      var kb = h('button', { class: 'upd-kbtn' + (atKey >= 0 ? ' on' : ''), text: '◆', title: atKey >= 0 ? 'Remove the keyframe at this frame' : 'Add a keyframe at this frame' });
      kb.addEventListener('click', function () {
        if (atKey >= 0) keys.splice(atKey, 1); else { keys.push({ t: f, v: cur, e: 'ease' }); keys.sort(function (a, b) { return a.t - b.t; }); }
        sel = null; changed(true); draw();
      });
      var track = h('div', { class: 'upd-track', style: 'width:' + W + 'px' });
      if (keys.length > 1) {
        for (var i = 0; i < keys.length - 1; i++) if (keys[i + 1].t > keys[i].t && Math.abs(keys[i + 1].v - keys[i].v) > 1e-9 && keys[i].e !== 'hold') track.appendChild(h('span', { class: 'upd-seg', style: 'left:' + px(keys[i].t) + 'px;width:' + px(keys[i + 1].t - keys[i].t) + 'px' }));
      }
      keys.forEach(function (q, i) {
        var dm = h('span', { class: 'upd-key' + (sel && sel.c === c && sel.i === i ? ' sel' : '') + (q.e === 'hold' ? ' hold' : ''), style: 'left:' + px(q.t) + 'px', title: d[1] + ' ' + q.v + d[2] + ' at frame ' + q.t + ' - drag to move, double-click to delete' });
        dm.addEventListener('mousedown', function (e) {
          e.stopPropagation(); sel = { c: c, i: i }; f = Math.round(q.t); var moved = false;
          var mv = function (ev) { q.t = frAt(ev, track); dm.style.left = px(q.t) + 'px'; moved = true; App.touch(); };
          var up = function () { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (moved) { keys.sort(function (a, b) { return a.t - b.t; }); sel = { c: c, i: keys.indexOf(q) }; f = Math.round(q.t); App.commit(); } draw(); scrub(); };
          window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        });
        dm.addEventListener('dblclick', function (e) { e.stopPropagation(); keys.splice(keys.indexOf(q), 1); sel = null; changed(true); draw(); });
        track.appendChild(dm);
      });
      track.addEventListener('mousedown', function (e) { f = frAt(e, track); sel = null; draw(); scrub(); });
      grid.appendChild(h('div', { class: 'upd-row' + (keys.length ? ' has' : '') }, [h('span', { class: 'upd-name', text: d[1] }), h('span', { class: 'upd-val' }, [vin, h('i', { text: d[2] })]), kb, h('div', { class: 'upd-trackwrap' }, [track])]));
    });
    grid.appendChild(ph);
    ph.style.left = 'calc(' + (150 + 92 + 26) + 'px + ' + px(f) + 'px)';
    var ml = h('div', { class: 'upd-mline' }); ml.style.left = 'calc(' + (150 + 92 + 26) + 'px + ' + px(+t.swap || 0) + 'px)'; grid.appendChild(ml);
    body.appendChild(grid);

    /* the selected keyframe */
    var sk = sel && t.k[sel.c] && t.k[sel.c][sel.i];
    if (sk) {
      var es = h('select', {}, UpdAnim.EASES.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      es.value = sk.e || 'ease';
      es.addEventListener('change', function () { sk.e = es.value; changed(true); draw(); });
      var dn = UpdAnim.CH.filter(function (x) { return x[0] === sel.c; })[0];
      body.appendChild(h('div', { class: 'upd-tools' }, [h('span', { text: dn[1] + ' key at frame ' + sk.t + ':  easing to the next key' }), es, h('button', { text: 'Delete key', onclick: function () { t.k[sel.c].splice(sel.i, 1); sel = null; changed(true); draw(); } })]));
    }
    body.appendChild(h('p', { class: 'hint', text: 'Values are offsets from the layer’s normal look, so the animation works wherever the layer is on the main timeline. The new value appears at the blue update marker (frame ' + (+t.swap || 0) + '). Click a track to move the playhead; the viewer shows that frame.' }));
  }
  win.appendChild(head); win.appendChild(body);
  UI.doc.body.appendChild(win);
  win.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') UpdAnim.close(); });
  draw(); scrub();
};

/* play the update animation in the viewer with a new test value */
UpdAnim.play = function (layerId) {
  var L = UpdAnim.layer(layerId); if (!L || !L.key) return;
  var pl = Stage.player; if (pl) pl.updScrub = null;
  var cur = App.testData[L.key] != null ? App.testData[L.key] : (L.type === 'text' ? L.text : '');
  var next = /^\s*-?\d+(\.\d+)?\s*$/.test(String(cur)) ? String(+cur + 1) : (String(cur) === 'Updated' ? 'Changed again' : 'Updated');
  Stage.live('update', { key: L.key, value: next });
  var len = (L.upd && L.upd.preset === 'custom' && L.upd.tl ? +L.upd.tl.len || 25 : +(L.upd || {}).dur || 15) / App.comp().fps;
  if (UpdAnim.win) setTimeout(function () { if (UpdAnim.win && Stage.player) { Stage.player.updScrub = { id: layerId, frame: 0 }; } }, len * 1000 + 150);
};
