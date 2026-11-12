/* CG Motion - imports Photoshop files (.psd / .psb), also what Affinity Photo, Photopea, GIMP and Krita export as PSD.
   Every layer keeps its place, size, opacity, blend mode and visibility; groups become null layers their layers follow;
   text layers become editable text (CasparCG fields); clipping masks become mattes; layer masks are baked into the pixels. */
var PSD = {};

PSD.is = function (path) { return /\.(psd|psb)$/i.test(path || ''); };

PSD.BLEND = { norm: 'normal', pass: 'normal', mul: 'multiply', scrn: 'screen', over: 'overlay', dark: 'darken', lite: 'lighten', 'div ': 'color-dodge', idiv: 'color-burn',
  hLit: 'hard-light', sLit: 'soft-light', diff: 'difference', smud: 'exclusion', hue: 'hue', sat: 'saturation', colr: 'color', lum: 'luminosity' };
PSD.BLEND_NEAR = { lddg: 'screen', lbrn: 'multiply', dkCl: 'darken', lgCl: 'lighten', vLit: 'hard-light', lLit: 'hard-light', pLit: 'hard-light', hMix: 'hard-light', fsub: 'difference', fdiv: 'color-burn', diss: 'normal' };
PSD.WEIGHT = [[/thin|hairline/i, 100], [/extra.?light|ultra.?light/i, 200], [/light/i, 300], [/medium/i, 500], [/semi.?bold|demi.?bold/i, 600], [/extra.?bold|ultra.?bold|heavy/i, 800], [/black/i, 900], [/bold/i, 700]];

/* a reader over the file bytes */
PSD.reader = function (u8) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), r = { p: 0, u8: u8, dv: dv };
  r.u8b = function () { return u8[r.p++]; };
  r.u16 = function () { var v = dv.getUint16(r.p); r.p += 2; return v; };
  r.i16 = function () { var v = dv.getInt16(r.p); r.p += 2; return v; };
  r.u32 = function () { var v = dv.getUint32(r.p); r.p += 4; return v; };
  r.i32 = function () { var v = dv.getInt32(r.p); r.p += 4; return v; };
  r.u64 = function () { var hi = dv.getUint32(r.p), lo = dv.getUint32(r.p + 4); r.p += 8; return hi * 4294967296 + lo; };
  r.f64 = function () { var v = dv.getFloat64(r.p); r.p += 8; return v; };
  r.str = function (n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(u8[r.p + i]); r.p += n; return s; };
  r.bytes = function (n) { var b = u8.subarray(r.p, r.p + n); r.p += n; return b; };
  r.uni = function () { var n = r.u32(), s = ''; for (var i = 0; i < n; i++) { var c = dv.getUint16(r.p + i * 2); if (c) s += String.fromCharCode(c); } r.p += n * 2; return s; };
  r.pascal = function (pad) { var n = u8[r.p], s = r.str(n + 1).slice(1), tot = n + 1; while (tot % pad) { r.p++; tot++; } return s; };
  return r;
};

/* ---------- Photoshop descriptors (text, effects) ---------- */
PSD.desc = function (r) {
  r.uni();
  var cl = r.u32(); r.p += cl || 4;
  var n = r.u32(), o = {};
  for (var i = 0; i < n; i++) {
    var kl = r.u32(), key = r.str(kl || 4).trim();
    o[key] = PSD.item(r);
  }
  return o;
};
PSD.item = function (r) {
  var t = r.str(4), n, i, a;
  switch (t) {
    case 'Objc': case 'GlbO': return PSD.desc(r);
    case 'VlLs': n = r.u32(); a = []; for (i = 0; i < n; i++) a.push(PSD.item(r)); return a;
    case 'doub': return r.f64();
    case 'UntF': r.str(4); return r.f64();
    case 'UnFl': r.str(4); n = r.u32(); a = []; for (i = 0; i < n; i++) a.push(r.f64()); return a;
    case 'TEXT': return r.uni();
    case 'enum': var l1 = r.u32(); r.p += l1 || 4; var l2 = r.u32(); return r.str(l2 || 4).trim();
    case 'long': return r.i32();
    case 'comp': return r.u64();
    case 'bool': return !!r.u8b();
    case 'type': case 'GlbC': r.uni(); var l3 = r.u32(); r.p += l3 || 4; return null;
    case 'alis': n = r.u32(); r.p += n; return null;
    case 'tdta': n = r.u32(); return r.bytes(n);
    case 'Pth ': n = r.u32(); r.p += n; return null;
    case 'obj ': n = r.u32(); for (i = 0; i < n; i++) PSD.ref(r); return null;
    default: throw new Error('descriptor type ' + t);
  }
};
PSD.ref = function (r) {
  var t = r.str(4);
  if (t === 'prop') { r.uni(); var a = r.u32(); r.p += a || 4; var b = r.u32(); r.p += b || 4; }
  else if (t === 'Clss') { r.uni(); var c = r.u32(); r.p += c || 4; }
  else if (t === 'Enmr') { r.uni(); var d = r.u32(); r.p += d || 4; var e = r.u32(); r.p += e || 4; var f = r.u32(); r.p += f || 4; }
  else if (t === 'rele') { r.uni(); var g = r.u32(); r.p += g || 4; r.p += 4; }
  else if (t === 'Idnt' || t === 'indx') r.p += 4;
  else if (t === 'name') { r.uni(); var hh = r.u32(); r.p += hh || 4; r.uni(); }
};

/* the text engine data: a PostScript-like dictionary */
PSD.engine = function (bytes) {
  var i = 0, n = bytes.length;
  function ws() { while (i < n && (bytes[i] <= 32)) i++; }
  function val() {
    ws();
    var c = bytes[i];
    if (c === 60 && bytes[i + 1] === 60) { i += 2; var o = {}; for (;;) { ws(); if (bytes[i] === 62 && bytes[i + 1] === 62) { i += 2; return o; } if (bytes[i] !== 47) { i++; continue; } var k = name(); o[k] = val(); } }
    if (c === 91) { i++; var a = []; for (;;) { ws(); if (bytes[i] === 93) { i++; return a; } if (i >= n) return a; a.push(val()); } }
    if (c === 40) return string();
    if (c === 47) return name();
    var s = i; while (i < n && bytes[i] > 32 && [91, 93, 40, 47, 60, 62].indexOf(bytes[i]) < 0) i++;
    var w = String.fromCharCode.apply(null, bytes.subarray(s, i));
    if (w === 'true') return true; if (w === 'false') return false;
    var f = parseFloat(w); return isNaN(f) ? w : f;
  }
  function name() { i++; var s = i; while (i < n && bytes[i] > 32 && [91, 93, 40, 47, 60, 62].indexOf(bytes[i]) < 0) i++; return String.fromCharCode.apply(null, bytes.subarray(s, i)); }
  function string() {
    i++; var out = [];
    while (i < n && bytes[i] !== 41) { if (bytes[i] === 92) { i++; var e = bytes[i]; out.push(e === 110 ? 10 : (e === 114 ? 13 : (e === 116 ? 9 : e))); i++; } else out.push(bytes[i++]); }
    i++;
    if (out[0] === 0xfe && out[1] === 0xff) { var s = ''; for (var k = 2; k + 1 < out.length; k += 2) s += String.fromCharCode((out[k] << 8) | out[k + 1]); return s; }
    return String.fromCharCode.apply(null, out);
  }
  try { return val(); } catch (e) { return {}; }
};

/* ---------- pixels ---------- */
PSD.inflate = async function (data) { return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); };
PSD.channel = async function (r, w, h, depth, psb, len) {
  var end = r.p + len, comp = r.u16(), bpp = depth / 8, rowB = w * bpp, out = new Uint8Array(w * h), raw, y, x;
  if (!w || !h) { r.p = end; return out; }
  if (comp === 0) raw = r.bytes(rowB * h);
  else if (comp === 1) {
    var counts = [];
    for (y = 0; y < h; y++) counts.push(psb ? r.u32() : r.u16());
    raw = new Uint8Array(rowB * h);
    var o = 0;
    for (y = 0; y < h; y++) {
      var stop = r.p + counts[y], ro = y * rowB, rp = 0;
      while (r.p < stop && rp < rowB) {
        var b = r.u8[r.p++];
        if (b < 128) { for (var k = 0; k <= b && rp < rowB; k++) raw[ro + rp++] = r.u8[r.p++]; }
        else if (b > 128) { var v = r.u8[r.p++]; for (var m = 0; m < 257 - b && rp < rowB; m++) raw[ro + rp++] = v; }
      }
      r.p = stop; o += counts[y];
    }
  } else if (comp === 2 || comp === 3) {
    raw = await PSD.inflate(r.bytes(end - r.p));
    if (comp === 3 && bpp === 1) for (y = 0; y < h; y++) for (x = 1; x < w; x++) raw[y * w + x] = (raw[y * w + x] + raw[y * w + x - 1]) & 255;
    if (comp === 3 && bpp === 2) for (y = 0; y < h; y++) { var acc = 0; for (x = 0; x < w; x++) { var q = y * rowB + x * 2; acc = (acc + ((raw[q] << 8) | raw[q + 1])) & 65535; raw[q] = acc >> 8; raw[q + 1] = acc & 255; } }
  } else raw = new Uint8Array(rowB * h);
  r.p = end;
  if (bpp === 1) return raw.length >= w * h ? raw.subarray(0, w * h) : out;
  if (bpp === 2) { for (var i = 0; i < w * h; i++) out[i] = raw[i * 2]; return out; }
  var fv = new DataView(raw.buffer, raw.byteOffset);
  for (var j = 0; j < w * h; j++) out[j] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, fv.getFloat32(j * 4)), 1 / 2.2) * 255)));
  return out;
};

/* ---------- the file ---------- */
PSD.parse = async function (u8) {
  var r = PSD.reader(u8);
  if (r.str(4) !== '8BPS') throw new Error('This is not a Photoshop file.');
  var ver = r.u16(), psb = ver === 2; r.p += 6;
  var chans = r.u16(), H = r.u32(), W = r.u32(), depth = r.u16(), mode = r.u16();
  if ([1, 2, 3, 4, 8].indexOf(mode) < 0) throw new Error('Only RGB, CMYK, greyscale and indexed files can be imported (this one uses colour mode ' + mode + ').');
  var cmLen = r.u32(), pal = mode === 2 && cmLen >= 768 ? r.u8.slice(r.p, r.p + 768) : null; r.p += cmLen;   // colour mode data (palette)
  var _sk = r.u32(); r.p += _sk;               // image resources
  var lmLen = psb ? r.u64() : r.u32(), lmEnd = r.p + lmLen, layers = [];
  if (lmLen) {
    var liLen = psb ? r.u64() : r.u32(), liEnd = r.p + liLen;
    if (liLen) layers = await PSD.layerInfo(r, depth, psb, mode);
    r.p = liEnd;
    if (!layers.length) {
      /* 16 / 32 bit files keep their layers in an extra block */
      var _sk = r.u32(); r.p += _sk; // global layer mask
      while (r.p + 12 <= lmEnd) {
        var sig = r.str(4), key = r.str(4); if (sig !== '8BIM' && sig !== '8B64') break;
        var big = psb && /^(Lr16|Lr32|Layr|LMsk|Mt16|Mt32|Mtrn|Alph|FMsk|lnk2|FEid|FXid|PxSD)$/.test(key);
        var bl = big ? r.u64() : r.u32(), be = r.p + bl;
        if (key === 'Lr16' || key === 'Lr32' || key === 'Layr') { layers = await PSD.layerInfo(r, key === 'Lr32' ? 32 : (key === 'Lr16' ? 16 : 8), psb, mode); r.p = be; break; }
        r.p = be; while ((r.p - 0) % 4) r.p++;
      }
    }
  }
  /* a flattened file (no layers): use the merged image */
  if (!layers.length) {
    r.p = lmEnd;
    try { layers = [await PSD.composite(r, W, H, chans, depth, psb, mode)]; } catch (e) { layers = []; }
  }
  /* indexed colour: look every pixel up in the palette, then treat it as RGB */
  if (mode === 2) {
    layers.forEach(function (R) {
      var ix = R.px && R.px[0]; if (!ix) return;
      var n = ix.length, rr = new Uint8Array(n), gg = new Uint8Array(n), bb = new Uint8Array(n);
      for (var i = 0; i < n; i++) { var v = ix[i]; if (pal) { rr[i] = pal[v]; gg[i] = pal[256 + v]; bb[i] = pal[512 + v]; } else rr[i] = gg[i] = bb[i] = v; }
      R.px[0] = rr; R.px[1] = gg; R.px[2] = bb;
    });
  }
  var outMode = mode === 2 ? 3 : (mode === 8 ? 1 : mode);
  return { w: W, h: H, depth: depth, mode: outMode, srcMode: mode, layers: layers };
};
/* the merged image at the end of the file (all channels share one compression) */
PSD.composite = async function (r, W, H, chans, depth, psb, mode) {
  var comp = r.u16(), bpp = depth / 8, rowB = W * bpp, n = W * H, px = {}, c, y;
  var colour = mode === 3 ? 3 : (mode === 4 ? 4 : 1), take = Math.min(chans, colour + 1);
  function to8(raw) {
    if (bpp === 1) return raw;
    var o = new Uint8Array(n), i;
    if (bpp === 2) { for (i = 0; i < n; i++) o[i] = raw[i * 2]; return o; }
    var dv = new DataView(raw.buffer, raw.byteOffset);
    for (i = 0; i < n; i++) o[i] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, dv.getFloat32(i * 4)), 1 / 2.2) * 255)));
    return o;
  }
  if (comp === 0) {
    for (c = 0; c < take; c++) px[c === colour ? -1 : c] = to8(r.bytes(rowB * H));
  } else if (comp === 1) {
    var counts = [];
    for (c = 0; c < chans; c++) for (y = 0; y < H; y++) counts.push(psb ? r.u32() : r.u16());
    for (c = 0; c < take; c++) {
      var raw = new Uint8Array(rowB * H);
      for (y = 0; y < H; y++) {
        var stop = r.p + counts[c * H + y], ro = y * rowB, rp = 0;
        while (r.p < stop && rp < rowB) {
          var b = r.u8[r.p++];
          if (b < 128) { for (var k = 0; k <= b && rp < rowB; k++) raw[ro + rp++] = r.u8[r.p++]; }
          else if (b > 128) { var v = r.u8[r.p++]; for (var m = 0; m < 257 - b && rp < rowB; m++) raw[ro + rp++] = v; }
        }
        r.p = stop;
      }
      px[c === colour ? -1 : c] = to8(raw);
    }
  } else throw new Error('compressed merged image');
  if (mode === 4 && px[-1]) { px[3] = px[-1]; delete px[-1]; if (chans > 4) { /* CMYK alpha sits after K */ } }
  return { name: 'Image', top: 0, left: 0, bottom: H, right: W, w: W, h: H, ch: [], extra: {}, blend: 'norm', opacity: 1, clipping: 0, flags: 0, px: px };
};
PSD.layerInfo = async function (r, depth, psb, mode) {
  var count = Math.abs(r.i16()), recs = [], i, c;
  for (i = 0; i < count; i++) {
    var L = { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32(), ch: [], extra: {} };
    var nc = r.u16();
    for (c = 0; c < nc; c++) L.ch.push({ id: r.i16(), len: psb ? r.u64() : r.u32() });
    r.p += 4; L.blend = r.str(4); L.opacity = r.u8b() / 255; L.clipping = r.u8b(); L.flags = r.u8b(); r.p++;
    var exLen = r.u32(), exEnd = r.p + exLen;
    var mLen = r.u32(), mEnd = r.p + mLen;
    if (mLen >= 18) { L.mask = { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32(), def: r.u8b(), flags: r.u8b() }; }
    r.p = mEnd;
    var _sk = r.u32(); r.p += _sk;               // blending ranges
    L.name = r.pascal(4);
    while (r.p + 12 <= exEnd) {
      var sig = r.str(4); if (sig !== '8BIM' && sig !== '8B64') { r.p = exEnd; break; }
      var key = r.str(4), big = psb && /^(LMsk|Lr16|Lr32|Layr|Mt16|Mt32|Mtrn|Alph|FMsk|lnk2|FEid|FXid|PxSD)$/.test(key);
      var len = big ? r.u64() : r.u32(), end = r.p + len;
      try {
        if (key === 'luni') L.name = r.uni() || L.name;
        else if (key === 'lsct' || key === 'lsdk') L.section = r.u32();
        else if (key === 'iOpa') L.fill = r.u8b() / 255;
        else if (key === 'TySh') L.text = PSD.typeTool(r);
        else if (key === 'lfx2') { r.p += 8; L.fx = PSD.desc(r); }
        else if (key === 'SoLd' || key === 'PlLd' || key === 'SoLE') L.smart = true;
        else if (/^(SoCo|GdFl|PtFl|vscg)$/.test(key)) L.fillLayer = key;
        else if (/^(brit|levl|curv|expA|vibA|hue |hue2|blnc|blwh|phfl|mixr|clrL|nvrt|post|thrs|grdm|selc)$/.test(key)) L.adjust = key;
      } catch (e) { L.bad = key + ': ' + e.message; }
      r.p = end;
    }
    r.p = exEnd;
    recs.push(L);
  }
  /* the pixels, channel by channel, in the same order */
  for (i = 0; i < recs.length; i++) {
    var R = recs[i], w = Math.max(0, R.right - R.left), h = Math.max(0, R.bottom - R.top), data = {};
    for (c = 0; c < R.ch.length; c++) {
      var ch = R.ch[c], cw = w, chh = h;
      if (ch.id === -2 && R.mask) { cw = Math.max(0, R.mask.right - R.mask.left); chh = Math.max(0, R.mask.bottom - R.mask.top); }
      if (ch.id < -2 || ch.len < 2) { r.p += ch.len; continue; }
      var start = r.p;
      try { data[ch.id] = await PSD.channel(r, cw, chh, depth, psb, ch.len); } catch (e) { data[ch.id] = null; }
      r.p = start + ch.len;
    }
    R.px = data; R.w = w; R.h = h;
  }
  return recs.map(function (x) { return x; });
};
PSD.typeTool = function (r) {
  r.p += 2;
  var t = [r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64()];
  r.p += 2; r.p += 4;
  var d = PSD.desc(r), eng = d.EngineData ? PSD.engine(d.EngineData) : {};
  return { transform: t, text: d.Txt || d['Txt '] || '', engine: eng, bounds: d.bounds || d.boundingBox || null };
};

/* RGBA canvas data URL of one layer (mask baked in) */
PSD.png = function (R, mode, docW, docH) {
  var w = R.w, h = R.h, px = R.px;
  if (!w || !h) return null;
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data, n = w * h, i;
  var A = px[-1], m = R.mask && px[-2], mw = m ? R.mask.right - R.mask.left : 0, inv = R.mask && (R.mask.flags & 4);
  for (i = 0; i < n; i++) {
    var rr, gg, bb;
    if (mode === 3) { rr = px[0] ? px[0][i] : 0; gg = px[1] ? px[1][i] : 0; bb = px[2] ? px[2][i] : 0; }
    else if (mode === 1) { rr = gg = bb = px[0] ? px[0][i] : 0; }
    else { /* CMYK is stored inverted (255 = no ink) */ var kk = px[3] ? px[3][i] : 255; rr = (px[0] ? px[0][i] : 255) * kk / 255; gg = (px[1] ? px[1][i] : 255) * kk / 255; bb = (px[2] ? px[2][i] : 255) * kk / 255; }
    var a = A ? A[i] : 255;
    if (R.mask && !(R.mask.flags & 2)) {
      var x = i % w + R.left, y = (i / w | 0) + R.top, mv = R.mask.def;
      if (m && x >= R.mask.left && x < R.mask.right && y >= R.mask.top && y < R.mask.bottom) mv = m[(y - R.mask.top) * mw + (x - R.mask.left)];
      if (inv) mv = 255 - mv;
      a = a * mv / 255;
    }
    d[i * 4] = rr; d[i * 4 + 1] = gg; d[i * 4 + 2] = bb; d[i * 4 + 3] = a;
  }
  g.putImageData(im, 0, 0);
  return cv.toDataURL('image/png');
};

/* "BlameSport-Bold" / "TimesNewRomanPSMT" -> family + weight + italic */
PSD.font = function (ps) {
  var s = String(ps || 'Arial'), parts = s.split('-'), fam = parts[0].replace(/(PS)?MT$|PS$/, ''), style = parts.slice(1).join(' ');
  if (!/\s/.test(fam)) fam = fam.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  var w = 400; for (var i = 0; i < PSD.WEIGHT.length; i++) if (PSD.WEIGHT[i][0].test(style)) { w = PSD.WEIGHT[i][1]; break; }
  if (/^bold$/i.test(style)) w = 700;
  return { family: fam.trim() || 'Arial', weight: w, italic: /italic|oblique/i.test(style) };
};

/* ---------- PSD -> composition ---------- */
PSD.convert = async function (u8, name) {
  var doc = await PSD.parse(u8), notes = [], seen = {};
  function note(s) { if (!seen[s]) { seen[s] = 1; notes.push(s); } }
  var p = App.blankProject(), stats = { layers: 0, texts: 0, groups: 0, assets: 0, fields: {}, fonts: {}, clips: 0 };
  p.name = name; p.assets = {}; p.actions = [];
  p.imported = { from: 'Photoshop' };
  var uid = 0; function nid(pre) { return pre + Date.now().toString(36).slice(-4) + '_' + (uid++); }
  var comp = { id: nid('c'), name: name, w: doc.w, h: doc.h, fps: 50, duration: 250, bg: '', layers: [], markers: [], loops: [], note: 'Imported from the Photoshop file "' + name + '". Every layer is in place; add keyframes to animate it.' };
  if (doc.depth !== 8) note('This file is ' + doc.depth + '-bit; it was converted to 8-bit colour.');
  if (doc.mode === 4) note('This file is CMYK; colours were converted to RGB and may look slightly different.');
  var keys = {};
  function fieldKey(nm) { var k = String(nm || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '') || 'text'; var k0 = k, i = 2; while (keys[k]) k = k0 + '_' + (i++); keys[k] = 1; return k; }
  function base(nm, type) { return { id: nid('l'), name: nm, type: type, start: 0, end: comp.duration, visible: true, locked: false, parent: '', matte: '', matteMode: 'alpha', blend: 'normal', p: {}, a: {}, mask: { on: false, shape: 'rect' }, shadow: false }; }

  /* records run bottom to top; a section divider (3) opens a group, the group's own record (1 / 2) closes it */
  var root = { kids: [] }, stack = [root];
  doc.layers.forEach(function (R) {
    if (R.section === 3) { var g = { group: true, kids: [] }; stack[stack.length - 1].kids.push(g); stack.push(g); return; }
    if ((R.section === 1 || R.section === 2) && stack.length > 1) { var gg = stack.pop(); gg.R = R; return; }
    stack[stack.length - 1].kids.push({ R: R });
  });
  var out = [];
  function blendOf(R) {
    var bk = R.blend, bt = bk.trim();
    var b = PSD.BLEND[bk] || PSD.BLEND[bt];
    var nb = PSD.BLEND_NEAR[bk] || PSD.BLEND_NEAR[bt];
    if (!b && nb) { note('The "' + bt + '" blend mode has no exact match; "' + nb + '" was used (layer "' + R.name + '").'); b = nb; }
    if (b && !/^(normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion)$/.test(b)) { note('The "' + b + '" blend mode was imported as Normal (layer "' + R.name + '").'); b = 'normal'; }
    return b || 'normal';
  }
  function shadowOf(L, R) {
    var ds = R.fx && R.fx.DrSh;
    if (ds && ds.enab !== false) {
      var col = ds.Clr || {}, op = ds.Opct == null ? 75 : ds.Opct, ang = (ds.lagl == null ? 120 : ds.lagl) * Math.PI / 180, dist = ds.Dstn || 0;
      L.shadow = true;
      L.p.shX = Math.round(-Math.cos(ang) * dist * 10) / 10; L.p.shY = Math.round(Math.sin(ang) * dist * 10) / 10;
      L.p.shBlur = Math.round((ds.blur || 0) * 10) / 10;
      L.p.shColor = RT.toHex([col['Rd  '] || col.Rd || 0, col['Grn '] || col.Grn || 0, col['Bl  '] || col.Bl || 0, op / 100]);
    }
    if (R.fx) Object.keys(R.fx).forEach(function (k) {
      var on = R.fx[k] && R.fx[k].enab !== false;
      if (on && /^(FrFX|OrGl|IrGl|IrSh|ebbl|ChFX|SoFi|GrFl|patternFill)$/.test(k)) note('The layer style "' + ({ FrFX: 'Stroke', OrGl: 'Outer glow', IrGl: 'Inner glow', IrSh: 'Inner shadow', ebbl: 'Bevel', ChFX: 'Satin', SoFi: 'Colour overlay', GrFl: 'Gradient overlay', patternFill: 'Pattern overlay' })[k] + '" on "' + R.name + '" is not supported yet; the layer was imported without it.');
    });
  }
  function walk(node, parentId, hidden, opMul) {
    /* front first in CG Motion; Photoshop lists from the bottom */
    for (var i = node.kids.length - 1; i >= 0; i--) {
      var k = node.kids[i];
      if (k.group) {
        var GR = k.R || { name: 'Group', opacity: 1, flags: 0, blend: 'pass' }, G = base(GR.name || 'Group', 'null');
        G.p.x = 0; G.p.y = 0; G.p.ax = 0; G.p.ay = 0;
        G.parent = parentId; var gh = hidden || !!(GR.flags & 2);
        G.visible = !gh;
        if (GR.blend && GR.blend !== 'pass' && GR.blend !== 'norm') note('Group "' + G.name + '" uses a blend mode; its layers were imported with their own modes.');
        out.push(G); stats.groups++;
        walk(k, G.id, gh, opMul * (GR.opacity == null ? 1 : GR.opacity));
        continue;
      }
      var R = k.R;
      if (R.adjust) { note('Adjustment layer "' + R.name + '" was left out (adjustments are not supported); use Effects > Bright / Contrast / Saturate on the layers instead.'); continue; }
      var L, op = (R.opacity == null ? 1 : R.opacity) * opMul;
      if (R.text && R.text.text) {
        var T = R.text, eng = T.engine || {}, ed = eng.EngineDict || {}, rd = eng.ResourceDict || {};
        var run = ((ed.StyleRun || {}).RunArray || [])[0] || {}, ss = ((run.StyleSheet || {}).StyleSheetData) || {};
        var fonts = rd.FontSet || [], fi = ss.Font != null ? ss.Font : 0, fnt = PSD.font(fonts[fi] && fonts[fi].Name);
        var scale = Math.sqrt(Math.abs(T.transform[0] * T.transform[3] - T.transform[1] * T.transform[2])) || 1;
        var fs = (ss.FontSize || 24) * scale, fc = ss.FillColor && ss.FillColor.Values;
        var para = ((((ed.ParagraphRun || {}).RunArray || [])[0] || {}).ParagraphSheet || {}).Properties || {};
        var just = para.Justification || 0;
        L = base(R.name, 'text');
        L.text = String(T.text).replace(/\r/g, '\n').replace(/\n$/, '');
        L.key = fieldKey(R.name); stats.fields[L.key] = 1; stats.texts++;
        L.font = fnt.family; L.weight = fnt.weight; L.italic = fnt.italic; stats.fonts[fnt.family] = 1;
        if (ss.FauxBold) L.weight = 700; if (ss.FauxItalic) L.italic = true;
        var caps = ss.FontCaps === 2; L.upper = caps; L.tcase = caps ? 'upper' : 'none';
        L.align = just === 1 ? 'right' : (just === 2 ? 'center' : 'left');
        L.valign = 'middle';
        L.box = true; L.boxScale = false; L.clip = false; L.boxWrap = false; L.fitBox = false; L.squeeze = false;
        L.padL = L.padR = L.padT = L.padB = 0; L.maxW = 0; L.wrapW = 0;
        L.p.fontSize = Math.round(fs * 10) / 10;
        L.p.tracking = Math.round((ss.Tracking || 0) / 1000 * fs * 10) / 10;
        L.p.lineHeight = ss.AutoLeading === false && ss.Leading ? Math.round(ss.Leading * scale / fs * 100) / 100 : 1.2;
        L.p.color = fc ? RT.toHex([fc[1] * 255, fc[2] * 255, fc[3] * 255, fc[0] == null ? 1 : fc[0]]) : '#000000ff';
        L.p.bg = '#00000000';
        /* the box: the rendered text, widened so other words fit, anchored on the alignment side */
        var bw = Math.max(1, R.w), bh = Math.max(1, R.h), extra = Math.max(bw * 0.25, fs);
        var lines = L.text.split('\n').length, boxH = Math.max(bh, fs * 1.25 * lines);
        var left = R.left, w = bw + extra;
        if (L.align === 'center') left = R.left - extra / 2; else if (L.align === 'right') left = R.left - extra;
        L.p.w = Math.round(w); L.p.h = Math.round(boxH);
        L.p.x = Math.round(left + w / 2); L.p.y = Math.round(R.top + bh / 2);
        L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
        if (!R.w) { L.p.x = Math.round(T.transform[4] + w / 2); L.p.y = Math.round(T.transform[5] - fs * 0.35); }
        if ((ed.StyleRun || {}).RunArray && ed.StyleRun.RunArray.length > 1) note('Text "' + R.name + '" mixes several styles; it was imported with the first one (Text styles can rebuild the rest).');
      } else {
        var src = PSD.png(R, doc.mode, doc.w, doc.h);
        if (!src) { if (R.fillLayer) note('Fill layer "' + R.name + '" has no pixels of its own and was left out.'); continue; }
        var aid = nid('a');
        p.assets[aid] = { id: aid, type: 'image', name: name + ' - ' + R.name, src: src, w: R.w, h: R.h }; stats.assets++;
        L = base(R.name, 'image');
        L.asset = aid; L.fit = 'fill'; L.prefix = ''; L.suffix = ''; L.key = '';
        L.p.w = R.w; L.p.h = R.h; L.p.ax = R.w / 2; L.p.ay = R.h / 2;
        L.p.x = R.left + R.w / 2; L.p.y = R.top + R.h / 2;
        if (R.smart) note('Smart object "' + R.name + '" was imported as its picture.');
      }
      if (R.fill != null && R.fill < 1) op *= R.fill;
      if (op < 0.999) L.p.op = Math.round(op * 1000) / 10;
      L.blend = blendOf(R);
      L.visible = !(hidden || (R.flags & 2));
      L.parent = parentId;
      shadowOf(L, R);
      L.__clip = !!R.clipping;
      out.push(L); stats.layers++;
    }
  }
  walk(root, '', false, 1);
  /* clipping masks: a clipped layer shows only where the layer under it is (that layer stays visible) */
  for (var i = 0; i < out.length; i++) {
    var L2 = out[i];
    if (!L2.__clip) continue;
    for (var j = i + 1; j < out.length; j++) {
      var B = out[j];
      if (B.type === 'null' || B.parent !== L2.parent) continue;
      if (!B.__clip) { L2.matte = B.id; L2.matteMode = 'alpha'; B.matteShow = true; stats.clips++; break; }
    }
  }
  out.forEach(function (L3) { delete L3.__clip; });
  comp.layers = out;
  p.comps = [comp]; p.rootComp = comp.id;
  var fl = Object.keys(stats.fonts).filter(function (f) { return !/^(Arial|Segoe UI|Verdana|Tahoma|Georgia|Times New Roman|Courier New|Impact)$/i.test(f); });
  if (fl.length) notes.unshift('Fonts used: ' + fl.join(', ') + '. Add the font files under Assets > Fonts (then they travel inside the template), or install them on the CasparCG PC. If a text looks different, check the font name in the Inspector.');
  if (stats.texts) notes.push('Text layers became editable text: check their size and position against Photoshop (a text box was made around each one).');
  function pl(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  return { project: p, report: { summary: pl(stats.layers, 'layer') + ' (' + pl(stats.texts, 'editable text') + '), ' + pl(stats.groups, 'group') + ', ' + pl(stats.clips, 'clipping mask') + ', ' + pl(stats.assets, 'picture') + ', ' + doc.w + 'x' + doc.h + '.', fields: Object.keys(stats.fields), notes: notes } };
};

PSD.showReport = function (name, rep) {
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var kids = [
    h('div', { class: 'modal-title', text: 'Imported from Photoshop: ' + name }),
    h('p', { text: rep.summary }),
    rep.fields.length ? h('p', { class: 'hint', text: 'Fields: ' + rep.fields.join(', ') }) : null,
    h('div', { class: 'ghead', text: rep.notes.length ? 'Check these (' + rep.notes.length + ')' : 'Everything in the file was converted' })
  ];
  if (rep.notes.length) kids.push(h('ul', { class: 'imp-notes' }, rep.notes.map(function (n) { return h('li', { text: n }); })));
  kids.push(h('p', { class: 'hint', text: 'Photoshop files have no animation: every layer is in place, ready for keyframes. Groups are null layers their layers follow. Use Save to keep the project; the .psd is not changed.' }));
  kids.push(h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'OK', onclick: close })]));
  var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal wide' }, kids));
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') close(); });
  host.appendChild(bg);
  var b = bg.querySelector('.modal-btns button'); if (b) b.focus();
};

PSD.open = function (bytes, path) {
  var name = String(path || 'Photoshop file').replace(/^.*[\\\/]/, '').replace(/\.(psd|psb)$/i, '');
  UI.status('Reading Photoshop file...', true);
  return PSD.convert(bytes, name).then(function (r) {
    App.load(r.project, null);
    App.setDirty(true);
    PSD.last = r.report;
    UI.status('Imported "' + name + '" from Photoshop: ' + r.report.summary);
    if (!window.__test) PSD.showReport(name, r.report);
    return r;
  });
};
