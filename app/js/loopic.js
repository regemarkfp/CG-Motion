/* CG Motion - opens Loopic project files (.loo) and turns them into a CG Motion project.
   A .loo file is JSON: compositions > layers > element (with property groups and keyframes) plus embedded resources. */
var Loopic = {};

Loopic.is = function (text, path) {
  if (path && /\.loo$/i.test(path)) return true;
  return /^\s*\{\s*"compositions"\s*:/.test(text.slice(0, 200));
};

/* any CSS colour Loopic writes (#rgb, #rrggbbaa, rgb(), rgba(), hsl(h, s%, l%, a), names) -> #rrggbbaa */
Loopic.color = function (v) {
  if (v == null || v === '') return '#00000000';
  v = String(v).trim();
  var m = /^hsla?\(\s*([-\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,\/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    var hh = ((+m[1] % 360) + 360) % 360 / 360, s = +m[2] / 100, l = +m[3] / 100, a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var f = function (t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : (t < 0.5 ? q : (t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p)); };
    return RT.toHex([f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255, a]);
  }
  if (/^#[0-9a-f]{4}$/i.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] + v[4] + v[4];
  return RT.normColor(v) || '#000000ff';
};

Loopic.ease = function (e) {
  if (!e) return { type: 'linear' };
  var b = [+e.p1x, +e.p1y, +e.p2x, +e.p2y];
  if (b.some(isNaN) || (Math.abs(b[0] - b[1]) < 1e-6 && Math.abs(b[2] - b[3]) < 1e-6)) return { type: 'linear' };
  return { type: 'bezier', b: b };
};

/* sizes of embedded pictures, read from the file header where possible (PNG) so hundreds of frames need no decoding */
Loopic.imageSize = function (src) {
  try {
    var m = /^data:image\/png;base64,/.exec(src);
    if (m) {
      var bin = atob(src.substr(m[0].length, 44));
      var n = function (o) { return ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0; };
      if (bin.substr(12, 4) === 'IHDR') return Promise.resolve({ w: n(16), h: n(20) });
    }
  } catch (e) {}
  return new Promise(function (res) {
    var im = new Image();
    im.onload = function () { res({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 }); };
    im.onerror = function () { res({ w: 0, h: 0 }); };
    im.src = src;
  });
};

/* the hooks written in a composition's code box: [{kind, arg, body}] */
Loopic.hooks = function (code) {
  var out = [], re = /loopic\.useOn([A-Za-z]+)\s*\(/g, m;
  code = String(code || '');
  while ((m = re.exec(code))) {
    var i = re.lastIndex, depth = 1, q = null;
    for (; i < code.length && depth > 0; i++) {
      var ch = code[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; }
      else if (ch === '"' || ch === "'" || ch === '`') q = ch;
      else if (ch === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; }
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    var inner = code.slice(re.lastIndex, i - 1), am = /^\s*(["'`])([^"'`]*)\1\s*,/.exec(inner);
    var bi = inner.indexOf('=>'), body = bi >= 0 ? inner.slice(bi + 2) : inner;
    body = body.replace(/\/\/[^\n]*/g, '').trim().replace(/^\{/, '').replace(/\}$/, '').trim();
    out.push({ kind: m[1], arg: am ? am[2] : '', body: body, src: code.slice(m.index, i + 1) });
    re.lastIndex = i;
  }
  return out;
};

/* Converts the parsed .loo object. Returns a promise of { project, report }. */
Loopic.convert = async function (d, name) {
  if (!d || !d.compositions || !d.compositions.length) throw new Error('Not a Loopic project');
  var p = App.blankProject(), notes = [], seen = {}, stats = { comps: 0, layers: 0, masks: 0, keys: 0, fields: {}, invokes: {}, assets: 0 };
  function note(s) { if (!seen[s]) { seen[s] = 1; notes.push(s); } }
  p.name = name || 'Loopic project';
  p.comps = []; p.assets = {}; p.actions = [];
  p.imported = { from: 'Loopic', version: d.version || '' };

  /* ---------- resources ---------- */
  var list = (d.resources && (d.resources.resources || d.resources)) || [], seqRes = {}, resById = {}, derived = {};
  if (!Array.isArray(list)) list = [];
  function dataUrl(r) {
    var c = r.content || '', ft = String(r.fileType || '').toLowerCase();
    if (/^data:/.test(c)) return c;
    if (ft === 'svg' || /^\s*<(\?xml|svg)/.test(c)) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(c);
    var mime = { otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ft] || 'application/octet-stream';
    return 'data:' + mime + ';base64,' + c;
  }
  for (var ri = 0; ri < list.length; ri++) {
    var r = list[ri], kind = String(r.fileResourceType || '').toUpperCase(), aid = 'a_' + r.id;
    resById[r.id] = r;
    if (r.resourceType === 'IMAGE_SEQUENCE' || Array.isArray(r.images)) {
      var imgs = r.images || [], frames = imgs.map(dataUrl), sz = frames.length ? await Loopic.imageSize(frames[0]) : { w: 0, h: 0 };
      p.assets[aid] = { id: aid, type: 'sequence', name: (r.name || 'Sequence') + ' [' + frames.length + ' frames]', frames: frames, w: sz.w, h: sz.h, fps: (d.compDefaults && d.compDefaults.fps) || 25 };
      seqRes[r.id] = imgs.map(function (x) { return x.id; });
      imgs.forEach(function (x) { resById[x.id] = x; });
      stats.assets++;
    } else if (kind === 'FONT' || /^(otf|ttf|woff2?)$/i.test(r.fileType || '')) {
      p.assets[aid] = { id: aid, type: 'font', name: r.name + '.' + (r.fileType || 'ttf'), family: r.name, src: dataUrl(r) };
      stats.assets++;
    } else if (kind === 'IMAGE' || kind === 'SVG' || /^(png|jpe?g|gif|webp|svg)$/i.test(r.fileType || '')) {
      var src = dataUrl(r), isz = await Loopic.imageSize(src);
      p.assets[aid] = { id: aid, type: 'image', name: r.name || 'Image', src: src, w: isz.w, h: isz.h };
      stats.assets++;
    } else note('A resource of a kind CG Motion does not use was left out: ' + (r.name || r.id) + ' (' + (r.fileType || r.resourceType) + ').');
  }

  /* ---------- helpers for properties ---------- */
  function ks(pr) { return pr && Array.isArray(pr.keyframes) && pr.keyframes.length ? pr.keyframes.slice().sort(function (a, b) { return a.frame - b.frame; }) : null; }
  function stat(pr, dflt) { if (!pr) return dflt; var k = ks(pr); return k ? k[0].value : (pr.value == null ? dflt : pr.value); }
  function put(L, nm, pr, f, dflt) {
    f = f || function (v) { return v; };
    if (!pr) { if (dflt !== undefined) L.p[nm] = dflt; return; }
    var k = ks(pr);
    if (k) {
      var out = [], last = null;
      k.forEach(function (q) {
        var t = Math.round(q.frame);
        if (last && last.t === t) { last.v = f(q.value); last.e = Loopic.ease(q.easing); return; }
        last = { t: t, v: f(q.value), e: Loopic.ease(q.easing) };
        out.push(last);
      });
      L.a[nm] = out; stats.keys += out.length;
    } else L.p[nm] = f(pr.value == null ? dflt : pr.value);
  }
  function colProp(o) { if (!o) return null; if (o.color && o.color.color) return o.color.color; if (o.color && ('value' in o.color || o.color.keyframes)) return o.color; if ('value' in o || o.keyframes) return o; return null; }
  function isGrad(o) { return !!(o && (o.isGradient || (o.color && o.color.isGradient))); }
  var n100 = function (v) { return Math.round(+v * 1e4) / 100; }, num = function (v) { return +v || 0; };

  var compById = {};
  d.compositions.forEach(function (c) { compById[c.id] = c; });

  /* ---------- one layer ---------- */
  function build(Ld, c, asMask) {
    var e = Ld.element || {}, T = String(e.type || '').toUpperCase(), tp = e.transformProperties || {}, sp = e.sizeProperties || {}, org = e.transformOrigin || {};
    var L = {
      id: 'l' + Ld.id, name: Ld.name || T, type: 'null', start: Math.round(Ld.startFrame || 0), end: Math.round((Ld.startFrame || 0) + (Ld.duration || c.duration)),
      visible: Ld.isVisible !== false && !Ld.isGuide, locked: !!Ld.isLocked, parent: '', matte: '', matteMode: 'alpha', blend: 'normal',
      p: {}, a: {}, mask: { on: false, shape: 'rect' }, shadow: false
    };
    if (Ld.isGuide) L.guide = true;
    var ox = num(stat(org.x, 0)), oy = num(stat(org.y, 0));
    if (ks(org.x) || ks(org.y)) note('An animated anchor point was imported at its first value (layer "' + L.name + '").');
    put(L, 'x', tp.x, num, 0); put(L, 'y', tp.y, num, 0);
    put(L, 'rot', tp.rotation, num, 0);
    put(L, 'sx', tp.scaleX, n100, 100); put(L, 'sy', tp.scaleY, n100, 100);
    put(L, 'op', tp.opacity, n100, 100);

    var sized = true, w0 = num(stat(sp.width, 0)), h0 = num(stat(sp.height, 0));
    if (T === 'TEXT') {
      var x = e.textProperties || {};
      L.type = 'text';
      L.text = String(e.content == null ? '' : e.content).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      L.key = e.key || '';
      L.font = stat(x.fontFamily, 'Arial');
      var fw = String(stat(x.fontWeight, 'normal'));
      L.weight = fw === 'bold' ? 700 : (fw === 'normal' ? 400 : (parseInt(fw, 10) || 400));
      L.italic = /italic|oblique/.test(String(stat(x.fontStyle, 'normal')));
      var al = String(stat(x.textAlign, 'left'));
      L.align = /^(left|center|right|justify)$/.test(al) ? al : (al === 'end' ? 'right' : 'left');
      var va = String(stat(x.verticalTextAlign, 'top'));
      L.valign = va === 'center' || va === 'middle' ? 'middle' : (va === 'bottom' ? 'bottom' : 'top');
      var tt = String(stat(x.textTransform, 'none'));
      L.upper = tt === 'uppercase'; L.tcase = tt === 'uppercase' ? 'upper' : (tt === 'lowercase' ? 'lower' : (tt === 'capitalize' ? 'title' : 'none'));
      L.padT = num(stat(x.paddingTop, 0)); L.padR = num(stat(x.paddingRight, 0)); L.padB = num(stat(x.paddingBottom, 0)); L.padL = num(stat(x.paddingLeft, 0));
      L.maxW = 0; L.wrapW = 0;
      L.box = true; L.boxScale = false; L.clip = false;
      L.squeeze = !!e.autoSqueeze;
      L.boxWrap = !!e.multiline && !e.autoSqueeze && !e.autoSize;
      put(L, 'fontSize', x.fontSize, num, 60); put(L, 'tracking', x.letterSpacing, num, 0); put(L, 'lineHeight', x.lineHeight, num, 1.2);
      put(L, 'color', colProp(x.color) || x.color, Loopic.color, '#ffffffff');
      put(L, 'bg', colProp(x.backgroundColor) || x.backgroundColor, Loopic.color, '#00000000');
      if (String(stat(x.textDecoration, 'none')) !== 'none') note('Underline / strike-through on text is not supported and was dropped (layer "' + L.name + '").');
      var ts = e.textShadowProperties;
      if (ts) {
        var tc = colProp(ts.color) || ts.color, tcv = Loopic.color(stat(tc, 'transparent'));
        if (RT.parseColor(tcv)[3] > 0 && (num(stat(ts.shiftRight, 0)) || num(stat(ts.shiftBottom, 0)) || num(stat(ts.blur, 0)) || ks(ts.shiftRight) || ks(ts.shiftBottom) || ks(ts.blur))) {
          L.shadow = true;
          put(L, 'shX', ts.shiftRight, num, 0); put(L, 'shY', ts.shiftBottom, num, 0); put(L, 'shBlur', ts.blur, num, 0); put(L, 'shColor', tc, Loopic.color);
        }
      }
    } else if (T === 'RECTANGLE' || /ELLIPSE|CIRCLE/.test(T) || T === 'PATH') {
      var pp = e.pathProperties || {};
      L.type = 'shape'; L.shape = T === 'RECTANGLE' ? 'rect' : (T === 'PATH' ? 'poly' : 'ellipse'); L.gradient = false;
      var stops = isGrad(pp.fill) ? (pp.fill.colorStops || []).slice().sort(function (a, b) { return num(stat(a.step, 0)) - num(stat(b.step, 0)); }) : [];
      if (stops.length >= 2) {
        /* two-colour gradient: first and last stop */
        L.gradient = true;
        put(L, 'fill', stops[0].color, Loopic.color, '#ffffffff');
        put(L, 'fill2', stops[stops.length - 1].color, Loopic.color, '#000000ff');
        put(L, 'gradAngle', pp.fill.degree, num, 90);
        if (stops.length > 2 || num(stat(stops[0].step, 0)) !== 0 || num(stat(stops[stops.length - 1].step, 100)) !== 100 || String(pp.fill.gradientType || 'linear') !== 'linear') {
          note('A gradient with more than two colours, shifted stops or a round shape was imported as a plain two-colour linear gradient (layer "' + L.name + '").');
        }
      } else put(L, 'fill', stops.length ? stops[0].color : colProp(pp.fill), Loopic.color, '#ffffffff');
      put(L, 'stroke', colProp(pp.strokeColor), Loopic.color, '#000000ff');
      put(L, 'strokeW', pp.strokeWidth, num, 0);
      if (T === 'PATH') {
        /* a drawn path becomes a straight-edged outline; curves are followed with short segments */
        var pts = [], P = e.points || [], n = P.length, moving = false;
        var pv = function (o) { if (ks(o.x) || ks(o.y)) moving = true; return [num(stat(o.x, 0)), num(stat(o.y, 0))]; };
        for (var i = 0; i < n; i++) {
          var A = P[i], B = P[(i + 1) % n], a0 = pv(A.mainPoint), b0 = pv(B.mainPoint), ac = pv(A.outC || { x: {}, y: {} }), bc = pv(B.inC || { x: {}, y: {} });
          pts.push(a0);
          if (i === n - 1 && e.isClosed === false) break;
          if (ac[0] || ac[1] || bc[0] || bc[1]) {
            var c1 = [a0[0] + ac[0], a0[1] + ac[1]], c2 = [b0[0] + bc[0], b0[1] + bc[1]];
            for (var s2 = 1; s2 < 12; s2++) {
              var u = s2 / 12, v = 1 - u;
              pts.push([v * v * v * a0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b0[0], v * v * v * a0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b0[1]]);
            }
          }
        }
        if (moving) note('A path with animated points was imported in its first shape (layer "' + L.name + '").');
        if (e.isClosed === false) note('An open path was imported as a closed outline (layer "' + L.name + '").');
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pts.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
        if (!pts.length) { x0 = y0 = 0; x1 = y1 = 1; }
        var bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
        L.pts = pts.map(function (q) { return [Math.round((q[0] - x0) / bw * 1e5) / 1e5, Math.round((q[1] - y0) / bh * 1e5) / 1e5]; });
        L.p.w = bw; L.p.h = bh; L.p.ax = -x0 + ox; L.p.ay = -y0 + oy;
        sized = false;
      } else {
        var br = e.borderRadiusProperties;
        if (br && T === 'RECTANGLE') {
          if (stat(br.syncRadius, true) !== false) put(L, 'radius', br.radius, num, 0);
          else {
            var rs = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].map(function (k) { return num(stat(br[k], 0)); });
            L.p.radius = Math.max.apply(null, rs);
            if (rs.some(function (v) { return v !== rs[0]; })) note('Different radii per corner are not supported; the largest was used on all corners (layer "' + L.name + '").');
          }
        }
      }
    } else if (T === 'IMAGE' || T === 'IMAGE_LOADER') {
      L.type = 'image';
      var rid = T === 'IMAGE' ? e.imageResourceId : (e.placeholderId && e.placeholderId !== 'none' ? e.placeholderId : '');
      L.asset = rid && p.assets['a_' + rid] ? 'a_' + rid : '';
      L.key = T === 'IMAGE_LOADER' ? (e.key || '') : '';
      L.fit = T === 'IMAGE_LOADER' ? (/^(contain|cover|fill)$/.test(e.size || '') ? e.size : 'contain') : 'fill';
      L.prefix = ''; L.suffix = '';
      if (T === 'IMAGE' && rid && !L.asset) note('A picture used by layer "' + L.name + '" was not found inside the file.');
    } else if (T === 'IMAGE_SEQUENCE') {
      L.type = 'sequence'; L.loop = 'hold'; L.fps = c.fps; L.freeRun = false;
      var sid = e.imageSequenceResourceId, all = seqRes[sid], ids = e.imageIds || [];
      if (all) {
        L.asset = 'a_' + sid;
        if (ids.length && ids.join() !== all.join()) {
          var at = all.indexOf(ids[0]), run = at >= 0 && ids.every(function (q, j) { return all[at + j] === q; });
          if (run) { L.seqStart = at; L.seqLen = ids.length; }
          else {
            /* frames picked out of order: a sequence of its own */
            var dk = ids.join();
            if (!derived[dk]) {
              var did = 'a_' + sid + '_' + Object.keys(derived).length, base = p.assets['a_' + sid];
              p.assets[did] = { id: did, type: 'sequence', name: base.name.replace(/\s*\[\d+ frames\]$/, '') + ' (part) [' + ids.length + ' frames]', frames: ids.map(function (q) { return resById[q] ? dataUrl(resById[q]) : ''; }).filter(Boolean), w: base.w, h: base.h, fps: base.fps };
              derived[dk] = did;
            }
            L.asset = derived[dk];
          }
        }
      } else { L.asset = ''; note('The frames of sequence layer "' + L.name + '" were not found inside the file.'); }
    } else if (T === 'COMPOSITION') {
      var sub = compById[e.compositionId];
      if (sub && sub !== c) {
        L.type = 'comp'; L.comp = 'c' + sub.id;
        L.triggered = !!e.detachPlayhead; L.autoPlay = !!e.detachPlayhead && e.autoPlay !== false;
        var kx = sub.width > 0 && w0 > 0 ? w0 / sub.width : 1, ky = sub.height > 0 && h0 > 0 ? h0 / sub.height : 1;
        if (Math.abs(kx - 1) > 0.002 || Math.abs(ky - 1) > 0.002) {
          var mulK = function (nm, k) { if (L.a[nm]) L.a[nm].forEach(function (q) { q.v = Math.round(q.v * k * 100) / 100; }); else L.p[nm] = Math.round((L.p[nm] == null ? 100 : L.p[nm]) * k * 100) / 100; };
          mulK('sx', kx); mulK('sy', ky);
          if (ks(sp.width) || ks(sp.height)) note('A nested composition with an animated size was imported at its first size (layer "' + L.name + '").');
        }
        L.p.ax = sub.width / 2 + ox / kx; L.p.ay = sub.height / 2 + oy / ky;
        sized = false;
      } else { note('Layer "' + L.name + '" pointed at a composition that is not in the file; it became an empty null layer.'); sized = false; }
    } else {
      note('Layer type "' + T + '" has no match in CG Motion; "' + L.name + '" became an empty null layer.');
      L.p.ax = 50; L.p.ay = 50; sized = false;
    }

    if (sized) {
      /* Loopic sizes a layer around its centre, so the anchor follows half the size */
      put(L, 'w', sp.width, num, 100); put(L, 'h', sp.height, num, 100);
      var half = function (nm, src, off) {
        if (L.a[src]) L.a[nm] = L.a[src].map(function (q) { return { t: q.t, v: q.v / 2 + off, e: clone(q.e) }; });
        else L.p[nm] = (L.p[src] || 0) / 2 + off;
      };
      half('ax', 'w', ox); half('ay', 'h', oy);
      if (L.type === 'text' && e.borderRadiusProperties) put(L, 'radius', e.borderRadiusProperties.radius, num, 0);
    }

    var fp = e.filterProperties;
    if (fp) {
      if (ks(fp.blur) || num(stat(fp.blur, 0))) put(L, 'blur', fp.blur, num, 0);
      if (ks(fp.brightness) || +stat(fp.brightness, 1) !== 1) put(L, 'bright', fp.brightness, n100, 100);
      if (ks(fp.contrast) || +stat(fp.contrast, 1) !== 1) put(L, 'contrast', fp.contrast, n100, 100);
      if (ks(fp.saturate) || +stat(fp.saturate, 1) !== 1) put(L, 'sat', fp.saturate, n100, 100);
      if (ks(fp.hueRotate) || num(stat(fp.hueRotate, 0))) put(L, 'hue', fp.hueRotate, num, 0);
      ['grayscale', 'invert', 'sepia'].forEach(function (k) { if (fp[k] && (ks(fp[k]) || num(stat(fp[k], 0)))) note('The "' + k + '" filter is not supported and was dropped (layer "' + L.name + '").'); });
      if (fp.opacity && !ks(fp.opacity) && +stat(fp.opacity, 1) !== 1) {
        var fo = +stat(fp.opacity, 1);
        if (L.a.op) L.a.op.forEach(function (q) { q.v = Math.round(q.v * fo * 100) / 100; }); else L.p.op = Math.round(L.p.op * fo * 100) / 100;
      }
    }
    var ds = e.dropShadowPropertyGroup;
    if (ds && !L.shadow) {
      var dc = colProp(ds.color), dcv = Loopic.color(stat(dc, 'transparent'));
      if (RT.parseColor(dcv)[3] > 0 && (num(stat(ds.x, 0)) || num(stat(ds.y, 0)) || num(stat(ds.blur, 0)) || ks(ds.x) || ks(ds.y) || ks(ds.blur))) {
        L.shadow = true;
        put(L, 'shX', ds.x, num, 0); put(L, 'shY', ds.y, num, 0); put(L, 'shBlur', ds.blur, num, 0); put(L, 'shColor', dc, Loopic.color);
      }
    }
    if (asMask) {
      /* a Loopic mask clips to its shape, whatever its colour, opacity or eye icon */
      L.visible = true; L.start = 0; L.end = c.duration; L.shadow = false;
      delete L.a.op; L.p.op = 100;
      if (L.type === 'shape') { delete L.a.fill; L.p.fill = '#ffffffff'; L.p.strokeW = 0; delete L.a.strokeW; L.gradient = false; }
      L.name = 'Mask: ' + (Ld.name || 'mask');
    }
    L.__key = e.key || '';
    return L;
  }

  /* ---------- compositions ---------- */
  var hookList = [];
  d.compositions.forEach(function (c) {
    var comp = { id: 'c' + c.id, name: c.name || 'Composition', w: Math.round(c.width) || 1920, h: Math.round(c.height) || 1080, fps: +c.fps || 25, duration: Math.max(1, Math.round(c.duration || 100)), bg: '', layers: [], markers: [], loops: [] };
    try { var bgc = Loopic.color(c.background && c.background.color); if (RT.parseColor(bgc)[3] > 0) comp.bg = bgc.slice(0, 7); } catch (e0) {}
    var maskIds = {}, out = [];
    (c.layers || []).forEach(function (Ld) {
      var L = build(Ld, c, false), mattes = [];
      stats.layers++;
      (Ld.maskLayers || []).forEach(function (Md) {
        /* the same mask copied onto several layers becomes one shared mask layer */
        var sig = JSON.stringify(Md.element, function (k, v) { return k === 'id' ? undefined : v; });
        if (!maskIds[sig]) {
          var M = build(Md, c, true);
          maskIds[sig] = M.id; out.push(M); stats.masks++;
          if ((Md.maskLayers || []).length) note('A mask on a mask is not supported and was dropped (mask "' + Md.name + '").');
        }
        if (mattes.indexOf(maskIds[sig]) < 0) mattes.push(maskIds[sig]);
      });
      if (mattes.length) { L.matte = mattes[0]; if (mattes.length > 1) L.matteMore = mattes.slice(1).map(function (id) { return { id: id, op: 'int' }; }); }
      out.push(L);
    });
    comp.layers = out.reverse();   /* Loopic lists back to front, CG Motion front to back */

    /* frame actions: pause = stop marker, jump back and play = repeat section */
    (c.actions || []).forEach(function (a) {
      var code = String(a.code || '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ''), f = Math.round(a.frame), m;
      if (!code) return;
      if (/^this\.(pause|stop)\(\);?$/.test(code)) { if (f > 0 && f < comp.duration && !comp.markers.some(function (q) { return q.t === f; })) comp.markers.push({ t: f }); }
      else if ((m = /^this\.goToAndPlay\((\d+)\);?$/.exec(code)) && +m[1] < f) comp.loops.push({ from: +m[1], to: f });
      else note('Code on frame ' + f + ' of "' + comp.name + '" was not converted: ' + String(a.code).trim().slice(0, 120));
    });
    comp.markers.sort(function (a, b) { return a.t - b.t; });
    Loopic.hooks(c.compositionAction).forEach(function (hk) { hookList.push({ comp: comp, hk: hk }); });
    p.comps.push(comp);
    stats.comps++;
  });
  p.rootComp = compById[d.activeCompositionId] ? 'c' + d.activeCompositionId : p.comps[0].id;

  /* ---------- code hooks: invokes, colour / value updates, split names, reverse out ---------- */
  function nextStop(comp, after) { for (var i = 0; i < comp.markers.length; i++) if (comp.markers[i].t > after) return comp.markers[i].t; return comp.duration; }
  function byKey(comp, key) {
    /* in this composition, else in the compositions nested inside it */
    var hit = [], seenC = {};
    (function look(c2, depth) {
      if (seenC[c2.id] || depth > 8) return;
      seenC[c2.id] = 1;
      c2.layers.forEach(function (L) { if (L.__key === key) hit.push(L); });
      if (hit.length && depth === 0) return;
      c2.layers.forEach(function (L) { if (L.type === 'comp') p.comps.forEach(function (c3) { if (c3.id === L.comp) look(c3, depth + 1); }); });
    })(comp, 0);
    return hit;
  }
  var STYLE = { fill: ['fill', 'set'], color: ['color', 'set'], backgroundColor: ['bg', 'set'], strokeColor: ['stroke', 'set'], stroke: ['stroke', 'set'], strokeWidth: ['strokeW', 'set'],
    opacity: ['op', 'mul'], x: ['x', 'set'], y: ['y', 'set'], width: ['w', 'set'], height: ['h', 'set'], rotation: ['rot', 'set'], scaleX: ['sx', 'mul'], scaleY: ['sy', 'mul'], fontSize: ['fontSize', 'set'], letterSpacing: ['tracking', 'set'], blur: ['blur', 'set'] };
  var dead = [];
  hookList.forEach(function (o) {
    var comp = o.comp, hk = o.hk, b = hk.body, m, done = false;
    function fail() { note('Code in "' + comp.name + '" was not converted and needs rebuilding by hand: ' + hk.src.replace(/\s+/g, ' ').slice(0, 160)); }
    if (hk.kind === 'Invoke') {
      if (!hk.arg) return fail();
      var from = null, to = null;
      if ((m = /this\.goToAndPlay\(\s*(\d+)\s*\)/.exec(b))) { from = +m[1]; to = nextStop(comp, from); }
      else if ((m = /this\.goToAndStop\(\s*(\d+)\s*\)/.exec(b))) { from = to = +m[1]; }
      if (from == null) return fail();
      var nm = hk.arg.replace(/[^A-Za-z0-9_$]/g, '_'); if (/^[0-9]/.test(nm)) nm = '_' + nm;
      if (nm !== hk.arg) note('Invoke "' + hk.arg + '" was renamed "' + nm + '" (invoke names can only use letters, digits and _).');
      stats.invokes[nm] = 1;
      /* on the composition's own template it drives the main timeline; where the composition is nested and runs independently, that copy */
      p.actions.push({ id: uid('x'), name: nm, target: 'main', comp: comp.id, from: from, to: to });
      p.comps.forEach(function (c2) { c2.layers.forEach(function (L) {
        if (L.type !== 'comp' || L.comp !== comp.id) return;
        if (L.triggered) p.actions.push({ id: uid('x'), name: nm, target: L.id, from: from, to: to });
        else note('"' + comp.name + '" has invokes but is nested in "' + c2.name + '" following the parent timeline, so its invokes do nothing there. Tick "Runs independently" on that layer to use them.');
      }); });
    } else if (hk.kind === 'Update') {
      if (!hk.arg) return fail();
      var km = /findElementByKey\(\s*(?:(key)|["'`]([^"'`]+)["'`])\s*\)/.exec(b), tkey = km ? (km[1] ? hk.arg : km[2]) : null, targets = tkey ? byKey(comp, tkey) : [];
      if (!targets.length) {
        if (tkey) dead.push(hk.arg + ' (' + comp.name + ')');
        else fail();
        return;
      }
      var re = /\.style\.([A-Za-z]+)\.value\s*=\s*value\b/g;
      while ((m = re.exec(b))) {
        var st = STYLE[m[1]];
        if (!st) { note('Field "' + hk.arg + '" sets "' + m[1] + '" in "' + comp.name + '", which cannot be mapped automatically.'); continue; }
        targets.forEach(function (L) { L.bind = L.bind || {}; L.bind[st[0]] = { key: hk.arg, mode: st[1], glide: 0 }; });
        stats.fields[hk.arg] = 1; done = true;
      }
      if (/\.setContent\s*\(/.test(b)) {
        var sm = /\.split\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(b), span = /<span[^>]*style\s*=\s*\\?["']([^"'>]*)/.exec(b);
        targets.forEach(function (L) {
          if (L.type !== 'text') return;
          L.key = hk.arg;
          if (sm) {
            var css = span ? span[1] : '', ff = /font-family\s*:\s*([^;]+)/i.exec(css), fw = /font-weight\s*:\s*([^;]+)/i.exec(css), fs = /font-style\s*:\s*([^;]+)/i.exec(css);
            var w = fw ? fw[1].trim() : '';
            L.split = { on: true, sep: sm[1], font: ff ? ff[1].trim().replace(/^["']|["']$/g, '') : '', weight: w === 'bold' ? 700 : (w === 'normal' ? 400 : (parseInt(w, 10) || '')), italic: fs ? (/italic|oblique/.test(fs[1]) ? 'on' : 'off') : '', join: ' ' };
          }
          done = true;
        });
        stats.fields[hk.arg] = 1;
      }
      if (!done) fail();
    } else if (hk.kind === 'Stop' && /this\.play\(\s*\{\s*reverse\s*:\s*true\s*\}\s*\)/.test(b)) {
      comp.outReverse = true;
    } else fail();
  });
  p.comps.forEach(function (c2) { c2.layers.forEach(function (L) {
    if (L.key && (L.type === 'text' || L.type === 'image')) stats.fields[L.key] = 1;
    delete L.__key;
  }); });

  if (dead.length) note('Left-over code for fields whose element is not in the file was dropped (it did nothing in Loopic either): ' + dead.join(', ') + '.');
  var fl = Object.keys(stats.fields), il = Object.keys(stats.invokes);
  return { project: p, report: {
    summary: stats.comps + ' composition' + (stats.comps === 1 ? '' : 's') + ', ' + stats.layers + ' layers, ' + stats.masks + ' masks, ' + stats.keys + ' keyframes, ' + stats.assets + ' fonts / pictures / sequences.',
    fields: fl, invokes: il, notes: notes
  } };
};

Loopic.showReport = function (name, rep) {
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var kids = [
    h('div', { class: 'modal-title', text: 'Imported from Loopic: ' + name }),
    h('p', { text: rep.summary }),
    rep.fields.length ? h('p', { class: 'hint', text: 'Fields: ' + rep.fields.join(', ') }) : null,
    rep.invokes.length ? h('p', { class: 'hint', text: 'Invokes: ' + rep.invokes.join(', ') }) : null,
    h('div', { class: 'ghead', text: rep.notes.length ? 'Check these (' + rep.notes.length + ')' : 'Everything in the file was converted' })
  ];
  if (rep.notes.length) kids.push(h('ul', { class: 'imp-notes' }, rep.notes.map(function (n) { return h('li', { text: n }); })));
  if (Object.keys(App.project.assets).some(function (k) { return App.project.assets[k].type === 'sequence' && !App.project.assets[k].crop; })) kids.push(h('div', { class: 'pbar' }, [h('button', { class: 'primary', text: 'Optimise sequences for playback', title: 'Cuts every frame down to the area that has pixels. Looks the same, plays much smoother.', onclick: function () { close(); Panels.optimiseAll(); } })]));
  kids.push(h('p', { class: 'hint', text: 'This is now a CG Motion project. Use Save to keep it as a .cgm file; the .loo file is not changed. Compare each template with the original before going on air.' }));
  kids.push(h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'OK', onclick: close })]));
  var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal wide' }, kids));
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') close(); });
  host.appendChild(bg);
  var b = bg.querySelector('button'); if (b) b.focus();
};

/* text of a .loo file -> loads it as the open project */
Loopic.open = function (text, path) {
  var name = String(path || 'Loopic project').replace(/^.*[\\\/]/, '').replace(/\.loo$/i, '');
  UI.status('Reading Loopic project...', true);
  var d;
  try { d = JSON.parse(text); } catch (e) { return Promise.reject(new Error('This .loo file could not be read (it is not the plain project format).')); }
  return Loopic.convert(d, name).then(function (r) {
    App.load(r.project, null);
    App.setDirty(true);
    Loopic.last = r.report;
    UI.status('Imported "' + name + '" from Loopic: ' + r.report.summary);
    if (!window.__test) Loopic.showReport(name, r.report);
    return r;
  });
};
