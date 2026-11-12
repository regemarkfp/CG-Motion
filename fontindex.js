// CG Motion - index of the fonts installed on this computer, so exported templates can carry them.
// Reads only each font's table directory, 'name', 'OS/2' and 'head' tables; the result is cached by file size and date.
const fs = require('fs');
const path = require('path');
const os = require('os');

function fontDirs() {
  const d = [];
  if (process.platform === 'win32') {
    d.push(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'));
    if (process.env.LOCALAPPDATA) d.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
  } else if (process.platform === 'darwin') {
    d.push('/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts'));
  } else {
    d.push('/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local', 'share', 'fonts'));
  }
  return d;
}
function walk(dir, out, depth) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) walk(p, out, depth + 1);
    else if (/\.(ttf|otf|ttc)$/i.test(e.name)) out.push(p);
  }
}
function readAt(fd, pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return n === len ? b : b.subarray(0, n); }
function utf16be(b) { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s; }
function face(fd, base) {
  const hdr = readAt(fd, base, 12); if (hdr.length < 12) return null;
  const n = hdr.readUInt16BE(4), dir = readAt(fd, base + 12, n * 16), T = {};
  for (let i = 0; i < n && (i + 1) * 16 <= dir.length; i++) T[dir.toString('latin1', i * 16, i * 16 + 4)] = { off: dir.readUInt32BE(i * 16 + 8), len: dir.readUInt32BE(i * 16 + 12) };
  if (!T.name) return null;
  const nm = readAt(fd, T.name.off, Math.min(T.name.len, 1 << 20)), count = nm.readUInt16BE(2), strOff = nm.readUInt16BE(4), names = {};
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12; if (r + 12 > nm.length) break;
    const plat = nm.readUInt16BE(r), enc = nm.readUInt16BE(r + 2), lang = nm.readUInt16BE(r + 4), id = nm.readUInt16BE(r + 6), len = nm.readUInt16BE(r + 8), o = nm.readUInt16BE(r + 10);
    if (![1, 2, 4, 16, 17].includes(id)) continue;
    const raw = nm.subarray(strOff + o, strOff + o + len);
    let s = null, score = 0;
    if (plat === 3 && (enc === 1 || enc === 10)) { s = utf16be(raw); score = lang === 0x409 ? 3 : 2; }
    else if (plat === 0) { s = utf16be(raw); score = 2; }
    else if (plat === 1 && enc === 0) { s = raw.toString('latin1'); score = 1; }
    if (s && (!names[id] || names[id].score < score)) names[id] = { s: s.trim(), score };
  }
  const fam = (names[16] || names[1] || {}).s, legacy = (names[1] || {}).s, sub = ((names[17] || names[2] || {}).s || 'Regular');
  if (!fam) return null;
  let weight = 400, italic = /italic|oblique/i.test(sub), fsType = 0;
  if (T['OS/2'] && T['OS/2'].len >= 64) {
    const o2 = readAt(fd, T['OS/2'].off, 64);
    weight = o2.readUInt16BE(4) || 400; fsType = o2.readUInt16BE(8); italic = italic || !!(o2.readUInt16BE(62) & 1);
  } else if (T.head) { const hd = readAt(fd, T.head.off, 54); if (hd.length >= 46) { const ms = hd.readUInt16BE(44); if (ms & 1) weight = 700; if (ms & 2) italic = true; } }
  if (weight < 100) weight = weight * 100; // some old fonts store 1-9
  /* fsType 2 = restricted licence: the font may not be embedded */
  return { family: fam, legacy: legacy && legacy !== fam ? legacy : '', full: (names[4] || {}).s || '', sub, weight: Math.max(100, Math.min(1000, weight)), italic, restricted: (fsType & 0x000F) === 2 };
}
function parseFile(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const sig = readAt(fd, 0, 12).toString('latin1', 0, 4);
    if (sig === 'ttcf') {
      /* a collection: only the first face can be embedded as it is (browsers read face 0) */
      const off = readAt(fd, 12, 4).readUInt32BE(0), f = face(fd, off);
      return f ? [Object.assign(f, { collection: true })] : [];
    }
    const f = face(fd, 0);
    return f ? [f] : [];
  } finally { fs.closeSync(fd); }
}
let memo = null;
function index(cacheFile) {
  if (memo) return memo;
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) {}
  const files = [], fresh = {}, faces = [];
  fontDirs().forEach((d) => walk(d, files, 0));
  for (const f of files) {
    let st; try { st = fs.statSync(f); } catch (e) { continue; }
    const key = st.size + ':' + Math.round(st.mtimeMs);
    let entry = cache[f] && cache[f].key === key ? cache[f] : null;
    if (!entry) { let fc = []; try { fc = parseFile(f); } catch (e) { fc = []; } entry = { key, faces: fc }; }
    fresh[f] = entry;
    entry.faces.forEach((x) => faces.push(Object.assign({ file: f }, x)));
  }
  try { fs.writeFileSync(cacheFile, JSON.stringify(fresh)); } catch (e) {}
  memo = faces;
  return faces;
}
/* the installed file that best matches family + weight + italic */
function find(faces, family, weight, italic) {
  const f = String(family || '').toLowerCase().trim();
  let cands = faces.filter((x) => x.family.toLowerCase() === f);
  const viaLegacy = !cands.length;
  if (viaLegacy) cands = faces.filter((x) => (x.legacy && x.legacy.toLowerCase() === f) || (x.full && x.full.toLowerCase() === f));
  if (!cands.length) return null;
  const w = +weight || 400, it = !!italic;
  cands.sort((a, b) => {
    const sa = (a.italic === it ? 0 : 1000) + Math.abs(a.weight - w) + (a.collection ? 0.5 : 0);
    const sb = (b.italic === it ? 0 : 1000) + Math.abs(b.weight - w) + (b.collection ? 0.5 : 0);
    return sa - sb;
  });
  return cands[0];
}
function reset() { memo = null; }
module.exports = { index, find, reset, parseFile };
