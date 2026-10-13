/* CG Motion - core state, history and helpers */
var RT = CGRuntime;

/* finds an element in the main window or in any floating panel window */
function $(sel, root) {
  if (root) return root.querySelector(sel);
  var ds = (window.UI && UI.docs) || [document];
  for (var i = 0; i < ds.length; i++) { var r = ds[i].querySelector(sel); if (r) return r; }
  return null;
}
function $$(sel) {
  var out = [], ds = (window.UI && UI.docs) || [document];
  ds.forEach(function (d) { Array.prototype.push.apply(out, d.querySelectorAll(sel)); });
  return out;
}
function h(tag, attrs, kids) {
  var e = document.createElement(tag), k;
  if (attrs) for (k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  }
  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function uid(p) { return (p || 'i') + Math.random().toString(36).slice(2, 9); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function round2(v) { return Math.round(v * 100) / 100; }
function natCmp(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var PROPS = {
  transform: ['x', 'y', 'ax', 'ay', 'sx', 'sy', 'rot', 'skx', 'sky', 'op'],
  text: ['fontSize', 'tracking', 'lineHeight', 'color', 'w', 'h', 'bg', 'radius', 'stroke', 'strokeW'],
  shape: ['w', 'h', 'radius', 'fill', 'fill2', 'gradAngle', 'stroke', 'strokeW'],
  image: ['w', 'h'], sequence: ['w', 'h'], lottie: ['w', 'h'], comp: [], 'null': [],
  table: ['w', 'h', 'fontSize', 'color', 'fill', 'fill2', 'bg', 'stroke', 'strokeW'],
  chart: ['w', 'h', 'prog', 'fontSize', 'color', 'bg', 'strokeW'],
  crawl: ['w', 'h', 'fontSize', 'tracking', 'color', 'bg'],
  mask: ['mx', 'my', 'mw', 'mh', 'mr'],
  fx: ['blur', 'bright', 'contrast', 'sat', 'hue', 'shX', 'shY', 'shBlur', 'shColor', 'texOp', 'texX', 'texY', 'texSc', 'texRot', 'texBr', 'texCt', 'texBlur', 'texHue', 'texSat']
};
var LABELS = {
  x: 'Position X', y: 'Position Y', ax: 'Anchor X', ay: 'Anchor Y', sx: 'Scale X', sy: 'Scale Y', rot: 'Rotation', skx: 'Skew X', sky: 'Skew Y', op: 'Opacity',
  fontSize: 'Font size', tracking: 'Letter spacing', lineHeight: 'Line height', color: 'Text colour',
  w: 'Width', h: 'Height', radius: 'Corner radius', bg: 'Box colour', fill: 'Fill', fill2: 'Fill 2', gradAngle: 'Gradient angle', stroke: 'Stroke', strokeW: 'Stroke width',
  prog: 'Progress', texOp: 'Texture opacity', texX: 'Texture offset X', texY: 'Texture offset Y', texSc: 'Texture zoom', texRot: 'Texture turn', texBr: 'Texture brightness', texCt: 'Texture contrast', texBlur: 'Texture soften', texHue: 'Texture hue', texSat: 'Texture saturation', mx: 'Mask X', my: 'Mask Y', mw: 'Mask width', mh: 'Mask height', mr: 'Mask radius',
  blur: 'Blur', bright: 'Brightness', contrast: 'Contrast', sat: 'Saturation', hue: 'Hue', shX: 'Shadow X', shY: 'Shadow Y', shBlur: 'Shadow blur', shColor: 'Shadow colour'
};
var TYPE_NAMES = { text: 'Text', shape: 'Shape', image: 'Image', sequence: 'Sequence', lottie: 'Lottie', comp: 'Comp', 'null': 'Null', table: 'Table', chart: 'Chart', crawl: 'Crawl' };

var App = {
  project: null, compId: null, time: 0, sel: [], selKeys: [], tool: 'select', playing: false,
  dirty: false, path: null, gen: 0, hist: [], hi: -1, testData: {}, listeners: {},
  ui: { expanded: {}, pxf: 6, guides: false, seqWebp: 0.9 }
};

App.on = function (ev, fn) { (App.listeners[ev] = App.listeners[ev] || []).push(fn); };
App.emit = function (ev, arg) { (App.listeners[ev] || []).forEach(function (fn) { fn(arg); }); };

App.blankProject = function () {
  var cid = uid('c');
  return {
    app: 'cgmotion', version: 1, name: 'Untitled', rootComp: cid,
    comps: [{ id: cid, name: 'Main', w: 1920, h: 1080, fps: 50, duration: 250, bg: '#1e1e1e', layers: [], markers: [] }],
    assets: {},
    easings: [
      { id: 'e_ease', name: 'Ease', b: [0.33, 0, 0.67, 1] },
      { id: 'e_in', name: 'Ease in', b: [0.42, 0, 1, 1] },
      { id: 'e_out', name: 'Ease out', b: [0, 0, 0.58, 1] },
      { id: 'e_smooth', name: 'Smooth', b: [0.65, 0, 0.35, 1] },
      { id: 'e_snapout', name: 'Snappy out', b: [0.16, 1, 0.3, 1] },
      { id: 'e_snapin', name: 'Snappy in', b: [0.7, 0, 0.84, 0] },
      { id: 'e_over', name: 'Overshoot', b: [0.34, 1.56, 0.64, 1] },
      { id: 'e_antic', name: 'Anticipate', b: [0.36, 0, 0.66, -0.56] }
    ],
    actions: [], swatches: [], defaultEase: { type: 'linear' }, dataKeys: 1,
    caspar: { host: '127.0.0.1', port: 5250, channel: 1, layer: 20, folder: '' }
  };
};

App.load = function (project, path) {
  var b = App.blankProject(), k, needKeys = !project.dataKeys;
  for (k in b) if (project[k] === undefined) project[k] = b[k];
  project.comps.forEach(function (c) {
    c.markers = (c.markers || []).filter(function (m) { return m.t > 0; });
    c.layers.forEach(function (L) {
      L.a = L.a || {}; L.p = L.p || {}; L.mask = L.mask || { on: false, shape: 'rect' };
      /* the older two-part "second style" becomes the general text styles */
      /* older drift X / Y becomes a scroll with a direction and speed */
      if (L.tex && !L.tex.motion && (L.tex.moveX || L.tex.moveY)) { L.tex.motion = 'scroll'; L.tex.speed = Math.round(Math.sqrt(L.tex.moveX * L.tex.moveX + L.tex.moveY * L.tex.moveY) * 10) / 10; L.tex.dir = Math.round(Math.atan2(+L.tex.moveY || 0, +L.tex.moveX || 0) * 180 / Math.PI); delete L.tex.moveX; delete L.tex.moveY; }
      if (L.split && !L.styles) { L.styles = { on: !!L.split.on, sep: L.split.sep || '||', join: L.split.join == null ? ' ' : L.split.join, segs: [{}, { font: L.split.font || '', weight: L.split.weight || '', italic: L.split.italic || '' }] }; delete L.split; }
    });
  });
  /* tables, charts and crawls are always controllable from CasparCG (older projects had this off by default) */
  if (needKeys) {
    project.dataKeys = 1;
    var prevP = App.project; App.project = project;
    project.comps.forEach(function (c) { c.layers.forEach(function (L) { if ((L.type === 'table' || L.type === 'chart' || L.type === 'crawl') && !L.key) L.key = App.freeKey(L.type); }); });
    App.project = prevP;
  }
  if (!project.exportFolder && project.caspar && project.caspar.folder) project.exportFolder = project.caspar.folder;
  App.project = project;
  App.compId = project.rootComp;
  App.path = path || null;
  App.time = 0; App.sel = []; App.selKeys = []; App.testData = {};
  App.gen++;
  App.hist = [App.snap()]; App.hi = 0;
  App.setDirty(false);
  UI.installFonts();
  App.emit('project');
  App.emit('change');
};

App.comp = function (id) {
  var cs = App.project.comps, i;
  id = id || App.compId;
  for (i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
  return cs[0];
};
App.layer = function (id) {
  var ls = App.comp().layers;
  for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i];
  return null;
};
App.selLayers = function () { return App.comp().layers.filter(function (L) { return App.sel.indexOf(L.id) >= 0; }); };
App.allLayers = function (fn) { App.project.comps.forEach(function (c) { c.layers.forEach(function (L) { fn(L, c); }); }); };

/* ---------- history ---------- */
App.snap = function () {
  var p = App.project, a = p.assets;
  p.assets = undefined;
  var s = JSON.stringify(p);
  p.assets = a;
  return s;
};
App.setDirty = function (d) {
  App.dirty = d;
  document.title = (d ? '• ' : '') + App.project.name + ' - CG Motion';
  var pn = $('#proj-name');
  if (pn) pn.textContent = (d ? '• ' : '') + App.project.name + '  /  ' + App.comp().name;
  if (window.Api) Api.setDirty(d);
};
App.commit = function () {
  var s = App.snap();
  if (s !== App.hist[App.hi]) {
    App.hist.length = App.hi + 1;
    App.hist.push(s);
    if (App.hist.length > 150) App.hist.shift();
    App.hi = App.hist.length - 1;
    App.setDirty(true);
  }
  App.emit('change');
};
App.touch = function () { App.emit('change'); };
App.restore = function (s) {
  var a = App.project.assets;
  App.project = JSON.parse(s);
  App.project.assets = a;
  App.gen++;
  App.selKeys = [];
  if (!App.project.comps.some(function (c) { return c.id === App.compId; })) App.compId = App.project.rootComp;
  App.sel = App.sel.filter(function (id) { return !!App.layer(id); });
  App.setDirty(true);
  App.emit('project');
  App.emit('change');
};
App.undo = function () { if (App.hi > 0) { App.hi--; App.restore(App.hist[App.hi]); } };
App.redo = function () { if (App.hi < App.hist.length - 1) { App.hi++; App.restore(App.hist[App.hi]); } };

/* ---------- properties and keyframes ---------- */
App.val = function (L, name, t) { return RT.evalProp(L, name, t == null ? App.time : t, App.project); };
App.setKey = function (L, name, t, v) {
  var ks = L.a[name], i;
  for (i = 0; i < ks.length; i++) if (ks[i].t === t) { ks[i].v = v; return ks[i]; }
  var k = { t: t, v: v, e: clone(App.project.defaultEase || { type: 'linear' }) };
  ks.push(k);
  ks.sort(function (a, b) { return a.t - b.t; });
  return k;
};
App.setProp = function (L, name, v) {
  if (L.a[name]) App.setKey(L, name, Math.round(App.time), v);
  else L.p[name] = v;
};
App.toggleAnim = function (L, name) {
  if (L.a[name]) {
    var v = App.val(L, name);
    App.selKeys = App.selKeys.filter(function (k) { return L.a[name].indexOf(k) < 0; });
    delete L.a[name];
    L.p[name] = v;
  } else {
    L.a[name] = [{ t: Math.round(App.time), v: App.val(L, name), e: clone(App.project.defaultEase || { type: 'linear' }) }];
  }
};
App.keyAt = function (L, name, t) {
  var ks = L.a[name] || [];
  for (var i = 0; i < ks.length; i++) if (ks[i].t === t) return ks[i];
  return null;
};
App.toggleKey = function (L, name) {
  var t = Math.round(App.time), k = App.keyAt(L, name, t);
  if (!L.a[name]) { App.toggleAnim(L, name); return; }
  if (k) {
    L.a[name].splice(L.a[name].indexOf(k), 1);
    App.selKeys = App.selKeys.filter(function (x) { return x !== k; });
    if (!L.a[name].length) { delete L.a[name]; L.p[name] = k.v; }
  } else App.setKey(L, name, t, App.val(L, name));
};
App.normalizeKeys = function () {
  App.comp().layers.forEach(function (L) {
    for (var n in L.a) {
      var ks = L.a[n], seen = {}, out = [];
      ks.sort(function (a, b) { return a.t - b.t || (App.selKeys.indexOf(b) >= 0 ? -1 : 1); });
      /* when two keys land on one frame, the one being dragged (selected) wins */
      ks.forEach(function (k) {
        if (seen[k.t] == null) { seen[k.t] = out.length; out.push(k); }
        else if (App.selKeys.indexOf(k) >= 0) out[seen[k.t]] = k;
      });
      L.a[n] = out;
    }
  });
  var all = [];
  App.comp().layers.forEach(function (L) { for (var n in L.a) all = all.concat(L.a[n]); });
  App.selKeys = App.selKeys.filter(function (k) { return all.indexOf(k) >= 0; });
};
App.keyOwner = function (k) {
  var res = null;
  App.comp().layers.forEach(function (L) { for (var n in L.a) if (L.a[n].indexOf(k) >= 0) res = { layer: L, prop: n }; });
  return res;
};
/* a field name nobody uses yet: table1, chart2 ... */
App.freeKey = function (base) {
  var used = {}, i = 1;
  App.allLayers(function (L) { if (L.key) used[L.key] = 1; (L.bindings || []).forEach(function (b) { if (b.key) used[b.key] = 1; }); for (var q in (L.bind || {})) if (L.bind[q].key) used[L.bind[q].key] = 1; });
  (App.project.swatches || []).forEach(function (s) { if (s.key) used[s.key] = 1; });
  while (used[base + i]) i++;
  return base + i;
};
/* everything on a layer that can be mapped to a CasparCG field: [property, label, kind] */
App.bindable = function (L) {
  var out = [{ k: 'visible', label: 'Visible (on/off)', kind: 'toggle' }];
  PROPS.transform.concat(PROPS[L.type] || []).forEach(function (n) { out.push({ k: n, label: LABELS[n], kind: RT.COLOR_PROPS[n] ? 'colour' : 'number' }); });
  var extra = {
    text: [['font', 'Font name', 'text'], ['weight', 'Font weight', 'text'], ['align', 'Align (left/center/right)', 'text'], ['italic', 'Italic (on/off)', 'toggle'], ['upper', 'Uppercase (on/off)', 'toggle'], ['maxW', 'Fit width', 'number'], ['wrapW', 'Wrap width', 'number'], ['padL', 'Margin left', 'number'], ['padR', 'Margin right', 'number'], ['padT', 'Margin top', 'number'], ['padB', 'Margin bottom', 'number']],
    shape: [['shape', 'Shape (rect/ellipse)', 'text'], ['gradient', 'Gradient (on/off)', 'toggle']],
    image: [['fit', 'Fit (fill/contain/cover)', 'text']],
    sequence: [['loop', 'Playback (hold/loop/pingpong)', 'text'], ['fps', 'Sequence FPS', 'number'], ['freeRun', 'Keep running (on/off)', 'toggle']],
    lottie: [['loop', 'Playback (hold/loop)', 'text'], ['speed', 'Speed', 'number'], ['freeRun', 'Keep running (on/off)', 'toggle']],
    table: [['rows', 'Table data', 'text'], ['header', 'Header row (on/off)', 'toggle'], ['firstBold', 'First column bold (on/off)', 'toggle'], ['cols', 'Column widths', 'text'], ['aligns', 'Column alignment', 'text']],
    chart: [['data', 'Chart data', 'text'], ['chart', 'Chart type (line/bar/hbar/dual/pie/donut)', 'text'], ['ymax', 'Scale maximum', 'number'], ['colors', 'Series colours', 'text'], ['suffix', 'Value suffix (e.g. %)', 'text'], ['legend', 'Legend (on/off)', 'toggle'], ['cumul', 'Running total (on/off)', 'toggle'], ['xStart', 'First label number', 'number']],
    crawl: [['text', 'Crawl text', 'text'], ['speed', 'Speed (px per second)', 'number'], ['sepText', 'Separator', 'text']]
  }[L.type] || [];
  extra.forEach(function (e) { out.push({ k: e[0], label: e[1], kind: e[2] }); });
  if (L.type !== 'null' && L.type !== 'sequence') [['tex.on', 'Texture on/off', 'toggle'], ['tex.kind', 'Texture type (grain/paper/brushed/carbon/scan/lines/grid/dots/hex/halftone/gradient/radial/rays/rings/vignette/gloss/shine/image)', 'text'], ['tex.src', 'Texture picture (path or URL)', 'text'], ['tex.blend', 'Texture blend (overlay/soft-light/multiply/screen/normal)', 'text'],
    ['tex.scale', 'Texture size %', 'number'], ['tex.aspect', 'Texture stretch %', 'number'], ['tex.angle', 'Texture angle', 'number'], ['tex.color', 'Texture pattern colour', 'text'], ['tex.invert', 'Texture invert (on/off)', 'toggle'],
    ['tex.motion', 'Texture motion (none/scroll/pingpong/flicker/orbit)', 'text'], ['tex.speed', 'Texture scroll speed px/s', 'number'], ['tex.dir', 'Texture direction (degrees)', 'number'], ['tex.dist', 'Texture distance px', 'number'], ['tex.period', 'Texture seconds per cycle', 'number'],
    ['tex.rate', 'Texture flicker jumps per second', 'number'], ['tex.spin', 'Texture spin degrees/s', 'number'], ['tex.pulse', 'Texture pulse %', 'number'], ['tex.fade', 'Texture fade (none/edges/top/bottom/left/right/centre/outside)', 'text'], ['tex.maskInv', 'Texture mask inverted (on/off)', 'toggle']
  ].forEach(function (e) { out.push({ k: e[0], label: e[1], kind: e[2] }); });
  out.push({ k: 'blend', label: 'Blend mode', kind: 'text' }, { k: 'start', label: 'In frame', kind: 'number' }, { k: 'end', label: 'Out frame', kind: 'number' });
  PROPS.mask.forEach(function (n) { out.push({ k: n, label: LABELS[n], kind: 'number' }); });
  PROPS.fx.forEach(function (n) { out.push({ k: n, label: LABELS[n], kind: RT.COLOR_PROPS[n] ? 'colour' : 'number' }); });
  out.push({ k: 'shadow', label: 'Drop shadow (on/off)', kind: 'toggle' });
  return out;
};
/* layers whose box has its own width and height (resized with the handles rather than scaled) */
App.isSized = function (L) { return /^(shape|image|sequence|lottie|table|chart|crawl)$/.test(L.type) || (L.type === 'text' && !!L.box); };
App.animProps = function (L) {
  var list = PROPS.transform.concat(PROPS[L.type] || [], PROPS.mask, PROPS.fx);
  return list.filter(function (n) { return !!L.a[n]; });
};

/* ---------- time ---------- */
App.setTime = function (t, fromLive) {
  var c = App.comp();
  App.time = clamp(Math.round(t), 0, Math.max(0, c.duration - 1));
  if (!fromLive && App.liveMode) { App.liveMode = false; Stage.player && Stage.player.halt(); }
  App.emit('time');
};
App.togglePlay = function () {
  if (App.playing) { App.playing = false; App.emit('play'); return; }
  var c = App.comp(), t0 = performance.now(), f0 = App.time >= c.duration - 1 ? 0 : App.time;
  App.playing = true;
  App.emit('play');
  (function tick(now) {
    if (!App.playing) return;
    var f = f0 + (now - t0) / 1000 * c.fps;
    if (f >= c.duration) { t0 = now; f0 = 0; f = 0; }
    App.setTime(Math.floor(f));
    requestAnimationFrame(tick);
  })(t0);
};

/* ---------- layers ---------- */
App.newLayer = function (type, extra) {
  var c = App.comp(), n = 1, base = TYPE_NAMES[type], name;
  do { name = base + ' ' + n++; } while (c.layers.some(function (L) { return L.name === name; }));
  var L = {
    id: uid('l'), name: name, type: type, start: 0, end: c.duration, visible: true, locked: false,
    parent: '', matte: '', matteMode: 'alpha', blend: 'normal',
    p: { x: c.w / 2, y: c.h / 2 }, a: {}, mask: { on: false, shape: 'rect' }, shadow: false
  };
  if (type === 'text') {
    var fam = 'Arial', as = App.project.assets, k;
    for (k in as) if (as[k].type === 'font') { fam = as[k].family; break; }
    L.text = 'Text'; L.font = fam; L.weight = 400; L.align = 'left'; L.key = ''; L.maxW = 0; L.wrapW = 0;
    L.p.fontSize = 72; L.p.color = '#ffffffff';
  } else if (type === 'shape') {
    L.shape = 'rect'; L.gradient = false;
    L.p.w = 400; L.p.h = 200; L.p.ax = 200; L.p.ay = 100; L.p.fill = '#00ff83ff';
  } else if (type === 'null') { L.p.ax = 50; L.p.ay = 50; }
  else if (type === 'table' || type === 'chart' || type === 'crawl') {
    var fam2 = 'Arial', as2 = App.project.assets, k2;
    for (k2 in as2) if (as2[k2].type === 'font') { fam2 = as2[k2].family; break; }
    L.font = fam2; L.weight = 400; L.key = App.freeKey(type);
    if (type === 'table') {
      L.rows = 'Pos|Team|P|W|Pts\n1|Proteas|6|5|22\n2|Australia|6|4|18\n3|India|6|4|17\n4|England|6|2|10';
      L.header = true; L.cols = '1,4,1,1,1.4'; L.aligns = 'c,l,c,c,c'; L.headColor = '#06210fff'; L.reveal = 'slide'; L.stagger = 4; L.revealDur = 10;
      L.p.w = 900; L.p.h = 300; L.p.fontSize = 30; L.p.color = '#ffffffff'; L.p.fill = '#202020e6'; L.p.fill2 = '#2b2b2be6'; L.p.bg = '#00ff83ff'; L.p.stroke = '#00000066'; L.p.strokeW = 1;
    } else if (type === 'chart') {
      L.chart = 'line'; L.cumul = true; L.legend = true; L.anim = 50;
      L.data = 'Proteas: 4, 8, 3, 12w, 6, 9, 2, 14, 7, 10w\nAustralia: 6, 2, 10, 5, 7w, 11, 4, 8w, 13, 6';
      L.p.w = 900; L.p.h = 480; L.p.fontSize = 22; L.p.color = '#ffffffff'; L.p.bg = '#00000000'; L.p.strokeW = 5;
    } else {
      L.text = 'Breaking news | Scores and results all day | Next match starts at 14:00';
      L.itemSep = '|'; L.sepText = '\u2022'; L.sepColor = '#00ff83ff'; L.gap = 60; L.speed = 160; L.fade = 40;
      L.p.w = 1920; L.p.h = 64; L.p.fontSize = 34; L.p.color = '#ffffffff'; L.p.bg = '#141414e6';
    }
    L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
    if (type === 'crawl') { L.p.x = c.w / 2; L.p.y = c.h - 90; }
  }
  if (extra) { for (var e in extra) { if (e === 'p') { for (var q in extra.p) L.p[q] = extra.p[q]; } else L[e] = extra[e]; } }
  return L;
};
App.addLayer = function (type, extra) {
  var L = App.newLayer(type, extra);
  App.comp().layers.unshift(L);
  App.sel = [L.id]; App.selKeys = [];
  App.commit();
  App.emit('sel');
  return L;
};
App.addAssetLayer = function (assetId) {
  var a = App.project.assets[assetId], c = App.comp();
  if (!a) return;
  if (a.type === 'font') return App.addLayer('text', { font: a.family, text: a.family, box: true, boxWrap: true, valign: 'top', p: { x: Math.round(c.w / 2 - 350), y: Math.round(c.h / 2 - 50), w: 700, h: 100 } });
  var w = a.w || 400, hh = a.h || 400, ex = { asset: a.id, name: a.name.replace(/\.[^.]+$/, ''), p: { w: w, h: hh, ax: w / 2, ay: hh / 2 } };
  if (a.type === 'image') { ex.fit = 'fill'; ex.key = ''; return App.addLayer('image', ex); }
  if (a.type === 'sequence') { ex.loop = 'hold'; ex.fps = a.fps || c.fps; ex.freeRun = false; return App.addLayer('sequence', ex); }
  if (a.type === 'lottie') {
    ex.loop = 'hold'; ex.speed = 1; ex.freeRun = false;
    ex.bindings = (a.texts || []).map(function (n) { return { layer: n, key: '' }; });
    return App.addLayer('lottie', ex);
  }
};
App.addCompLayer = function (compId) {
  var sub = App.comp(compId);
  if (sub.id === App.compId || App.compUses(sub.id, App.compId)) { UI.status('A composition cannot contain itself.'); return; }
  return App.addLayer('comp', { comp: sub.id, name: sub.name, triggered: false, p: { ax: sub.w / 2, ay: sub.h / 2 } });
};
App.compUses = function (a, b, depth) {
  /* does comp a (directly or indirectly) contain comp b? */
  if ((depth || 0) > 8) return true;
  return App.comp(a).layers.some(function (L) { return L.type === 'comp' && (L.comp === b || App.compUses(L.comp, b, (depth || 0) + 1)); });
};
App.deleteLayers = function (ids) {
  var c = App.comp();
  c.layers = c.layers.filter(function (L) { return ids.indexOf(L.id) < 0; });
  c.layers.forEach(function (L) {
    if (ids.indexOf(L.parent) >= 0) L.parent = '';
    if (ids.indexOf(L.matte) >= 0) L.matte = '';
    if (L.matteMore) L.matteMore = L.matteMore.filter(function (m) { return ids.indexOf(m.id) < 0; });
    if (L.tex && L.tex.masks) L.tex.masks = L.tex.masks.filter(function (m) { return ids.indexOf(m.id) < 0; });
  });
  (App.project.actions || []).forEach(function (a) { if (ids.indexOf(a.target) >= 0) a.target = 'main'; });
  App.sel = App.sel.filter(function (id) { return ids.indexOf(id) < 0; });
  App.selKeys = [];
};
App.duplicate = function () {
  var c = App.comp(), out = [];
  App.selLayers().forEach(function (L) {
    var d = clone(L);
    d.id = uid('l'); d.name = L.name + ' copy';
    c.layers.splice(c.layers.indexOf(L), 0, d);
    out.push(d.id);
  });
  if (out.length) { App.sel = out; App.commit(); App.emit('sel'); }
};
App.moveLayers = function (dir) {
  var c = App.comp(), ls = c.layers, sel = App.selLayers();
  if (dir > 0) sel.reverse();
  sel.forEach(function (L) {
    var i = ls.indexOf(L), j = i + dir;
    if (j < 0 || j >= ls.length || App.sel.indexOf(ls[j].id) >= 0) return;
    ls[i] = ls[j]; ls[j] = L;
  });
  App.commit();
};
App.precompose = function () {
  var sel = App.selLayers(), c = App.comp();
  if (!sel.length) return;
  return UI.prompt('Name for the new composition', 'Comp ' + (App.project.comps.length + 1)).then(function (name) {
    if (!name) return null;
    var ids = sel.map(function (L) { return L.id; });
    var nc = { id: uid('c'), name: name, w: c.w, h: c.h, fps: c.fps, duration: c.duration, bg: c.bg, layers: sel, markers: [] };
    sel.forEach(function (L) { if (ids.indexOf(L.parent) < 0) L.parent = ''; if (ids.indexOf(L.matte) < 0) L.matte = ''; });
    var at = c.layers.indexOf(sel[0]);
    c.layers = c.layers.filter(function (L) { return ids.indexOf(L.id) < 0; });
    c.layers.forEach(function (L) { if (ids.indexOf(L.parent) >= 0) L.parent = ''; if (ids.indexOf(L.matte) >= 0) L.matte = ''; });
    App.project.comps.push(nc);
    var CL = App.newLayer('comp', { comp: nc.id, name: name, triggered: false, p: { ax: c.w / 2, ay: c.h / 2 } });
    c.layers.splice(Math.min(at, c.layers.length), 0, CL);
    App.sel = [CL.id]; App.selKeys = [];
    App.commit(); App.emit('sel');
    return CL;
  });
};
App.openComp = function (id) {
  App.compId = id; App.sel = []; App.selKeys = []; App.time = 0;
  App.emit('project'); App.emit('change'); App.emit('sel');
};

/* ---------- clipboard ---------- */
App.copy = function () {
  if (App.selKeys.length) {
    var items = [], min = Infinity;
    App.selKeys.forEach(function (k) { var o = App.keyOwner(k); if (o) { items.push({ prop: o.prop, k: clone(k) }); min = Math.min(min, k.t); } });
    items.forEach(function (i) { i.k.t -= min; });
    App.clip = { keys: items };
  } else if (App.sel.length) App.clip = { layers: clone(App.selLayers()) };
};
App.paste = function () {
  var cl = App.clip, c = App.comp();
  if (!cl) return;
  if (cl.keys) {
    var made = [];
    App.selLayers().forEach(function (L) {
      cl.keys.forEach(function (i) {
        if (!L.a[i.prop]) L.a[i.prop] = [];
        var k = App.setKey(L, i.prop, Math.round(App.time) + i.k.t, clone(i.k.v));
        k.e = clone(i.k.e);
        made.push(k);
      });
    });
    App.selKeys = made;
    App.commit();
  } else if (cl.layers) {
    var ids = [];
    clone(cl.layers).reverse().forEach(function (L) {
      L.id = uid('l');
      if (L.type === 'comp' && (L.comp === c.id || App.compUses(L.comp, c.id))) return;
      c.layers.unshift(L); ids.push(L.id);
    });
    App.sel = ids; App.commit(); App.emit('sel');
  }
};

/* ---------- easing ---------- */
App.applyEase = function (e) {
  if (!App.selKeys.length) { UI.status('Select one or more keyframes first.'); return; }
  App.selKeys.forEach(function (k) { k.e = clone(e); });
  App.commit();
};

/* ---------- small UI helpers ---------- */
var UI = { docs: [document], doc: document };
/* the element that has keyboard focus, whichever window it is in */
UI.active = function () {
  for (var i = 0; i < UI.docs.length; i++) { try { if (UI.docs[i].hasFocus()) return UI.docs[i].activeElement; } catch (e) {} }
  return UI.doc.activeElement;
};
UI.installFonts = function () { UI.docs.forEach(function (d) { RT.installFonts(App.project, d); }); };
/* every window the app draws into is registered here so shortcuts, drags and menus work in all of them */
UI.addDoc = function (doc) {
  if (UI.docs.indexOf(doc) < 0) UI.docs.push(doc);
  function cur() { UI.doc = doc; }
  function org(e) { if (e.isTrusted !== false) doc._org = [e.screenX - e.clientX, e.screenY - e.clientY]; }
  doc.addEventListener('mousemove', org, true); doc.addEventListener('mousedown', org, true);
  doc.addEventListener('mousedown', cur, true); doc.addEventListener('keydown', cur, true); doc.addEventListener('focusin', cur, true); doc.addEventListener('contextmenu', cur, true);
  doc.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.popup')) Menu.close();
    if (!e.target.closest('.cpick') && !e.target.closest('.cchip')) Picker.close();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { Menu.close(); Picker.close(); } });
  doc.addEventListener('keydown', function (e) { Main.key(e); });
  doc.addEventListener('keyup', function (e) { Main.keyUp(e); });
  doc.addEventListener('focusout', function () { if (Timeline.pending) setTimeout(Timeline.build, 0); });
  if (doc.defaultView) doc.defaultView.addEventListener('blur', function () { Menu.close(); });
  if (doc !== document && doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', function () { if (Stage.player) { Stage.player.fontVer++; Stage.later(); } });
};
UI.removeDoc = function (doc) { UI.docs = UI.docs.filter(function (d) { return d !== doc; }); if (UI.doc === doc) UI.doc = document; };
UI.status = function (msg, sticky) {
  var s = $('#status');
  s.textContent = msg || '';
  clearTimeout(UI._st);
  if (msg && !sticky) UI._st = setTimeout(function () { s.textContent = ''; }, 5000);
};
UI.prompt = function (title, value) {
  return new Promise(function (res) {
    var inp = h('input', { type: 'text', value: value || '' });
    var host = UI.doc.body;
    function done(v) { host.removeChild(bg); res(v); }
    var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, [
      h('div', { class: 'modal-title', text: title }), inp,
      h('div', { class: 'modal-btns' }, [
        h('button', { text: 'Cancel', onclick: function () { done(null); } }),
        h('button', { class: 'primary', text: 'OK', onclick: function () { done(inp.value.trim()); } })
      ])
    ]));
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
    host.appendChild(bg);
    inp.focus(); inp.select();
  });
};
UI.pickFiles = function (accept, multiple) {
  return new Promise(function (res) {
    var inp = h('input', { type: 'file', accept: accept, multiple: !!multiple, style: 'display:none' });
    inp.addEventListener('change', function () { res(Array.prototype.slice.call(inp.files)); document.body.removeChild(inp); });
    document.body.appendChild(inp);
    inp.click();
  });
};
UI.readFile = function (file, as) {
  return new Promise(function (res, rej) {
    var r = new FileReader();
    r.onload = function () { res(r.result); };
    r.onerror = rej;
    if (as === 'text') r.readAsText(file); else r.readAsDataURL(file);
  });
};
UI.loadImage = function (src) {
  return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
};
/* colour control: a swatch that opens the colour picker, a hex code box and an opacity % box */
UI.colorParts = function (onSet) {
  var sw = h('span', { class: 'cchip-c' }), chip = h('span', { class: 'cchip', title: 'Click for the colour picker' }, [sw]);
  var hex = h('input', { type: 'text', class: 'hexin', maxlength: 9, spellcheck: 'false', title: 'Hex code: #RRGGBB, or #RRGGBBAA to include opacity' });
  var al = h('input', { type: 'number', min: 0, max: 100, step: 1, class: 'alpha', title: 'Opacity % (0 = fully transparent)' });
  var o = { chip: chip, hex: hex, al: al, val: '#ffffffff', get: function () { return o.val; } };
  function paint() {
    var act = UI.active();
    sw.style.background = RT.css(o.val);
    if (act !== hex) hex.value = o.val.slice(0, 7).toUpperCase();
    if (act !== al) al.value = Math.round(RT.parseColor(o.val)[3] * 100);
  }
  function put(v, live) { o.val = v; paint(); onSet(live); }
  o.show = function (hex8) { o.val = String(hex8 || '#ffffffff'); if (o.val.length < 9) o.val = RT.normColor(o.val) || '#ffffffff'; paint(); };
  chip.addEventListener('click', function () { Picker.open(chip, o.val, put); });
  hex.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') hex.blur(); });
  hex.addEventListener('change', function () {
    var raw = hex.value.replace(/\s/g, ''), n = RT.normColor(raw);
    if (!n) { paint(); UI.status('That is not a colour code. Use #RRGGBB, for example #1e90ff.'); return; }
    /* a 6-digit code keeps the current opacity; 8 digits set it */
    /* ...unless the colour was fully transparent: a colour you just typed should be visible */
    if (raw.replace('#', '').length <= 6 && /^#?[0-9a-f]+$/i.test(raw)) n = n.slice(0, 7) + (/00$/.test(o.val) ? 'ff' : o.val.slice(7, 9));
    put(n, false);
  });
  function setA(live) {
    var a = clamp(parseFloat(al.value), 0, 100); if (isNaN(a)) a = 100;
    put(o.val.slice(0, 7) + ('0' + Math.round(a / 100 * 255).toString(16)).slice(-2), live);
  }
  al.addEventListener('input', function () { setA(true); });
  al.addEventListener('change', function () { setA(false); });
  return o;
};

/* ---------- colour picker ---------- */
var Picker = { el: null, recent: [] };
Picker.hsv = function (r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, hh = 0;
  if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, mx ? d / mx : 0, mx];
};
Picker.rgb = function (hh, s, v) {
  var c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; } else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};
Picker.close = function () {
  if (!Picker.el) return;
  var el = Picker.el, fin = Picker.finish;
  Picker.el = null; Picker.finish = null;
  if (el.parentNode) el.parentNode.removeChild(el);
  if (fin) fin();
};
Picker.open = function (anchor, start, cb) {
  Picker.close();
  var doc = anchor.ownerDocument, win = doc.defaultView, c0 = RT.parseColor(start), hsv = Picker.hsv(c0[0], c0[1], c0[2]);
  var st = { h: hsv[0], s: hsv[1], v: hsv[2], a: c0[3] }, first = start, last = start;
  var sv = h('div', { class: 'cp-sv' }, [h('div', { class: 'cp-dot' })]);
  var hue = h('input', { type: 'range', min: 0, max: 360, step: 1, class: 'cp-hue', title: 'Hue' });
  var alp = h('input', { type: 'range', min: 0, max: 100, step: 1, class: 'cp-alpha', title: 'Opacity' });
  var prev = h('span', { class: 'cchip cp-prev' }, [h('span', { class: 'cchip-c' })]);
  var hexI = h('input', { type: 'text', class: 'cp-hex', maxlength: 9, spellcheck: 'false', title: 'Hex code (#RRGGBB or #RRGGBBAA)' });
  function numI(max, tip) { return h('input', { type: 'number', min: 0, max: max, step: 1, title: tip }); }
  var rI = numI(255, 'Red'), gI = numI(255, 'Green'), bI = numI(255, 'Blue'), aI = numI(100, 'Opacity %');
  function value() { var c = Picker.rgb(st.h, st.s, st.v); return RT.toHex([c[0], c[1], c[2], st.a]); }
  function paint(skip) {
    var c = Picker.rgb(st.h, st.s, st.v), pure = Picker.rgb(st.h, 1, 1), v = value(), dot = sv.firstChild;
    sv.style.background = 'linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0)),rgb(' + pure.join(',') + ')';
    dot.style.left = (st.s * 100) + '%'; dot.style.top = ((1 - st.v) * 100) + '%';
    alp.style.background = 'linear-gradient(to right,rgba(' + c.join(',') + ',0),rgb(' + c.join(',') + ')),repeating-conic-gradient(#b9b9b9 0 25%,#fff 0 50%) 0 0/10px 10px';
    prev.firstChild.style.background = RT.css(v);
    if (skip !== hue) hue.value = Math.round(st.h);
    if (skip !== alp) alp.value = Math.round(st.a * 100);
    if (skip !== hexI) hexI.value = (st.a >= 0.999 ? v.slice(0, 7) : v).toUpperCase();
    if (skip !== rI) rI.value = c[0]; if (skip !== gI) gI.value = c[1]; if (skip !== bI) bI.value = c[2];
    if (skip !== aI) aI.value = Math.round(st.a * 100);
  }
  function emit(live, skip) { paint(skip); last = value(); cb(last, live); }
  function fromHex(v, live, skip) {
    var c = RT.parseColor(v), q = Picker.hsv(c[0], c[1], c[2]);
    if (q[1] > 0.001 && q[2] > 0.001) st.h = q[0];
    st.s = q[1]; st.v = q[2]; st.a = c[3];
    emit(live, skip);
  }
  sv.addEventListener('mousedown', function (e) {
    e.preventDefault();
    function at(ev) { var r = sv.getBoundingClientRect(); st.s = clamp((ev.clientX - r.left) / r.width, 0, 1); st.v = 1 - clamp((ev.clientY - r.top) / r.height, 0, 1); if (st.a === 0) st.a = 1; emit(true); }
    at(e);
    dragLoop(at, function () { emit(false); });
  });
  hue.addEventListener('input', function () { st.h = +hue.value; if (st.a === 0) st.a = 1; emit(true, hue); });
  hue.addEventListener('change', function () { emit(false, hue); });
  alp.addEventListener('input', function () { st.a = +alp.value / 100; emit(true, alp); });
  alp.addEventListener('change', function () { emit(false, alp); });
  hexI.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { hexI.blur(); } if (e.key === 'Escape') Picker.close(); });
  hexI.addEventListener('input', function () {
    var raw = hexI.value.replace(/\s/g, ''), n = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw) ? RT.normColor(raw) : null;
    if (n) { if (raw.replace('#', '').length === 6) n = n.slice(0, 7) + (st.a === 0 ? 'ff' : value().slice(7, 9)); fromHex(n, true, hexI); }
  });
  hexI.addEventListener('change', function () { var n = RT.normColor(hexI.value.replace(/\s/g, '')); if (n) fromHex(n, false); else paint(); });
  [rI, gI, bI].forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
    inp.addEventListener('input', function () { fromHex(RT.toHex([clamp(+rI.value || 0, 0, 255), clamp(+gI.value || 0, 0, 255), clamp(+bI.value || 0, 0, 255), st.a === 0 ? 1 : st.a]), true, inp); });
    inp.addEventListener('change', function () { emit(false); });
  });
  aI.addEventListener('keydown', function (e) { e.stopPropagation(); });
  aI.addEventListener('input', function () { st.a = clamp(+aI.value || 0, 0, 100) / 100; emit(true, aI); });
  aI.addEventListener('change', function () { emit(false); });
  function chips(title, list) {
    if (!list.length) return null;
    return h('div', { class: 'cp-row2' }, [h('span', { class: 'cp-l', text: title })].concat(list.map(function (q) {
      var cs = h('span', { class: 'cchip cp-s', title: q.name || q.color.toUpperCase() }, [h('span', { class: 'cchip-c', style: 'background:' + RT.css(q.color) })]);
      cs.addEventListener('click', function () { fromHex(q.color, false); });
      return cs;
    })));
  }
  var shared = (App.project.swatches || []).map(function (q) { return { color: q.color, name: q.name + '  ' + q.color.slice(0, 7).toUpperCase() }; });
  var basics = ['#ffffffff', '#000000ff', '#ff3b30ff', '#ff9500ff', '#ffcc00ff', '#34c759ff', '#00c7beff', '#007affff', '#5856d6ff', '#af52deff'].map(function (q) { return { color: q }; });
  var tools = [h('button', { text: 'Transparent', title: 'Fully transparent', onclick: function () { st.a = 0; emit(false); } })];
  if (win.EyeDropper) tools.push(h('button', { text: 'Pick from screen', title: 'Click anywhere on the screen to take its colour', onclick: function () {
    try { new win.EyeDropper().open().then(function (r) { var n = RT.normColor(r.sRGBHex); if (n) fromHex(n.slice(0, 7) + 'ff', false); }).catch(function () {}); } catch (e) {}
  } }));
  tools.push(h('span', { class: 'grow' }));
  tools.push(h('button', { class: 'primary', text: 'Done', onclick: function () { Picker.close(); } }));
  var el = h('div', { class: 'cpick' }, [
    sv, hue, alp,
    h('div', { class: 'cp-row' }, [prev, h('label', { text: 'Hex' }), hexI]),
    h('div', { class: 'cp-row' }, [h('label', { text: 'R' }), rI, h('label', { text: 'G' }), gI, h('label', { text: 'B' }), bI, h('label', { text: 'A%' }), aI]),
    chips('Basic', basics), chips('Shared', shared), chips('Recent', Picker.recent.map(function (q) { return { color: q }; })),
    h('div', { class: 'cp-row cp-tools' }, tools)
  ]);
  el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  doc.body.appendChild(el);
  var r = anchor.getBoundingClientRect(), pr = el.getBoundingClientRect(), x = r.left - pr.width - 8, y = r.top - 20;
  if (x < 4) x = Math.min(r.right + 8, win.innerWidth - pr.width - 4);
  el.style.left = Math.max(4, x) + 'px';
  el.style.top = Math.max(4, Math.min(y, win.innerHeight - pr.height - 4)) + 'px';
  Picker.el = el;
  Picker.finish = function () {
    if (last !== first) {
      Picker.recent = [last].concat(Picker.recent.filter(function (q) { return q !== last; })).slice(0, 10);
      cb(last, false);
    }
  };
  paint();
};
UI.copy = function (text) {
  var ta = h('textarea', { style: 'position:fixed;left:-999px;top:0' });
  ta.value = text;
  var bd = UI.doc.body;
  bd.appendChild(ta);
  ta.select();
  try { UI.doc.execCommand('copy'); } catch (e) {}
  bd.removeChild(ta);
};
