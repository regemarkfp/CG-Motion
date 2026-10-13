/* CG Motion - timeline: layers, bars, keyframes, markers */
var Timeline = { rows: [], RH: 24 };

Timeline.init = function () {
  var T = Timeline;
  T.left = $('#tl-left'); T.tracks = $('#tl-tracks'); T.inner = $('#tl-inner'); T.ruler = $('#tl-ruler'); T.rwrap = $('#tl-ruler-wrap');
  T.tracks.addEventListener('scroll', function () { T.left.scrollTop = T.tracks.scrollTop; T.rwrap.scrollLeft = T.tracks.scrollLeft; });
  T.left.addEventListener('wheel', function (e) { T.tracks.scrollTop += e.deltaY; });
  T.tracks.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    Timeline.setZoom(App.ui.pxf * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  }, { passive: false });
  T.left.addEventListener('mousedown', T.leftDown);
  T.left.addEventListener('change', T.leftChange);
  T.left.addEventListener('dblclick', T.leftDbl);
  T.tracks.addEventListener('mousedown', T.trackDown);
  T.ruler.addEventListener('mousedown', T.rulerDown);
  T.ruler.addEventListener('dblclick', function (e) {
    var m = e.target.closest('.mk'), lp = e.target.closest('.lp');
    if (m) { App.comp().markers.splice(+m.dataset.i, 1); App.commit(); }
    else if (lp) { App.comp().loops.splice(+lp.dataset.i, 1); App.commit(); }
  });
  $('#tl-zoom').addEventListener('input', function () { Timeline.setZoom(+this.value); });
  $('#tl-frame').addEventListener('change', function () { App.setTime(+this.value || 0); });
  $('#comp-select').addEventListener('change', function () { App.openComp(this.value); });
  App.on('change', T.build); App.on('sel', T.build); App.on('time', T.sync);
  App.on('play', function () { $('#btn-play').textContent = App.playing ? 'Pause' : 'Play'; });
};

Timeline.setZoom = function (v) {
  App.ui.pxf = clamp(v, 1, 40);
  $('#tl-zoom').value = App.ui.pxf;
  Timeline.build();
};

Timeline.rowProps = function (L) {
  var basic = ['x', 'y', 'w', 'h', 'sx', 'sy', 'rot', 'op'], all = PROPS.transform.concat(PROPS[L.type] || [], PROPS.mask, PROPS.fx);
  return all.filter(function (n) { return (basic.indexOf(n) >= 0 && !((n === 'w' || n === 'h') && !App.isSized(L))) || !!L.a[n]; });
};

Timeline.fmt = function (v) {
  return typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
};

Timeline.build = function () {
  if (!App.project) return;
  var T = Timeline, c = App.comp(), pxf = App.ui.pxf, rows = [], lh = '', th = '', tcur = Math.round(App.time);
  if (T.left.contains(UI.active()) && UI.active().tagName === 'INPUT') { T.pending = true; return; }
  T.pending = false;
  var W = c.duration * pxf + 300;
  c.layers.forEach(function (L) {
    rows.push({ L: L });
    var sel = App.sel.indexOf(L.id) >= 0, exp = !!App.ui.expanded[L.id];
    var opts = '<option value="">None</option>';
    c.layers.forEach(function (o) {
      if (o === L) return;
      var p = o, guard = 0, bad = false;
      while (p && guard++ < 50) { if (p.parent === L.id) { bad = true; break; } p = p.parent ? App.layer(p.parent) : null; }
      if (!bad) opts += '<option value="' + o.id + '"' + (L.parent === o.id ? ' selected' : '') + '>' + esc(o.name) + '</option>';
    });
    lh += '<div class="tl-row layer' + (sel ? ' sel' : '') + '" data-id="' + L.id + '">' +
      '<span class="tw" data-act="twirl" title="Show properties">' + (exp ? '▾' : '▸') + '</span>' +
      '<span class="eye' + (L.visible === false ? '' : ' on') + '" data-act="eye" title="Visible"></span>' +
      '<span class="lock' + (L.locked ? ' on' : '') + '" data-act="lock" title="Lock"></span>' +
      '<span class="chip t-' + L.type + '" title="' + TYPE_NAMES[L.type] + '"></span>' +
      '<span class="nm" title="Double-click to rename">' + esc(L.name) + (L.key ? ' <em>' + esc(L.key) + '</em>' : '') + (L.matte ? ' <em class="mt">matted</em>' : '') + '</span>' +
      '<select class="par" data-act="parent" title="Parent">' + opts + '</select></div>';
    var ticks = '', seen = {};
    if (!exp) for (var n in L.a) L.a[n].forEach(function (k) { if (!seen[k.t]) { seen[k.t] = 1; ticks += '<u style="left:' + (k.t * pxf) + 'px"></u>'; } });
    th += '<div class="tr-row layer' + (sel ? ' sel' : '') + '" data-id="' + L.id + '"><div class="bar t-' + L.type + '" style="left:' + (L.start * pxf) + 'px;width:' + Math.max(2, (L.end - L.start) * pxf) + 'px"><i class="hl"></i><i class="hr"></i></div>' + ticks + '</div>';
    if (exp) {
      T.rowProps(L).forEach(function (n) {
        rows.push({ L: L, prop: n });
        var an = !!L.a[n], v = App.val(L, n), onKey = an && !!App.keyAt(L, n, tcur);
        lh += '<div class="tl-row prop" data-id="' + L.id + '" data-prop="' + n + '">' +
          '<span class="sw' + (an ? ' on' : '') + '" data-act="sw" title="Toggle animation"></span>' +
          '<span class="pn">' + LABELS[n] + '</span>' +
          '<input class="pv" ' + (RT.COLOR_PROPS[n] ? 'type="text"' : 'type="number" step="any"') + ' value="' + esc(T.fmt(v)) + '">' +
          '<span class="nav" data-act="prev" title="Previous keyframe">‹</span>' +
          '<span class="kd' + (onKey ? ' on' : '') + '" data-act="key" title="Add or remove keyframe"></span>' +
          '<span class="nav" data-act="next" title="Next keyframe">›</span></div>';
        var ks = '';
        (L.a[n] || []).forEach(function (k, i) {
          var cls = k.e && k.e.type === 'hold' ? ' hold' : (k.e && (k.e.type === 'bezier' || k.e.type === 'preset') ? ' bez' : '');
          ks += '<b class="kf' + cls + (App.selKeys.indexOf(k) >= 0 ? ' sel' : '') + '" data-k="' + i + '" style="left:' + (k.t * pxf) + 'px"></b>';
        });
        th += '<div class="tr-row prop" data-id="' + L.id + '" data-prop="' + n + '">' + ks + '</div>';
      });
    }
  });
  T.rows = rows;
  T.left.innerHTML = lh + '<div style="height:40px"></div>';
  T.inner.style.width = W + 'px';
  T.inner.innerHTML = th + '<div style="height:40px"></div><div id="tl-end" style="left:' + (c.duration * pxf) + 'px"></div>' + c.markers.map(function (m) { return '<div class="mline" style="left:' + (m.t * pxf) + 'px"></div>'; }).join('') + '<div id="tl-ph"></div><div id="tl-marq"></div>';
  T.left.scrollTop = T.tracks.scrollTop;

  /* ruler */
  var steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000], step = 1000, i, r = '';
  for (i = 0; i < steps.length; i++) if (steps[i] * pxf >= 56) { step = steps[i]; break; }
  for (i = 0; i <= c.duration; i += step) r += '<span class="tick" style="left:' + (i * pxf) + 'px">' + i + '</span>';
  (App.project.actions || []).forEach(function (a) {
    var show = (a.target === 'main' || !a.target) ? (a.comp ? a.comp === App.compId : App.compId === App.project.rootComp) : false;
    if (!show) App.allLayers(function (L) { if (L.id === a.target && L.comp === App.compId) show = true; });
    if (!show) return;
    var f0 = Math.min(a.from, a.to), f1 = Math.max(a.from, a.to);
    r += '<span class="band" style="left:' + (f0 * pxf) + 'px;width:' + Math.max(3, (f1 - f0) * pxf) + 'px" title="Invoke: ' + esc(a.name) + '">' + (a.loop ? '\u21BB ' : '') + esc(a.name) + '</span>';
  });
  (c.loops || []).forEach(function (lp, ix) {
    r += '<span class="lp" data-i="' + ix + '" style="left:' + (lp.from * pxf) + 'px;width:' + Math.max(8, (lp.to - lp.from) * pxf) + 'px" title="Repeat section (frames ' + lp.from + ' to ' + lp.to + '): on air the timeline circles here until next, stop or another invoke. Drag to move, drag an end to resize, double-click to delete.">\u21BB repeat</span>';
  });
  c.markers.forEach(function (m, ix) { r += '<span class="mk" data-i="' + ix + '" style="left:' + (m.t * pxf) + 'px" title="Stop marker - drag to move, double-click to delete">' + esc(m.name || 'stop') + '</span>'; });
  r += '<div id="tl-phh"></div>';
  T.ruler.style.width = W + 'px';
  T.ruler.innerHTML = r;

  var cs = $('#comp-select');
  cs.innerHTML = App.project.comps.map(function (k) { return '<option value="' + k.id + '"' + (k.id === c.id ? ' selected' : '') + '>' + esc(k.name) + (k.id === App.project.rootComp ? ' (main)' : '') + '</option>'; }).join('');
  T.sync(true);
};

Timeline.sync = function (built) {
  if (!App.project) return;
  var T = Timeline, c = App.comp(), x = App.time * App.ui.pxf;
  var ph = $('#tl-ph'), phh = $('#tl-phh');
  if (ph) ph.style.left = x + 'px';
  if (phh) phh.style.left = x + 'px';
  var f = App.time, s = Math.floor(f / c.fps), ff = Math.round(f - s * c.fps);
  $('#tl-time').textContent = (s < 10 ? '0' : '') + s + ':' + (ff < 10 ? '0' : '') + ff + '  /  ' + c.duration + 'f @ ' + c.fps;
  var fi = $('#tl-frame');
  if (UI.active() !== fi) fi.value = f;
  if (App.playing || App.liveMode) {
    var sl = T.tracks.scrollLeft, w = T.tracks.clientWidth;
    if (x < sl || x > sl + w - 40) T.tracks.scrollLeft = Math.max(0, x - 80);
  }
  if (built === true) return;
  var tcur = Math.round(App.time), rows = T.left.querySelectorAll('.tl-row.prop');
  for (var i = 0; i < rows.length; i++) {
    var L = App.layer(rows[i].dataset.id), n = rows[i].dataset.prop;
    if (!L) continue;
    var inp = rows[i].querySelector('.pv');
    if (inp !== UI.active()) inp.value = T.fmt(App.val(L, n));
    rows[i].querySelector('.kd').classList.toggle('on', !!(L.a[n] && App.keyAt(L, n, tcur)));
  }
};

Timeline.frameAt = function (e) {
  var r = Timeline.inner.getBoundingClientRect();
  return (e.clientX - r.left) / App.ui.pxf;
};

/* click selects one layer; Shift + click selects every layer between the last clicked one and this one;
   Ctrl + click adds or removes one; Ctrl + Shift + click adds the range to what is already selected */
Timeline.selectLayer = function (L, e) {
  var ls = App.comp().layers, anc = Timeline.anchor && App.layer(Timeline.anchor) ? Timeline.anchor : (App.sel.length ? App.sel[App.sel.length - 1] : null);
  var ai = -1, bi = -1, k;
  for (k = 0; k < ls.length; k++) { if (ls[k].id === anc) ai = k; if (ls[k].id === L.id) bi = k; }
  if (e.shiftKey && ai >= 0 && bi >= 0) {
    var range = ls.slice(Math.min(ai, bi), Math.max(ai, bi) + 1).map(function (x) { return x.id; });
    if (e.ctrlKey || e.metaKey) range.forEach(function (id) { if (App.sel.indexOf(id) < 0) App.sel.push(id); });
    else App.sel = range;
    App.emit('sel');
    return;
  }
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    var i = App.sel.indexOf(L.id);
    if (i >= 0) App.sel.splice(i, 1); else App.sel.push(L.id);
  } else if (App.sel.indexOf(L.id) < 0 || App.sel.length > 1) App.sel = [L.id];
  Timeline.anchor = L.id;
  App.emit('sel');
};

Timeline.leftDown = function (e) {
  if (e.button !== 0) return;
  var row = e.target.closest('.tl-row');
  if (!row) { App.sel = []; App.selKeys = []; App.emit('sel'); return; }
  var L = App.layer(row.dataset.id), act = e.target.dataset.act, n = row.dataset.prop;
  if (!L) return;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (act === 'twirl') { App.ui.expanded[L.id] = !App.ui.expanded[L.id]; Timeline.build(); return; }
  if (act === 'eye') { L.visible = L.visible === false; App.commit(); return; }
  if (act === 'lock') { L.locked = !L.locked; App.commit(); return; }
  if (act === 'sw') { App.toggleAnim(L, n); App.commit(); return; }
  if (act === 'key') { App.toggleKey(L, n); App.commit(); return; }
  if (act === 'prev' || act === 'next') {
    var ks = (L.a[n] || []).map(function (k) { return k.t; }), t = App.time, target = null;
    if (act === 'prev') ks.forEach(function (k) { if (k < t) target = k; });
    else for (var i = ks.length - 1; i >= 0; i--) if (ks[i] > t) target = ks[i];
    if (target != null) App.setTime(target);
    return;
  }
  e.preventDefault();
  if (UI.active() && UI.active().blur) UI.active().blur();
  Timeline.selectLayer(L, e);
  if (n) return;
  /* drag to reorder */
  var y0 = e.clientY, c = App.comp(), moved = false, line = null, to = -1;
  dragLoop(function (ev) {
    if (!moved && Math.abs(ev.clientY - y0) < 5) return;
    moved = true;
    var rows = Timeline.left.querySelectorAll('.tl-row.layer'), best = rows.length, i;
    for (i = 0; i < rows.length; i++) { var r = rows[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { best = i; break; } }
    to = best;
    if (!line) { line = h('div', { class: 'tl-drop' }); UI.doc.body.appendChild(line); }
    var ref = rows[Math.min(best, rows.length - 1)].getBoundingClientRect(), lr = Timeline.left.getBoundingClientRect();
    line.style.cssText = 'left:' + lr.left + 'px;width:' + lr.width + 'px;top:' + (best >= rows.length ? ref.bottom : ref.top) + 'px';
  }, function () {
    if (line && line.parentNode) line.parentNode.removeChild(line);
    if (!moved || to < 0) return;
    var sel = App.selLayers(), before = c.layers[to], rest = c.layers.filter(function (x) { return sel.indexOf(x) < 0; });
    while (before && sel.indexOf(before) >= 0) before = c.layers[c.layers.indexOf(before) + 1];
    var at = before ? rest.indexOf(before) : rest.length;
    c.layers = rest.slice(0, at).concat(sel, rest.slice(at));
    App.commit();
  });
};

Timeline.leftChange = function (e) {
  var row = e.target.closest('.tl-row');
  if (!row) return;
  var L = App.layer(row.dataset.id), n = row.dataset.prop;
  if (!L) return;
  if (e.target.dataset.act === 'parent') { Inspector.setParent(L, e.target.value); App.commit(); return; }
  if (e.target.classList.contains('pv')) {
    var v = e.target.value;
    if (RT.COLOR_PROPS[n]) { if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return; if (v.length === 7) v += 'ff'; }
    else { v = parseFloat(v); if (isNaN(v)) return; }
    App.setProp(L, n, v);
    e.target.blur();
    App.commit();
  }
};

Timeline.leftDbl = function (e) {
  var row = e.target.closest('.tl-row.layer');
  if (!row || !e.target.closest('.nm')) return;
  var L = App.layer(row.dataset.id);
  UI.prompt('Rename layer', L.name).then(function (v) { if (v) { L.name = v; App.commit(); } });
};

Timeline.trackDown = function (e) {
  if (e.button !== 0) return;
  var T = Timeline, tgt = e.target, row = tgt.closest('.tr-row'), f0 = T.frameAt(e), moved = false;
  if (e.clientX > T.tracks.getBoundingClientRect().left + T.tracks.clientWidth || e.clientY > T.tracks.getBoundingClientRect().top + T.tracks.clientHeight) return;
  if (UI.active() && UI.active().blur) UI.active().blur();
  e.preventDefault();
  var L = row ? App.layer(row.dataset.id) : null;
  if (tgt.classList.contains('kf') && L) {
    var k = L.a[row.dataset.prop][+tgt.dataset.k], ix = App.selKeys.indexOf(k);
    if (e.shiftKey || e.ctrlKey) { if (ix >= 0) App.selKeys.splice(ix, 1); else App.selKeys.push(k); }
    else if (ix < 0) App.selKeys = [k];
    if (App.sel.indexOf(L.id) < 0) App.sel = [L.id];
    App.emit('sel');
    var orig = App.selKeys.map(function (q) { return q.t; });
    dragLoop(function (ev) {
      var d = Math.round(T.frameAt(ev) - f0);
      if (!moved && d === 0) return;
      moved = true;
      var min = Math.min.apply(null, orig);
      if (min + d < 0) d = -min;
      App.selKeys.forEach(function (q, i) { q.t = orig[i] + d; });
      App.touch();
    }, function () { if (moved) { App.normalizeKeys(); App.commit(); } });
    return;
  }
  if ((tgt.classList.contains('hl') || tgt.classList.contains('hr')) && L) {
    var left = tgt.classList.contains('hl'), s0 = L.start, e0 = L.end;
    T.selectLayer(L, e);
    dragLoop(function (ev) {
      var d = Math.round(T.frameAt(ev) - f0);
      moved = true;
      if (left) L.start = clamp(s0 + d, 0, L.end - 1); else L.end = Math.max(L.start + 1, e0 + d);
      App.touch();
    }, function () { if (moved) App.commit(); });
    return;
  }
  if (tgt.closest('.bar') && L) {
    T.selectLayer(L, e);
    var ls = App.selLayers().map(function (q) {
      var keys = []; for (var n in q.a) q.a[n].forEach(function (k) { keys.push([k, k.t]); });
      return { L: q, s: q.start, e: q.end, keys: keys };
    });
    dragLoop(function (ev) {
      var d = Math.round(T.frameAt(ev) - f0);
      if (!moved && d === 0) return;
      moved = true;
      ls.forEach(function (o) { o.L.start = o.s + d; o.L.end = o.e + d; o.keys.forEach(function (p) { p[0].t = p[1] + d; }); });
      App.touch();
    }, function () { if (moved) App.commit(); });
    return;
  }
  /* empty space: marquee-select keyframes */
  var ir = T.inner.getBoundingClientRect(), x0 = e.clientX - ir.left, y0 = e.clientY - ir.top;
  dragLoop(function (ev) {
    var r2 = T.inner.getBoundingClientRect(), x1 = ev.clientX - r2.left, y1 = ev.clientY - r2.top, mq = $('#tl-marq');
    moved = true;
    if (mq) mq.style.cssText = 'display:block;left:' + Math.min(x0, x1) + 'px;top:' + Math.min(y0, y1) + 'px;width:' + Math.abs(x1 - x0) + 'px;height:' + Math.abs(y1 - y0) + 'px';
    T.mq = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  }, function () {
    var keys = e.shiftKey ? App.selKeys.slice() : [];
    if (moved && T.mq) {
      T.rows.forEach(function (rw, i) {
        if (!rw.prop || !rw.L.a[rw.prop]) return;
        var cy = i * T.RH + T.RH / 2;
        if (cy < T.mq[1] || cy > T.mq[3]) return;
        rw.L.a[rw.prop].forEach(function (k) { var x = k.t * App.ui.pxf; if (x >= T.mq[0] - 4 && x <= T.mq[2] + 4 && keys.indexOf(k) < 0) keys.push(k); });
      });
    }
    T.mq = null;
    App.selKeys = keys;
    App.emit('sel');
  });
};

Timeline.rulerDown = function (e) {
  if (e.button !== 0) return;
  e.preventDefault();
  var T = Timeline, c = App.comp(), mk = e.target.closest('.mk'), lpe = e.target.closest('.lp');
  if (lpe) {
    var lp = c.loops[+lpe.dataset.i], bb = lpe.getBoundingClientRect(), edge = e.clientX - bb.left < 6 ? 'l' : (bb.right - e.clientX < 6 ? 'r' : 'm');
    var f0 = lp.from, t0 = lp.to, x0 = e.clientX, mvd = false;
    dragLoop(function (ev) {
      var d = Math.round((ev.clientX - x0) / App.ui.pxf);
      mvd = true;
      if (edge === 'l') lp.from = clamp(f0 + d, 0, lp.to - 1);
      else if (edge === 'r') lp.to = clamp(t0 + d, lp.from + 1, c.duration);
      else { d = clamp(d, -f0, c.duration - t0); lp.from = f0 + d; lp.to = t0 + d; }
      App.touch();
    }, function () { if (mvd) App.commit(); });
    return;
  }
  function fr(ev) { var r = T.ruler.getBoundingClientRect(); return (ev.clientX - r.left) / App.ui.pxf; }
  if (mk) {
    var m = c.markers[+mk.dataset.i], moved = false;
    dragLoop(function (ev) { m.t = clamp(Math.round(fr(ev)), 1, c.duration - 1); moved = true; App.touch(); }, function () { if (moved) App.commit(); });
    return;
  }
  if (App.playing) App.togglePlay();
  App.setTime(fr(e));
  dragLoop(function (ev) { App.setTime(fr(ev)); });
};

Timeline.addMarker = function () {
  var c = App.comp(), t = Math.round(App.time);
  if (t <= 0) { UI.status('A stop marker on the first frame would freeze the template before anything shows. Move the playhead to where the graphic should hold, then add it.'); return; }
  if (c.markers.some(function (m) { return m.t === t; })) return;
  c.markers.push({ t: t, name: 'stop' });
  c.markers.sort(function (a, b) { return a.t - b.t; });
  App.commit();
};

Timeline.addLoop = function () {
  var c = App.comp(), t = Math.round(App.time), to = Math.min(c.duration, t + Math.max(10, Math.round(c.fps)));
  if (to - t < 1) { UI.status('Move the playhead earlier: there is no room for a repeat section here.'); return; }
  (c.loops = c.loops || []).push({ from: t, to: to });
  App.commit();
  UI.status('Repeat section added at the playhead. Drag it or its ends on the ruler. On air the timeline circles inside it until next, stop or another invoke.');
};
Timeline.jumpKey = function (dir) {
  var ts = [], t = App.time, target = null;
  var ls = App.sel.length ? App.selLayers() : App.comp().layers;
  ls.forEach(function (L) { for (var n in L.a) L.a[n].forEach(function (k) { ts.push(k.t); }); });
  ts.sort(function (a, b) { return a - b; });
  if (dir < 0) ts.forEach(function (k) { if (k < t) target = k; });
  else for (var i = ts.length - 1; i >= 0; i--) if (ts[i] > t) target = ts[i];
  if (target != null) App.setTime(target);
};
