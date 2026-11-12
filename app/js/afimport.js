/* CG Motion - Affinity document -> CG Motion project.
   Each artboard (or the page) becomes a composition. Layers and groups become null layers their
   layers follow; plain rectangles and ellipses become editable shapes; text becomes editable text
   (a CasparCG field each); pixel layers and placed images become pictures; other vector shapes are
   drawn into pictures at the document's resolution. Large groups of plain vector artwork are drawn
   into one picture so a template doesn't carry hundreds of layers. */
var AFI = {};
AFI.b64 = function (u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); };
AFI.is = function (path) { return /\.(af|afphoto|afdesign|afpub|aftemplate)$/i.test(path || ''); };

/* ---------- geometry helpers ---------- */
AFI.box = function (path) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  path.forEach(function (sp) {
    [sp.start].concat.apply([sp.start], sp.segs).forEach(function (q) { if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; });
  });
  return b;
};
AFI.union = function (a, b) { if (!a) return b; if (!b) return a; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; };
AFI.imgBox = function (im) { var m = im.m, w = im.w, h = im.h, c = [AF.ap(m, 0, 0), AF.ap(m, w, 0), AF.ap(m, w, h), AF.ap(m, 0, h)]; return AFI.box([{ start: c[0], segs: [[c[1], c[1], c[1]], [c[2], c[2], c[2]], [c[3], c[3], c[3]]] }]); };
AFI.p2d = function (path) {
  var p = new Path2D();
  path.forEach(function (sp) {
    p.moveTo(sp.start[0], sp.start[1]);
    sp.segs.forEach(function (s) { p.bezierCurveTo(s[0][0], s[0][1], s[1][0], s[1][1], s[2][0], s[2][1]); });
    if (sp.closed) p.closePath();
  });
  return p;
};
/* decompose a map into position / scale / rotation; null when it skews or flips */
AFI.similar = function (m) {
  var sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), det = m[0] * m[3] - m[1] * m[2];
  if (!(sx > 1e-9 && sy > 1e-9) || det <= 0) return null;
  if (Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-6 * sx * sy) return null;
  return { sx: sx, sy: sy, rot: Math.atan2(m[1], m[0]) * 180 / Math.PI };
};
AFI.rgba = function (c, mul) { var a = c.a * (mul == null ? 1 : mul); return 'rgba(' + Math.round(Math.max(0, Math.min(1, c.r)) * 255) + ',' + Math.round(Math.max(0, Math.min(1, c.g)) * 255) + ',' + Math.round(Math.max(0, Math.min(1, c.b)) * 255) + ',' + Math.max(0, Math.min(1, a)) + ')'; };
AFI.hex = function (c, mul) { return RT.toHex([Math.max(0, Math.min(1, c.r)) * 255, Math.max(0, Math.min(1, c.g)) * 255, Math.max(0, Math.min(1, c.b)) * 255, Math.max(0, Math.min(1, c.a * (mul == null ? 1 : mul)))]); };
AFI.mix = function (a, b, t) { return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t }; };
AFI.CANVAS_BLEND = { normal: 'source-over', pass: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
  'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', add: 'lighter',
  'darker-color': 'darken', 'lighter-color': 'lighten', 'linear-light': 'hard-light', 'vivid-light': 'hard-light', 'pin-light': 'hard-light', 'hard-mix': 'hard-light', subtract: 'difference' };
AFI.LAYER_BLEND = /^(normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion)$/;
AFI.NEAR = { add: 'screen', 'darker-color': 'darken', 'lighter-color': 'lighten', 'linear-light': 'hard-light', 'vivid-light': 'hard-light', 'pin-light': 'hard-light', 'hard-mix': 'hard-light', subtract: 'difference' };

/* ---------- getting pixels ready ---------- */
AFI.decodeImage = async function (bytes) { // used for tiles stored as the original image
  var bmp = await createImageBitmap(new Blob([bytes]));
  var c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  var g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, rgba: g.getImageData(0, 0, bmp.width, bmp.height).data };
};
AFI.prepImage = async function (im, asMask) {
  if (im.src) return;
  if (im.encoded) { im.src = await createImageBitmap(new Blob([im.encoded], { type: im.mime })); return; }
  var c = document.createElement('canvas'); c.width = im.w; c.height = im.h;
  var g = c.getContext('2d'), d = g.createImageData(im.w, im.h);
  if (asMask) { for (var i = 0; i < im.w * im.h; i++) { d.data[i * 4 + 3] = im.rgba[i * 4]; } } // grey level -> coverage
  else d.data.set(im.rgba);
  g.putImageData(d, 0, 0); im.src = c;
};
AFI.prep = async function (n) {
  if (n.kind.t === 'image') await AFI.prepImage(n.kind.img, false);
  if (n.pixelMask) await AFI.prepImage(n.pixelMask, true);
  for (var i = 0; i < n.children.length; i++) await AFI.prep(n.children[i]);
};

/* ---------- drawing (document space) ---------- */
AFI.styleFor = function (g, paint, mul) {
  if (paint.solid) return AFI.rgba(paint.solid, mul);
  return null;
};
AFI.gradStops = function (grad, mul) {
  var out = [], s = grad.stops.slice().sort(function (a, b) { return a.o - b.o; });
  s.forEach(function (st, i) {
    out.push([st.o, AFI.rgba(st.c, mul)]);
    var nx = s[i + 1];
    if (nx && Math.abs(st.bias - 0.5) > 0.01 && nx.o > st.o) {
      var k = 1 + 8 * Math.abs(st.bias - 0.5), hh = Math.pow(0.5, 1 / k), half = st.bias >= 0.5 ? hh : 1 - hh;
      out.push([st.o + (nx.o - st.o) * half, AFI.rgba(AFI.mix(st.c, nx.c, 0.5), mul)]);
    }
  });
  return out;
};
AFI.fillPaint = function (g, p2d, rule, paint, mul, bbox) {
  if (paint.solid) { g.fillStyle = AFI.rgba(paint.solid, mul); g.fill(p2d, rule); return; }
  if (!paint.grad) return;
  var G = paint.grad, m = G.m, det = m[0] * m[3] - m[1] * m[2];
  if (!(Math.abs(det) > 1e-12)) { g.fillStyle = AFI.rgba(G.stops[0].c, mul); g.fill(p2d, rule); return; }
  g.save(); g.clip(p2d, rule);
  g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  var gr = G.kind === 'radial' ? g.createRadialGradient(0, 0, 0, 0, 0, 1) : (G.kind === 'conical' && g.createConicGradient ? g.createConicGradient(0, 0, 0) : g.createLinearGradient(0, 0, 1, 0));
  AFI.gradStops(G, mul).forEach(function (s) { gr.addColorStop(Math.max(0, Math.min(1, s[0])), s[1]); });
  g.fillStyle = gr;
  /* cover the bbox in unit space */
  var inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  var cs = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map(function (q) { return AF.ap(inv, q[0], q[1]); });
  var xs = cs.map(function (q) { return q[0]; }), ys = cs.map(function (q) { return q[1]; });
  var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  g.fillRect(x0 - 1, y0 - 1, Math.max.apply(null, xs) - x0 + 2, Math.max.apply(null, ys) - y0 + 2);
  g.restore();
};
AFI.strokePaint = function (g, p2d, st, mul, bbox, note) {
  var col = st.paint.solid || (st.paint.grad && st.paint.grad.stops[0].c);
  if (!col) return;
  if (st.paint.grad) note('Gradient strokes were drawn in their first colour.');
  g.save();
  g.strokeStyle = AFI.rgba(col, mul); g.lineCap = st.cap; g.lineJoin = st.join; g.miterLimit = st.miter;
  if (st.dash) { g.setLineDash(st.dash.arr); g.lineDashOffset = -st.dash.phase; }
  if (st.align === 'inside') { g.clip(p2d); g.lineWidth = st.width * 2; }
  else if (st.align === 'outside') { var out = new Path2D(); out.rect(bbox[0] - 1e4, bbox[1] - 1e4, bbox[2] - bbox[0] + 2e4, bbox[3] - bbox[1] + 2e4); out.addPath(p2d); g.clip(out, 'evenodd'); g.lineWidth = st.width * 2; }
  else g.lineWidth = st.width;
  g.stroke(p2d);
  g.restore();
};
AFI.fxOf = function (n, cls) { for (var i = 0; i < n.fx.length; i++) if (n.fx[i].cls === cls) return n.fx[i]; return null; };
AFI.baked = function (n) { return !!(AFI.fxOf(n, 'ColO') || AFI.fxOf(n, 'Strk')); };
AFI.pad = function (k) { var p = 2; (k.strokes || []).forEach(function (s) { p = Math.max(p, s.width * (s.align === 'outside' ? 1 : (s.align === 'inside' ? 0 : 0.5)) * (s.join === 'miter' ? Math.min(s.miter, 4) : 1) + 2); }); return p; };
/* the area a node covers, in document pixels */
AFI.extent = function (n) {
  var k = n.kind, b = null;
  if (k.t === 'shape') { var e = AFI.box(k.path), p = AFI.pad(k); b = [e[0] - p, e[1] - p, e[2] + p, e[3] + p]; }
  else if (k.t === 'image') b = AFI.imgBox(k.img);
  if (!(k.t === 'shape' && n.children.length)) n.children.forEach(function (c) { b = AFI.union(b, AFI.extent(c)); });
  var sk = AFI.fxOf(n, 'Strk'); if (sk && b) { var sr = (AF.num(sk, 'Radi') || 0) + 1; b = [b[0] - sr, b[1] - sr, b[2] + sr, b[3] + sr]; }
  if (n.mask && b) { var mb = AFI.box(n.mask); b = [Math.max(b[0], mb[0]), Math.max(b[1], mb[1]), Math.min(b[2], mb[2]), Math.min(b[3], mb[3])]; }
  return b;
};
/* draw one node (and what it contains) onto g, whose transform maps document pixels */
AFI.draw = function (g, n, note, opts) {
  opts = opts || {};
  if (!n.visible) return;
  var k = n.kind, ext = AFI.extent(n); if (!ext || !(ext[2] > ext[0]) || !(ext[3] > ext[1])) return;
  var isolated = n.children.length || n.mask || n.pixelMask || AFI.baked(n) || (!opts.top && ((n.blend !== 'normal' && n.blend !== 'pass') || n.opacity < 1));
  var target = g, layer = null, T = g.getTransform();
  if (isolated) {
    /* draw into an off-screen picture the size of the node, then composite it */
    var sc = Math.hypot(T.a, T.b) || 1, x0 = Math.floor(ext[0]), y0 = Math.floor(ext[1]), W = Math.ceil((ext[2] - x0) * sc), H = Math.ceil((ext[3] - y0) * sc);
    if (W < 1 || H < 1 || W * H > 64e6) return;
    layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    target = layer.getContext('2d'); target.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
  }
  var fm = n.fillOpacity;
  if (k.t === 'shape') {
    var p2d = AFI.p2d(k.path), rule = k.evenOdd ? 'evenodd' : 'nonzero', bb = AFI.box(k.path);
    k.strokes.forEach(function (s) { if (s.behind) AFI.strokePaint(target, p2d, s, fm, bb, note); });
    k.fills.forEach(function (f) { AFI.fillPaint(target, p2d, rule, f, fm, bb); });
    if (n.children.length) {
      /* a shape clips what it contains: drawn over the fill, under the stroke */
      target.save(); target.clip(p2d, rule);
      n.children.forEach(function (c) { AFI.draw(target, c, note); });
      target.restore();
    }
    k.strokes.forEach(function (s) { if (!s.behind) AFI.strokePaint(target, p2d, s, fm, bb, note); });
  } else {
    if (k.t === 'image' && k.img.src) {
      var m = k.img.m; target.save(); target.transform(m[0], m[1], m[2], m[3], m[4], m[5]); target.imageSmoothingQuality = 'high'; target.drawImage(k.img.src, 0, 0); target.restore();
    }
    n.children.forEach(function (c) { AFI.draw(target, c, note); });
  }
  if (isolated) {
    AFI.applyFx(target, layer, n, Math.hypot(T.a, T.b) || 1);
    if (n.mask) { target.save(); target.globalCompositeOperation = 'destination-in'; target.fillStyle = '#fff'; target.fill(AFI.p2d(n.mask)); target.restore(); }
    if (n.pixelMask && n.pixelMask.src) {
      var pm = n.pixelMask, mm = pm.m;
      /* outside the mask's own area the node is hidden */
      var mk = document.createElement('canvas'); mk.width = layer.width; mk.height = layer.height;
      var mg = mk.getContext('2d'); mg.setTransform(target.getTransform()); mg.transform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]); mg.drawImage(pm.src, 0, 0);
      target.save(); target.setTransform(1, 0, 0, 1, 0, 0); target.globalCompositeOperation = 'destination-in'; target.drawImage(mk, 0, 0); target.restore();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = opts.top ? 1 : n.opacity;
    g.globalCompositeOperation = opts.top ? 'source-over' : (AFI.CANVAS_BLEND[n.blend] || 'source-over');
    var sc2 = Math.hypot(T.a, T.b) || 1;
    g.drawImage(layer, Math.floor(ext[0]) * sc2 + T.e, Math.floor(ext[1]) * sc2 + T.f);
    g.restore();
  }
};
/* colour overlay and outline effects, baked into the node's own picture */
AFI.applyFx = function (g, layer, n, sc) {
  var co = AFI.fxOf(n, 'ColO'), sk = AFI.fxOf(n, 'Strk'), W = layer.width, H = layer.height;
  function col(e) { return AF.color({ warn: function () {} }, AF.ob(e, 'Colr')) || { r: 0, g: 0, b: 0, a: 1 }; }
  if (co) {
    var c = col(co), o = AF.num(co, 'Opac'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = (o == null ? 1 : o) * c.a; g.fillStyle = AFI.rgba({ r: c.r, g: c.g, b: c.b, a: 1 }); g.fillRect(0, 0, W, H); g.restore();
  }
  if (sk) {
    var r = (AF.num(sk, 'Radi') || 0) * sc, c2 = col(sk), o2 = AF.num(sk, 'Opac');
    if (r > 0) {
      var ol = document.createElement('canvas'); ol.width = W; ol.height = H; var og = ol.getContext('2d');
      var steps = Math.max(16, Math.min(64, Math.round(r * 4)));
      for (var i = 0; i < steps; i++) { var a = i / steps * Math.PI * 2; og.drawImage(layer, Math.cos(a) * r, Math.sin(a) * r); }
      for (var rr = r * 0.5; rr > 0.5; rr *= 0.5) for (var j = 0; j < 16; j++) { var b = j / 16 * Math.PI * 2; og.drawImage(layer, Math.cos(b) * rr, Math.sin(b) * rr); }
      og.globalCompositeOperation = 'source-in'; og.globalAlpha = 1; og.fillStyle = AFI.rgba({ r: c2.r, g: c2.g, b: c2.b, a: 1 }); og.fillRect(0, 0, W, H);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-over'; g.globalAlpha = (o2 == null ? 1 : o2) * c2.a; g.drawImage(ol, 0, 0); g.restore();
    }
  }
};
/* a node as a picture: {src, x, y, w, h} in document pixels */
AFI.picture = function (n, note, scale) {
  var ext = AFI.extent(n); if (!ext) return null;
  var s = scale || 1, x0 = Math.floor(ext[0]), y0 = Math.floor(ext[1]), x1 = Math.ceil(ext[2]), y1 = Math.ceil(ext[3]);
  var W = Math.round((x1 - x0) * s), H = Math.round((y1 - y0) * s);
  if (W < 1 || H < 1) return null;
  if (W * H > 40e6) { note('Some very large artwork was left out (over 40 megapixels).'); return null; }
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  var vis = n.visible; n.visible = true;
  AFI.draw(g, n, note, { top: true });
  n.visible = vis;
  /* trim transparent edges */
  var d = g.getImageData(0, 0, W, H).data, minX = W, minY = H, maxX = -1, maxY = -1;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return null;
  var tw = maxX - minX + 1, th = maxY - minY + 1;
  if (tw !== W || th !== H) { var c2 = document.createElement('canvas'); c2.width = tw; c2.height = th; c2.getContext('2d').drawImage(c, -minX, -minY); c = c2; }
  return { src: c.toDataURL('image/png'), x: x0 + minX / s, y: y0 + minY / s, w: tw / s, h: th / s, pw: tw, ph: th };
};

/* ---------- what a subtree holds ---------- */
AFI.stats = function (n) {
  var s = { leaves: 0, text: 0, images: 0 };
  (function walk(x) {
    if (x.kind.t === 'text') s.text++;
    if (x.kind.t === 'image') s.images++;
    if (x.kind.t === 'shape' || x.kind.t === 'image' || x.kind.t === 'text') s.leaves++;
    x.children.forEach(walk);
  })(n);
  return s;
};

/* ---------- conversion ---------- */
AFI.convert = async function (u8, name, opts) {
  opts = opts || {};
  var A = AF.archive(u8), thumb = AF.thumbnail(A), notes = [], seen = {}, M = null, failure = '';
  function note(s) { if (!seen[s]) { seen[s] = 1; notes.push(s); } }
  try { M = await AF.model(A, { decodeImage: AFI.decodeImage }); } catch (e) { failure = e.message; }
  var p = App.blankProject(), stats = { layers: 0, texts: 0, groups: 0, assets: 0, shapes: 0, pictures: 0, fields: {}, fonts: {}, mattes: 0, comps: 0 };
  p.name = name; p.assets = {}; p.actions = []; p.imported = { from: 'Affinity' }; p.comps = [];
  var uid = 0; function nid(pre) { return pre + Date.now().toString(36).slice(-4) + '_' + (uid++); }
  var keys = {};
  function fieldKey(nm) { var k = String(nm || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'text'; var k0 = k, i = 2; while (keys[k]) k = k0 + '_' + (i++); keys[k] = 1; return k; }
  function newComp(nm, w, h) {
    var c = { id: nid('c'), name: nm, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), fps: 50, duration: 250, bg: '', layers: [], markers: [], loops: [], note: 'Imported from the Affinity file "' + name + '". Every layer is in place; add keyframes to animate it.' };
    p.comps.push(c); stats.comps++; return c;
  }
  function base(comp, nm, type) { return { id: nid('l'), name: nm, type: type, start: 0, end: comp.duration, visible: true, locked: false, parent: '', matte: '', matteMode: 'alpha', blend: 'normal', p: {}, a: {}, mask: { on: false, shape: 'rect' }, shadow: false }; }
  function addAsset(src, w, h, label) { var aid = nid('a'); p.assets[aid] = { id: aid, type: 'image', name: name + ' - ' + label, src: src, w: w, h: h }; stats.assets++; return aid; }
  function layerBlend(n) {
    var b = n.blend;
    if (b === 'pass' || b === 'normal') return 'normal';
    if (AFI.LAYER_BLEND.test(b)) return b;
    if (AFI.NEAR[b]) { note('The "' + b + '" blend mode has no exact match; "' + AFI.NEAR[b] + '" was used.'); return AFI.NEAR[b]; }
    note('The "' + b + '" blend mode was imported as Normal.'); return 'normal';
  }
  function effects(L, n) {
    n.fx.forEach(function (e) {
      if ((e.cls === 'ColO' || e.cls === 'Strk') && L.type !== 'text') return;
      if (e.cls === 'ColO') { var oc = AF.color({ warn: note }, AF.ob(e, 'Colr')); if (oc) L.p.color = AFI.hex(oc, AF.num(e, 'Opac') == null ? 1 : AF.num(e, 'Opac')); return; }
      if (e.cls === 'Gaus' || e.cls === 'GBlr') { L.p.blur = Math.round((AF.num(e, 'Radi') || 0) / 2 * 10) / 10; return; }
      if (e.cls === 'Shad') {
        var col = AF.color({ warn: note }, AF.ob(e, 'Colr')) || { r: 0, g: 0, b: 0, a: 1 }, op = AF.num(e, 'Opac'), off = AF.num(e, 'Offs') || 0, ang = AF.num(e, 'Angl') || 0, rad = AF.num(e, 'Radi') || 0;
        L.shadow = true;
        L.p.shX = Math.round(Math.cos(ang) * off * 10) / 10; L.p.shY = Math.round(Math.sin(ang) * off * 10) / 10;
        L.p.shBlur = Math.round(rad * 10) / 10; L.p.shColor = AFI.hex(col, op == null ? 1 : op);
        return;
      }
      var nm = { Strk: 'Outline', OutG: 'Outer glow', InnG: 'Inner glow', InnS: 'Inner shadow', ColO: 'Colour overlay', GrdO: 'Gradient overlay', BevE: 'Bevel / emboss', GBlr: 'Gaussian blur', OBlr: 'Outer blur' }[e.cls] || 'layer effect';
      note('The "' + nm + '" effect on "' + (n.name || 'a layer') + '" is not supported yet; the layer was imported without it.');
    });
  }
  function nameOf(n) {
    if (n.name) return n.name;
    if (n.kind.t === 'text') { var t = n.kind.text.runs.map(function (r) { return r.text; }).join('').replace(/[\u2029\u2028\r\n]+/g, ' ').trim(); return t.slice(0, 32) || 'Text'; }
    return { layer: 'Layer', group: 'Group', shape: 'Shape', image: 'Picture', artboard: 'Artboard' }[n.kind.t] || 'Layer';
  }

  /* place a node's layers into comp, front first. ctx: parent id, offset, opacity multiplier, hidden, matte */
  function emit(comp, nodes, ctx) {
    for (var i = nodes.length - 1; i >= 0; i--) one(comp, nodes[i], ctx);
  }
  function one(comp, n, ctx) {
    var k = n.kind, hidden = ctx.hidden || !n.visible, op = n.opacity * ctx.opMul, nm = nameOf(n), ox = ctx.ox, oy = ctx.oy;
    var container = k.t === 'layer' || k.t === 'group' || k.t === 'artboard' || (k.t === 'unsupported' && n.children.length);
    if (k.t === 'unsupported' && !n.children.length) return;
    var st = AFI.stats(n);
    /* plain vector artwork in a big group: one picture */
    if (container && st.leaves === 0) return;
    if (container && st.text === 0 && st.leaves > collapseAt && !opts.keepAll) { return picture(comp, n, ctx, nm, op, hidden, 'group'); }
    if (container) {
      if (n.mask || n.pixelMask) { return picture(comp, n, ctx, nm, op, hidden, 'masked group'); }
      if (AFI.baked(n)) { return picture(comp, n, ctx, nm, op, hidden, 'effects'); }
      var G = base(comp, nm, 'null');
      G.p.x = 0; G.p.y = 0; G.p.ax = 0; G.p.ay = 0; G.parent = ctx.parent; G.visible = !hidden;
      if (n.blend !== 'pass' && n.blend !== 'normal') note('Group "' + nm + '" uses a blend mode; its layers were imported with their own modes.');
      if (n.fx.length) note('Effects on group "' + nm + '" were left out.');
      comp.layers.push(G); stats.groups++;
      emit(comp, n.children, { parent: G.id, ox: ox, oy: oy, opMul: op, hidden: hidden, matte: ctx.matte });
      return;
    }
    var L = null;
    if (k.t === 'text') L = textLayer(comp, n, ctx, nm);
    else if (k.t === 'shape') {
      if (n.children.length && st.text) {
        /* a shape that clips text: the shape becomes the matte of what it contains */
        L = shapeLayer(comp, n, ctx, nm) || pictureLayer(comp, n, ctx, nm, true);
      } else if (n.children.length) return picture(comp, n, ctx, nm, op, hidden, 'clipped');
      else L = shapeLayer(comp, n, ctx, nm) || pictureLayer(comp, n, ctx, nm, false);
    } else if (k.t === 'image') L = imageLayer(comp, n, ctx, nm);
    if (!L) return;
    finish(L, n, ctx, op, hidden);
    if (k.t === 'shape' && n.children.length) {
      L.matteShow = true;
      var before = comp.layers.length - 1;
      /* children go in front of the shape and use it as their matte */
      var kids = []; var sub = { parent: ctx.parent, ox: ox, oy: oy, opMul: op, hidden: hidden, matte: L.id };
      var saved = comp.layers; comp.layers = kids; emit(comp, n.children, sub); comp.layers = saved;
      comp.layers.splice.apply(comp.layers, [before, 0].concat(kids));
    }
  }
  function finish(L, n, ctx, op, hidden) {
    if (op < 0.999) L.p.op = Math.round(op * 1000) / 10;
    L.blend = layerBlend(n); L.visible = !hidden; L.parent = ctx.parent;
    if (ctx.matte && !L.matte) { L.matte = ctx.matte; L.matteMode = 'alpha'; stats.mattes++; }
    effects(L, n);
    L.__node = n;
    stats.layers++;
  }
  function picture(comp, n, ctx, nm, op, hidden, why) {
    var L = pictureLayer(comp, n, ctx, nm, false);
    if (!L) return;
    finish(L, n, ctx, op, hidden);
    if (why === 'group') note(collapseAt > 1 ? 'Groups of plain vector artwork (more than 12 shapes and no text) were each drawn into one picture, so the template stays light.' : 'This document has many parts, so each group without text was drawn into one picture to keep the template light.');
    if (why === 'masked group') note('Groups with a mask were drawn into one picture with the mask applied.');
    if (why === 'effects') note('Groups with a colour overlay or outline effect were drawn into one picture with the effect applied.');
  }
  function pictureLayer(comp, n, ctx, nm, noKids) {
    var kids = n.children; if (noKids) n.children = [];
    var vis = n.visible, opac = n.opacity, bl = n.blend; n.opacity = 1; n.blend = 'normal';
    var pic = AFI.picture(n, note, opts.scale || 1);
    n.children = kids; n.visible = vis; n.opacity = opac; n.blend = bl;
    if (!pic) return null;
    var L = base(comp, nm, 'image');
    L.asset = addAsset(pic.src, pic.pw, pic.ph, nm); L.fit = 'fill'; L.prefix = ''; L.suffix = ''; L.key = '';
    L.p.w = pic.w; L.p.h = pic.h; L.p.ax = pic.w / 2; L.p.ay = pic.h / 2;
    L.p.x = pic.x - ctx.ox + pic.w / 2; L.p.y = pic.y - ctx.oy + pic.h / 2;
    comp.layers.push(L); stats.pictures++;
    return L;
  }
  function shapeLayer(comp, n, ctx, nm) {
    var k = n.kind;
    if (!k.prim || !k.box || n.mask || n.pixelMask || k.evenOdd || AFI.baked(n)) return null;
    var sim = AFI.similar(k.m); if (!sim) return null;
    if (k.fills.length > 1 || k.strokes.length > 1) return null;
    var f = k.fills[0], s = k.strokes[0];
    if (f && !f.solid) return null;
    if (s && (!s.paint.solid || s.align !== 'center' || s.dash)) return null;
    var b = k.box, w = (b[2] - b[0]) * sim.sx, h = (b[3] - b[1]) * sim.sy, r = 0;
    if (k.prim.kind === 'rect' && k.prim.r) { if (Math.abs(sim.sx - sim.sy) > 1e-3 * sim.sx) return null; r = k.prim.r * sim.sx; }
    var sw = s ? s.width : 0, c = AF.ap(k.m, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    var L = base(comp, nm, 'shape');
    L.shape = k.prim.kind === 'ellipse' ? 'ellipse' : 'rect'; L.gradient = false;
    L.p.w = Math.round((w + sw) * 100) / 100; L.p.h = Math.round((h + sw) * 100) / 100; L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
    L.p.x = Math.round((c[0] - ctx.ox) * 100) / 100; L.p.y = Math.round((c[1] - ctx.oy) * 100) / 100;
    if (Math.abs(sim.rot) > 0.01) L.p.rot = Math.round(sim.rot * 100) / 100;
    L.p.fill = f ? AFI.hex(f.solid, n.fillOpacity) : '#00000000';
    if (r) L.p.radius = Math.round((r + sw / 2) * 100) / 100;
    if (s) { L.p.stroke = AFI.hex(s.paint.solid, n.fillOpacity); L.p.strokeW = Math.round(sw * 100) / 100; }
    comp.layers.push(L); stats.shapes++;
    return L;
  }
  function imageLayer(comp, n, ctx, nm) {
    var im = n.kind.img, sim = AFI.similar(im.m);
    if (!sim || n.mask || n.pixelMask || !im.src || AFI.baked(n)) return pictureLayer(comp, n, ctx, nm, false);
    var src;
    if (im.encoded) src = 'data:' + im.mime + ';base64,' + AFI.b64(im.encoded);
    else src = im.src.toDataURL('image/png');
    var L = base(comp, nm, 'image');
    L.asset = addAsset(src, im.w, im.h, nm); L.fit = 'fill'; L.prefix = ''; L.suffix = ''; L.key = '';
    var w = im.w * sim.sx, h = im.h * sim.sy, c = AF.ap(im.m, im.w / 2, im.h / 2);
    L.p.w = Math.round(w * 100) / 100; L.p.h = Math.round(h * 100) / 100; L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
    L.p.x = Math.round((c[0] - ctx.ox) * 100) / 100; L.p.y = Math.round((c[1] - ctx.oy) * 100) / 100;
    if (Math.abs(sim.rot) > 0.01) L.p.rot = Math.round(sim.rot * 100) / 100;
    comp.layers.push(L); stats.pictures++;
    return L;
  }
  function textLayer(comp, n, ctx, nm) {
    var T = n.kind.text, runs = T.runs.filter(function (r) { return r.text.replace(/[\s\u2029\u2028]/g, ''); });
    if (!runs.length) return null;
    var r0 = runs[0], m = T.m, sim = AFI.similar(m) || { sx: AF.scaleOf(m), sy: AF.scaleOf(m), rot: 0 };
    if (!AFI.similar(m)) note('Skewed or flipped text was imported straight.');
    var sc = Math.sqrt(sim.sx * sim.sy), fs = r0.size * sc;
    var styles = {}; runs.forEach(function (r) { styles[[r.family, r.weight, r.italic, Math.round(r.size * 10), JSON.stringify(r.fill)].join('|')] = 1; });
    if (Object.keys(styles).length > 1) note('Text "' + nm + '" mixes several styles; it was imported with the first one (Text styles can rebuild the rest).');
    var L = base(comp, nm, 'text');
    L.text = T.runs.map(function (r) { return r.text; }).join('').replace(/\r\n?|[\u2029\u2028]/g, '\n').replace(/\n+$/, '');
    L.key = fieldKey(nm); stats.fields[L.key] = 1; stats.texts++;
    L.font = r0.family || 'Arial'; L.weight = r0.weight; L.italic = r0.italic; stats.fonts[L.font] = 1;
    L.upper = r0.caps; L.tcase = r0.caps ? 'upper' : 'none';
    L.align = T.align === 'justify' ? 'left' : T.align;
    if (T.align === 'justify') note('Justified text was imported left aligned.');
    L.box = true; L.boxScale = false; L.clip = false; L.boxWrap = !T.artistic; L.fitBox = false; L.squeeze = false;
    L.padL = L.padR = L.padT = L.padB = 0; L.maxW = 0; L.wrapW = 0;
    L.valign = T.artistic ? 'middle' : 'top';
    L.p.fontSize = Math.round(fs * 10) / 10;
    var tr = r0.tracking; L.p.tracking = Math.round((Math.abs(tr) < 2 ? tr : tr / 1000) * fs * 10) / 10;
    L.p.lineHeight = r0.leading ? Math.round(r0.leading / r0.size * 100) / 100 : 1.2;
    var col = r0.fill.solid || (r0.fill.grad && r0.fill.grad.stops[0].c);
    if (r0.fill.grad) note('Gradient-filled text "' + nm + '" uses its first colour.');
    L.p.color = col ? AFI.hex(col, n.fillOpacity) : '#00000000';
    L.p.bg = '#00000000';
    /* the box: the frame (frame text) or the text's bounds widened so longer words fit (artistic text) */
    var b = T.bounds, bw = Math.max(1, (b[2] - b[0]) * sim.sx), bh = Math.max(1, (b[3] - b[1]) * sim.sy);
    var lines = L.text.split('\n').length, w = bw, h = bh, shift = 0;
    if (T.artistic) {
      var extra = Math.max(bw * 0.25, fs); w = bw + extra; h = Math.max(bh, fs * 1.25 * lines);
      shift = L.align === 'center' ? 0 : (L.align === 'right' ? -extra / 2 : extra / 2);
    }
    var c = AF.ap(m, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2), rad = sim.rot * Math.PI / 180;
    L.p.w = Math.round(w); L.p.h = Math.round(h); L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
    L.p.x = Math.round((c[0] + Math.cos(rad) * shift - ctx.ox) * 10) / 10; L.p.y = Math.round((c[1] + Math.sin(rad) * shift - ctx.oy) * 10) / 10;
    if (Math.abs(sim.rot) > 0.01) L.p.rot = Math.round(sim.rot * 100) / 100;
    if (n.mask || n.pixelMask) note('Masks on text "' + nm + '" were left out.');
    comp.layers.push(L);
    return L;
  }

  var collapseAt = 12;
  if (M) {
    var total = 0; M.spreads.forEach(function (sp) { sp.nodes.forEach(function (n) { total += AFI.stats(n).leaves; }); });
    if (total > 150) collapseAt = 1;
    for (var si = 0; si < M.spreads.length; si++) for (var ni = 0; ni < M.spreads[si].nodes.length; ni++) await AFI.prep(M.spreads[si].nodes[ni]);
    M.warnings.forEach(note);
    M.spreads.forEach(function (sp, si) {
      var boards = sp.nodes.filter(function (n) { return n.kind.t === 'artboard'; }), loose = sp.nodes.filter(function (n) { return n.kind.t !== 'artboard'; });
      var multi = M.spreads.length > 1;
      boards.slice().reverse().forEach(function (ab) {
        var r = ab.kind.rect, comp = newComp(ab.name || ('Artboard ' + (stats.comps + 1)), r[2] - r[0], r[3] - r[1]);
        var ctx = { parent: '', ox: r[0], oy: r[1], opMul: 1, hidden: false, matte: '' };
        emit(comp, ab.children, ctx);
        if (ab.kind.background.length) {
          var bgNode = { cls: 'bg', name: 'Background', visible: true, opacity: 1, fillOpacity: 1, blend: 'normal', children: [], mask: null, pixelMask: null, fx: [],
            kind: { t: 'shape', path: ab.kind.path, local: ab.kind.path, m: AF.I, evenOdd: false, prim: { kind: 'rect', r: 0 }, box: r, fills: ab.kind.background, strokes: [] } };
          one(comp, bgNode, ctx);
        }
      });
      if (loose.length || !boards.length) {
        var b = sp.bounds, label = boards.length ? name + ' (outside the artboards)' : (multi ? name + ' - page ' + (si + 1) : name);
        var comp = newComp(label, b[2] - b[0], b[3] - b[1]);
        emit(comp, loose, { parent: '', ox: b[0], oy: b[1], opMul: 1, hidden: false, matte: '' });
        if (!sp.transparent && !boards.length && opts.pageBackground) comp.bg = '#ffffffff';
      }
    });
    if (M.spreads.some(function (s) { return s.pages.length > 1; })) note('Facing pages were imported as one composition per spread.');
  }
  if (M && !p.comps.some(function (c) { return c.layers.length; })) note('This document has no visible artwork to import.');
  if (!M) {
    /* the document could not be read: use the picture Affinity stores of itself */
    if (!thumb) throw new Error(failure || 'Nothing in this Affinity file could be imported.');
    var bmp = await createImageBitmap(new Blob([thumb], { type: 'image/png' }));
    var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
    p.comps = []; stats.comps = 0; var comp = newComp(name, bmp.width, bmp.height), L = base(comp, 'Preview', 'image');
    L.asset = addAsset(cv.toDataURL('image/png'), bmp.width, bmp.height, 'preview'); L.fit = 'fill'; L.prefix = ''; L.suffix = ''; L.key = '';
    L.p.w = bmp.width; L.p.h = bmp.height; L.p.ax = bmp.width / 2; L.p.ay = bmp.height / 2; L.p.x = bmp.width / 2; L.p.y = bmp.height / 2;
    comp.layers.push(L); stats.layers++; stats.pictures++;
    notes.unshift('The document itself could not be read' + (failure ? ' (' + failure + ')' : '') + ', so the small preview Affinity stores in the file was imported instead. Export a PSD from Affinity for full quality.');
  }
  p.comps.forEach(function (c) { c.layers.forEach(function (L) { delete L.__node; }); });
  p.rootComp = p.comps[0].id;
  var fl = Object.keys(stats.fonts).filter(function (f) { return !/^(Arial|Segoe UI|Verdana|Tahoma|Georgia|Times New Roman|Courier New|Impact)$/i.test(f); });
  if (fl.length) notes.unshift('Fonts used: ' + fl.join(', ') + '. Add the font files under Assets > Fonts (then they travel inside the template), or install them on the CasparCG PC.');
  if (stats.texts) notes.push('Text layers became editable text: check their size and position against Affinity (a text box was made around each one).');
  function pl(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  var summary = pl(stats.comps, 'composition') + ', ' + pl(stats.layers, 'layer') + ' (' + pl(stats.texts, 'editable text') + ', ' + pl(stats.shapes, 'shape') + ', ' + pl(stats.pictures, 'picture') + '), ' + pl(stats.groups, 'group') + (stats.mattes ? ', ' + pl(stats.mattes, 'clipped layer') : '') + '.';
  return { project: p, report: { summary: summary, fields: Object.keys(stats.fields), notes: notes, thumb: thumb, savedBy: M ? M.savedBy : '' } };
};

AFI.showReport = function (name, rep) {
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var thumbEl = null;
  if (rep.thumb) { var url = URL.createObjectURL(new Blob([rep.thumb], { type: 'image/png' })); thumbEl = h('div', { class: 'vmix-thumbs' }, h('div', { class: 'vmix-th' }, [h('img', { src: url }), h('span', { text: 'Affinity\'s own preview' })])); }
  var kids = [
    h('div', { class: 'modal-title', text: 'Imported from Affinity: ' + name }),
    h('p', { text: rep.summary + (rep.savedBy ? ' Saved by ' + rep.savedBy + '.' : '') }),
    thumbEl,
    rep.fields.length ? h('p', { class: 'hint', text: 'Fields: ' + rep.fields.join(', ') }) : null,
    h('div', { class: 'ghead', text: rep.notes.length ? 'Check these (' + rep.notes.length + ')' : 'Everything in the file was converted' })
  ];
  if (rep.notes.length) kids.push(h('ul', { class: 'imp-notes' }, rep.notes.map(function (n) { return h('li', { text: n }); })));
  kids.push(h('p', { class: 'hint', text: 'Affinity files have no animation: every layer is in place, ready for keyframes. Each artboard is its own composition. Use Save to keep the project; the Affinity file is not changed.' }));
  kids.push(h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'OK', onclick: close })]));
  var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal wide' }, kids));
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') close(); });
  host.appendChild(bg);
  var b = bg.querySelector('.modal-btns button'); if (b) b.focus();
};

AFI.open = function (bytes, path, opts) {
  var name = String(path || 'Affinity file').replace(/^.*[\\\/]/, '').replace(/\.(af|afphoto|afdesign|afpub|aftemplate)$/i, '');
  UI.status('Reading Affinity file...', true);
  return AFI.convert(bytes, name, opts).then(function (r) {
    App.load(r.project, null);
    App.setDirty(true);
    AFI.last = r.report;
    UI.status('Imported "' + name + '" from Affinity: ' + r.report.summary);
    if (!window.__test) AFI.showReport(name, r.report);
    return r;
  });
};
