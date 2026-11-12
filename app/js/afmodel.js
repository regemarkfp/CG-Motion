/* CG Motion - Affinity document model: pages, artboards, layers, shapes, text and pixels in
   document pixels, every transform composed. Structures follow storytold/vectorcraft's affinity
   crate (MIT / Apache-2.0), re-written for CG Motion; see NOTICE.md. */
var AF = (typeof AF !== 'undefined' && AF) || (typeof require !== 'undefined' ? require('./affinity.js') : {});

/* ---------- small helpers over stream objects ---------- */
/* a field; linked copies (symbols, master instances) keep most properties on master objects */
AF.MASTERS = ['VBFM', 'VLSM', 'PFMs', 'BlMM', 'VisM', 'FiEM', 'DsMa', 'EdMa', 'TMas', 'TWMa', 'VTrM', 'BGMs', 'HKMs', 'MCrM', 'ShpM'];
AF.f = function (o, t, depth) {
  if (!o || !o.f) return undefined;
  var v = o.f[t];
  if (v !== undefined || (depth || 0) > 4) return v;
  for (var i = 0; i < AF.MASTERS.length; i++) {
    var m = o.f[AF.MASTERS[i]];
    if (m && m.obj && m.obj !== o) { var r = AF.f(m.obj, t, (depth || 0) + 1); if (r !== undefined) return r; }
  }
  return undefined;
};
AF.last = function (o, t) { if (!o) return undefined; for (var i = o.list.length - 1; i >= 0; i--) if (o.list[i][0] === t) return o.list[i][1]; return undefined; };
AF.ob = function (o, t) { var v = AF.f(o, t); return v && v.obj ? v.obj : null; };
AF.obs = function (o, t) { var v = AF.f(o, t); return Array.isArray(v) ? v.filter(function (x) { return x && x.obj; }).map(function (x) { return x.obj; }) : []; };
AF.num = function (o, t) { var v = AF.f(o, t); return typeof v === 'number' && isFinite(v) ? v : null; };
AF.bool = function (o, t) { var v = AF.f(o, t); return typeof v === 'boolean' ? v : null; };
AF.str = function (o, t) { var v = AF.f(o, t); return typeof v === 'string' ? v : null; };
AF.en = function (o, t) { var v = AF.f(o, t); return v && typeof v.en === 'number' ? v : null; };
AF.fl = function (o, t, n) { var v = AF.f(o, t); return Array.isArray(v) && v.length === n && v.every(function (x) { return typeof x === 'number' && isFinite(x); }) ? v : null; };
AF.entry = function (o, t) { var v = AF.f(o, t); return v && typeof v.entry === 'string' ? v.entry : null; };
AF.floatsOf = function (v) {
  if (Array.isArray(v)) return v.every(function (x) { return typeof x === 'number'; }) ? v : null;
  if (v instanceof Uint8Array && v.length % 4 === 0) { var dv = new DataView(v.buffer, v.byteOffset, v.length), o = []; for (var i = 0; i < v.length; i += 4) o.push(dv.getFloat32(i, true)); return o; }
  return null;
};

/* ---------- affine maps [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f ---------- */
AF.I = [1, 0, 0, 1, 0, 0];
AF.xf = function (m) { return [m[0], m[3], m[1], m[4], m[2], m[5]]; }; // Affinity stores (a, c, e, b, d, f)
AF.then = function (s, o) { return [o[0] * s[0] + o[2] * s[1], o[1] * s[0] + o[3] * s[1], o[0] * s[2] + o[2] * s[3], o[1] * s[2] + o[3] * s[3], o[0] * s[4] + o[2] * s[5] + o[4], o[1] * s[4] + o[3] * s[5] + o[5]]; };
AF.ap = function (m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
AF.scaleOf = function (m) { return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); };
AF.local = function (o) { var x = AF.fl(o, 'Xfrm', 6); return x ? AF.xf(x) : AF.I; };
AF.finite = function (m) { return m.every(function (v) { return isFinite(v); }); };

/* ---------- blend modes (Blnd enum id, version) ---------- */
AF.blend = function (e) {
  if (!e) return 'normal';
  var k = e.en + ',' + e.ver;
  var M = { '1,0': 'darken', '2,1': 'darker-color', '2,0': 'multiply', '3,0': 'color-burn', '4,0': 'lighten', '6,1': 'lighter-color', '5,0': 'screen', '6,0': 'color-dodge', '7,0': 'add',
    '8,0': 'overlay', '9,0': 'soft-light', '10,0': 'hard-light', '11,0': 'vivid-light', '12,0': 'pin-light', '15,1': 'linear-light', '13,0': 'hard-mix', '14,0': 'difference', '15,0': 'exclusion',
    '16,0': 'subtract', '17,0': 'hue', '18,0': 'saturation', '19,0': 'luminosity', '20,0': 'color', '21,0': 'average', '22,0': 'negation', '23,0': 'reflect', '24,0': 'glow', '25,0': 'erase' };
  return e.en === 0 ? 'normal' : (M[k] || 'unknown');
};

/* ---------- colours and paints ---------- */
AF.color = function (R, o) {
  if (!o) return null;
  var v = AF.floatsOf(AF.f(o, '_col'));
  function cl(x) { return Math.max(0, Math.min(1, x)); }
  switch (o.cls) {
    case 'RGBA': return v && v.length >= 4 ? { r: v[0], g: v[1], b: v[2], a: cl(v[3]) } : null;
    case 'HSLA': if (!v || v.length < 4) return null; var h = ((v[0] % 1) + 1) % 1 * 6, s = v[1], l = v[2], c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2, rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, h | 0)];
      return { r: rgb[0] + m, g: rgb[1] + m, b: rgb[2] + m, a: cl(v[3]) };
    case 'CMYK': if (!v || v.length < 5) return null; var k = 1 - v[3]; R.cmyk = true; return { r: (1 - v[0]) * k, g: (1 - v[1]) * k, b: (1 - v[2]) * k, a: cl(v[4]) };
    case 'GRAY': return v && v.length >= 2 ? { r: v[0], g: v[0], b: v[0], a: cl(v[1]) } : null;
    case 'LABA': var b = AF.f(o, '_col'); if (!(b instanceof Uint8Array) || b.length < 8) return null;
      var u = function (i) { return (b[2 * i] | (b[2 * i + 1] << 8)) / 65535; };
      return AF.lab(100 * u(0), 255 * u(1) - 128, 255 * u(2) - 128, u(3));
    case 'Pant': R.warn('Spot (Pantone) colours were imported as their RGB equivalent.'); return AF.color(R, AF.ob(o, 'srgb')) || AF.color(R, AF.ob(o, 'base'));
    case 'RegC': return { r: 0, g: 0, b: 0, a: 1 };
  }
  R.warn('Some colours use a colour model CG Motion does not know; they were left out.');
  return null;
};
AF.lab = function (L, A, B, alpha) { // CIE Lab (D50) -> sRGB
  var fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  function f(t) { return t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29); }
  var X = 0.96422 * f(fx), Y = f(fy), Z = 0.82521 * f(fz);
  var r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z, g = -0.9787684 * X + 1.9161415 * Y + 0.0334540 * Z, bb = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z;
  function gm(c) { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  return { r: gm(r), g: gm(g), b: gm(bb), a: alpha };
};
/* a fill descriptor (FDsc) or bare fill; local maps node space to document pixels */
AF.paint = function (R, o, local) {
  if (!o) return null;
  var fill = o, unit = AF.I;
  if (o.cls === 'FDsc') { var x = AF.fl(o, 'FDeX', 6); if (x) unit = AF.xf(x); fill = AF.ob(o, 'FDeF'); if (!fill) return null; }
  switch (fill.cls) {
    case 'FilN': return { none: true };
    case 'FilS': var c = AF.color(R, AF.ob(fill, 'Colr')); return c ? { solid: c } : null;
    case 'FilG':
      var t = AF.en(fill, 'Type'), kind = !t || t.en === 0 ? 'linear' : (t.en === 1 || t.en === 2 ? 'radial' : (t.en === 3 ? 'conical' : 'linear'));
      var grad = AF.ob(fill, 'Grad'); if (!grad) return null;
      var cols = AF.obs(grad, 'Cols'), posn = AF.f(grad, 'Posn'), stops = [];
      if (!Array.isArray(posn)) posn = [];
      for (var i = 0; i < Math.min(cols.length, posn.length, 1024); i++) {
        var col = AF.color(R, cols[i]); if (!col) return null;
        var pv = AF.floatsOf(posn[i]) || [];
        stops.push({ o: Math.max(0, Math.min(1, isFinite(pv[0]) ? pv[0] : 0)), c: col, bias: Math.max(0, Math.min(1, isFinite(pv[1]) ? pv[1] : 0.5)) });
      }
      if (!stops.length) return { none: true };
      return { grad: { kind: kind, stops: stops, m: AF.then(unit, local) } };
    case 'FilB': R.warn('Bitmap and pattern fills were left empty.'); return { none: true };
  }
  R.warn('Some fills of an unknown kind were left empty.');
  return { none: true };
};
AF.current = function (o, list, idx) { var items = AF.obs(o, list), i = AF.num(o, idx) || 0; return items[i] || items[0] || null; };
AF.fills = function (R, o, local, list) {
  var d = AF.current(o, list || 'BFFl', 'BFCr') || AF.ob(o, 'BFil');
  var p = d ? AF.paint(R, d, local) : null;
  return p && !p.none ? [p] : [];
};
AF.nodePaint = function (R, o, local) {
  var fills = AF.fills(R, o, local, 'BFFl');
  if (AF.obs(o, 'BFFl').length > 1 || AF.obs(o, 'LIFl').length > 1) R.warn('Some objects have several fills or strokes; only the active one was imported.');
  if (AF.ob(o, 'Trns')) R.warn('Transparency gradients were imported without them.');
  var pen, style;
  if (AF.f(o, 'LIFl') !== undefined) { pen = AF.current(o, 'LIFl', 'LICr'); style = AF.current(o, 'LILn', 'LICr'); }
  else { pen = AF.ob(o, 'PFil'); style = AF.ob(o, 'LSty'); }
  var dro = AF.f(o, 'DrwO'), behind = Array.isArray(dro) && dro[0] && dro[0].en === 1;
  var st = pen && style ? AF.stroke(R, pen, style, local, behind) : null;
  return { fills: fills, strokes: st ? [st] : [] };
};
AF.stroke = function (R, pen, ldsc, local, behind) {
  var paint = AF.paint(R, pen, local);
  if (!paint || paint.none) return null;
  var lsty = ldsc.cls === 'LDsc' ? AF.ob(ldsc, 'LDeL') : ldsc; if (!lsty) return null;
  var wt = AF.num(lsty, 'Wght'); if (!(wt > 0 && wt < 1e7)) return null;
  var scales = AF.bool(ldsc, 'LDSc'); if (scales === null) scales = true;
  var width = scales ? wt * AF.scaleOf(local) : wt;
  var data = AF.f(lsty, 'Data'); if (!(data instanceof Uint8Array)) data = new Uint8Array(0);
  var miter = 4; if (data.length >= 8) { var mv = new DataView(data.buffer, data.byteOffset, 8).getFloat64(0, true); if (isFinite(mv) && mv >= 1) miter = mv; }
  var cap = 'round', join = 'round';
  if (data[8] === 0 && data[9] === 0) { cap = 'butt'; join = 'miter'; }
  else if (data[8] === 0 && data.length > 9) { cap = 'butt'; join = 'round'; }
  else if (data[8] === 2 && data[9] === 2) { cap = data[10] === 3 ? 'round' : 'square'; join = 'round'; }
  var a = AF.num(ldsc, 'LDSa'), align = a === 1 ? 'inside' : (a === 2 ? 'outside' : 'center');
  var dash = null, patn = AF.f(lsty, 'Patn');
  if (Array.isArray(patn) && (data[10] === 2 || patn.length)) {
    var v = patn.filter(function (x) { return typeof x === 'number'; });
    while (v.length >= 2 && v[v.length - 1] === 0 && v[v.length - 2] === 0) v.length -= 2;
    if (v.length && v.every(function (x) { return isFinite(x) && x >= 0; }) && v.some(function (x) { return x > 0; }))
      dash = { arr: v.map(function (x) { return x * width; }), phase: (AF.num(lsty, 'Phse') || 0) * width };
  }
  if (AF.ob(lsty, 'Brus') || AF.ob(ldsc, 'LDeP')) R.warn('Brush and pressure strokes were imported as plain strokes.');
  return { paint: paint, width: width, cap: cap, join: join, miter: miter, align: align, dash: dash, behind: behind };
};

/* ---------- outlines (node space) ---------- */
AF.K = 0.5522847498307934;
AF.poly = function (pts) { return { start: pts[0], segs: pts.slice(1).map(function (p) { return [p, p, p]; }), closed: true }; };
AF.ellipse = function (cx, cy, rx, ry) {
  var kx = AF.K * rx, ky = AF.K * ry;
  return { start: [cx + rx, cy], closed: true, segs: [
    [[cx + rx, cy + ky], [cx + kx, cy + ry], [cx, cy + ry]], [[cx - kx, cy + ry], [cx - rx, cy + ky], [cx - rx, cy]],
    [[cx - rx, cy - ky], [cx - kx, cy - ry], [cx, cy - ry]], [[cx + kx, cy - ry], [cx + rx, cy - ky], [cx + rx, cy]]] };
};
AF.rectangle = function (x0, y0, x1, y1) { return AF.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); };
AF.cornered = function (b, corners) {
  var x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3], w = x1 - x0, h = y1 - y0, K = AF.K;
  function fit(r, pair, side) { return pair > side ? side * (r / pair) : r; }
  var tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];
  var rx = [fit(tl[0], tl[0] + tr[0], w), fit(tr[0], tl[0] + tr[0], w), fit(br[0], bl[0] + br[0], w), fit(bl[0], bl[0] + br[0], w)];
  var ry = [fit(tl[1], tl[1] + bl[1], h), fit(tr[1], tr[1] + br[1], h), fit(br[1], tr[1] + br[1], h), fit(bl[1], tl[1] + bl[1], h)];
  var kx = rx.map(function (r) { return (1 - K) * r; }), ky = ry.map(function (r) { return (1 - K) * r; });
  var arcs = [
    [[x1 - rx[1], y0], [x1 - kx[1], y0], [x1, y0 + ky[1]], [x1, y0 + ry[1]]],
    [[x1, y1 - ry[2]], [x1, y1 - ky[2]], [x1 - kx[2], y1], [x1 - rx[2], y1]],
    [[x0 + rx[3], y1], [x0 + kx[3], y1], [x0, y1 - ky[3]], [x0, y1 - ry[3]]],
    [[x0, y0 + ry[0]], [x0, y0 + ky[0]], [x0 + kx[0], y0], [x0 + rx[0], y0]]];
  var straight = [tr[2], br[2], bl[2], tl[2]], segs = [];
  arcs.forEach(function (a, i) {
    segs.push([a[0], a[0], a[0]]);
    if (a[0][0] !== a[3][0] || a[0][1] !== a[3][1]) segs.push(straight[i] ? [a[3], a[3], a[3]] : [a[1], a[2], a[3]]);
  });
  return { start: [x0 + rx[0], y0], segs: segs, closed: true };
};
AF.arc = function (cx, cy, rx, ry, a0, a1, out) {
  var n = Math.max(1, Math.min(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)))), step = (a1 - a0) / n, k = 4 / 3 * Math.tan(step / 4);
  function p(a) { return [cx + rx * Math.cos(a), cy - ry * Math.sin(a)]; }
  function d(a) { return [-rx * Math.sin(a), -ry * Math.cos(a)]; }
  for (var i = 0; i < n; i++) {
    var s = a0 + step * i, e = a0 + step * (i + 1), ps = p(s), pe = p(e), ds = d(s), de = d(e);
    out.push([[ps[0] + k * ds[0], ps[1] + k * ds[1]], [pe[0] - k * de[0], pe[1] - k * de[1]], pe]);
  }
};
AF.fillet = function (pts, closed) {
  var n = pts.length, corners = [];
  function get(i) { if (closed) return pts[((i % n) + n) % n][0]; return i >= 0 && i < n ? pts[i][0] : null; }
  function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return l > 0 ? [[dx / l, dy / l], l] : [[0, 0], 0]; }
  pts.forEach(function (pr, i) {
    var p = pr[0], radius = pr[1], a = get(i - 1), b = get(i + 1);
    if (!a || !b) { corners.push([p, p, p, p]); return; }
    var U1 = unit(p, a), U2 = unit(p, b), u1 = U1[0], u2 = U2[0];
    var phi = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (radius <= 0 || phi < 1e-6 || Math.PI - phi < 1e-6) { corners.push([p, p, p, p]); return; }
    var t = Math.min(radius / Math.tan(phi / 2), U1[1] / 2, U2[1] / 2), r = t * Math.tan(phi / 2), k = 4 / 3 * Math.tan((Math.PI - phi) / 4) * r;
    var s = [p[0] + u1[0] * t, p[1] + u1[1] * t], e = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    corners.push([s, [s[0] - u1[0] * k, s[1] - u1[1] * k], [e[0] - u2[0] * k, e[1] - u2[1] * k], e]);
  });
  if (!corners.length) return { start: [0, 0], segs: [], closed: closed };
  var segs = [], cur = corners[0][0], start = cur;
  corners.forEach(function (c, i) {
    if (i > 0) segs.push([cur, c[0], c[0]]);
    if (c[0][0] !== c[3][0] || c[0][1] !== c[3][1]) segs.push([c[1], c[2], c[3]]);
    cur = c[3];
  });
  if (closed && (cur[0] !== start[0] || cur[1] !== start[1])) segs.push([cur, start, start]);
  return { start: start, segs: segs, closed: closed };
};
/* parametric shape (Shpe) in box b; returns {path, prim} where prim describes simple rects/ellipses */
AF.shape = function (R, sh, b, world) {
  var x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3], w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2;
  function num(t, d) { var v = AF.last(sh, t); return typeof v === 'number' && isFinite(v) ? v : d; }
  function sides(t, d) { return Math.max(3, Math.min(10000, Math.round(num(t, d)))); }
  function onE(a, f) { return [cx + f * rx * Math.cos(a), cy + f * ry * Math.sin(a)]; }
  var sub, prim = null, i, n;
  switch (sh.cls) {
    case 'ShNR': case 'ShRR':
      var types = AF.last(sh, 'CTyp'), radii = AF.last(sh, 'ShCR');
      types = Array.isArray(types) ? types.map(function (t) { return t && typeof t.en === 'number' ? t.en : null; }) : [];
      radii = Array.isArray(radii) ? radii.map(function (f) { return isFinite(f) && f > 0 ? f : 0; }) : [];
      var locked = AF.last(sh, 'Lock') !== false, corners = [];
      for (i = 0; i < 4; i++) { var j = locked ? 0 : i; corners.push([radii[j] || 0, types[j] == null ? null : types[j]]); }
      if (!types.length || corners.every(function (c) { return !c[0]; })) { sub = AF.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); prim = { kind: 'rect', r: 0 }; }
      else {
        if (corners.some(function (c) { return c[0] > 0 && [0, 1, 4].indexOf(c[1]) < 0; })) R.warn('Rectangles with concave or other corner types were imported with round corners.');
        var abs = AF.bool(sh, 'AbSz') === true, sx = Math.hypot(world[0], world[1]), sy = Math.hypot(world[2], world[3]);
        var cs = corners.map(function (c) {
          var crx, cry;
          if (!abs) { crx = cry = c[0] * Math.min(w, h); } else if (sx > 0 && sy > 0) { crx = c[0] / sx; cry = c[0] / sy; } else { crx = cry = 0; }
          return [crx, cry, c[1] === 1];
        });
        sub = AF.cornered(b, cs);
        var same = cs.every(function (c) { return Math.abs(c[0] - cs[0][0]) < 1e-6 && Math.abs(c[1] - cs[0][1]) < 1e-6 && !c[2]; });
        if (same && Math.abs(cs[0][0] - cs[0][1]) < 1e-6) prim = { kind: 'rect', r: cs[0][0] };
      }
      break;
    case 'ShpE': sub = AF.ellipse(cx, cy, rx, ry); prim = { kind: 'ellipse' }; break;
    case 'ShPy':
      n = sides('Side', 5);
      var ang = function (k) { return -Math.PI / 2 + 2 * Math.PI * k / n; };
      if (AF.last(sh, 'Smth') === true) {
        var kk = num('Curv', 0) * 4 / 3 * Math.tan(Math.PI / (2 * n)), segs = [];
        var V = function (k) { return onE(ang(k), 1); }, T = function (k) { return [-rx * Math.sin(ang(k)), ry * Math.cos(ang(k))]; };
        for (i = 0; i < n; i++) { var p = V(i), q = V(i + 1), tp = T(i), tq = T(i + 1); segs.push([[p[0] + kk * tp[0], p[1] + kk * tp[1]], [q[0] - kk * tq[0], q[1] - kk * tq[1]], q]); }
        sub = { start: V(0), segs: segs, closed: true };
      } else { var pp = []; for (i = 0; i < n; i++) pp.push(onE(ang(i), 1)); sub = AF.poly(pp); }
      break;
    case 'ShSt':
      n = sides('Pnts', 5); var qr = Math.max(0, Math.min(1, num('IRad', 0.382))), sp = [];
      if (['CrcI', 'CrcO', 'CrvL', 'CrvR'].some(function (t) { return Math.abs(num(t, 0)) > 1e-9; })) R.warn('Stars with rounded or curved points were imported with sharp points.');
      for (i = 0; i < 2 * n; i++) sp.push(onE(-Math.PI / 2 + Math.PI * i / n, i % 2 ? qr : 1));
      sub = AF.poly(sp); break;
    case 'ShSS':
      n = sides('Side', 5); var ri = Math.max(0, Math.min(1, num('COut', 0.5))), st = Math.PI / n, l = Math.cos(st), hw = ri * Math.sin(st), inner = ri * Math.cos(st), qq = [];
      for (var k2 = 0; k2 < n; k2++) {
        var phi = -Math.PI / 2 + st + 2 * Math.PI * k2 / n, c = Math.cos(phi), s = Math.sin(phi);
        [[inner, -hw], [l, -hw], [l, hw], [inner, hw]].forEach(function (uv) { qq.push([cx + rx * (uv[0] * c - uv[1] * s), cy + ry * (uv[0] * s + uv[1] * c)]); });
      }
      sub = AF.poly(qq); break;
    case 'ShPi':
      var TAU = 2 * Math.PI, rs = num('AngS', 0), re = num('AngE', TAU), start = ((rs % TAU) + TAU) % TAU, delta = re - rs;
      var sweep = re >= rs ? Math.min(delta, TAU) : ((delta % TAU) + TAU) % TAU, inn = Math.max(0, Math.min(1, num('IRad', 0)));
      var a0 = start, a1 = start + sweep, psegs = [];
      AF.arc(cx, cy, rx, ry, a0, a1, psegs);
      if (inn > 0) { var ip = [cx + inn * rx * Math.cos(a1), cy - inn * ry * Math.sin(a1)]; psegs.push([ip, ip, ip]); AF.arc(cx, cy, inn * rx, inn * ry, a1, a0, psegs); }
      else psegs.push([[cx, cy], [cx, cy], [cx, cy]]);
      sub = { start: [cx + rx * Math.cos(a0), cy - ry * Math.sin(a0)], segs: psegs, closed: true }; break;
    case 'ShpT': var pt = num('Pos ', 0.5); sub = AF.poly([[x0 + pt * w, y0], [x1, y1], [x0, y1]]); break;
    case 'ShTz': var L = num('PosL', 0.25), Rr = num('PosR', 0.75); sub = AF.poly([[x0 + L * w, y0], [x0 + Rr * w, y0], [x1, y1], [x0, y1]]); break;
    default:
      R.warn('Clouds, hearts, cogs, callouts, arrows and other special shapes were imported as ellipses.');
      sub = AF.ellipse(cx, cy, rx, ry);
  }
  return { path: [sub], prim: prim };
};
/* curves (PCvD data) */
AF.curves = function (R, crvs) {
  var data = AF.ob(crvs, 'Data'); if (!data) return null;
  var f = data.list.map(function (x) { return x[1]; }), p = 1, count = f[p++];
  if (typeof count !== 'number') return null;
  var corners = null, cd = AF.ob(crvs, 'CnrD');
  if (cd) {
    var cf = cd.list.map(function (x) { return x[1]; });
    if (Array.isArray(cf[1]) && Array.isArray(cf[2])) { corners = []; for (var c = 0; c < Math.min(cf[1].length, cf[2].length); c++) if (isFinite(cf[2][c]) && cf[2][c] > 0) corners.push([cf[1][c], cf[2][c]]); }
  }
  var path = [];
  for (var idx = 0; idx < count; idx++) {
    var closed = f[p++], recs = f[p++];
    if (typeof closed !== 'boolean' || !Array.isArray(recs)) return null;
    var anchors = [], pin = null;
    for (var i = 0; i < recs.length; i++) {
      var b = recs[i]; if (!(b instanceof Uint8Array) || b.length !== 18) return null;
      var dv = new DataView(b.buffer, b.byteOffset, 18), pt = [dv.getFloat64(0, true), dv.getFloat64(8, true)], role = b[17];
      if (!isFinite(pt[0]) || !isFinite(pt[1])) return null;
      if (role === 0) { anchors.push({ p: pt, inh: pin, out: null, rec: i }); pin = null; }
      else if (role === 1) { if (anchors.length) anchors[anchors.length - 1].out = pt; }
      else if (role === 2) pin = pt;
      else return null;
    }
    if (!anchors.length) continue;
    var radii = idx === 0 ? corners : null, done = false;
    if (radii && radii.length) {
      var eq = function (a, b2) { return !b2 || (a[0] === b2[0] && a[1] === b2[1]); };
      if (anchors.every(function (a) { return eq(a.p, a.inh) && eq(a.p, a.out); })) {
        var pts = anchors.map(function (a) { var r = 0; radii.forEach(function (x) { if (x[0] === a.rec) r = Math.max(r, x[1]); }); return [a.p, r]; });
        if (closed && pts.length > 1 && pts[0][0][0] === pts[pts.length - 1][0][0] && pts[0][0][1] === pts[pts.length - 1][0][1]) { var lr = pts.pop(); pts[0][1] = Math.max(pts[0][1], lr[1]); }
        path.push(AF.fillet(pts, closed)); done = true;
      }
    }
    if (!done) {
      var segs = [];
      for (var s = 1; s < anchors.length; s++) { var A = anchors[s - 1], B = anchors[s]; segs.push([A.out || A.p, B.inh || B.p, B.p]); }
      path.push({ start: anchors[0].p, segs: segs, closed: closed });
    }
  }
  if (corners && count > 1) R.warn('Rounded corners on curves with several parts: only the first part was rounded.');
  return path;
};
AF.mapPath = function (path, m) {
  return path.map(function (sp) { return { start: AF.ap(m, sp.start[0], sp.start[1]), closed: sp.closed, segs: sp.segs.map(function (sg) { return sg.map(function (q) { return AF.ap(m, q[0], q[1]); }); }) }; });
};
/* outline of a curve, shape or compound in node space: {path, evenOdd, prim} */
AF.outline = function (R, o, world, depth) {
  depth = depth || 0; if (depth > 64) return null;
  var cls = o.cls;
  if (cls === 'PCrv' || cls === 'TxtC') {
    var crvs = AF.ob(o, 'Crvs') || AF.ob(AF.ob(o, 'MCrM'), 'Crvs'); if (!crvs) return null;
    var p = AF.curves(R, crvs); if (!p) return null;
    return { path: p, evenOdd: p.length > 1 };
  }
  if (cls === 'Comp') {
    var all = [];
    AF.obs(o, 'Chld').forEach(function (c) {
      var loc = AF.local(c), op = AF.en(c, 'ComO');
      if (op && op.en !== 0 && op.en !== 2) R.warn('Compound shapes that intersect or exclude were imported as add.');
      var r = AF.outline(R, c, AF.then(loc, world), depth + 1);
      if (r) all = all.concat(AF.mapPath(r.path, loc));
    });
    return { path: all, evenOdd: true };
  }
  var sh = AF.ob(o, 'Shpe'), owner = o;
  if (!sh) { var master = AF.ob(o, 'ShpM'); sh = AF.ob(master, 'Shpe'); owner = master; }
  var b = AF.fl(owner, 'ShpB', 4); if (!sh || !b) return null;
  var r2 = AF.shape(R, sh, b, world);
  return { path: r2.path, evenOdd: false, prim: r2.prim, box: b };
};

/* ---------- text ---------- */
AF.text = function (R, o, world) {
  var story = AF.ob(o, 'StSt'), frame = AF.ob(o, 'TxtH'); if (!story || !frame) return null;
  var artistic = frame.cls === 'ArFr', bounds = AF.fl(frame, 'FrmB', 4); if (!bounds) return null;
  var runs = [], align = null, placeholders = false;
  AF.obs(story, 'Blok').forEach(function (block) {
    var g = AF.ob(block, 'Glyp'); if (!g) return;
    var chars;
    var u = AF.str(g, 'Utf8');
    if (u != null) chars = Array.from(u);
    else {
      chars = [];
      AF.obs(g, 'Mixd').forEach(function (seg) { var gl = AF.obs(seg, 'Glys').length; for (var i = 0; i < gl; i++) chars.push('\uFFFC'); if (gl) placeholders = true; chars = chars.concat(Array.from(AF.str(seg, 'Utf8') || '')); });
    }
    var start = 0, ga = AF.ob(block, 'GAtt');
    AF.obs(ga, 'Runs').forEach(function (run) {
      var ix = AF.num(run, 'Indx'); if (ix == null) return;
      var end = Math.min(ix, chars.length); if (end <= start) return;
      push(chars.slice(start, end), AF.ob(run, 'Item')); start = end;
    });
    if (start < chars.length) push(chars.slice(start), null);
    AF.obs(AF.ob(block, 'PAtt'), 'Runs').forEach(function (pr) {
      var it = AF.ob(pr, 'Item'); if (!it) return;
      var ints = AF.f(it, 'Ints'), a = Array.isArray(ints) ? ints[0] : 0;
      var al = a === 1 ? 'center' : (a === 2 ? 'right' : (a === 3 ? 'justify' : 'left'));
      if (align == null) align = al; else if (align !== al) R.warn('Text with mixed paragraph alignments uses the first alignment.');
      var d = AF.f(it, 'Doub'); if (Array.isArray(d) && d.slice(1, 7).some(function (v) { return Math.abs(v) > 1e-9; })) R.warn('Paragraph indents and spacing were imported with the defaults.');
    });
  });
  function push(ch, attrs) {
    var text = ch.filter(function (c) { return c !== '\0' && c !== '\uFFFC'; }).join('');
    if (!text) return;
    var run = { text: text, post: '', family: '', weight: 400, italic: false, caps: false, size: 12 * R.dpi / 72, tracking: 0, leading: null, fill: { solid: { r: 0, g: 0, b: 0, a: 1 } } };
    if (attrs) {
      var D = AF.f(attrs, 'Doub'), I = AF.f(attrs, 'Ints');
      if (Array.isArray(D) && D[0] > 0 && D[0] < 1e6) run.size = D[0];
      if (Array.isArray(D) && isFinite(D[4])) run.tracking = D[4];
      if (Array.isArray(I) && I[4] === 1 && Array.isArray(D) && D[13] > 0) run.leading = D[13];
      var objs = AF.f(attrs, 'Objs'); objs = Array.isArray(objs) ? objs.map(function (v) { return v && v.obj ? v.obj : null; }) : [];
      var fp = objs[0] ? AF.paint(R, objs[0], world) : null; if (fp && !fp.none) run.fill = fp; else if (fp && fp.none) run.fill = { none: true };
      var sp = objs[1] ? AF.paint(R, objs[1], world) : null; if (sp && !sp.none) { R.warn('Outlined (stroked) text was imported without the outline.'); run.strokeFill = sp; }
      if (Array.isArray(D) && isFinite(D[10]) && Math.abs(D[10] - 1) > 1e-3) R.warn('Horizontally scaled text was imported unscaled.');
      var req = AF.ob(attrs, 'DFnt'), res = AF.ob(attrs, 'RFnt');
      if (res && !AF.str(res, 'Famy') && !AF.str(res, 'Post')) res = null;
      var font = res || req;
      if (font) {
        run.post = AF.str(font, 'Post') || ''; run.family = AF.str(font, 'Famy') || '';
        var wg = AF.num(font, 'Wegt'); if (wg >= 1 && wg <= 1000) run.weight = wg;
        run.italic = AF.bool(font, 'Ital') === true;
      }
      var ot = objs[7]; if (ot) AF.obs(ot, 'Setn').forEach(function (s) { var ft = AF.num(s, 'Feat'), v = AF.num(s, 'Valu'); if (ft === 0x43415001 && (v === 0 || v === 1)) run.caps = v === 1; });
    }
    runs.push(run);
  }
  if (placeholders) R.warn('Text fields such as page numbers were left out of the text.');
  align = align || 'left';
  if (!artistic && (AF.obs(frame, 'ColW').length > 1 || (Array.isArray(AF.f(frame, 'ColW')) && AF.f(frame, 'ColW').length > 1))) R.warn('Text frames with several columns were imported as one column.');
  if (o.cls === 'TxtC') R.warn('Text on a curved outline was imported as a rectangular frame.');
  return { runs: runs, align: align, bounds: bounds, baseline: bounds[1] + (AF.num(frame, 'ArtV') || 0), artistic: artistic, m: world };
};

/* ---------- pixels ---------- */
AF.original = async function (R, name) {
  var bytes = await AF.read(R.A, name), s = AF.stream(bytes), d = AF.f(s, 'Data');
  if (d && d.blob && d.blob.length) return d.blob;
  throw new Error('embedded image without data');
};
AF.imageKind = function (b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  return '';
};
AF.nodeImage = async function (R, o, world) {
  var bm = AF.ob(o, 'Bitm'); if (!bm) { R.warn('Some pixel layers had no pixels.'); return null; }
  if (bm.cls !== 'DyBm') { R.warn('Some pixel layers are stored in a way CG Motion does not know.'); return null; }
  var W = AF.num(bm, 'BmpW') || 0, H = AF.num(bm, 'BmpH') || 0; if (!W || !H) return null;
  var hasTiles = AF.f(bm, 'Sta1') !== undefined, bk = AF.entry(bm, 'Bckg');
  if (bk && (o.cls === 'ImgN' || !hasTiles)) {
    try { var bytes = await AF.original(R, bk), mime = AF.imageKind(bytes); if (mime) return { w: W, h: H, encoded: bytes, mime: mime, m: world }; }
    catch (e) { R.warn('An embedded image file could not be read; its stored pixels were used.'); }
  }
  var crop = AF.f(o, 'BitR'), c = [0, 0, W, H];
  if (Array.isArray(crop) && crop.length === 4 && crop[0] > -2147483647) c = [Math.max(0, Math.min(W, crop[0])), Math.max(0, Math.min(H, crop[1])), Math.max(0, Math.min(W, crop[2])), Math.max(0, Math.min(H, crop[3]))];
  return AF.decode(R, bm, c, world);
};
AF.maskImage = async function (R, o, world) {
  var bm = AF.ob(o, 'Bitm'); if (!bm) return null;
  var W = AF.num(bm, 'BmpW') || 0, H = AF.num(bm, 'BmpH') || 0, f = AF.en(bm, 'Frmt');
  if (!W || !H || !f || (f.en !== 6 && f.en !== 7)) { R.warn('Some pixel masks use a format CG Motion does not know; they were left out.'); return null; }
  return AF.decode(R, bm, [0, 0, W, H], world);
};
AF.embedded = async function (R, o, world) {
  var e = AF.ob(o, 'Bitm'), cache = AF.ob(e, 'Cach'), bb = AF.fl(e, 'ChBB', 4); if (!cache || !bb) return null;
  var W = AF.num(cache, 'BmpW') || 0, H = AF.num(cache, 'BmpH') || 0; if (!W || !H) return null;
  var cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  var place = AF.then([(bb[2] - bb[0]) / W, 0, 0, (bb[3] - bb[1]) / H, bb[0] - cx, bb[1] - cy], world);
  return AF.decode(R, cache, [0, 0, W, H], place);
};
AF.decode = async function (R, bm, crop, world) {
  var x0 = crop[0], y0 = crop[1], x1 = crop[2], y1 = crop[3]; if (x1 <= x0 || y1 <= y0) return null;
  var w = x1 - x0, h = y1 - y0; if (w * h > 64 * 1024 * 1024) { R.warn('Pixel layers larger than 64 megapixels were left out.'); return null; }
  var f = AF.en(bm, 'Frmt'), fmt = f ? f.en : -1, ch, bps;
  if (fmt === 0) { ch = 4; bps = 1; } else if (fmt === 1) { ch = 4; bps = 2; } else if (fmt === 6) { ch = 1; bps = 1; } else if (fmt === 7) { ch = 1; bps = 2; }
  else if (fmt === 4) { ch = 5; bps = 1; R.warn('CMYK pixel layers were converted to RGB without the document\'s colour profile.'); }
  else { R.warn('Pixel layers in grey, Lab or 32-bit formats were left out.'); return null; }
  var W = AF.num(bm, 'BmpW') || 0, Hh = AF.num(bm, 'BmpH') || 0, source = null;
  var needSrc = false; for (var c0 = 1; c0 <= ch; c0++) { var sa = AF.f(bm, 'Sta' + c0); if (Array.isArray(sa) && sa.indexOf(5) >= 0) needSrc = true; }
  if (needSrc && fmt === 0 && AF.num(bm, 'LInf') === 0 && AF.num(bm, 'TInf') === 0 && AF.entry(bm, 'Bckg') && R.decodeImage) {
    try { var sb = await AF.original(R, AF.entry(bm, 'Bckg')), px = await R.decodeImage(sb); if (px && px.w === W && px.h === Hh) source = px; } catch (e) { source = null; }
  }
  var planes = [];
  for (var c = 1; c <= ch; c++) planes.push(await AF.plane(R, bm, c, bps, [x0, y0, w, h], source));
  var n = w * h, rgba = new Uint8ClampedArray(n * 4);
  function smp(p, i) { return bps === 2 ? (p[2 * i] | (p[2 * i + 1] << 8)) / 257 : p[i]; }
  for (var i = 0; i < n; i++) {
    var o = i * 4;
    if (ch === 1) { var g = smp(planes[0], i); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255; }
    else if (ch === 5) { var k = 1 - smp(planes[3], i) / 255; rgba[o] = (255 - smp(planes[0], i)) * k; rgba[o + 1] = (255 - smp(planes[1], i)) * k; rgba[o + 2] = (255 - smp(planes[2], i)) * k; rgba[o + 3] = smp(planes[4], i); }
    else { rgba[o] = smp(planes[0], i); rgba[o + 1] = smp(planes[1], i); rgba[o + 2] = smp(planes[2], i); rgba[o + 3] = smp(planes[3], i); }
  }
  return { w: w, h: h, rgba: rgba, gray: ch === 1, m: AF.then([1, 0, 0, 1, x0, y0], world) };
};
AF.plane = async function (R, bm, c, bps, cr, source) {
  var TILE = 256, x0 = cr[0], y0 = cr[1], w = cr[2], h = cr[3];
  var W = AF.num(bm, 'BmpW') || 0, H = AF.num(bm, 'BmpH') || 0;
  var tw = AF.num(bm, 'TWi' + c) || Math.ceil(W * bps / TILE), th = AF.num(bm, 'THi' + c) || Math.ceil(H / TILE);
  var states = AF.f(bm, 'Sta' + c); states = Array.isArray(states) ? states : [];
  var tiles = AF.obs(bm, 'Idx' + c), row = w * bps, out = new Uint8Array(row * h);
  var bx0 = x0 * bps, bx1 = (x0 + w) * bps, py0 = y0, py1 = y0 + h, next = 0;
  function copy(ox, oy, at) {
    for (var y = Math.max(oy, py0); y < Math.min(oy + TILE, py1); y++)
      for (var x = Math.max(ox, bx0); x < Math.min(ox + TILE, bx1); x++) out[(y - py0) * row + (x - bx0)] = at(x - ox, y - oy);
  }
  for (var t = 0; t < Math.min(states.length, tw * th); t++) {
    var ty = Math.floor(t / Math.max(1, tw)), tx = t % Math.max(1, tw), st = states[t], ox = tx * TILE, oy = ty * TILE;
    if (st === 0 || st === 1) continue;
    if (st === 2) { copy(ox, oy, function () { return 255; }); continue; }
    if (st === 4) {
      var blk = tiles[next++]; if (!blk) throw new Error('missing pixel tile');
      if (ox >= bx1 || ox + TILE <= bx0 || oy >= py1 || oy + TILE <= py0) continue;
      var nm = AF.entry(blk, 'Data'); if (!nm) throw new Error('pixel tile without data');
      var data = R.tiles[nm];
      if (!data) {
        data = await AF.read(R.A, nm);
        if (data.length === 65536 + 22 && data[0] === 0 && data[1] === 0xFF && data[2] === 0x4B && data[3] === 0x53) data = data.subarray(21, 21 + 65536);
        if (data.length !== 65536) throw new Error('pixel tile size');
        R.tiles[nm] = data;
      }
      (function (d) { copy(ox, oy, function (x, y) { return d[y * TILE + x]; }); })(data);
      continue;
    }
    if (st === 3) { R.warn('32-bit pixel layers were left out.'); continue; }
    if (st === 5) {
      if (source) { (function (S, ox2, oy2) { copy(ox2, oy2, function (x, y) { return S.rgba[((oy2 + y) * S.w + ox2 + x) * 4 + c - 1] || 0; }); })(source, ox, oy); continue; }
      R.warn('Some pixel layers drawn from an embedded image were left empty.'); continue;
    }
    throw new Error('unknown pixel tile state');
  }
  return out;
};

/* ---------- the document ---------- */
AF.describe = function (cls) {
  return { PCrv: 'curve', ShpN: 'shape', SNEN: 'shape', SNRR: 'shape', ShRN: 'shape', Comp: 'compound shape', Rstr: 'pixel', ImgN: 'image', EmbN: 'embedded document', MPIN: 'master page',
    FRst: 'fill', MRst: 'mask', FlRN: 'live filter', Slic: 'slice', SlcP: 'slice', '3DLA': '3D' }[cls] || (/RA$/.test(cls) ? 'adjustment' : (/^(Lv|Cr|HS|Ex|Br|Bl|Gr|Vb|Po|Th|In|Rc|Sh|Wb|Sc|Cb|Ch)/.test(cls) && /(Ad|AL|FL)$/.test(cls) ? 'adjustment' : 'unsupported'));
};
AF.model = async function (A, opts) {
  opts = opts || {};
  var root = AF.stream(await AF.read(A, 'doc.dat'));
  var counts = {}, R = { A: A, dpi: 72, tiles: {}, decodeImage: opts.decodeImage, warn: function (w) { counts[w] = (counts[w] || 0) + 1; }, nodes: 0, active: new Set() };
  var uv = AF.ob(root, 'UVCn'), dpi = AF.num(uv, 'UPPI'); if (dpi > 0 && dpi < 100000) R.dpi = dpi;
  var nv = AF.ob(root, 'NVer'), savedBy = nv ? (AF.str(nv, 'Prod') || 'Affinity') + (AF.num(nv, 'Majr') != null ? ' ' + AF.num(nv, 'Majr') + '.' + AF.num(nv, 'Minr') + '.' + AF.num(nv, 'Bild') : '') : '';
  var doc = AF.ob(root, 'DocR'); if (!doc) throw new Error('This Affinity document has no pages.');
  var spreads = [];
  for (var si = 0, kids = AF.obs(doc, 'Chld'); si < kids.length; si++) {
    var sp = kids[si];
    if (sp.cls !== 'Sprd') { R.warn('An unknown kind of page was left out.'); continue; }
    var pages = AF.pages(sp), ds = AF.fl(doc, 'DfSz', 2), sb = AF.fl(sp, 'SprB', 4), bounds;
    if (sb) bounds = sb; else if (pages.length) bounds = pages.reduce(function (a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; });
    else if (ds && ds[0] > 0) bounds = [0, 0, ds[0], ds[1]]; else bounds = [0, 0, 0, 0];
    var ch = await AF.children(R, sp, AF.I, 0);
    if (ch.mask) R.warn('Mask layers placed directly on a page were left out.');
    spreads.push({ bounds: bounds, pages: pages, transparent: AF.bool(sp, 'SprT') === true, nodes: ch.nodes });
  }
  if (!spreads.length) throw new Error('This Affinity document has no pages.');
  if (AF.obs(doc, 'MpCh').length) R.warn('Master pages were left out (their content is not placed on the pages that use them).');
  var warnings = Object.keys(counts).map(function (w) { return counts[w] > 1 ? w + ' (' + counts[w] + ' times)' : w; });
  return { dpi: R.dpi, spreads: spreads, savedBy: savedBy, warnings: warnings };
};
AF.pages = function (sp) {
  var md = AF.ob(sp, 'SpMd');
  if (md) { var v = AF.obs(md, 'PagR').map(function (p) { return AF.fl(p, 'rctp', 4); }).filter(function (r) { return r && r[2] > r[0] && r[3] > r[1]; }); if (v.length) return v; }
  var b = AF.fl(sp, 'SprB', 4), n = AF.num(sp, 'PagC');
  if (b && n >= 2 && n <= 16) { var w = (b[2] - b[0]) / n, out = []; for (var i = 0; i < n; i++) out.push([b[0] + w * i, b[1], b[0] + w * (i + 1), b[3]]); return out; }
  return [];
};
AF.children = async function (R, parent, world, depth) {
  var out = [], mask = null, kids = AF.obs(parent, 'Chld');
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c.cls === 'MRst') {
      if (AF.bool(c, 'Visi') === false) continue;
      var m = await AF.maskImage(R, c, AF.then(AF.local(c), world));
      if (m && !mask) mask = m; else if (m) R.warn('Layers with several pixel masks use only the first.');
      continue;
    }
    var n = await AF.node(R, c, world, depth + 1);
    if (n) out.push(n);
  }
  return { nodes: out, mask: mask };
};
AF.node = async function (R, o, parent, depth) {
  if (depth > 128) { R.warn('Layers nested deeper than 128 levels were left out.'); return null; }
  if (++R.nodes > 500000) throw new Error('This Affinity document has too many layers.');
  if (R.active.has(o)) { R.warn('A layer that contains itself was left out.'); return null; }
  R.active.add(o);
  var world = AF.then(AF.local(o), parent), cls = o.cls;
  var be = AF.en(o, 'Blnd'), blend = be ? AF.blend(be) : ((cls === 'Scop' || cls === 'Grup') && AF.bool(o, 'PasT') !== false ? 'pass' : 'normal');
  var opac = AF.num(o, 'Opac'); opac = opac == null ? 1 : Math.max(0, Math.min(1, opac));
  var fop = AF.num(o, 'FOpc');
  var node = { cls: cls, name: AF.str(o, 'Desc') || '', visible: AF.bool(o, 'Visi') !== false, opacity: opac, fillOpacity: fop == null ? 1 : Math.max(0, Math.min(1, fop)), blend: blend, kind: null, children: [], mask: null, pixelMask: null, fx: [] };
  node.kind = AF.finite(world) ? await AF.kind(R, o, cls, world, parent) : { t: 'unsupported' };
  var effectLayer = o.chain.indexOf('EncR') >= 0 || o.chain.indexOf('AdjR') >= 0;
  if (cls !== 'Comp' && !effectLayer) { var ch = await AF.children(R, o, world, depth); node.children = ch.nodes; if (ch.mask) node.pixelMask = ch.mask; }
  /* attached vector shapes mask the node; an attached mask layer is a pixel mask */
  var att = AF.obs(o, 'AdCh');
  for (var i = 0; i < att.length; i++) {
    var a = att[i]; if (AF.bool(a, 'Visi') === false) continue;
    var lw = AF.then(AF.local(a), world);
    if (a.cls === 'PCrv' || a.cls === 'ShpN' || a.cls === 'Comp') { var ol = AF.outline(R, a, lw); if (ol) node.mask = (node.mask || []).concat(AF.mapPath(ol.path, lw)); }
    else if (a.cls === 'Scop' || a.cls === 'Grup') { var gp = AF.groupOutline(R, a, lw, 0); if (gp.length) node.mask = (node.mask || []).concat(gp); }
    else if (a.cls === 'MRst') { var pm = await AF.maskImage(R, a, lw); if (pm && !node.pixelMask) node.pixelMask = pm; }
    else R.warn(AF.describe(a.cls).replace(/^./, function (x) { return x.toUpperCase(); }) + ' layers attached to other layers were left out.');
  }
  AF.obs(o, 'FiEf').forEach(function (e) { if (AF.bool(e, 'Enab') !== false) node.fx.push(e); });
  R.active.delete(o);
  return node;
};
/* the outlines of the shapes in a group, in document pixels (a group used as a vector mask) */
AF.groupOutline = function (R, g, world, depth) {
  var out = []; if (depth > 32) return out;
  AF.obs(g, 'Chld').forEach(function (c) {
    if (AF.bool(c, 'Visi') === false) return;
    var w = AF.then(AF.local(c), world);
    if (c.cls === 'Scop' || c.cls === 'Grup') out = out.concat(AF.groupOutline(R, c, w, depth + 1));
    else { var ol = AF.outline(R, c, w); if (ol) out = out.concat(AF.mapPath(ol.path, w)); }
  });
  return out;
};
AF.kind = async function (R, o, cls, world, parent) {
  switch (cls) {
    case 'Scop': return { t: 'layer' };
    case 'Grup': return { t: 'group' };
    case 'PCrv': case 'ShpN': case 'Comp': case 'SNEN': case 'SNRR': case 'ShRN':
      var ph = AF.ob(o, 'phrp');
      if (AF.bool(o, 'ABEn') === true || (ph && ph.cls === 'aprp')) return AF.artboard(R, o, world);
      var ol = AF.outline(R, o, world);
      if (!ol) { R.warn('Some ' + AF.describe(cls) + 's could not be read.'); return { t: 'unsupported' }; }
      var pt = AF.nodePaint(R, o, world);
      return { t: 'shape', path: AF.mapPath(ol.path, world), local: ol.path, m: world, evenOdd: ol.evenOdd, prim: ol.prim, box: ol.box, fills: pt.fills, strokes: pt.strokes };
    case 'TxtA': case 'TxtF': case 'TxtC':
      var t = AF.text(R, o, world);
      if (!t) { R.warn('Some text could not be read (master-page text, or an unknown layout).'); return { t: 'unsupported' }; }
      return { t: 'text', text: t };
    case 'ImgN': case 'Rstr':
      var im = await AF.nodeImage(R, o, world); return im ? { t: 'image', img: im } : { t: 'unsupported' };
    case 'EmbN':
      var em = await AF.embedded(R, o, world);
      R.warn(em ? 'Embedded documents and symbols were imported as pictures of them.' : 'Embedded documents and symbols without a stored picture were left out.');
      return em ? { t: 'image', img: em } : { t: 'unsupported' };
    case 'FRst':
      var b = AF.ob(o, 'Bitm'), w = AF.num(b, 'BmpW'), h = AF.num(b, 'BmpH');
      if (w > 0 && h > 0) { var loc = [AF.rectangle(0, 0, w, h)], fl = AF.fills(R, o, parent, 'BFFl'); return { t: 'shape', path: AF.mapPath(loc, world), local: loc, m: world, evenOdd: false, prim: { kind: 'rect', r: 0 }, box: [0, 0, w, h], fills: fl, strokes: [] }; }
      R.warn('Fill layers without an area were left out.'); return { t: 'unsupported' };
  }
  R.warn(AF.describe(cls).replace(/^./, function (x) { return x.toUpperCase(); }) + ' layers were left out' + (AF.describe(cls) === 'adjustment' ? ' (use Effects on the layers instead).' : '.'));
  return { t: 'unsupported' };
};
AF.artboard = function (R, o, world) {
  var b = AF.fl(o, 'ShpB', 4);
  if (!b || !(b[2] > b[0] && b[3] > b[1])) { R.warn('An artboard without a valid size was imported without clipping.'); return { t: 'unsupported' }; }
  var cs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(function (p) { return AF.ap(world, p[0], p[1]); });
  if (Math.abs(world[1]) > 1e-9 || Math.abs(world[2]) > 1e-9 || world[0] <= 0 || world[3] <= 0) R.warn('Rotated or flipped artboards use their bounding box.');
  var xs = cs.map(function (p) { return p[0]; }), ys = cs.map(function (p) { return p[1]; });
  var rect = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  var ol = AF.outline(R, o, world), pt = AF.nodePaint(R, o, world);
  return { t: 'artboard', rect: rect, path: ol ? AF.mapPath(ol.path, world) : [AF.rectangle(rect[0], rect[1], rect[2], rect[3])], background: pt.fills, strokes: pt.strokes };
};

if (typeof module !== 'undefined') module.exports = AF;
