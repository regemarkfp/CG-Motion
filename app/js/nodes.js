/* CG Motion - node screen: wire up parents and masks by dragging between layers */
var Nodes = { on: false, panX: 30, panY: 46, NW: 210, NH: 70 };

Nodes.init = function () {
  var el = Nodes.el = $('#nodes');
  el.addEventListener('mousedown', Nodes.down);
  el.addEventListener('wheel', function (e) { e.preventDefault(); Nodes.panX -= e.deltaX; Nodes.panY -= e.deltaY; Nodes.build(); }, { passive: false });
  App.on('change', Nodes.build); App.on('sel', Nodes.build); App.on('project', Nodes.build);
};
Nodes.toggle = function (v) {
  Nodes.on = v == null ? !Nodes.on : v;
  Nodes.el.style.display = Nodes.on ? 'block' : 'none';
  $$('[data-cmd=nodes]').forEach(function (b) { b.classList.toggle('on', Nodes.on); });
  Nodes.build();
};

Nodes.depth = function (L) { var d = 0, p = L, g = 0; while (p && p.parent && g++ < 50) { p = App.layer(p.parent); d++; } return d; };
/* columns run left to right: parents and mask shapes sit to the left of the layers that use them */
Nodes.tidy = function () {
  var c = App.comp(), rows = {}, memo = {};
  function col(L, g) {
    if (memo[L.id] != null) return memo[L.id];
    if (g > 30) return 0;
    var v = 0, par = L.parent && App.layer(L.parent);
    if (par) v = Math.max(v, col(par, g + 1) + 1);
    Nodes.maskLinks(L).forEach(function (k) { v = Math.max(v, col(App.layer(k.id), g + 1) + 1); });
    memo[L.id] = v;
    return v;
  }
  c.nodePos = {};
  c.layers.forEach(function (L) {
    var d = col(L, 0);
    rows[d] = rows[d] || 0;
    c.nodePos[L.id] = [d * 330, rows[d] * 86];
    rows[d]++;
  });
};
Nodes.pos = function (L) {
  var c = App.comp();
  if (!c.nodePos) Nodes.tidy();
  if (!c.nodePos[L.id]) {
    var maxY = -96, k;
    for (k in c.nodePos) if (App.layer(k) && c.nodePos[k][0] === 0) maxY = Math.max(maxY, c.nodePos[k][1]);
    c.nodePos[L.id] = [0, maxY + 96];
  }
  return c.nodePos[L.id];
};
Nodes.port = function (L, side, kind) {
  var p = Nodes.pos(L);
  return [p[0] + (side === 'out' ? Nodes.NW : 0), p[1] + (kind === 'parent' ? 34 : 58)];
};
Nodes.curve = function (a, b) {
  var dx = Math.max(50, Math.abs(b[0] - a[0]) * 0.5);
  return 'M' + a[0] + ' ' + a[1] + 'C' + (a[0] + dx) + ' ' + a[1] + ',' + (b[0] - dx) + ' ' + b[1] + ',' + b[0] + ' ' + b[1];
};
/* every mask connection of a layer: the main matte first, then the extra ones */
Nodes.maskLinks = function (L) {
  var out = [];
  if (L.matte && App.layer(L.matte)) out.push({ id: L.matte, main: true, op: /Inv$/.test(L.matteMode || '') ? 'sub' : 'add', luma: /^luma/.test(L.matteMode || '') });
  (L.matteMore || []).forEach(function (m, i) { if (App.layer(m.id)) out.push({ id: m.id, i: i, op: m.op || 'add' }); });
  return out;
};

Nodes.build = function () {
  if (!Nodes.on || !App.project) return;
  var c = App.comp(), svg = '', html = '', OPS = { add: '+', sub: '−', int: '∩' }, TIP = { add: 'Add: this shape is added to the mask', sub: 'Subtract: this shape cuts a hole in the mask', int: 'Intersect: only where this shape overlaps the rest of the mask' };
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  c.layers.forEach(function (L) {
    if (L.parent && App.layer(L.parent)) {
      var a = Nodes.port(App.layer(L.parent), 'out', 'parent'), b = Nodes.port(L, 'in', 'parent'), m = mid(a, b);
      svg += '<path class="nl p" d="' + Nodes.curve(a, b) + '"/>';
      html += '<div class="nl-h p" style="left:' + m[0] + 'px;top:' + m[1] + 'px"><span data-act="psel" data-id="' + L.id + '" title="How it follows: ' + (L.pEdge ? 'pinned to edges' : 'whole object') + '. Click to select the layer and change it in the inspector.">' + (L.pEdge ? 'edges' : 'whole') + '</span><b data-act="pdel" data-id="' + L.id + '" title="Remove this parent link">×</b></div>';
    }
    Nodes.maskLinks(L).forEach(function (k) {
      var a = Nodes.port(App.layer(k.id), 'out', 'mask'), b = Nodes.port(L, 'in', 'mask'), m = mid(a, b);
      svg += '<path class="nl m" d="' + Nodes.curve(a, b) + '"/>';
      html += '<div class="nl-h m" style="left:' + m[0] + 'px;top:' + m[1] + 'px"><span data-act="mop" data-id="' + L.id + '" data-k="' + (k.main ? 'main' : k.i) + '" title="' + TIP[k.op] + (k.luma ? ' (luma)' : '') + '. Click to change.">' + OPS[k.op] + (k.luma ? ' L' : '') + '</span><b data-act="mdel" data-id="' + L.id + '" data-k="' + (k.main ? 'main' : k.i) + '" title="Remove this mask link">×</b></div>';
    });
  });
  var used = {};
  c.layers.forEach(function (L) { Nodes.maskLinks(L).forEach(function (k) { used[k.id] = 1; }); });
  c.layers.forEach(function (L) {
    var p = Nodes.pos(L);
    html += '<div class="node' + (App.sel.indexOf(L.id) >= 0 ? ' sel' : '') + (used[L.id] ? ' ismask' : '') + '" data-id="' + L.id + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px">' +
      '<div class="n-h"><span class="chip t-' + L.type + '"></span><span class="n-nm">' + esc(L.name) + '</span>' + (used[L.id] ? '<em>mask</em>' : '') + '</div>' +
      '<div class="n-row"><i class="port in p"></i><span>parent</span><span class="grow"></span><span>parent of</span><i class="port out p" data-port="parent" title="Drag onto another layer to make this layer its parent"></i></div>' +
      '<div class="n-row"><i class="port in m"></i><span>masked by</span><span class="grow"></span><span>masks</span><i class="port out m" data-port="mask" title="Drag onto another layer to use this layer as (part of) its mask"></i></div></div>';
  });
  Nodes.el.innerHTML = '<div id="nodes-inner" style="transform:translate(' + Nodes.panX + 'px,' + Nodes.panY + 'px)"><svg class="nlinks">' + svg + '<path id="nl-temp" class="nl" d=""/></svg>' + html + '</div>' +
    '<div class="nodes-bar"><b>Nodes</b><span>Drag from a dot on the right of a layer onto another layer. <i class="lg p"></i> green = parent of, <i class="lg m"></i> orange = masks. Several orange links into one layer combine into one mask: click + / − / ∩ on a link to add, subtract or intersect.</span>' +
    '<button data-act="tidy">Tidy up</button><button data-act="close">Back to viewer</button></div>';
};

Nodes.connect = function (kind, A, B) {
  if (!A || !B || A === B) return;
  if (kind === 'parent') {
    var p = A, g = 0;
    while (p && g++ < 50) { if (p.id === B.id) { UI.status('"' + B.name + '" is already above "' + A.name + '" in that chain, so it cannot become its child.'); return; } p = p.parent ? App.layer(p.parent) : null; }
    Inspector.setParent(B, A.id);
  } else {
    if (Nodes.maskLinks(B).some(function (k) { return k.id === A.id; })) return;
    if (!B.matte && !(B.matteMore && B.matteMore.length)) { B.matte = A.id; B.matteMode = 'alpha'; }
    else {
      if (!B.matte) { var f = B.matteMore.shift(); B.matte = f.id; B.matteMode = f.op === 'sub' ? 'alphaInv' : 'alpha'; }
      (B.matteMore = B.matteMore || []).push({ id: A.id, op: 'add' });
    }
  }
  App.commit();
};
Nodes.removeMask = function (L, k) {
  if (k === 'main') {
    var f = (L.matteMore || []).shift();
    if (f) { L.matte = f.id; L.matteMode = f.op === 'sub' ? 'alphaInv' : 'alpha'; } else L.matte = '';
  } else L.matteMore.splice(+k, 1);
};
Nodes.cycleMask = function (L, k) {
  var multi = L.matteMore && L.matteMore.length;
  if (k === 'main') {
    var order = multi ? ['alpha', 'alphaInv'] : ['alpha', 'alphaInv', 'luma', 'lumaInv'], i = order.indexOf(L.matteMode || 'alpha');
    L.matteMode = order[(i + 1) % order.length];
  } else {
    var m = L.matteMore[+k], o = ['add', 'sub', 'int'];
    m.op = o[(o.indexOf(m.op || 'add') + 1) % 3];
  }
};

Nodes.down = function (e) {
  if (e.button !== 0) return;
  var t = e.target, act = t.dataset && t.dataset.act, L = act && t.dataset.id ? App.layer(t.dataset.id) : null;
  if (act === 'tidy') { Nodes.tidy(); Nodes.panX = 30; Nodes.panY = 46; App.commit(); return; }
  if (act === 'close') { Nodes.toggle(false); return; }
  if (act === 'pdel' && L) { Inspector.setParent(L, ''); App.commit(); return; }
  if (act === 'psel' && L) { App.sel = [L.id]; App.emit('sel'); return; }
  if (act === 'mdel' && L) { Nodes.removeMask(L, t.dataset.k); App.commit(); return; }
  if (act === 'mop' && L) { Nodes.cycleMask(L, t.dataset.k); App.commit(); return; }
  e.preventDefault();
  if (UI.active() && UI.active().blur) UI.active().blur();
  var nodeEl = t.closest('.node'), x0 = e.clientX, y0 = e.clientY, moved = false;
  if (nodeEl && t.classList.contains('out')) {
    var A = App.layer(nodeEl.dataset.id), kind = t.dataset.port, a = Nodes.port(A, 'out', kind);
    dragLoop(function (ev) {
      var r = Nodes.el.getBoundingClientRect(), b = [ev.clientX - r.left - Nodes.panX, ev.clientY - r.top - Nodes.panY], tp = $('#nl-temp');
      if (tp) { tp.setAttribute('class', 'nl ' + (kind === 'parent' ? 'p' : 'm')); tp.setAttribute('d', Nodes.curve(a, b)); }
    }, function (ev) {
      var hit = UI.doc.elementFromPoint(ev.clientX, ev.clientY), n = hit && hit.closest('.node');
      if (n) Nodes.connect(kind, A, App.layer(n.dataset.id));
      Nodes.build();
    });
    return;
  }
  if (nodeEl) {
    var Ln = App.layer(nodeEl.dataset.id);
    if (e.shiftKey || e.ctrlKey) { var ix = App.sel.indexOf(Ln.id); if (ix >= 0) App.sel.splice(ix, 1); else App.sel.push(Ln.id); }
    else if (App.sel.indexOf(Ln.id) < 0) App.sel = [Ln.id];
    App.selKeys = [];
    App.emit('sel');
    var start = App.selLayers().map(function (q) { return { L: q, p: Nodes.pos(q).slice() }; });
    dragLoop(function (ev) {
      moved = true;
      start.forEach(function (o) { App.comp().nodePos[o.L.id] = [o.p[0] + ev.clientX - x0, o.p[1] + ev.clientY - y0]; });
      Nodes.build();
    }, function () { if (moved) App.commit(); });
    return;
  }
  var px = Nodes.panX, py = Nodes.panY;
  dragLoop(function (ev) { Nodes.panX = px + ev.clientX - x0; Nodes.panY = py + ev.clientY - y0; moved = true; Nodes.build(); },
    function () { if (!moved && App.sel.length) { App.sel = []; App.emit('sel'); } });
};
