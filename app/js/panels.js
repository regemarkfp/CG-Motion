/* CG Motion - left panels: assets, control (data + invokes), easing, CasparCG */
var Panels = { NAMES: ['assets', 'control', 'colours', 'easing', 'caspar', 'data'], presetSel: null, log: [] };

Panels.init = function () {
  App.on('change', Panels.refresh); App.on('project', Panels.build);
  App.on('sel', function () { if (Dock.isActive('easing') || Dock.isActive('colours') || Dock.isActive('data')) Panels.build(); });
};
Panels.refresh = function () {
  if (window.DataEd && DataEd.quiet) return;
  var a = UI.active();
  if (a && /INPUT|TEXTAREA/.test(a.tagName) && a.closest('.sidep')) return;
  Panels.build();
};
/* draws every side panel that is currently showing; hidden ones are emptied */
Panels.build = function () {
  if (!App.project) return;
  Panels.NAMES.forEach(function (name) {
    var el = $('#pn-' + name);
    if (!Dock.isActive(name)) { if (el.firstChild) el.innerHTML = ''; return; }
    var st = el.scrollTop;
    el.innerHTML = '';
    Panels[name](el);
    el.scrollTop = st;
  });
};
function pbtn(text, fn, title, cls) { return h('button', { text: text, title: title || '', class: cls || '', onclick: fn }); }

/* ================= Assets ================= */
Panels.addAsset = function (a) {
  a.id = uid('a');
  App.project.assets[a.id] = a;
  App.setDirty(true);
  return a;
};
Panels.importImages = function () {
  UI.pickFiles('image/*', true).then(async function (files) {
    for (var i = 0; i < files.length; i++) {
      var src = await UI.readFile(files[i]), img = await UI.loadImage(src);
      Panels.addAsset({ type: 'image', name: files[i].name, src: src, w: img.naturalWidth, h: img.naturalHeight });
    }
    App.touch();
  });
};
/* Optimise for playback: most broadcast sequences are full-frame pictures with a small graphic in them.
   Cutting every frame down to the area that ever has pixels makes each frame far quicker to unpack and draw. Looks identical. */
Panels.optimiseAsset = async function (a, tick) {
  if (!a || a.type !== 'sequence' || a.crop || !a.frames || !a.frames.length) return null;
  var first = await UI.loadImage(a.frames[0]), W = a.w || first.naturalWidth, H = a.h || first.naturalHeight;
  if (!W || !H) return null;
  a.w = W; a.h = H;
  var cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  cv.width = W; cv.height = H;
  var x0 = W, y0 = H, x1 = -1, y1 = -1, i, x, y, imgs = [];
  for (i = 0; i < a.frames.length; i++) {
    var im = i ? await UI.loadImage(a.frames[i]) : first;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(im, 0, 0, W, H);
    var d = new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer);
    for (y = 0; y < H; y++) {
      var row = y * W, inside = y >= y0 && y <= y1;
      /* only look where the box found so far does not already reach */
      var xe = inside ? Math.min(x0, W) : W;
      for (x = 0; x < xe; x++) if (d[row + x] >>> 24) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x > x1) x1 = x; break; }
      for (x = W - 1; x > Math.max(x1, inside ? x1 : -1) && x >= 0; x--) if (d[row + x] >>> 24) { x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; break; }
    }
    if (tick) tick(i, a.frames.length * 2);
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
  var cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (cw * ch > W * H * 0.8) return { skipped: true, name: a.name };
  var before = 0, after = 0, out = [];
  cv.width = cw; cv.height = ch;
  for (i = 0; i < a.frames.length; i++) {
    var src = a.frames[i], im2 = await UI.loadImage(src);
    ctx.clearRect(0, 0, cw, ch); ctx.drawImage(im2, -x0, -y0, W, H);
    var webp = /^data:image\/webp/.test(src), nu = webp ? cv.toDataURL('image/webp', 0.95) : cv.toDataURL('image/png');
    before += src.length; after += nu.length;
    out.push(nu);
    if (tick) tick(a.frames.length + i, a.frames.length * 2);
  }
  a.frames = out; a.crop = [x0, y0, cw, ch];
  return { name: a.name, area: Math.round(cw * ch / (W * H) * 1000) / 10, before: before, after: after };
};
Panels.optimiseAll = async function () {
  var list = [], id, as = App.project.assets;
  for (id in as) if (as[id].type === 'sequence' && !as[id].crop) list.push(as[id]);
  if (!list.length) { UI.status('All sequences are already optimised.'); return []; }
  var res = [], b = 0, a2 = 0;
  for (var k = 0; k < list.length; k++) {
    var r = await Panels.optimiseAsset(list[k], function (i, n) { if (i % 10 === 0) UI.status('Optimising sequence ' + (k + 1) + ' of ' + list.length + ' (' + Math.round(i / n * 100) + '%)...', true); });
    if (r) { res.push(r); if (!r.skipped) { b += r.before; a2 += r.after; } }
  }
  App.setDirty(true); App.touch();
  var done = res.filter(function (r) { return !r.skipped; });
  UI.status(done.length ? 'Optimised ' + done.length + ' sequence' + (done.length > 1 ? 's' : '') + ': frames now cover ' + done.map(function (r) { return r.area + '%'; }).join(', ') + ' of the picture; ' + (b * 0.75 / 1048576).toFixed(1) + ' MB down to ' + (a2 * 0.75 / 1048576).toFixed(1) + ' MB. Save to keep it.' : 'These sequences fill the whole picture, nothing to cut away.');
  return res;
};
Panels.importSequence = function () {
  UI.pickFiles('image/*', true).then(async function (files) {
    if (!files.length) return;
    files.sort(function (a, b) { return natCmp(a.name, b.name); });
    var frames = [], w = 0, hh = 0, q = App.ui.seqWebp, cv = document.createElement('canvas'), ctx = cv.getContext('2d'), bytes = 0;
    for (var i = 0; i < files.length; i++) {
      UI.status('Importing frame ' + (i + 1) + ' of ' + files.length + '...', true);
      var src = await UI.readFile(files[i]);
      if (i === 0 || q > 0) {
        var img = await UI.loadImage(src);
        if (i === 0) { w = img.naturalWidth; hh = img.naturalHeight; cv.width = w; cv.height = hh; }
        if (q > 0) { ctx.clearRect(0, 0, w, hh); ctx.drawImage(img, 0, 0, w, hh); var wp = cv.toDataURL('image/webp', q); if (wp.length < src.length) src = wp; }
      }
      bytes += src.length;
      frames.push(src);
    }
    var base = files[0].name.replace(/\.[^.]+$/, '').replace(/[\s._-]*\d+$/, '') || 'Sequence';
    var na = Panels.addAsset({ type: 'sequence', name: base + ' [' + frames.length + ' frames]', frames: frames, w: w, h: hh, fps: App.comp().fps });
    await Panels.optimiseAsset(na, function (i, n) { if (i % 10 === 0) UI.status('Optimising sequence (' + Math.round(i / n * 100) + '%)...', true); });
    bytes = na.frames.reduce(function (s, f) { return s + f.length; }, 0);
    UI.status('Sequence imported: ' + frames.length + ' frames, about ' + (bytes * 0.75 / 1048576).toFixed(1) + ' MB inside the template.');
    App.touch();
  });
};
Panels.importFonts = function () {
  UI.pickFiles('.ttf,.otf,.woff,.woff2', true).then(async function (files) {
    for (var i = 0; i < files.length; i++) {
      var src = await UI.readFile(files[i]), fam = files[i].name.replace(/\.[^.]+$/, '');
      var ext = files[i].name.split('.').pop().toLowerCase(), mime = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext] || 'font/ttf';
      src = src.replace(/^data:[^;]*;/, 'data:' + mime + ';');
      Panels.addAsset({ type: 'font', name: files[i].name, family: fam, src: src });
    }
    UI.installFonts();
    App.touch();
  });
};
Panels.importLottie = function () {
  UI.pickFiles('.json', true).then(async function (files) {
    for (var i = 0; i < files.length; i++) {
      try {
        var d = JSON.parse(await UI.readFile(files[i], 'text'));
        if (!d.layers || !d.w) throw new Error('not lottie');
        var texts = [];
        (function walk(ls) { (ls || []).forEach(function (l) { if (l.ty === 5 && l.nm && texts.indexOf(l.nm) < 0) texts.push(l.nm); }); })(d.layers);
        (d.assets || []).forEach(function (a) { (a.layers || []).forEach(function (l) { if (l.ty === 5 && l.nm && texts.indexOf(l.nm) < 0) texts.push(l.nm); }); });
        Panels.addAsset({ type: 'lottie', name: files[i].name, data: d, w: d.w, h: d.h, texts: texts });
      } catch (e) { UI.status(files[i].name + ' is not a Lottie JSON file. (Export as "Lottie JSON", not dotLottie.)'); }
    }
    App.touch();
  });
};
Panels.assetUsed = function (id) {
  var n = 0;
  App.allLayers(function (L) { if (L.asset === id) n++; });
  return n;
};

Panels.assets = function (el) {
  var p = App.project, groups = { image: [], sequence: [], lottie: [], font: [] }, id;
  for (id in p.assets) groups[p.assets[id].type].push(p.assets[id]);
  el.appendChild(h('div', { class: 'pbar' }, [
    pbtn('+ Images', Panels.importImages), pbtn('+ Sequence', Panels.importSequence, 'Select all frames of a PNG / WebP image sequence'),
    pbtn('+ Fonts', Panels.importFonts, 'TTF, OTF, WOFF, WOFF2'), pbtn('+ Lottie', Panels.importLottie, 'Lottie JSON')
  ]));
  var unopt = Object.keys(p.assets).filter(function (k) { return p.assets[k].type === 'sequence' && !p.assets[k].crop; }).length;
  if (unopt) el.appendChild(h('div', { class: 'pbar' }, [pbtn('Optimise ' + unopt + ' sequence' + (unopt > 1 ? 's' : '') + ' for playback', function () { Panels.optimiseAll(); }, 'Cuts every frame down to the area that has pixels. Looks the same, plays much smoother.', 'primary')]));
  var sq = h('select', { title: 'Image sequences are stored inside the template, so smaller is better' });
  [['0.9', 'Sequences: convert to WebP 90% (recommended)'], ['0.75', 'Sequences: convert to WebP 75% (smallest)'], ['1', 'Sequences: WebP 100%'], ['0', 'Sequences: keep original files']].forEach(function (o) { sq.appendChild(h('option', { value: o[0], text: o[1] })); });
  sq.value = String(App.ui.seqWebp);
  sq.addEventListener('change', function () { App.ui.seqWebp = parseFloat(sq.value); });
  el.appendChild(h('div', { class: 'pbar' }, [sq]));

  el.appendChild(h('div', { class: 'ghead' }, ['Compositions', pbtn('+ New', function () {
    UI.prompt('Name for the new composition', 'Comp ' + (p.comps.length + 1)).then(function (name) {
      if (!name) return;
      var c = App.comp(), nc = { id: uid('c'), name: name, w: c.w, h: c.h, fps: c.fps, duration: c.duration, bg: c.bg, layers: [], markers: [] };
      p.comps.push(nc); App.commit(); App.openComp(nc.id);
    });
  })]));
  p.comps.forEach(function (c) {
    el.appendChild(h('div', { class: 'aitem' + (c.id === App.compId ? ' cur' : ''), ondblclick: function () { App.openComp(c.id); } }, [
      h('span', { class: 'chip t-comp' }),
      h('span', { class: 'an', text: c.name + (c.id === p.rootComp ? '  (main)' : ''), title: 'Double-click to open' }),
      h('span', { class: 'am', text: c.w + 'x' + c.h }),
      pbtn('Open', function () { App.openComp(c.id); }),
      c.id !== App.compId ? pbtn('+', function () { App.addCompLayer(c.id); }, 'Add to the current composition as a layer') : null,
      pbtn('Ren', function () { UI.prompt('Rename composition', c.name).then(function (v) { if (v) { c.name = v; App.commit(); } }); }, 'Rename'),
      c.id !== p.rootComp ? pbtn('Main', function () { p.rootComp = c.id; App.commit(); }, 'Make this the composition that is exported') : null,
      c.id !== p.rootComp ? pbtn('×', function () {
        if (!confirm('Delete composition "' + c.name + '"? Layers that use it will be removed.')) return;
        p.comps = p.comps.filter(function (x) { return x !== c; });
        p.comps.forEach(function (x) { x.layers = x.layers.filter(function (L) { return !(L.type === 'comp' && L.comp === c.id); }); });
        if (App.compId === c.id) App.compId = p.rootComp;
        App.sel = []; App.commit(); App.emit('project');
      }, 'Delete') : null
    ]));
  });

  var titles = { image: 'Images', sequence: 'Image sequences', lottie: 'Lottie animations', font: 'Fonts' };
  ['image', 'sequence', 'lottie', 'font'].forEach(function (g) {
    el.appendChild(h('div', { class: 'ghead', text: titles[g] }));
    if (!groups[g].length) el.appendChild(h('div', { class: 'hint', text: 'None yet.' }));
    groups[g].sort(function (a, b) { return natCmp(a.name, b.name); }).forEach(function (a) {
      var thumb = g === 'image' ? h('img', { class: 'th', src: a.src }) : g === 'sequence' ? h('img', { class: 'th', src: a.frames[Math.floor(a.frames.length / 2)] }) :
        g === 'font' ? h('span', { class: 'th ft', text: 'Aa', style: 'font-family:"' + a.family + '"' }) : h('span', { class: 'chip t-lottie' });
      el.appendChild(h('div', { class: 'aitem', ondblclick: function () { App.addAssetLayer(a.id); } }, [
        thumb, h('span', { class: 'an', text: g === 'font' ? a.family : a.name, title: 'Double-click to add to the composition' }),
        h('span', { class: 'am', text: g === 'font' ? '' : a.w + 'x' + a.h }),
        pbtn('+', function () { App.addAssetLayer(a.id); }, g === 'font' ? 'Add a text layer with this font' : 'Add to composition'),
        pbtn('×', function () {
          var n = Panels.assetUsed(a.id);
          if (n && !confirm('"' + a.name + '" is used by ' + n + ' layer(s). Delete it and those layers?')) return;
          App.project.comps.forEach(function (c) { c.layers = c.layers.filter(function (L) { return L.asset !== a.id; }); });
          delete App.project.assets[a.id];
          App.sel = App.sel.filter(function (i) { return !!App.layer(i); });
          UI.installFonts();
          App.commit(); App.setDirty(true); App.emit('sel');
        }, 'Delete')
      ]));
    });
  });
};

/* ================= Control: data fields + invokes ================= */
/* Which numbered copies of each composition exist under the open composition (repeaters add name1, name2, ...). */
Panels.suffixes = function () {
  var map = {};
  (function walk(id, list, d) {
    if (d > 8) return;
    var c = App.comp(id);
    map[c.id] = (map[c.id] || []).concat(list.filter(function (x) { return (map[c.id] || []).indexOf(x) < 0; }));
    c.layers.forEach(function (L) {
      if (L.type !== 'comp' || !App.project.comps.some(function (k) { return k.id === L.comp; })) return;
      var next = list;
      if (L.rep && L.rep.on) {
        var n = Math.max(1, Math.min(100, Math.round(+L.rep.n || 1))), first = L.rep.first == null ? 1 : Math.round(+L.rep.first || 0);
        next = [];
        list.forEach(function (ps) { for (var k = 0; k < n; k++) next.push({ s: ps.s + (ps.s ? '_' : '') + (first + k), n: first + k }); });
      }
      walk(L.comp, next, d + 1);
    });
  })(App.compId, [{ s: '', n: null }], 0);
  return map;
};
/* every field the open template accepts */
Panels.fieldList = function () {
  var out = [], seen = {}, suf = Panels.suffixes();
  function add(key, o) { if (key && !seen[key]) { seen[key] = 1; o.key = key; out.push(o); } }
  function eachLayer(fn) {
    App.project.comps.forEach(function (c) { (suf[c.id] || []).forEach(function (sx) { c.layers.forEach(function (L) { fn(L, sx); }); }); });
  }
  eachLayer(function (L, sx) {
    if (L.key) add(L.key + sx.s, { kind: L.type === 'image' ? 'image' : 'text', def: L.type === 'text' ? String(L.text || '').split('{#}').join(sx.n == null ? '' : sx.n) : (L.type === 'table' ? (L.rows || '') : (L.type === 'chart' ? (L.data || '') : (L.type === 'crawl' ? (L.text || '') : ''))), hint: L.name + (L.type === 'image' ? ' - picture' : (L.type === 'table' ? ' - table rows' : (L.type === 'chart' ? ' - chart data' : (L.type === 'crawl' ? ' - crawl items' : ' - text')))), copy: sx.n });
    if (L.key && L.cells !== false && !sx.s && (L.type === 'table' || L.type === 'chart' || L.type === 'crawl')) RT.cellFields(L).forEach(function (cf) { add(L.key + '_' + cf.s, { kind: cf.colour ? 'colour' : 'text', def: cf.colour ? String(RT.normColor(cf.def) || cf.def).slice(0, 7) : cf.def, hint: L.name + ' - ' + cf.hint, cell: true }); });
    if (L.tex && L.tex.cgKey && !sx.s) {
      var tk = L.tex.cgKey, T = L.tex;
      add(tk, { kind: 'value', def: T.on ? '1' : '0', hint: L.name + ' - texture: 1/0, a preset name, or JSON such as {"kind":"grain","opacity":40}' });
      add(tk + '_preset', { kind: 'value', def: '', hint: L.name + ' - texture preset by name (' + Object.keys(App.project.texPresets || {}).join(', ') + ')' });
      [['kind', 'type (grain, paper, halftone, rays ...)', T.kind || 'grain'], ['opacity', 'opacity %', String(L.p.texOp == null ? 35 : L.p.texOp)], ['size', 'size %', String(T.scale || 100)], ['color', 'pattern colour', T.color || ''], ['blend', 'blend mode', T.blend || 'overlay'],
       ['motion', 'motion (none, scroll, pingpong, flicker, orbit)', T.motion || 'none'], ['speed', 'scroll speed px/s', String(T.speed || 0)], ['dir', 'direction degrees', String(T.dir || 0)], ['angle', 'angle', String(T.angle || 0)],
       ['x', 'offset X', String(L.p.texX || 0)], ['y', 'offset Y', String(L.p.texY || 0)], ['zoom', 'zoom %', String(L.p.texSc == null ? 100 : L.p.texSc)], ['pic', 'picture path or URL', '']].forEach(function (f) {
        add(tk + '_' + f[0], { kind: f[0] === 'color' ? 'colour' : (/^(opacity|size|speed|dir|angle|x|y|zoom)$/.test(f[0]) ? 'number' : 'value'), def: f[0] === 'color' ? (RT.normColor(f[2]) || '#ffffff').slice(0, 7) : f[2], hint: L.name + ' - texture ' + f[1], cell: true });
      });
    }
    (L.bindings || []).forEach(function (b) { add(b.key && b.key + sx.s, { kind: 'lottie text', def: '', hint: L.name + ' - ' + b.layer, copy: sx.n }); });
    if (L.type === 'comp' && L.rep && L.rep.on && L.rep.countKey) add(L.rep.countKey + sx.s, { kind: 'number', def: String(L.rep.n), hint: L.name + ' - copies shown' });
  });
  (App.project.swatches || []).forEach(function (s) { add(s.key, { kind: 'colour', def: s.color.slice(0, 7), hint: s.name + ' - shared colour' }); });
  eachLayer(function (L, sx) {
    for (var k in (L.bind || {})) {
      var bd = L.bind[k];
      if (!bd.key || seen[bd.key + sx.s]) continue;
      var kind = RT.COLOR_PROPS[k] ? 'colour' : (RT.BOOLS[k] ? 'toggle' : (RT.DEF.hasOwnProperty(k) || RT.NUMS[k] ? 'number' : 'value')), def;
      if (kind === 'colour') def = String(RT.baseProp(L, k, 0, App.project)).slice(0, 7);
      else if (kind === 'toggle') { var cv = k.indexOf('tex.') === 0 ? (L.tex || {})[k.slice(4)] : L[k]; def = cv === false || (k !== 'visible' && !cv) ? '0' : '1'; }
      else if (RT.DEF.hasOwnProperty(k)) def = bd.mode === 'add' ? '0' : (bd.mode === 'mul' ? '1' : String(Math.round(RT.baseProp(L, k, App.time, App.project) * 100) / 100));
      else if (k.indexOf('tex.') === 0) { var tv = (L.tex || {})[k.slice(4)]; def = tv == null ? '' : String(tv); }
      else def = L[k] == null ? '' : String(L[k]);
      add(bd.key + sx.s, { kind: kind, def: def, hint: L.name + ' - ' + k });
    }
  });
  return out.sort(function (a, b) { return natCmp(a.key, b.key); });
};
Panels.sampleData = function () {
  var o = {};
  Panels.fieldList().forEach(function (f) { o[f.key] = App.testData[f.key] != null ? App.testData[f.key] : f.def; });
  return o;
};
Panels.control = function (el) {
  var p = App.project, fields = Panels.fieldList();
  el.appendChild(h('div', { class: 'ghead', text: 'Test like CasparCG' }));
  el.appendChild(h('div', { class: 'pbar' }, [
    pbtn('Play', function () { Stage.live('play'); }, 'CG PLAY - runs to the first stop marker', 'primary'),
    pbtn('Next', function () { Stage.live('next'); }, 'CG NEXT - continues to the next stop marker'),
    pbtn('Stop', function () { Stage.live('stop'); }, 'CG STOP - plays from the last stop marker to the end, then clears'),
    pbtn('Back to editing', function () { App.setTime(App.time); })
  ]));
  el.appendChild(h('p', { class: 'hint', text: 'Stop markers on the timeline (M key) are where play() and next() pause.' }));

  el.appendChild(h('div', { class: 'ghead', text: 'Editable fields' }));
  if (!fields.length) el.appendChild(h('p', { class: 'hint', text: 'No editable fields yet. Select a text layer and tick "Editable from CasparCG".' }));
  fields.forEach(function (f) {
    var inp = h('input', { type: 'text', placeholder: f.def || f.kind, value: App.testData[f.key] != null ? App.testData[f.key] : '' });
    inp.addEventListener('input', function () {
      if (inp.value === '') delete App.testData[f.key]; else App.testData[f.key] = inp.value;
      Stage.render();
    });
    var extra = null;
    function put(v) { inp.value = v; if (v === '') delete App.testData[f.key]; else App.testData[f.key] = v; Stage.render(); }
    if (f.kind === 'colour') {
      extra = h('input', { type: 'color', value: (RT.normColor(App.testData[f.key]) || f.def).slice(0, 7), title: 'Pick a test colour' });
      extra.addEventListener('input', function () { put(extra.value); });
      inp.placeholder = f.def + '  (colour)';
    } else if (f.kind === 'toggle') {
      inp.placeholder = f.def + '  (1 = on, 0 = off)';
      extra = h('input', { type: 'checkbox', title: 'Toggle' });
      extra.checked = /^(1|true|yes|on|show)$/i.test(App.testData[f.key] != null ? App.testData[f.key] : f.def);
      extra.addEventListener('change', function () { put(extra.checked ? '1' : '0'); extra.blur(); });
    } else if (f.kind === 'image') {
      inp.placeholder = 'path or URL';
      if (App.testData[f.key] && /^data:/.test(App.testData[f.key])) { inp.value = ''; inp.placeholder = 'test picture loaded'; }
      extra = pbtn('Browse', function () { UI.pickFiles('image/*').then(function (fs) { if (fs[0]) UI.readFile(fs[0]).then(function (d) { App.testData[f.key] = d; inp.value = ''; inp.placeholder = fs[0].name + ' (test only)'; Stage.render(); }); }); }, 'Try a picture from this PC (for testing only, it is not stored in the template)');
    }
    el.appendChild(h('div', { class: 'f' }, [h('label', { text: f.key, title: f.hint || f.kind }), inp, extra]));
  });
  if (fields.length) {
    el.appendChild(h('div', { class: 'pbar' }, [
      pbtn('Clear test values', function () { App.testData = {}; Stage.render(); Panels.build(); }),
      pbtn('Copy JSON', function () { UI.copy(JSON.stringify(Panels.sampleData())); UI.status('Field data copied as JSON.'); }),
      pbtn('Export CSV', function () { IO.exportCSV(); }, 'Save the list of variables of this template as a CSV file (for RFP Manager or a spreadsheet)')
    ]));
  }

  el.appendChild(h('div', { class: 'ghead' }, ['Invokes', pbtn('+ Add', function () {
    var n = 1; while (p.actions.some(function (a) { return a.name === 'action' + n; })) n++;
    p.actions.push({ id: uid('x'), name: 'action' + n, target: 'main', comp: App.compId, from: Math.round(App.time), to: Math.min(App.comp().duration, Math.round(App.time) + 25) });
    App.commit();
  })]));
  el.appendChild(h('p', { class: 'hint', text: 'An invoke is a named function in the exported template. Calling it (CG INVOKE) plays a range of frames, on the main timeline or on a composition layer that runs independently.' }));
  var targets = [['main', 'Main timeline']];
  App.allLayers(function (L) { if (L.type === 'comp' && L.triggered) targets.push([L.id, 'Layer: ' + L.name]); });
  /* only the invokes that belong to the template that is open (its own, and those of independent compositions inside it) */
  var inTpl = {};
  IO.exportProject(App.compId).actions.forEach(function (a) { inTpl[a.id] = 1; });
  p.actions.forEach(function (a) {
    if (!inTpl[a.id]) return;
    function fld(label, key, type) {
      var inp = h('input', { type: type, value: a[key] });
      inp.addEventListener('change', function () {
        var v = inp.value;
        if (type === 'number') { v = parseFloat(v); if (isNaN(v)) return; }
        else { v = v.replace(/[^A-Za-z0-9_$]/g, ''); if (/^[0-9]/.test(v)) v = '_' + v; if (!v) return; }
        a[key] = v; App.commit();
      });
      return h('div', { class: 'f' }, [h('label', { text: label }), inp]);
    }
    var sel = h('select');
    targets.forEach(function (t) { sel.appendChild(h('option', { value: t[0], text: t[1] })); });
    sel.value = a.target || 'main';
    sel.addEventListener('change', function () { a.target = sel.value; if (a.target === 'main') a.comp = App.compId; else delete a.comp; sel.blur(); App.commit(); });
    var reserved = /^(play|stop|next|update|invoke|gotoFrame|setText)$/.test(a.name);
    el.appendChild(h('div', { class: 'card' }, [
      fld('Name', 'name', 'text'),
      reserved ? h('p', { class: 'hint warn', text: 'This name is reserved, pick another.' }) : null,
      h('div', { class: 'f' }, [h('label', { text: 'Plays' }), sel]),
      !a.loop ? null : h('div', { class: 'f' }, [h('label', { text: 'Repeat' }), (function () {
        var rs = h('select', { title: 'What happens when the range has played' });
        [['', 'Play once and hold'], ['loop', 'Loop until another invoke or stop'], ['pingpong', 'Back and forth until another invoke or stop']].forEach(function (o) { rs.appendChild(h('option', { value: o[0], text: o[1] })); });
        rs.value = a.loop || '';
        rs.addEventListener('change', function () { a.loop = rs.value; rs.blur(); App.commit(); });
        return rs;
      })()]),
      h('div', { class: 'grid' }, [fld('From', 'from', 'number'), fld('To', 'to', 'number')]),
      h('div', { class: 'pbar' }, [
        pbtn('From = playhead', function () { a.from = Math.round(App.time); App.commit(); }),
        pbtn('To = playhead', function () { a.to = Math.round(App.time); App.commit(); }),
        pbtn('Test', function () { Stage.live('invoke', a.name); }, 'Run this invoke in the viewer', 'primary'),
        pbtn('×', function () { p.actions.splice(p.actions.indexOf(a), 1); App.commit(); }, 'Delete')
      ]),
      h('code', { class: 'amcp', text: 'CG ' + p.caspar.channel + '-' + p.caspar.layer + ' INVOKE 1 "' + a.name + '"' })
    ]));
  });
  if (targets.length === 1) el.appendChild(h('p', { class: 'hint', text: 'Tip: to animate one element without touching the rest (a wicket flash, a stat pop-up), put it in its own composition, add that as a layer, and tick "Runs independently" on the layer. It then appears here as a target.' }));
};

/* ================= Colours ================= */
Panels.swatchUse = function (id) {
  var n = 0;
  App.allLayers(function (L) { for (var k in (L.link || {})) if (L.link[k] === id) n++; });
  return n;
};
Panels.colours = function (el) {
  var p = App.project, sws = p.swatches || (p.swatches = []), sel = App.selLayers();
  el.appendChild(h('div', { class: 'ghead' }, ['Shared colours', pbtn('+ Add', function () {
    var n = sws.length + 1, base = '#00ff83ff', L = sel[0];
    if (L && (L.type === 'text' || L.type === 'shape')) base = App.val(L, L.type === 'text' ? 'color' : 'fill');
    sws.push({ id: uid('s'), name: 'Colour ' + n, color: base, key: '' });
    App.commit();
  }, 'Adds a shared colour (starts from the selected layer\'s colour)')]));
  el.appendChild(h('p', { class: 'hint', text: 'Change a shared colour once and every text or shape linked to it follows. Tick "From CasparCG" and the operator can send the colour too, for example team colours.' }));
  if (!sws.length) el.appendChild(h('p', { class: 'hint', text: 'No shared colours yet.' }));
  sws.forEach(function (s) {
    var cp = UI.colorParts(function (live) { s.color = cp.get(); if (live) Stage.render(); else App.commit(); });
    cp.show(s.color);
    var nm = h('input', { type: 'text', value: s.name });
    nm.addEventListener('change', function () { s.name = nm.value.trim() || s.name; App.commit(); });
    var ck = h('input', { type: 'checkbox' }); ck.checked = !!s.key;
    ck.addEventListener('change', function () { s.key = ck.checked ? (s.key || Inspector.nextKey()) : ''; ck.blur(); App.commit(); });
    var key = h('input', { type: 'text', value: s.key || '', placeholder: 'field name' });
    key.addEventListener('change', function () { s.key = key.value.replace(/[^A-Za-z0-9_]/g, ''); App.commit(); });
    function apply(prop, label) {
      return pbtn(label, function () {
        App.selLayers().forEach(function (L) { if (PROPS[L.type] && PROPS[L.type].indexOf(prop) >= 0) { L.link = L.link || {}; L.link[prop] = s.id; } });
        App.commit();
      }, 'Link the ' + label.toLowerCase() + ' of the selected layer(s) to this colour');
    }
    var types = {}; sel.forEach(function (L) { types[L.type] = 1; });
    var n = Panels.swatchUse(s.id);
    el.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'f' }, [cp.chip, cp.hex, cp.al]),
      h('div', { class: 'f' }, [nm, pbtn('\u00D7', function () {
        App.allLayers(function (L) { for (var k in (L.link || {})) if (L.link[k] === s.id) { if (!L.a[k]) L.p[k] = s.color; delete L.link[k]; } });
        sws.splice(sws.indexOf(s), 1); App.commit();
      }, 'Delete (linked layers keep the colour)')]),
      h('div', { class: 'f chk' }, [h('label', {}, [ck, ' From CasparCG']), s.key ? key : null]),
      h('div', { class: 'hint', text: n ? 'Used by ' + n + ' colour setting' + (n > 1 ? 's' : '') + '.' : 'Not used yet.' }),
      (types.text || types.shape) ? h('div', { class: 'pbar' }, [h('span', { class: 'lbl', text: 'Apply to selection:' }), types.text ? apply('color', 'Text') : null, types.shape ? apply('fill', 'Fill') : null, types.shape ? apply('stroke', 'Stroke') : null]) : null,
      s.key ? h('code', { class: 'amcp', text: '"' + s.key + '": "' + (/ff$/i.test(s.color) ? s.color.slice(0, 7) : s.color) + '"   (8 digits = with opacity, or "transparent")' }) : null
    ]));
  });
  if (!sel.length && sws.length) el.appendChild(h('p', { class: 'hint', text: 'Select layers to link them here, or use the drop-down next to any colour in the inspector.' }));
};

/* ================= Easing ================= */
Panels.easeState = function () {
  var k = App.selKeys[0], pr = App.project;
  if (k) {
    var e = k.e || { type: 'linear' };
    if (e.type === 'preset') {
      var ps = pr.easings.filter(function (x) { return x.id === e.id; })[0];
      if (ps) return { mode: 'preset', preset: ps, b: ps.b, keys: true };
    }
    if (e.type === 'bezier') return { mode: 'bezier', b: e.b, keys: true };
    return { mode: e.type === 'hold' ? 'hold' : 'linear', b: [0, 0, 1, 1], keys: true };
  }
  var sel = pr.easings.filter(function (x) { return x.id === Panels.presetSel; })[0];
  if (sel) return { mode: 'preset', preset: sel, b: sel.b, keys: false };
  return { mode: 'none', b: [0, 0, 1, 1], keys: false };
};
Panels.setCurve = function (b, live) {
  var st = Panels.easeState();
  b = b.map(function (v) { return Math.round(v * 1000) / 1000; });
  if (st.mode === 'preset') st.preset.b = b;
  else if (st.keys) App.selKeys.forEach(function (k) { k.e = { type: 'bezier', b: b.slice() }; });
  else return;
  if (live) { Stage.render(); } else App.commit();
};
Panels.curvePath = function (b, X, Y) {
  return 'M' + X(0) + ' ' + Y(0) + 'C' + X(b[0]) + ' ' + Y(b[1]) + ',' + X(b[2]) + ' ' + Y(b[3]) + ',' + X(1) + ' ' + Y(1);
};
Panels.easing = function (el) {
  var pr = App.project, st = Panels.easeState(), b = st.b.slice();
  function X(v) { return 24 + v * 200; } function Y(v) { return 200 - v * 140; }
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'curve'); svg.setAttribute('viewBox', '0 0 248 262');
  function draw() {
    svg.innerHTML = '<rect x="24" y="60" width="200" height="140" class="cv-box"/>' +
      '<line class="cv-arm" x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(b[0]) + '" y2="' + Y(b[1]) + '"/>' +
      '<line class="cv-arm" x1="' + X(1) + '" y1="' + Y(1) + '" x2="' + X(b[2]) + '" y2="' + Y(b[3]) + '"/>' +
      (st.mode === 'hold' ? '<path class="cv-line" d="M24 200H224V60"/>' : '<path class="cv-line" d="' + Panels.curvePath(b, X, Y) + '"/>') +
      '<circle class="cv-h" data-i="0" cx="' + X(b[0]) + '" cy="' + Y(b[1]) + '" r="7"/><circle class="cv-h" data-i="2" cx="' + X(b[2]) + '" cy="' + Y(b[3]) + '" r="7"/>';
  }
  draw();
  svg.addEventListener('mousedown', function (e) {
    var i = e.target.getAttribute && e.target.getAttribute('data-i');
    if (i == null || st.mode === 'none') return;
    i = +i; e.preventDefault();
    if (st.mode === 'hold' || st.mode === 'linear') st.mode = 'bezier';
    dragLoop(function (ev) {
      var r = svg.getBoundingClientRect(), sc = 248 / r.width;
      b[i] = clamp(((ev.clientX - r.left) * sc - 24) / 200, 0, 1);
      b[i + 1] = clamp((200 - (ev.clientY - r.top) * sc) / 140, -0.42, 1.42);
      draw(); Panels.setCurve(b, true);
      nums.forEach(function (n, j) { n.value = Math.round(b[j] * 1000) / 1000; });
    }, function () { Panels.setCurve(b); });
  });
  var info = st.mode === 'none' ? 'Select keyframes in the timeline, or click a preset below to edit it.' :
    st.mode === 'preset' ? (st.keys ? 'Linked to preset "' + st.preset.name + '". Editing the curve changes every keyframe that uses it.' : 'Editing preset "' + st.preset.name + '". Every keyframe that uses it follows.') :
    st.mode === 'hold' ? 'Hold: the value jumps at the next keyframe.' : st.mode === 'linear' ? 'Linear. Drag a handle to shape the curve.' : 'Custom curve on ' + App.selKeys.length + ' keyframe(s).';
  el.appendChild(h('p', { class: 'hint', text: info }));
  el.appendChild(svg);
  var nums = b.map(function (v, j) {
    var n = h('input', { type: 'number', step: 0.01, value: v });
    n.addEventListener('change', function () { var x = parseFloat(n.value); if (isNaN(x)) return; b[j] = j % 2 === 0 ? clamp(x, 0, 1) : x; Panels.setCurve(b); });
    return n;
  });
  el.appendChild(h('div', { class: 'b4' }, nums));
  el.appendChild(h('div', { class: 'pbar' }, [
    pbtn('Linear', function () { App.applyEase({ type: 'linear' }); }),
    pbtn('Hold', function () { App.applyEase({ type: 'hold' }); }),
    st.mode === 'preset' && st.keys ? pbtn('Unlink', function () { App.applyEase({ type: 'bezier', b: st.preset.b.slice() }); }, 'Keep this curve but stop following the preset') : null,
    pbtn('Save as preset', function () {
      UI.prompt('Preset name', 'My ease').then(function (name) {
        if (!name) return;
        var ps = { id: uid('e'), name: name, b: b.slice() };
        pr.easings.push(ps);
        if (App.selKeys.length) App.selKeys.forEach(function (k) { k.e = { type: 'preset', id: ps.id }; });
        Panels.presetSel = ps.id;
        App.commit();
      });
    })
  ]));
  el.appendChild(h('div', { class: 'ghead', text: 'Presets (shared easing groups)' }));
  pr.easings.forEach(function (ps) {
    var n = 0;
    App.allLayers(function (L) { for (var q in L.a) L.a[q].forEach(function (k) { if (k.e && k.e.type === 'preset' && k.e.id === ps.id) n++; }); });
    var mini = '<svg viewBox="0 0 40 40" class="mini"><path d="' + Panels.curvePath(ps.b, function (v) { return 4 + v * 32; }, function (v) { return 30 - v * 20; }) + '"/></svg>';
    var cur = (st.mode === 'preset' && st.preset === ps);
    el.appendChild(h('div', { class: 'aitem' + (cur ? ' cur' : ''), onclick: function (e) {
      if (e.target.tagName === 'BUTTON') return;
      if (App.selKeys.length) App.applyEase({ type: 'preset', id: ps.id });
      else { Panels.presetSel = ps.id; Panels.build(); }
    } }, [
      h('span', { html: mini }), h('span', { class: 'an', text: ps.name, title: App.selKeys.length ? 'Click to apply to the selected keyframes' : 'Click to edit' }),
      h('span', { class: 'am', text: n ? n + ' keys' : '' }),
      pbtn('Ren', function () { UI.prompt('Rename preset', ps.name).then(function (v) { if (v) { ps.name = v; App.commit(); } }); }),
      pbtn('×', function () {
        App.allLayers(function (L) { for (var q in L.a) L.a[q].forEach(function (k) { if (k.e && k.e.type === 'preset' && k.e.id === ps.id) k.e = { type: 'bezier', b: ps.b.slice() }; }); });
        pr.easings.splice(pr.easings.indexOf(ps), 1);
        if (pr.defaultEase && pr.defaultEase.id === ps.id) pr.defaultEase = { type: 'linear' };
        App.commit();
      }, 'Delete preset (keyframes keep their curve)')
    ]));
  });
};

/* ================= CasparCG ================= */
Panels.amcpEscape = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); };
Panels.send = function (cmds) {
  var cp = App.project.caspar;
  return Api.amcp({ host: cp.host, port: +cp.port || 5250, commands: cmds }).then(function (res) {
    cmds.forEach(function (c) { Panels.log.push('> ' + (c.length > 140 ? c.slice(0, 140) + '...' : c)); });
    Panels.log.push(String(res || '').trim() || '(no reply)');
  }).catch(function (e) { Panels.log.push('! ' + (e && e.message || e)); }).then(function () {
    Panels.log = Panels.log.slice(-40);
    if (Dock.isActive('caspar')) Panels.build();
  });
};
Panels.caspar = function (el) {
  var cp = App.project.caspar, addr = cp.channel + '-' + cp.layer;
  function fld(label, key, type) {
    var inp = h('input', { type: type, value: cp[key] });
    inp.addEventListener('change', function () { cp[key] = type === 'number' ? (parseInt(inp.value, 10) || 0) : inp.value.trim(); App.commit(); });
    return h('div', { class: 'f' }, [h('label', { text: label }), inp]);
  }
  el.appendChild(h('div', { class: 'ghead', text: 'CasparCG server' }));
  if (!Api.desktop) el.appendChild(h('p', { class: 'hint warn', text: 'Live connection only works in the desktop app.' }));
  el.appendChild(h('div', { class: 'grid' }, [fld('Host', 'host', 'text'), fld('Port', 'port', 'number'), fld('Channel', 'channel', 'number'), fld('Layer', 'layer', 'number')]));
  var pf = h('input', { type: 'text', value: App.project.exportFolder || '' });
  pf.addEventListener('change', function () { App.project.exportFolder = pf.value.trim(); App.commit(); });
  el.appendChild(h('div', { class: 'full' }, [h('div', { class: 'f' }, [h('label', { text: 'Export folder' }), pf]), fld('Sub-folder', 'prefix', 'text')]));
  el.appendChild(h('div', { class: 'pbar' }, [pbtn('Browse...', function () { Api.pickFolder().then(function (f) { if (f) { App.project.exportFolder = f; App.commit(); } }); })]));
  el.appendChild(h('p', { class: 'hint', text: 'This is the export folder of the project. It should be the CasparCG template folder (template-path in casparcg.config) or a folder inside it; in that case put that folder name in Sub-folder so the server finds the template.' }));
  var name = ((cp.prefix || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') ? (cp.prefix || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') + '/' : '') + IO.safeName();
  el.appendChild(h('div', { class: 'ghead', text: 'On air: ' + name }));
  el.appendChild(h('div', { class: 'pbar' }, [
    pbtn('Export + load', function () {
      if (!App.project.exportFolder) { UI.status('Choose the export folder first.'); return; }
      IO.exportTo(App.project.exportFolder).then(function () {
        return Panels.send(['CG ' + addr + ' ADD 1 "' + name + '" 0 "' + Panels.amcpEscape(JSON.stringify(Panels.sampleData())) + '"']);
      }).catch(function (e) { UI.status('Export failed: ' + (e && e.message || e)); });
    }, 'Writes the template into the folder and loads it on the channel (not yet playing)', 'primary'),
    pbtn('Play', function () { Panels.send(['CG ' + addr + ' PLAY 1']); }),
    pbtn('Next', function () { Panels.send(['CG ' + addr + ' NEXT 1']); }),
    pbtn('Stop', function () { Panels.send(['CG ' + addr + ' STOP 1']); }),
    pbtn('Update', function () { Panels.send(['CG ' + addr + ' UPDATE 1 "' + Panels.amcpEscape(JSON.stringify(Panels.sampleData())) + '"']); }, 'Sends the values from the Control tab'),
    pbtn('Clear', function () { Panels.send(['CG ' + addr + ' CLEAR']); })
  ]));
  var tplActs = IO.exportProject(App.compId).actions.filter(function (a, i, arr) { return arr.findIndex(function (b) { return b.name === a.name; }) === i; });
  if (tplActs.length) {
    el.appendChild(h('div', { class: 'pbar' }, tplActs.map(function (a) {
      return pbtn(a.name, function () { Panels.send(['CG ' + addr + ' INVOKE 1 "' + a.name + '"']); }, 'CG INVOKE');
    })));
  }
  el.appendChild(h('pre', { class: 'log', text: Panels.log.join('\n') || 'Server replies appear here.' }));
};
