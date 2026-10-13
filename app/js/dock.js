/* CG Motion - workspace: dockable panels, menus and context menus */
var Dock = {
  PANELS: {
    viewer: { title: 'Viewer', el: '#center' }, timeline: { title: 'Timeline', el: '#timeline' }, inspector: { title: 'Inspector', el: '#right' },
    assets: { title: 'Assets', el: '#pn-assets' }, control: { title: 'Control', el: '#pn-control' }, colours: { title: 'Colours', el: '#pn-colours' },
    easing: { title: 'Easing', el: '#pn-easing' }, caspar: { title: 'CasparCG', el: '#pn-caspar' }, data: { title: 'Data', el: '#pn-data' }
  },
  tree: null, floats: [], wins: {}, byId: {}, KEY: 'cgm.layout.v1'
};
Dock.defaults = function () {
  return { t: 'split', dir: 'col', size: 1, kids: [
    { t: 'split', dir: 'row', size: 0.68, kids: [
      { t: 'tabs', size: 0.19, tabs: ['assets', 'control', 'colours', 'easing', 'caspar'], active: 'assets' },
      { t: 'tabs', size: 0.62, tabs: ['viewer'], active: 'viewer' },
      { t: 'tabs', size: 0.19, tabs: ['inspector'], active: 'inspector' }
    ] },
    { t: 'tabs', size: 0.32, tabs: ['timeline'], active: 'timeline' }
  ] };
};
Dock.groups = function (n, out) {
  out = out || [];
  var top = !n;
  n = n || Dock.tree;
  if (n.t === 'tabs') out.push(n); else n.kids.forEach(function (k) { Dock.groups(k, out); });
  if (top) Dock.floats.forEach(function (f) { out.push(f); });
  return out;
};
Dock.groupOf = function (name) { return Dock.groups().filter(function (g) { return g.tabs.indexOf(name) >= 0; })[0] || null; };
Dock.isActive = function (name) { var g = Dock.groupOf(name); return !!g && g.active === name; };
Dock.parentOf = function (target, n) {
  n = n || Dock.tree;
  if (n.t !== 'split') return null;
  for (var i = 0; i < n.kids.length; i++) {
    if (n.kids[i] === target) return n;
    var r = Dock.parentOf(target, n.kids[i]);
    if (r) return r;
  }
  return null;
};
Dock.valid = function (t) {
  try {
    var seen = {}, ok = true;
    (function walk(n) {
      if (!n || (n.t !== 'tabs' && n.t !== 'split')) { ok = false; return; }
      if (n.t === 'tabs') { if (!n.tabs || !n.tabs.length) ok = false; (n.tabs || []).forEach(function (x) { if (!Dock.PANELS[x] || seen[x]) ok = false; seen[x] = 1; }); if (n.tabs && n.tabs.indexOf(n.active) < 0) n.active = n.tabs[0]; }
      else { if (!n.kids || n.kids.length < 1) ok = false; (n.kids || []).forEach(walk); }
    })(t);
    return ok;
  } catch (e) { return false; }
};
Dock.init = function () {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(Dock.KEY) || 'null'); } catch (e) {}
  var fl = saved && saved.floats, tr = saved && saved.tree ? saved.tree : saved;
  Dock.tree = tr && Dock.valid(tr) ? tr : Dock.defaults();
  for (var k in Dock.PANELS) Dock.PANELS[k].node = $(Dock.PANELS[k].el);
  /* floating windows from last time are reopened in the desktop app; in a browser their panels go back into the main window */
  Dock.floats = [];
  if (fl && fl.length && Dock.tree === tr) {
    var have = {};
    Dock.groups().forEach(function (g) { g.tabs.forEach(function (x) { have[x] = 1; }); });
    fl.forEach(function (f) {
      var tabs = (f.tabs || []).filter(function (x) { return Dock.PANELS[x] && !have[x]; });
      tabs.forEach(function (x) { have[x] = 1; });
      if (!tabs.length) return;
      if (window.cgNative) Dock.floats.push({ t: 'tabs', float: true, fid: 'f' + (Dock.fn = (Dock.fn || 0) + 1), tabs: tabs, active: tabs.indexOf(f.active) >= 0 ? f.active : tabs[0], x: f.x, y: f.y, w: f.w, h: f.h });
      else Dock.groups()[0].tabs.push.apply(Dock.groups()[0].tabs, tabs);
    });
  }
  $('#dock').addEventListener('mousedown', Dock.down);
  window.addEventListener('resize', function () { Dock.changed(true); });
  Dock.render();
};
Dock.save = function () {
  try {
    localStorage.setItem(Dock.KEY, JSON.stringify({ tree: Dock.tree, floats: Dock.floats.map(function (f) {
      var w = Dock.wins[f.fid];
      if (w && !w.closed) { f.x = w.screenX; f.y = w.screenY; f.w = w.innerWidth; f.h = w.innerHeight; }
      return { tabs: f.tabs, active: f.active, x: f.x, y: f.y, w: f.w, h: f.h };
    }) }, function (k, v) { return k === 'id' ? undefined : v; }));
  } catch (e) {}
};
Dock.reset = function () { Dock.floats = []; Dock.tree = Dock.defaults(); Dock.render(); if (window.Stage && App.project) setTimeout(Stage.fit, 0); };

/* tidy the tree: no empty groups, no splits with a single child, no split nested in a split of the same direction */
Dock.clean = function () {
  function fix(n) {
    if (n.t === 'tabs') return n.tabs.length ? n : null;
    n.kids = n.kids.map(fix).filter(Boolean);
    var flat = [];
    n.kids.forEach(function (k) {
      if (k.t === 'split' && k.dir === n.dir) { var tot = k.kids.reduce(function (a, b) { return a + (b.size || 1); }, 0) || 1; k.kids.forEach(function (q) { q.size = (q.size || 1) / tot * (k.size || 1); flat.push(q); }); }
      else flat.push(k);
    });
    n.kids = flat;
    if (!n.kids.length) return null;
    if (n.kids.length === 1) { n.kids[0].size = n.size; return n.kids[0]; }
    /* sizes are shares of the split and must add up to the whole, or a gap is left when a panel goes */
    var sum = n.kids.reduce(function (q, k) { return q + (k.size > 0 ? k.size : (k.size = 0.2)); }, 0);
    n.kids.forEach(function (k) { k.size = k.size / sum; });
    return n;
  }
  Dock.tree = fix(Dock.tree) || Dock.defaults();
  Dock.tree.size = 1;
};

Dock.render = function () {
  var store = $('#dock-store'), dock = $('#dock'), k, n = 0;
  Dock.clean();
  for (k in Dock.PANELS) store.appendChild(Dock.PANELS[k].node);
  Dock.byId = {};
  function build(node) {
    node.id = 'd' + (n++);
    Dock.byId[node.id] = node;
    var el;
    if (node.t === 'tabs') {
      el = h('div', { class: 'dk-group', 'data-id': node.id });
      var head = h('div', { class: 'dk-head' });
      node.tabs.forEach(function (name) {
        head.appendChild(h('span', { class: 'dk-tab' + (name === node.active ? ' on' : ''), 'data-tab': name, text: Dock.PANELS[name].title, title: 'Drag to move this panel: onto another panel to tab it there, or to an edge to split' }));
      });
      head.appendChild(h('span', { class: 'grow' }));
      head.appendChild(h('span', { class: 'dk-x dk-pop', 'data-pop': node.active, text: '\u29C9', title: 'Pop this panel out into its own window (you can also drag its tab out of the window)' }));
      head.appendChild(h('span', { class: 'dk-x', 'data-close': node.active, text: '×', title: 'Close this panel (Window menu brings it back)' }));
      var body = h('div', { class: 'dk-body' });
      body.appendChild(Dock.PANELS[node.active].node);
      el.appendChild(head); el.appendChild(body);
    } else {
      el = h('div', { class: 'dk-split ' + node.dir, 'data-id': node.id });
      node.kids.forEach(function (kid, i) {
        if (i) el.appendChild(h('div', { class: 'dk-bar', 'data-i': i - 1 }));
        el.appendChild(build(kid));
      });
    }
    el.style.flex = (node.size || 1) + ' 1 0px';
    return el;
  }
  dock.innerHTML = '';
  dock.appendChild(build(Dock.tree));
  Dock.renderFloats(n);
  Dock.changed();
};

/* ---------- floating windows ---------- */
Dock.closeFloats = function () {
  Dock.closing = true;
  for (var k in Dock.wins) { try { Dock.wins[k].close(); } catch (e) {} }
};
Dock.renderFloats = function (n) {
  var used = {};
  Dock.floats = Dock.floats.filter(function (f) { return f.tabs.length > 0; });
  Dock.floats.forEach(function (f) {
    used[f.fid] = 1;
    var w = Dock.wins[f.fid], doc;
    if (!w || w.closed) {
      w = null;
      try {
        w = window.open('', 'cgmotion_' + f.fid + '_' + Date.now(), 'popup=yes,width=' + Math.round(f.w || 420) + ',height=' + Math.round(f.h || 520) + (f.x != null ? ',left=' + Math.round(f.x) + ',top=' + Math.round(f.y) : ''));
        doc = w && w.document;
        doc.title = 'CG Motion';
      } catch (e) { w = null; }
      if (!w) {
        /* the window could not be opened: put the panels back where they can be reached */
        var home = Dock.groups().filter(function (g) { return !g.float; })[0];
        f.tabs.forEach(function (x) { home.tabs.push(x); });
        f.tabs = [];
        UI.status('A separate window could not be opened here, so the panel stays in the main window.');
        return;
      }
      var css = document.querySelector('link[rel=stylesheet]');
      doc.head.appendChild(h('meta', { charset: 'utf-8' }));
      doc.head.appendChild(h('link', { rel: 'stylesheet', href: css ? css.href : 'style.css' }));
      doc.body.className = document.body.className + ' float-win';
      doc.body.appendChild(h('div', { id: 'fl-root', class: 'dk-group' }));
      doc.getElementById('fl-root').addEventListener('mousedown', Dock.down);
      UI.addDoc(doc);
      if (App.project) RT.installFonts(App.project, doc);
      (function (fl, ww, dd) {
        ww.addEventListener('resize', function () { Dock.changed(true); });
        var gone = function () { Dock.reap(fl, dd); };
        ww.addEventListener('beforeunload', gone); ww.addEventListener('pagehide', gone); ww.addEventListener('unload', gone);
      })(f, w, doc);
      Dock.wins[f.fid] = w;
    }
    doc = w.document;
    f.id = 'd' + (n++);
    Dock.byId[f.id] = f;
    var rootEl = doc.getElementById('fl-root'), head = h('div', { class: 'dk-head' }), body = h('div', { class: 'dk-body' });
    rootEl.setAttribute('data-id', f.id);
    f.tabs.forEach(function (name) { head.appendChild(h('span', { class: 'dk-tab' + (name === f.active ? ' on' : ''), 'data-tab': name, text: Dock.PANELS[name].title, title: 'Drag this tab over the main window to dock it; a highlight shows where it will land' })); });
    head.appendChild(h('span', { class: 'dk-hint', text: 'drag the tab to dock' }));
    head.appendChild(h('span', { class: 'grow' }));
    head.appendChild(h('span', { class: 'dk-x dk-dockb', 'data-dock': f.active, text: 'Dock', title: 'Put this panel back into the main window' }));
    rootEl.innerHTML = '';
    body.appendChild(Dock.PANELS[f.active].node);
    rootEl.appendChild(head); rootEl.appendChild(body);
    doc.title = Dock.PANELS[f.active].title + ' - CG Motion';
  });
  for (var k in Dock.wins) if (!used[k]) { var ow = Dock.wins[k]; delete Dock.wins[k]; try { UI.removeDoc(ow.document); ow.close(); } catch (e) {} }
};
/* a floating window was closed: its panels go back into the main window */
Dock.reap = function (fl, dd) {
  if (fl.dead) return;
  fl.dead = true;
  if (dd) UI.removeDoc(dd);
  delete Dock.wins[fl.fid];
  if (Dock.closing || Dock.floats.indexOf(fl) < 0) return;
  var store = $('#dock-store'), tabs = fl.tabs.slice();
  tabs.forEach(function (x) { store.appendChild(Dock.PANELS[x].node); });
  Dock.floats.splice(Dock.floats.indexOf(fl), 1);
  setTimeout(function () { tabs.forEach(function (x) { Dock.show(x); }); if (tabs.indexOf('viewer') >= 0 && App.project) setTimeout(function () { if (Stage.checkSize) Stage.checkSize(); }, 50); }, 0);
};
/* safety net in case a window disappears without telling us */
setInterval(function () {
  Dock.floats.slice().forEach(function (f) { var w = Dock.wins[f.fid]; if (w && w.closed) { var d = null; try { d = w.document; } catch (e) {} Dock.reap(f, d); } });
}, 700);
/* take a panel out of the main window into its own window */
Dock.popOut = function (name, x, y) {
  var g = Dock.groupOf(name), node = Dock.PANELS[name].node;
  if (!g) return;
  if (!g.float && Dock.groups().filter(function (q) { return !q.float; }).length === 1 && g.tabs.length === 1) { UI.status('The last panel in the main window has to stay there.'); return; }
  var r = node.getBoundingClientRect(), w = Math.max(320, Math.round(r.width || 420)), hh = Math.max(240, Math.round((r.height || 480) + 26));
  g.tabs.splice(g.tabs.indexOf(name), 1);
  if (g.active === name) g.active = g.tabs[0];
  Dock.floats.push({ t: 'tabs', float: true, fid: 'f' + (Dock.fn = (Dock.fn || 0) + 1), tabs: [name], active: name, x: x == null ? window.screenX + 80 : x, y: y == null ? window.screenY + 80 : y, w: w, h: hh });
  Dock.render();
  if (name === 'viewer' && App.project) setTimeout(function () { if (Stage.checkSize) Stage.checkSize(); }, 150);
};
Dock.dockBack = function (name) {
  var g = Dock.groupOf(name);
  if (!g || !g.float) return;
  g.tabs.splice(g.tabs.indexOf(name), 1);
  if (g.active === name) g.active = g.tabs[0];
  $('#dock-store').appendChild(Dock.PANELS[name].node);
  Dock.show(name);
  if (name === 'viewer' && App.project) setTimeout(function () { if (Stage.checkSize) Stage.checkSize(); }, 50);
};
/* panels changed size or visibility: let them redraw */
Dock.changed = function (noSave) {
  if (!noSave) Dock.save();
  if (!window.App || !App.project) return;
  Stage.layout(); Timeline.build(); Panels.build(); Nodes.build();
};
Dock.show = function (name) {
  var g = Dock.groupOf(name);
  if (!g) {
    var side = ['assets', 'control', 'colours', 'easing', 'caspar'], home = null;
    var docked = Dock.groups().filter(function (q) { return !q.float; });
    /* the data grid wants width: it opens beside the timeline */
    if (name === 'data') docked.forEach(function (q) { if (!home && q.tabs.indexOf('timeline') >= 0) home = q; });
    docked.forEach(function (q) { if (!home && q.tabs.some(function (x) { return side.indexOf(x) >= 0; })) home = q; });
    g = home || docked[0];
    g.tabs.push(name);
  }
  if (g.active !== name) { g.active = name; Dock.render(); } else Dock.render();
};
Dock.close = function (name) {
  var g = Dock.groupOf(name);
  if (!g) return;
  if (!g.float && Dock.groups().filter(function (q) { return !q.float; }).length === 1 && g.tabs.length === 1) return;
  g.tabs.splice(g.tabs.indexOf(name), 1);
  if (g.active === name) g.active = g.tabs[0];
  Dock.render();
};
Dock.toggle = function (name) { if (Dock.groupOf(name)) Dock.close(name); else Dock.show(name); };

Dock.move = function (name, target, zone) {
  var src = Dock.groupOf(name);
  if (!src || !target) return;
  if (target.float) zone = 'center';
  if (src.float && src !== target) $('#dock-store').appendChild(Dock.PANELS[name].node);
  if (src === target && (zone === 'center' || src.tabs.length === 1)) return;
  src.tabs.splice(src.tabs.indexOf(name), 1);
  if (src.active === name) src.active = src.tabs[0];
  if (zone === 'center') { target.tabs.push(name); target.active = name; }
  else {
    var dir = (zone === 'left' || zone === 'right') ? 'row' : 'col', before = zone === 'left' || zone === 'top';
    var g = { t: 'tabs', tabs: [name], active: name }, par = Dock.parentOf(target), full = target.size || 1;
    if (par && par.dir === dir) {
      target.size = full / 2; g.size = full / 2;
      par.kids.splice(par.kids.indexOf(target) + (before ? 0 : 1), 0, g);
    } else {
      var sp = { t: 'split', dir: dir, size: full, kids: before ? [g, target] : [target, g] };
      g.size = 0.5; target.size = 0.5;
      if (par) par.kids[par.kids.indexOf(target)] = sp; else Dock.tree = sp;
    }
  }
  Dock.render();
};

Dock.down = function (e) {
  if (e.button !== 0) return;
  var t = e.target;
  if (t.dataset && t.dataset.close) { Dock.close(t.dataset.close); return; }
  if (t.dataset && t.dataset.pop) { Dock.popOut(t.dataset.pop); return; }
  if (t.dataset && t.dataset.dock) { Dock.dockBack(t.dataset.dock); return; }
  if (t.classList.contains('dk-bar')) {
    e.preventDefault();
    var sp = Dock.byId[t.parentNode.dataset.id], i = +t.dataset.i, a = sp.kids[i], b = sp.kids[i + 1];
    var ea = t.previousElementSibling, eb = t.nextElementSibling, row = sp.dir === 'row';
    var pa = row ? ea.offsetWidth : ea.offsetHeight, pb = row ? eb.offsetWidth : eb.offsetHeight, tot = (a.size || 1) + (b.size || 1), p0 = row ? e.clientX : e.clientY;
    var bd = UI.doc.body;
    bd.classList.add(row ? 'dk-drag-row' : 'dk-drag-col');
    dragLoop(function (ev) {
      var d = (row ? ev.clientX : ev.clientY) - p0, na = clamp(pa + d, 70, pa + pb - 70);
      a.size = tot * na / (pa + pb); b.size = tot - a.size;
      ea.style.flex = a.size + ' 1 0px'; eb.style.flex = b.size + ' 1 0px';
      if (App.project) Stage.drawOverlay();
    }, function () { bd.classList.remove('dk-drag-row', 'dk-drag-col'); Dock.changed(); });
    return;
  }
  if (t.classList.contains('dk-tab')) {
    e.preventDefault();
    var name = t.dataset.tab, g = Dock.byId[t.closest('.dk-group').dataset.id], x0 = e.clientX, y0 = e.clientY, moving = false, hit = null, srcBody = UI.doc.body;
    dragLoop(function (ev) {
      if (!moving && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 8) return;
      if (!moving) { moving = true; srcBody.classList.add('dk-moving'); }
      hit = Dock.hitScreen(ev.screenX, ev.screenY);
      /* nothing happens until release: the highlight shows exactly where the panel will go */
      if (hit && hit.node === g && (hit.zone === 'center' || g.tabs.length === 1)) hit = { doc: hit.doc, none: true };
      Dock.mark(hit);
    }, function (ev) {
      srcBody.classList.remove('dk-moving');
      Dock.mark(null);
      if (!moving) { if (g.active !== name) { g.active = name; Dock.render(); } return; }
      if (hit && hit.root) Dock.moveRoot(name, hit.root);
      else if (hit && hit.node) Dock.move(name, hit.node, hit.zone);
      /* let go outside every window: the panel floats there */
      else if (!hit && (!g.float || g.tabs.length > 1)) Dock.popOut(name, ev.screenX - 60, ev.screenY - 12);
    });
  }
};

/* where a window's page starts on the screen (learned from the mouse, so it is exact) */
Dock.org = function (doc) {
  if (doc._org) return doc._org;
  var w = doc.defaultView, b = Math.max(0, (w.outerWidth - w.innerWidth) / 2);
  return [w.screenX + b, w.screenY + Math.max(0, w.outerHeight - w.innerHeight - b)];
};
/* what is under a point on the screen: a panel group and the zone of it, an outer edge of the workspace, or nothing */
Dock.hitScreen = function (sx, sy) {
  var docs = Dock.floats.map(function (f) { var w = Dock.wins[f.fid]; return w && !w.closed ? w.document : null; }).filter(Boolean).reverse().concat([document]);
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i], w = doc.defaultView, o = Dock.org(doc), cx = sx - o[0], cy = sy - o[1];
    if (cx < 0 || cy < 0 || cx > w.innerWidth || cy > w.innerHeight) continue;
    if (doc === document) {
      var dr = $('#dock', document).getBoundingClientRect(), E = 14;
      if (cx >= dr.left && cx <= dr.right && cy >= dr.top && cy <= dr.bottom) {
        var side = cx - dr.left < E ? 'left' : (dr.right - cx < E ? 'right' : (cy - dr.top < E ? 'top' : (dr.bottom - cy < E ? 'bottom' : null)));
        if (side) {
          var q0 = { left: dr.left, top: dr.top, width: dr.width, height: dr.height };
          if (side === 'left') q0.width = dr.width / 4; if (side === 'right') { q0.left = dr.right - dr.width / 4; q0.width = dr.width / 4; }
          if (side === 'top') q0.height = dr.height / 4; if (side === 'bottom') { q0.top = dr.bottom - dr.height / 4; q0.height = dr.height / 4; }
          return { doc: doc, root: side, rect: q0, label: 'Dock along the ' + side + ' of the workspace' };
        }
      }
    }
    var el = doc.elementFromPoint(cx, cy), ge = el && el.closest('.dk-group');
    if (!ge || !Dock.byId[ge.dataset.id]) return { doc: doc, none: true };
    var node = Dock.byId[ge.dataset.id], r = ge.getBoundingClientRect(), fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height, zone = 'center';
    if (!node.float && cy - r.top > 26) {
      var m = Math.min(fx, 1 - fx, fy, 1 - fy);
      if (m < 0.25) zone = m === fx ? 'left' : (m === 1 - fx ? 'right' : (m === fy ? 'top' : 'bottom'));
    }
    var q = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (zone === 'left') q.width = r.width / 2; if (zone === 'right') { q.left = r.left + r.width / 2; q.width = r.width / 2; }
    if (zone === 'top') q.height = r.height / 2; if (zone === 'bottom') { q.top = r.top + r.height / 2; q.height = r.height / 2; }
    var names = node.tabs.map(function (x) { return Dock.PANELS[x].title; }).join(', ');
    return { doc: doc, node: node, zone: zone, rect: q, label: zone === 'center' ? 'Tab with ' + names : 'Dock ' + (zone === 'left' || zone === 'right' ? 'to the ' + zone + ' of ' : (zone === 'top' ? 'above ' : 'below ')) + names };
  }
  return null;
};
/* the green highlight of where the panel will land, in whichever window it is over */
Dock.mark = function (hit) {
  UI.docs.forEach(function (d) {
    var m = d.getElementById('dk-drop');
    if (!hit || hit.doc !== d || !hit.rect) { if (m) m.parentNode.removeChild(m); return; }
    if (!m) { m = h('div', { id: 'dk-drop' }, h('span', {})); d.body.appendChild(m); }
    m.style.cssText = 'display:flex;left:' + hit.rect.left + 'px;top:' + hit.rect.top + 'px;width:' + hit.rect.width + 'px;height:' + hit.rect.height + 'px';
    m.firstChild.textContent = hit.label || '';
  });
};
/* dock a panel along an outer edge of the whole workspace */
Dock.moveRoot = function (name, side) {
  var src = Dock.groupOf(name);
  if (!src) return;
  if (!src.float && Dock.groups().filter(function (q) { return !q.float; }).length === 1 && src.tabs.length === 1) return;
  src.tabs.splice(src.tabs.indexOf(name), 1);
  if (src.active === name) src.active = src.tabs[0];
  if (src.float) $('#dock-store').appendChild(Dock.PANELS[name].node);
  var dir = (side === 'left' || side === 'right') ? 'row' : 'col', before = side === 'left' || side === 'top';
  var g = { t: 'tabs', tabs: [name], active: name, size: 0.25 }, old = Dock.tree;
  old.size = 0.75;
  Dock.tree = { t: 'split', dir: dir, size: 1, kids: before ? [g, old] : [old, g] };
  Dock.render();
  if (App.project) setTimeout(function () { if (Stage.checkSize) Stage.checkSize(); }, 50);
};

/* ================= menus ================= */
var Menu = { open: null };
Menu.defs = function () {
  return [
    ['File', [['Projects...', 'projects'], ['New project...', 'new', 'Ctrl+N'], ['Open...', 'open', 'Ctrl+O'], ['Import Loopic project (.loo)...', 'open'], '-', ['Save', 'save', 'Ctrl+S'], ['Save as...', 'saveas', 'Ctrl+Shift+S'], '-',
      ['Export template', 'export', 'Ctrl+E'], ['Export variables as CSV', 'csv'], '-', ['Optimise sequences for playback', 'optimise']]],
    ['Edit', [['Undo', 'undo', 'Ctrl+Z'], ['Redo', 'redo', 'Ctrl+Shift+Z'], '-', ['Copy', 'copy', 'Ctrl+C'], ['Paste', 'paste', 'Ctrl+V'], ['Duplicate', 'dup', 'Ctrl+D'], ['Delete', 'del', 'Del'], '-', ['Select all layers', 'selall', 'Ctrl+A']]],
    ['Layer', [['New text', 'toolText', 'T'], ['New rectangle', 'toolRect', 'R'], ['New ellipse', 'toolEllipse', 'O'], ['New image slot', 'slot'], ['New null', 'null'], ['New table', 'table'], ['New chart', 'chart'], ['New crawl', 'crawl'], '-',
      ['Make repeater', 'repeat'], ['Pre-compose', 'precomp', 'Ctrl+Shift+C'], '-', ['Bring forward', 'up', 'Ctrl+]'], ['Send backward', 'down', 'Ctrl+['], '-',
      ['Add stop marker', 'marker', 'M'], ['Add repeat section', 'loop'], ['Easy ease keyframes', 'ease', 'F9']]],
    ['View', [['Fit composition', 'fit'], ['Actual size (100%)', 'z100'], '-', ['Hand tool (drag to move around)', 'toolHand', 'H', function () { return App.tool === 'hand'; }], ['Trackpad scrolling (two fingers move, pinch zooms)', 'trackT', '', function () { return !!App.ui.trackpad; }], '-', ['Safe areas', 'guidesT', '', function () { return !!App.ui.guides; }], ['Snapping', 'snapT', '', function () { return App.ui.snap !== false; }], '-',
      ['Node screen', 'nodes', '', function () { return Nodes.on; }]]],
    ['Window', Object.keys(Dock.PANELS).map(function (k) { return [Dock.PANELS[k].title, 'win:' + k, '', function () { return !!Dock.groupOf(k); }]; }).concat(['-', ['Float the Viewer in its own window', function () { Dock.popOut('viewer'); }], ['Float the Timeline in its own window', function () { Dock.popOut('timeline'); }], ['Reset layout', 'resetLayout']])],
    ['Help', [['Open the guide (PDF)', 'guide', 'F1'], ['Open the tutorial project', 'tutorial'], ['Keyboard shortcuts', 'shortcuts']]]
  ];
};
Menu.init = function () {
  var bar = $('#menus');
  Menu.defs().forEach(function (m, i) { bar.appendChild(h('span', { class: 'menu-b', 'data-m': i, text: m[0] })); });
  bar.addEventListener('mousedown', function (e) {
    var b = e.target.closest('.menu-b');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (Menu.open === +b.dataset.m) Menu.close(); else Menu.show(+b.dataset.m);
  });
  bar.addEventListener('mouseover', function (e) { var b = e.target.closest('.menu-b'); if (b && Menu.open != null && Menu.open !== +b.dataset.m) Menu.show(+b.dataset.m); });
};
Menu.close = function () {
  $$('.popup').forEach(function (p) { p.parentNode.removeChild(p); });
  $$('.menu-b.on').forEach(function (b) { b.classList.remove('on'); });
  Menu.open = null;
};
Menu.run = function (cmd) {
  Menu.close();
  if (cmd.indexOf('win:') === 0) { Dock.toggle(cmd.slice(4)); return; }
  var f = Main.cmds[cmd];
  if (f) f();
};
/* items: [label, command or function, shortcut, checked()] or '-' */
Menu.popup = function (items, x, y) {
  var p = h('div', { class: 'popup' });
  items.forEach(function (it) {
    if (it === '-') { p.appendChild(h('div', { class: 'mi-sep' })); return; }
    var on = it[3] ? it[3]() : null;
    var row = h('div', { class: 'mi' }, [h('span', { class: 'mi-c', text: on ? '✓' : '' }), h('span', { class: 'mi-l', text: it[0] }), h('span', { class: 'mi-k', text: it[2] || '' })]);
    row.addEventListener('click', function (e) { e.stopPropagation(); if (typeof it[1] === 'function') { Menu.close(); it[1](); } else Menu.run(it[1]); });
    p.appendChild(row);
  });
  UI.doc.body.appendChild(p);
  var r = p.getBoundingClientRect(), vw = UI.doc.defaultView;
  p.style.left = Math.max(2, Math.min(x, vw.innerWidth - r.width - 4)) + 'px';
  p.style.top = Math.max(2, Math.min(y, vw.innerHeight - r.height - 4)) + 'px';
  return p;
};
Menu.show = function (i) {
  Menu.close();
  var b = document.querySelector('.menu-b[data-m="' + i + '"]'), r = b.getBoundingClientRect();
  UI.doc = document;
  b.classList.add('on');
  Menu.popup(Menu.defs()[i][1], r.left, r.bottom);
  Menu.open = i;
};
/* right-click menu for a layer (or for empty space when L is null) */
Menu.layer = function (e, L) {
  e.preventDefault();
  Menu.close();
  if (L && App.sel.indexOf(L.id) < 0) { App.sel = [L.id]; App.selKeys = []; App.emit('sel'); }
  var items;
  if (L) {
    items = [
      ['Rename...', function () { UI.prompt('Rename layer', L.name).then(function (v) { if (v) { L.name = v; App.commit(); } }); }],
      ['Duplicate', 'dup', 'Ctrl+D'], ['Delete', 'del', 'Del'], '-',
      [L.visible === false ? 'Show' : 'Hide', function () { App.selLayers().forEach(function (x) { x.visible = L.visible === false; }); App.commit(); }],
      [L.locked ? 'Unlock' : 'Lock', function () { var v = !L.locked; App.selLayers().forEach(function (x) { x.locked = v; }); App.commit(); }], '-',
      ['Bring forward', 'up', 'Ctrl+]'], ['Send backward', 'down', 'Ctrl+['], '-',
      ['Make repeater', 'repeat'], ['Pre-compose', 'precomp'],
      L.type === 'comp' ? ['Open composition', function () { App.openComp(L.comp); }] : ['Show in node screen', function () { Nodes.toggle(true); }]
    ];
  } else {
    items = [['Paste', 'paste', 'Ctrl+V'], '-', ['New text', 'toolText'], ['New rectangle', 'toolRect'], ['New ellipse', 'toolEllipse'], ['New image slot', 'slot'], ['New null', 'null'], ['New table', 'table'], ['New chart', 'chart'], ['New crawl', 'crawl'], '-', ['Fit composition', 'fit']];
  }
  Menu.popup(items, e.clientX + 2, e.clientY + 2);
};
