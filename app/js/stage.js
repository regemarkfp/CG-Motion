/* CG Motion - viewer: renders the comp with the runtime and handles direct manipulation */
var Stage = { snapLines: [], zoom: 0.5, panX: 40, panY: 40, fitMode: true, player: null, sig: '', handles: [], preview: null, space: false };

Stage.init = function () {
  var wrap = Stage.wrap = $('#stage-wrap');
  Stage.view = $('#stage-view'); Stage.bg = $('#stage-bg'); Stage.bgc = $('#stage-bgc'); Stage.root = $('#stage-root'); Stage.ov = $('#overlay');
  wrap.addEventListener('mousedown', Stage.down);
  wrap.addEventListener('dblclick', Stage.dbl);
  wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    var unit = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? 400 : 1);
    /* sideways scrolling (a tilt / horizontal wheel, a trackpad swipe, or Shift + wheel) moves the view left and right */
    var dx = e.deltaX * unit, dy = e.deltaY * unit, r0 = wrap.getBoundingClientRect();
    /* a trackpad pinch (and Ctrl + wheel) zooms smoothly around the pointer */
    if (e.ctrlKey) {
      Stage.fitMode = false;
      var zf = Math.exp(-dy * 0.01), z0 = clamp(Stage.zoom * zf, 0.05, 8), px0 = e.clientX - r0.left, py0 = e.clientY - r0.top;
      Stage.panX = px0 - (px0 - Stage.panX) * (z0 / Stage.zoom);
      Stage.panY = py0 - (py0 - Stage.panY) * (z0 / Stage.zoom);
      Stage.zoom = z0;
      Stage.layout();
      return;
    }
    /* trackpad scrolling, or the hand tool: two-finger scrolling moves the view in every direction */
    if (App.ui.trackpad || App.tool === 'hand') {
      Stage.fitMode = false;
      Stage.panX -= dx; Stage.panY -= dy;
      Stage.layout();
      return;
    }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (dx && Math.abs(dx) >= Math.abs(dy)) {
      Stage.fitMode = false;
      Stage.panX -= dx;
      Stage.layout();
      return;
    }
    if (!dy) return;
    Stage.fitMode = false;
    var r = wrap.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var f = e.deltaY < 0 ? 1.1 : 1 / 1.1, z = clamp(Stage.zoom * f, 0.05, 8);
    Stage.panX = mx - (mx - Stage.panX) * (z / Stage.zoom);
    Stage.panY = my - (my - Stage.panY) * (z / Stage.zoom);
    Stage.zoom = z;
    Stage.layout();
  }, { passive: false });
  window.addEventListener('resize', function () { Stage.drawOverlay(); });
  /* in Fit mode the composition keeps fitting whenever the viewer changes size (window, panel splitters, docking, floating) */
  Stage.lastSize = '';
  Stage.checkSize = function () {
    var r = Stage.wrap.getBoundingClientRect(), c = App.project ? App.comp() : null, k = Math.round(r.width) + 'x' + Math.round(r.height) + (c ? '|' + c.w + 'x' + c.h : '');
    if (k === Stage.lastSize) return;
    Stage.lastSize = k;
    if (Stage.fitMode && r.width > 0) Stage.fit(true); else Stage.drawOverlay();
  };
  if (window.ResizeObserver) new ResizeObserver(function () { Stage.checkSize(); }).observe(wrap);
  setInterval(Stage.checkSize, 400);
  App.on('project', function () { Stage.sig = ''; setTimeout(Stage.fit, 0); });
  App.on('change', function () { Stage.render(); Stage.checkSize(); });
  App.on('time', Stage.render);
  App.on('sel', Stage.drawOverlay);
};

Stage.later = function () {
  if (Stage._raf) return;
  Stage._raf = requestAnimationFrame(function () { Stage._raf = 0; Stage.render(); });
};

Stage.signature = function () {
  var p = App.project;
  return App.gen + '|' + App.compId + '|' + Object.keys(p.assets).length + '|' + p.comps.map(function (c) {
    return c.id + c.w + 'x' + c.h + ':' + c.layers.map(function (L) { return L.id + L.type + (L.asset || '') + (L.comp || '') + '>' + (L.matte || '') + (L.matteMore || []).map(function (m) { return '+' + m.id; }).join('') + (L.tex && L.tex.masks ? L.tex.masks.map(function (m) { return '~' + m.id; }).join('') : '') + (L.rep && L.rep.on ? 'x' + L.rep.n : '') + (L.box ? 'b' : ''); }).join(',');
  }).join(';');
};

Stage.render = function () {
  if (!App.project) return;
  var c = App.comp(), sig = Stage.signature();
  if (!Stage.player) {
    Stage.player = new RT.Player(App.project, Stage.root, {
      comp: App.compId, editor: true, onAsync: Stage.later,
      onFrame: function (t) { if (App.liveMode) { App.time = clamp(Math.floor(t), 0, c.duration - 1); App.emit('time'); } },
      onHide: function () { UI.status('Template is off air (stop finished). Scrub the timeline to return to editing.'); }
    });
    Stage.sig = sig;
  } else if (sig !== Stage.sig) {
    Stage.sig = sig;
    Stage.player.project = App.project;
    Stage.player.opts.comp = App.compId;
    Stage.player.build();
  }
  var pl = Stage.player;
  pl.project = App.project;
  pl.data = App.testData;
  if (App.liveMode) { pl.dirty = true; if (!pl.looping) pl.render(); }
  else { pl.live = false; pl.renderAt(App.time); }
  Stage.bg.style.width = c.w + 'px'; Stage.bg.style.height = c.h + 'px';
  Stage.bgc.style.backgroundColor = c.bg || 'transparent';
  Stage.layout();
};

Stage.layout = function () {
  Stage.view.style.transform = 'translate(' + Stage.panX + 'px,' + Stage.panY + 'px) scale(' + Stage.zoom + ')';
  $('#zoom-label').textContent = Math.round(Stage.zoom * 100) + '%';
  var fb = $('[data-cmd="fit"]');
  if (fb) fb.classList.toggle('on', !!Stage.fitMode);
  Stage.drawOverlay();
};
Stage.fit = function (keepMode) {
  var c = App.comp(), r = Stage.wrap.getBoundingClientRect();
  if (keepMode !== true) Stage.fitMode = true;
  if (!r.width) return;
  Stage.zoom = Math.min((r.width - 60) / c.w, (r.height - 60) / c.h);
  Stage.panX = (r.width - c.w * Stage.zoom) / 2;
  Stage.panY = (r.height - c.h * Stage.zoom) / 2;
  Stage.layout();
};

Stage.toScreen = function (p) { return [Stage.panX + p[0] * Stage.zoom, Stage.panY + p[1] * Stage.zoom]; };
Stage.toComp = function (e) {
  var r = Stage.wrap.getBoundingClientRect();
  return [(e.clientX - r.left - Stage.panX) / Stage.zoom, (e.clientY - r.top - Stage.panY) / Stage.zoom];
};
Stage.item = function (id) { return Stage.player ? Stage.player.item(id) : null; };
Stage.corners = function (it) {
  var m = it.wm, w = it.w, hh = it.h;
  return [RT.apply(m, 0, 0), RT.apply(m, w, 0), RT.apply(m, w, hh), RT.apply(m, 0, hh)].map(Stage.toScreen);
};

Stage.drawOverlay = function () {
  if (!App.project || !Stage.player) return;
  var c = App.comp(), s = '', ts = Stage.toScreen, i;
  var a = ts([0, 0]), b = ts([c.w, c.h]);
  s += '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + (b[0] - a[0]) + '" height="' + (b[1] - a[1]) + '" fill="none" stroke="#000" stroke-opacity=".6"/>';
  if (App.ui.guides) {
    [0.05, 0.1].forEach(function (m) {
      var p = ts([c.w * m, c.h * m]), q = ts([c.w * (1 - m), c.h * (1 - m)]);
      s += '<rect x="' + p[0] + '" y="' + p[1] + '" width="' + (q[0] - p[0]) + '" height="' + (q[1] - p[1]) + '" fill="none" stroke="#35d0ff" stroke-opacity=".55" stroke-dasharray="4 4"/>';
    });
    var cx = ts([c.w / 2, c.h / 2]);
    s += '<path d="M' + cx[0] + ' ' + a[1] + 'V' + b[1] + 'M' + a[0] + ' ' + cx[1] + 'H' + b[0] + '" stroke="#35d0ff" stroke-opacity=".35"/>';
  }
  function poly(pts, cls) { return '<polygon class="' + cls + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>'; }
  c.layers.forEach(function (L) {
    if (L.type !== 'null' || L.visible === false || App.sel.indexOf(L.id) >= 0) return;
    var it = Stage.item(L.id);
    if (it) s += poly(Stage.corners(it), 'ov-null');
  });
  Stage.maskIds().forEach(function (id) {
    if (App.sel.indexOf(id) >= 0) return;
    var mit = Stage.item(id), ML = App.layer(id);
    if (!mit || !ML) return;
    var mp = Stage.corners(mit), tx = mp[0];
    s += poly(mp, 'ov-matte') + '<text class="ov-matte-t" x="' + (tx[0] + 4) + '" y="' + (tx[1] - 4) + '">' + esc(ML.name) + '</text>';
  });
  Stage.handles = [];
  var sel = App.selLayers();
  sel.forEach(function (L) {
    var it = Stage.item(L.id);
    if (!it) return;
    var p = Stage.corners(it);
    s += poly(p, 'ov-sel');
    if (L.mask && L.mask.on) {
      var mx = App.val(L, 'mx'), my = App.val(L, 'my'), mw = App.val(L, 'mw'), mh = App.val(L, 'mh'), m = it.wm;
      s += poly([RT.apply(m, mx, my), RT.apply(m, mx + mw, my), RT.apply(m, mx + mw, my + mh), RT.apply(m, mx, my + mh)].map(ts), 'ov-mask');
    }
    var an = ts([it.base[4], it.base[5]]);
    s += '<path class="ov-anchor" d="M' + (an[0] - 7) + ' ' + an[1] + 'h14M' + an[0] + ' ' + (an[1] - 7) + 'v14"/><circle class="ov-anchor" cx="' + an[0] + '" cy="' + an[1] + '" r="3.5" fill="none"/>';
    if (sel.length === 1 && !L.locked) {
      var mid = function (u, v) { return [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2]; };
      var hs = [[p[0], -1, -1], [mid(p[0], p[1]), 0, -1], [p[1], 1, -1], [mid(p[1], p[2]), 1, 0], [p[2], 1, 1], [mid(p[2], p[3]), 0, 1], [p[3], -1, 1], [mid(p[3], p[0]), -1, 0]];
      hs.forEach(function (hd) {
        Stage.handles.push({ x: hd[0][0], y: hd[0][1], hx: hd[1], hy: hd[2], kind: 'size' });
        s += '<rect class="ov-handle" x="' + (hd[0][0] - 4) + '" y="' + (hd[0][1] - 4) + '" width="8" height="8"/>';
      });
      var tm = mid(p[0], p[1]), bm = mid(p[3], p[2]), dx = tm[0] - bm[0], dy = tm[1] - bm[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      var rp = [tm[0] + dx / len * 26, tm[1] + dy / len * 26];
      s += '<line class="ov-sel" x1="' + tm[0] + '" y1="' + tm[1] + '" x2="' + rp[0] + '" y2="' + rp[1] + '"/><circle class="ov-handle" cx="' + rp[0] + '" cy="' + rp[1] + '" r="5"/>';
      Stage.handles.push({ x: rp[0], y: rp[1], kind: 'rot' });
    }
  });
  (Stage.snapLines || []).forEach(function (g) {
    if (g.x != null) { var gx = ts([g.x, 0])[0]; s += '<line class="ov-snap" x1="' + gx + '" y1="0" x2="' + gx + '" y2="9999"/>'; }
    else { var gy = ts([0, g.y])[1]; s += '<line class="ov-snap" x1="0" y1="' + gy + '" x2="9999" y2="' + gy + '"/>'; }
  });
  if (Stage.preview) {
    var q = Stage.preview, p0 = ts([q.x, q.y]), p1 = ts([q.x + q.w, q.y + q.h]);
    s += '<rect class="ov-sel" x="' + p0[0] + '" y="' + p0[1] + '" width="' + (p1[0] - p0[0]) + '" height="' + (p1[1] - p0[1]) + '" ' + (q.ellipse ? 'rx="50%"' : '') + '/>';
  }
  Stage.ov.innerHTML = s;
};

/* the mask layers that belong with the current selection: masks of a selected layer, and the other masks of the same layer when a mask is selected */
Stage.maskIds = function () {
  var out = [], c = App.comp();
  c.layers.forEach(function (L) {
    var ids = RT.matteSpecs(L).map(function (s) { return s.id; });
    if (!ids.length) return;
    if (App.sel.indexOf(L.id) >= 0 || ids.some(function (id) { return App.sel.indexOf(id) >= 0; })) ids.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
  });
  return out;
};
Stage.hit = function (pt) {
  var ls = App.comp().layers, t = App.time, L, it, inv, q, i;
  for (i = 0; i < ls.length; i++) {
    L = ls[i]; it = Stage.item(L.id);
    if (!it || it.isMatte || L.locked || L.visible === false || t < L.start || t >= L.end) continue;
    inv = RT.invert(it.wm);
    if (!inv) continue;
    q = RT.apply(inv, pt[0], pt[1]);
    if (q[0] >= 0 && q[1] >= 0 && q[0] <= Math.max(it.w, 4) && q[1] <= Math.max(it.h, 4)) return L;
  }
  /* nothing visible there: mask layers of the selected layer can be picked by clicking inside their outline */
  var shown = Stage.maskIds();
  for (i = 0; i < ls.length; i++) {
    L = ls[i]; it = Stage.item(L.id);
    if (!it || !it.isMatte || L.locked || shown.indexOf(L.id) < 0) continue;
    inv = RT.invert(it.wm);
    if (!inv) continue;
    q = RT.apply(inv, pt[0], pt[1]);
    if (q[0] >= 0 && q[1] >= 0 && q[0] <= Math.max(it.w, 4) && q[1] <= Math.max(it.h, 4)) return L;
  }
  return null;
};

function dragLoop(move, up) {
  function mm(e) { move(e); }
  var d = UI.doc;   /* the window the drag started in */
  function mu(e) { d.removeEventListener('mousemove', mm); d.removeEventListener('mouseup', mu); if (up) up(e); }
  d.addEventListener('mousemove', mm);
  d.addEventListener('mouseup', mu);
}

Stage.down = function (e) {
  if (UI.active() && UI.active().blur && /INPUT|TEXTAREA|SELECT/.test(UI.active().tagName)) UI.active().blur();
  var r = Stage.wrap.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, pt = Stage.toComp(e);
  if (e.button === 1 || (e.button === 0 && (Stage.space || App.tool === 'hand'))) {
    e.preventDefault();
    var px = Stage.panX, py = Stage.panY, x0 = e.clientX, y0 = e.clientY;
    if (Stage.space) Main.panned = true;
    Stage.wrap.classList.add('panning');
    var endPan = function () { Stage.wrap.classList.remove('panning'); document.removeEventListener('mouseup', endPan, true); };
    document.addEventListener('mouseup', endPan, true);
    dragLoop(function (ev) { Stage.fitMode = false; Stage.panX = px + ev.clientX - x0; Stage.panY = py + ev.clientY - y0; Stage.layout(); });
    return;
  }
  if (e.button !== 0) return;
  e.preventDefault();
  if (App.liveMode) App.setTime(App.time);
  if (App.tool === 'text') {
    /* new text is a text box: click = a default-sized box, drag = a box of that size */
    dragLoop(function (ev) {
      var q = Stage.toComp(ev);
      Stage.preview = { x: Math.min(pt[0], q[0]), y: Math.min(pt[1], q[1]), w: Math.abs(q[0] - pt[0]), h: Math.abs(q[1] - pt[1]) };
      Stage.drawOverlay();
    }, function () {
      var q = Stage.preview;
      Stage.preview = null;
      if (q && q.w * Stage.zoom > 8 && q.h * Stage.zoom > 8) App.addLayer('text', { box: true, boxWrap: true, valign: 'top', clip: false, squeeze: false, p: { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.w), h: Math.round(q.h) } });
      else App.addLayer('text', { box: true, boxWrap: true, valign: 'top', clip: false, squeeze: false, p: { x: Math.round(pt[0]), y: Math.round(pt[1]), w: 700, h: 100 } });
      Main.setTool('select');
      setTimeout(function () { var ta = $('#insp textarea'); if (ta) { ta.focus(); ta.select(); } }, 30);
    });
    return;
  }
  if (App.tool === 'rect' || App.tool === 'ellipse') {
    var ell = App.tool === 'ellipse';
    dragLoop(function (ev) {
      var q = Stage.toComp(ev);
      Stage.preview = { x: Math.min(pt[0], q[0]), y: Math.min(pt[1], q[1]), w: Math.abs(q[0] - pt[0]), h: Math.abs(q[1] - pt[1]), ellipse: ell };
      Stage.drawOverlay();
    }, function () {
      var q = Stage.preview || { x: pt[0] - 200, y: pt[1] - 100, w: 400, h: 200 };
      if (q.w < 3 || q.h < 3) q = { x: pt[0] - 200, y: pt[1] - 100, w: 400, h: 200 };
      Stage.preview = null;
      var w = Math.round(q.w), hh = Math.round(q.h);
      App.addLayer('shape', { shape: ell ? 'ellipse' : 'rect', p: { x: Math.round(q.x + w / 2), y: Math.round(q.y + hh / 2), w: w, h: hh, ax: w / 2, ay: hh / 2 } });
      Main.setTool('select');
    });
    return;
  }
  /* select tool */
  for (var i = Stage.handles.length - 1; i >= 0; i--) {
    var hd = Stage.handles[i];
    if (Math.abs(hd.x - sx) <= 7 && Math.abs(hd.y - sy) <= 7) { Stage.handleDrag(hd, pt, e); return; }
  }
  var L = Stage.hit(pt);
  if (!L) {
    if (App.sel.length || App.selKeys.length) { App.sel = []; App.selKeys = []; App.emit('sel'); }
    return;
  }
  if (e.shiftKey || e.ctrlKey) {
    var ix = App.sel.indexOf(L.id);
    if (ix >= 0) App.sel.splice(ix, 1); else App.sel.push(L.id);
    App.emit('sel');
  } else if (App.sel.indexOf(L.id) < 0) { App.sel = [L.id]; App.selKeys = []; App.emit('sel'); }
  Stage.moveDrag(pt);
};

Stage.parentInv = function (L) {
  var pit = L.parent && Stage.item(L.parent), it = Stage.item(L.id);
  if (pit && it && it.edge) return [1, 0, 0, 1, -it.edge[0], -it.edge[1]];
  return pit ? (RT.invert(pit.cpm || pit.pm) || [1, 0, 0, 1, 0, 0]) : [1, 0, 0, 1, 0, 0];
};

/* ---------- snapping ---------- */
Stage.bbox = function (it) {
  var m = it.wm, pts = [RT.apply(m, 0, 0), RT.apply(m, it.w, 0), RT.apply(m, it.w, it.h), RT.apply(m, 0, it.h)];
  var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
  return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
};
/* things a dragged layer can snap to: the frame, its centre, the safe areas (when shown) and every other visible layer */
Stage.snapTargets = function (skip) {
  var c = App.comp(), xs = [0, c.w / 2, c.w], ys = [0, c.h / 2, c.h], t = App.time;
  if (App.ui.guides) [0.05, 0.1].forEach(function (m) { xs.push(c.w * m, c.w * (1 - m)); ys.push(c.h * m, c.h * (1 - m)); });
  c.layers.forEach(function (L) {
    if (L.visible === false || t < L.start || t >= L.end) return;
    var p = L, guard = 0;
    while (p && guard++ < 50) { if (skip.indexOf(p.id) >= 0) return; p = p.parent ? App.layer(p.parent) : null; }
    var it = Stage.item(L.id);
    if (!it || (!it.w && !it.h)) return;
    var b = Stage.bbox(it);
    xs.push(b[0], (b[0] + b[2]) / 2, b[2]); ys.push(b[1], (b[1] + b[3]) / 2, b[3]);
  });
  return { xs: xs, ys: ys };
};
/* returns how far to shift so one of vals lands on a target (0 when nothing is close), and records the guide */
Stage.snap1 = function (vals, targets, axis) {
  var best = null, th = 7 / Stage.zoom;
  vals.forEach(function (v) { targets.forEach(function (tg) { var d = tg - v; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: tg }; }); });
  if (!best) return 0;
  Stage.snapLines.push(axis === 'x' ? { x: best.at } : { y: best.at });
  return best.d;
};
Stage.snapOn = function (e) { return App.ui.snap !== false && !e.ctrlKey; };

Stage.moveDrag = function (pt0) {
  var items = App.selLayers().filter(function (L) { return !L.locked && App.sel.indexOf(L.parent) < 0; }).map(function (L) {
    return { L: L, x: App.val(L, 'x'), y: App.val(L, 'y'), inv: Stage.parentInv(L) };
  }), moved = false;
  var box = null, tg = Stage.snapTargets(App.sel);
  items.forEach(function (o) {
    var it = Stage.item(o.L.id); if (!it) return;
    var b = Stage.bbox(it);
    box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
  });
  dragLoop(function (e) {
    var pt = Stage.toComp(e), dx = pt[0] - pt0[0], dy = pt[1] - pt0[1];
    if (!moved && Math.abs(dx) * Stage.zoom < 3 && Math.abs(dy) * Stage.zoom < 3) return;
    moved = true;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    Stage.snapLines = [];
    if (box && Stage.snapOn(e)) {
      if (!(e.shiftKey && dx === 0)) dx += Stage.snap1([box[0] + dx, (box[0] + box[2]) / 2 + dx, box[2] + dx], tg.xs, 'x');
      if (!(e.shiftKey && dy === 0)) dy += Stage.snap1([box[1] + dy, (box[1] + box[3]) / 2 + dy, box[3] + dy], tg.ys, 'y');
    }
    items.forEach(function (o) {
      App.setProp(o.L, 'x', Math.round((o.x + o.inv[0] * dx + o.inv[2] * dy) * 10) / 10);
      App.setProp(o.L, 'y', Math.round((o.y + o.inv[1] * dx + o.inv[3] * dy) * 10) / 10);
    });
    App.touch();
  }, function () { Stage.snapLines = []; if (moved) App.commit(); else Stage.drawOverlay(); });
};

Stage.handleDrag = function (hd, pt0, e0) {
  var L = App.selLayers()[0], it = Stage.item(L.id);
  if (!L || !it) return;
  /* pulling a side handle of plain text turns it into a text box, like in a text editor: the box changes, the text keeps its size */
  if (L.type === 'text' && !L.box && hd.kind === 'size' && (!hd.hx || !hd.hy)) {
    Inspector.toBox(L);
    Stage.render();
    it = Stage.item(L.id);
    if (!it) return;
    UI.status('Now a text box: the handles resize the box and the text keeps its size. Untick "Text box" in the inspector to go back.');
  }
  var kx = it.kx || 1, ky = it.ky || 1;
  var A = [it.base[4], it.base[5]], moved = false;
  var sized = App.isSized(L);
  /* while Scale is being animated (and size is not), the handles scale the layer so the change is keyframed and nothing else moves */
  if (sized && L.type !== 'text' && (L.a.sx || L.a.sy) && !L.a.w && !L.a.h) sized = false;
  /* an animated layer is resized without touching its anchor, so other keyframes are never disturbed */
  var animated = ['x', 'y', 'w', 'h', 'ax', 'ay', 'sx', 'sy', 'rot', 'skx', 'sky'].some(function (k) { return !!L.a[k]; });
  var s0 = { w: it.w, h: it.h, ax: App.val(L, 'ax') * (it.kx || 1), ay: App.val(L, 'ay') * (it.ky || 1), sx: App.val(L, 'sx'), sy: App.val(L, 'sy'), rot: App.val(L, 'rot') };
  var wm0 = it.wm.slice(), inv0 = RT.invert(wm0), pinv = Stage.parentInv(L);
  if (hd.kind === 'rot') {
    var a0 = Math.atan2(pt0[1] - A[1], pt0[0] - A[0]);
    dragLoop(function (e) {
      var pt = Stage.toComp(e), d = (Math.atan2(pt[1] - A[1], pt[0] - A[0]) - a0) * 180 / Math.PI, v = s0.rot + d;
      if (e.shiftKey) v = Math.round(v / 15) * 15;
      App.setProp(L, 'rot', Math.round(v * 10) / 10);
      moved = true; App.touch();
    }, function () { if (moved) App.commit(); });
    return;
  }
  if (!inv0) return;
  var p0l = RT.apply(inv0, pt0[0], pt0[1]), al = RT.apply(inv0, A[0], A[1]);
  var hc = [(hd.x - Stage.panX) / Stage.zoom, (hd.y - Stage.panY) / Stage.zoom], off = [pt0[0] - hc[0], pt0[1] - hc[1]];
  var straight = Math.abs(wm0[1]) < 1e-6 && Math.abs(wm0[2]) < 1e-6, tg = Stage.snapTargets([L.id]);
  dragLoop(function (e) {
    var pt = Stage.toComp(e);
    Stage.snapLines = [];
    if (sized) {
      pt = [pt[0] - off[0], pt[1] - off[1]];
      if (straight && Stage.snapOn(e) && !e.shiftKey) {
        if (hd.hx) pt[0] += Stage.snap1([pt[0]], tg.xs, 'x');
        if (hd.hy) pt[1] += Stage.snap1([pt[1]], tg.ys, 'y');
      }
    }
    var q = RT.apply(inv0, pt[0], pt[1]);
    moved = true;
    if (sized) {
      var l = 0, t = 0, r = s0.w, b = s0.h;
      if (hd.hx > 0) r = Math.max(1, q[0]); if (hd.hx < 0) l = Math.min(r - 1, q[0]);
      if (hd.hy > 0) b = Math.max(1, q[1]); if (hd.hy < 0) t = Math.min(b - 1, q[1]);
      if (e.shiftKey && hd.hx && hd.hy && s0.w && s0.h) {
        var k = Math.max((r - l) / s0.w, (b - t) / s0.h), nw = s0.w * k, nh = s0.h * k;
        if (hd.hx > 0) r = l + nw; else l = r - nw;
        if (hd.hy > 0) b = t + nh; else t = b - nh;
      }
      var w = Math.round(r - l), hh = Math.round(b - t);
      var ax = s0.ax, ay = s0.ay;
      if (!animated) { ax = s0.w ? s0.ax / s0.w * w : 0; ay = s0.h ? s0.ay / s0.h * hh : 0; }
      var wp = RT.apply(wm0, l + ax, t + ay), pp = RT.apply(pinv, wp[0], wp[1]);
      if (hd.hx) App.setProp(L, 'w', round2(w / kx));
      if (hd.hy) App.setProp(L, 'h', round2(hh / ky));
      if (!animated) {
        if (hd.hx) App.setProp(L, 'ax', round2(ax / kx));
        if (hd.hy) App.setProp(L, 'ay', round2(ay / ky));
      }
      /* position only changes when it has to: always for a still layer (anchor stays proportional), otherwise only when the left or top edge moved */
      if (!animated || l !== 0 || t !== 0) {
        if (!animated || l !== 0) App.setProp(L, 'x', Math.round(pp[0] * 10) / 10);
        if (!animated || t !== 0) App.setProp(L, 'y', Math.round(pp[1] * 10) / 10);
      }
    } else {
      if (hd.hx && hd.hy) {
        var d0 = Math.hypot(pt0[0] - A[0], pt0[1] - A[1]) || 1, f = Math.hypot(pt[0] - A[0], pt[1] - A[1]) / d0;
        App.setProp(L, 'sx', round2(s0.sx * f)); App.setProp(L, 'sy', round2(s0.sy * f));
      } else if (hd.hx) {
        var dn = p0l[0] - al[0]; if (Math.abs(dn) > 0.01) App.setProp(L, 'sx', round2(s0.sx * (q[0] - al[0]) / dn));
      } else {
        var dm = p0l[1] - al[1]; if (Math.abs(dm) > 0.01) App.setProp(L, 'sy', round2(s0.sy * (q[1] - al[1]) / dm));
      }
    }
    App.touch();
  }, function () { Stage.snapLines = []; if (moved) App.commit(); else Stage.drawOverlay(); });
};

Stage.dbl = function (e) {
  var L = Stage.hit(Stage.toComp(e));
  if (!L) return;
  if (L.type === 'comp') App.openComp(L.comp);
  else if (L.type === 'text') { var ta = $('#insp textarea'); if (ta) { ta.focus(); ta.select(); } }
};

Stage.nudge = function (dx, dy) {
  var ls = App.selLayers().filter(function (L) { return !L.locked; });
  if (!ls.length) return;
  ls.forEach(function (L) { App.setProp(L, 'x', App.val(L, 'x') + dx); App.setProp(L, 'y', App.val(L, 'y') + dy); });
  App.commit();
};

/* Live test: drive the viewer exactly as CasparCG would drive the exported template. */
Stage.live = function (cmd, arg) {
  var pl = Stage.player;
  if (!pl) return;
  if (App.playing) App.togglePlay();
  if (!App.liveMode) { App.liveMode = true; pl.live = true; if (cmd !== 'play') { pl.main.time = App.time; pl.main.playing = false; } }
  pl.data = App.testData;
  if (cmd === 'play') pl.livePlay();
  else if (cmd === 'next') pl.liveNext();
  else if (cmd === 'stop') pl.liveStop();
  else if (cmd === 'invoke') pl.invoke(arg);
};
