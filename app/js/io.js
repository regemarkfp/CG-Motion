/* CG Motion - files, export, toolbar, shortcuts, start-up */
var N = window.cgNative || null;

var Api = {
  desktop: !!N,
  setDirty: function (d) { if (N) N.setDirty(d); },
  save: function (o) {
    if (N) return N.save(o);
    var a = h('a', { href: URL.createObjectURL(new Blob([o.data], { type: 'application/octet-stream' })), download: o.name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return Promise.resolve(o.name);
  },
  open: function () {
    if (N) return N.open();
    return UI.pickFiles('.cgm,.html,.json,.loo,.gtzip,.psd,.psb,.af,.afphoto,.afdesign,.afpub,.aftemplate,.aep,.comp,.setting', true).then(function (fs) {
      if (!fs.length) return null;
      var gt = fs.filter(function (f) { return /\.gtzip$/i.test(f.name); });
      if (gt.length) return Api.readGt(gt);
      if (/\.(psd|psb|af|afphoto|afdesign|afpub|aftemplate|aep)$/i.test(fs[0].name)) return fs[0].arrayBuffer().then(function (b) { return { path: fs[0].name, bytes: new Uint8Array(b) }; });
      return UI.readFile(fs[0], 'text').then(function (t) { return { path: fs[0].name, data: t }; });
    });
  },
  openGt: function () {
    if (N && N.openGt) return N.openGt();
    return UI.pickFiles('.gtzip', true).then(function (fs) { return fs.length ? Api.readGt(fs) : null; });
  },
  readGt: function (fs) {
    return Promise.all(fs.map(function (f) { return f.arrayBuffer().then(function (b) { return { path: f.name, bytes: new Uint8Array(b) }; }); })).then(function (l) { return { gtzips: l }; });
  },
  readApp: function (rel) {
    if (N) return N.readApp(rel);
    return fetch(rel === 'lottie' ? '../node_modules/lottie-web/build/player/lottie.min.js' : rel).then(function (r) { if (!r.ok) throw new Error('missing ' + rel); return r.text(); });
  },
  openGuide: function () { if (N && N.openGuide) return N.openGuide(); window.open('../docs/CG Motion Guide.pdf', '_blank'); return Promise.resolve({ path: 'browser' }); },
  pickFolder: function () { return N ? N.pickFolder() : Promise.resolve(null); },
  openPath: function (p) { return N && N.openPath ? N.openPath(p) : Promise.reject(new Error('Desktop app only')); },
  writeTo: function (folder, name, data) { return N ? N.writeTo(folder, name, data) : Promise.reject(new Error('Desktop app only')); },
  amcp: function (o) { return N ? N.amcp(o) : Promise.reject(new Error('The live CasparCG connection needs the desktop app.')); }
};

var IO = {};
/* file-safe name; with no argument it is the name of the composition that is open (= the template name) */
IO.safeName = function (n) { return String(n == null ? App.comp().name : n).replace(/[^A-Za-z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'template'; };
IO.confirmLose = function () { return !App.dirty || confirm('You have unsaved changes. Continue and lose them?'); };
IO.newProject = function () { if (IO.confirmLose()) IO.showStart(true); };
IO.parse = function (text) {
  var m = /<script id="cg-project" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
  var p = JSON.parse(m ? m[1] : text);
  if (!p || !p.comps || !p.comps.length) throw new Error('Not a CG Motion project');
  return p;
};
IO.open = function () {
  if (!IO.confirmLose()) return;
  Api.open().then(function (r) {
    if (!r) return;
    if (IO.openOther(r)) return;
    if (Loopic.is(r.data, r.path)) {
      return Loopic.open(r.data, r.path).then(function () { IO.hideStart(); }).catch(function (e) { UI.status('Could not import that Loopic file: ' + e.message, true); });
    }
    try {
      var isProj = /\.cgm$/i.test(r.path);
      App.load(IO.parse(r.data), isProj ? r.path : null);
      if (isProj) IO.addRecent(r.path); IO.hideStart();
      UI.status(isProj ? 'Opened ' + r.path : 'Opened from an exported template. Use Save to keep a project file.');
    } catch (e) { UI.status('Could not open that file: ' + e.message); }
  });
};
/* files that are not CG Motion projects: vMix titles, Photoshop files, and the ones that need exporting first */
IO.openOther = function (r) {
  var path = r.path || '', bytes = function () { return r.bytes || VMix.b64(r.b64); };
  if (r.gtzips || /\.gtzip$/i.test(path)) { IO.openGt(r.gtzips || [r]); return true; }
  if (PSD.is(path)) { PSD.open(bytes(), path).then(function () { IO.hideStart(); }).catch(function (e) { UI.status('Could not import that Photoshop file: ' + e.message, true); }); return true; }
  if (AFI.is(path)) { AFI.open(bytes(), path).then(function () { IO.hideStart(); }).catch(function (e) { UI.status('Could not import that Affinity file: ' + e.message, true); }); return true; }
  var how = {
    aep: ['After Effects', 'After Effects projects cannot be read directly yet. For now: export the composition as a Lottie file with the Bodymovin plugin and add it under Assets > Lottie, or render it as a PNG sequence with alpha and add it under Assets > Sequence. For a still layout, Composition > Save Frame As > Photoshop Layers... gives a .psd you can import here.'],
    comp: ['Fusion', 'Fusion compositions cannot be imported yet. For now: render the composition from Fusion or DaVinci Resolve as a PNG sequence with alpha and add it under Assets > Sequence.'],
    setting: ['Fusion', 'Fusion titles (.setting) cannot be imported yet. For now: render the title from DaVinci Resolve as a PNG sequence with alpha and add it under Assets > Sequence.']
  }[(/\.([a-z0-9]+)$/i.exec(path) || [])[1] ? (/\.([a-z0-9]+)$/i.exec(path)[1]).toLowerCase() : ''];
  if (how) { IO.explain(how[0] + ' file', how[1]); return true; }
  return false;
};
IO.explain = function (title, text) {
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, [h('div', { class: 'modal-title', text: title }), h('p', { text: text }), h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'OK', onclick: close })])]));
  host.appendChild(bg); bg.querySelector('button').focus();
};
IO.importAffinity = function () {
  if (!IO.confirmLose()) return;
  UI.pickFiles('.af,.afphoto,.afdesign,.afpub,.aftemplate').then(function (fs) {
    if (!fs.length) return;
    fs[0].arrayBuffer().then(function (b) { IO.openOther({ path: fs[0].name, bytes: new Uint8Array(b) }); });
  });
};
IO.importPsd = function () {
  if (!IO.confirmLose()) return;
  UI.pickFiles('.psd,.psb').then(function (fs) {
    if (!fs.length) return;
    fs[0].arrayBuffer().then(function (b) { IO.openOther({ path: fs[0].name, bytes: new Uint8Array(b) }); });
  });
};
/* vMix titles: [{path, b64 | bytes}] -> a project with a composition per title */
IO.openGt = function (list) {
  var files = list.map(function (f) { return { name: f.path, bytes: f.bytes || VMix.b64(f.b64) }; });
  return VMix.open(files).then(function () { IO.hideStart(); }).catch(function (e) { UI.status('Could not import those vMix titles: ' + e.message, true); });
};
IO.importGt = function () {
  if (!IO.confirmLose()) return;
  Api.openGt().then(function (r) { if (r && r.gtzips) IO.openGt(r.gtzips); });
};
IO.save = function (as) {
  var data = JSON.stringify(App.project), pr = App.project, done;
  if (!as && !App.path && pr.exportFolder && Api.desktop) done = Api.writeTo(pr.exportFolder, IO.safeName(pr.name) + '.cgm', data);
  else done = Api.save({ name: IO.safeName(pr.name) + '.cgm', path: as ? null : App.path, data: data, kind: 'project' });
  return done.then(function (p) {
    if (!p) return;
    App.path = p;
    App.setDirty(false);
    IO.addRecent(p);
    UI.status('Saved ' + p);
  }).catch(function (e) { UI.status('Save failed: ' + e.message); });
};

/* ---------- recent projects and the start screen ---------- */
IO.recents = function () { try { return JSON.parse(localStorage.getItem('cgm.recents') || '[]'); } catch (e) { return []; } };
IO.addRecent = function (path) {
  if (!path || !/[\\\/]/.test(path)) return;
  var list = IO.recents().filter(function (r) { return r.path !== path; });
  list.unshift({ path: path, name: App.project.name, folder: App.project.exportFolder || '', comps: App.project.comps.length, at: Date.now() });
  try { localStorage.setItem('cgm.recents', JSON.stringify(list.slice(0, 20))); } catch (e) {}
};
/* opens a file by its path: a project, an exported template or a Loopic project */
IO.openFile = function (path) {
  if (!IO.confirmLose()) return;
  return Api.openPath(path).then(function (r) {
    if (IO.openOther(r)) return;
    if (typeof Loopic !== 'undefined' && Loopic.is(r.data, path)) return Loopic.open(r.data, path).then(function () { IO.hideStart(); });
    var isProj = /\.cgm$/i.test(path);
    App.load(IO.parse(r.data), isProj ? path : null);
    if (isProj) IO.addRecent(path);
    IO.hideStart();
    UI.status('Opened ' + path);
  }).catch(function (e) { UI.status('Could not open ' + path + ': ' + e.message, true); });
};
IO.openRecent = function (path) {
  return Api.openPath(path).then(function (r) {
    App.load(IO.parse(r.data), path);
    IO.addRecent(path); IO.hideStart();
    UI.status('Opened ' + path);
  }).catch(function (e) {
    if (confirm('Could not open\n' + path + '\n\nIt may have been moved or deleted. Remove it from the list?')) {
      try { localStorage.setItem('cgm.recents', JSON.stringify(IO.recents().filter(function (r) { return r.path !== path; }))); } catch (e2) {}
      IO.showStart();
    }
  });
};
/* the version shown on the start screen and splash, from package.json (1.0.0 is shown as 1.0) */
IO.version = '';
try { Promise.resolve().then(function () { return Api.readApp('../package.json'); }).then(function (t) { var pj = JSON.parse(t); IO.version = String(pj.version || '').replace(/^(\d+\.\d+)\.0$/, '$1'); var hs = document.querySelector('.start-h .hint'); if (hs && IO.version && hs.textContent.indexOf('Version') < 0) hs.textContent += '  \u00b7  Version ' + IO.version; var sv = document.getElementById('sp-ver'); if (sv) sv.textContent = 'Version ' + IO.version + '  \u00b7  loading'; }).catch(function () {}); } catch (e) {}
/* the tutorial project that comes with the app: every kind of graphic, ready to take apart */
IO.openTutorial = function () {
  if (!IO.confirmLose()) return;
  return Api.readApp('tutorial/CG Motion Tutorial.cgm').then(function (t) {
    var p = IO.parse(t);
    App.load(p, null);
    IO.hideStart();
    UI.status('Tutorial project opened. Each composition is one graphic; click an empty spot in the viewer to read its notes in the Inspector. Save it somewhere of your own to keep changes.', true);
  }).catch(function (e) { UI.status('The tutorial project could not be opened: ' + e.message, true); });
};
IO.showShortcuts = function () {
  var rows = [['Space', 'Play / pause'], [', and .', 'Step a frame (Shift = 10)'], ['J / K', 'Previous / next keyframe'], ['M', 'Stop marker'], ['F9', 'Easy ease'], ['U', 'Show / hide layer properties'],
    ['V T R O', 'Select, Text, Rectangle, Ellipse'], ['Arrows', 'Nudge (Shift = 10)'], ['[ / ]', 'Move layer start / end to the playhead'], ['Alt + [ / ]', 'Trim'], ['Ctrl + [ / ]', 'Layer order'],
    ['Ctrl+C / V / D', 'Copy, paste, duplicate'], ['Ctrl+Shift+C', 'Pre-compose'], ['Ctrl+Shift+D', 'Duplicate the open composition'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+S / O / N / E', 'Save, open, new, export'],
    ['Wheel', 'Zoom the viewer'], ['Tilt wheel or Shift + wheel', 'Scroll the viewer sideways'], ['Space + drag, middle-drag', 'Pan the viewer'], ['H', 'Hand tool: drag to move around'], ['Pinch or Ctrl + wheel', 'Zoom smoothly (trackpad)'], ['Two fingers', 'Move around (View > Trackpad scrolling, or the Hand tool)']];
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var bg = h('div', { class: 'modal-bg', onclick: function (e) { if (e.target === bg) close(); } }, h('div', { class: 'modal wide' }, [
    h('div', { class: 'modal-title', text: 'Keyboard shortcuts' }),
    h('div', { class: 'keys' }, rows.map(function (r) { return h('div', { class: 'key-row' }, [h('code', { text: r[0] }), h('span', { text: r[1] })]); })),
    h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'Close', onclick: close })])
  ]));
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') close(); });
  host.appendChild(bg);
  bg.querySelector('button').focus();
};
IO.hideStart = function () { var s = $('#start'); if (s) s.parentNode.removeChild(s); };
IO.showStart = function (newForm) {
  IO.hideStart();
  var box = h('div', { class: 'start-box' }), bg = h('div', { id: 'start' }, box);
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') IO.hideStart(); });
  function home() {
    box.innerHTML = '';
    var rec = IO.recents();
    box.appendChild(h('div', { class: 'start-h' }, [h('img', { class: 'start-logo', src: 'logo.png', alt: 'RegemarkFP' }), h('div', {}, [h('div', { class: 'start-title', text: 'CG Motion' }), h('div', { class: 'hint', text: 'Templates for CasparCG  ·  by RegemarkFP' + (IO.version ? '  ·  Version ' + IO.version : '') })])]));
    box.appendChild(h('div', { class: 'pbar' }, [
      h('button', { class: 'primary big', text: 'New project', onclick: form }),
      h('button', { class: 'big', text: 'Open project...', title: 'CG Motion projects (.cgm), exported templates (.html), Loopic projects (.loo) and vMix titles (.gtzip)', onclick: function () { IO.open(); } }),
      h('button', { class: 'big', text: 'Import vMix titles...', title: 'Turn vMix GT titles (.gtzip) into CasparCG templates: pick one or several, each becomes a composition', onclick: function () { IO.importGt(); } }),
      h('button', { class: 'big', text: 'Tutorial project', title: 'Open the example project: a lower third, a table, charts, a crawl and more, ready to take apart', onclick: function () { IO.openTutorial(); } }),
      h('span', { class: 'grow' }),
      h('button', { text: 'Close', title: 'Back to the editor', onclick: IO.hideStart })
    ]));
    box.appendChild(h('div', { class: 'ghead', text: 'Recent projects' }));
    if (!rec.length) box.appendChild(h('p', { class: 'hint', text: 'Nothing here yet. Projects you create or open will be listed.' }));
    var list = h('div', { class: 'start-list' });
    rec.forEach(function (r) {
      list.appendChild(h('div', { class: 'start-item', onclick: function (e) { if (e.target.tagName !== 'BUTTON' && IO.confirmLose()) IO.openRecent(r.path); } }, [
        h('div', { class: 'grow' }, [h('div', { class: 'start-name', text: r.name || 'Untitled' }), h('div', { class: 'hint', text: r.path })]),
        h('div', { class: 'hint r', text: (r.comps ? r.comps + ' template' + (r.comps > 1 ? 's' : '') + '  ·  ' : '') + new Date(r.at).toLocaleDateString() }),
        h('button', { text: '×', title: 'Remove from this list (the file is not deleted)', onclick: function () {
          try { localStorage.setItem('cgm.recents', JSON.stringify(IO.recents().filter(function (x) { return x.path !== r.path; }))); } catch (e) {}
          home();
        } })
      ]));
    });
    box.appendChild(list);
  }
  function form() {
    if (!IO.confirmLose()) return;
    box.innerHTML = '';
    function fld(label, type, value, ph) { var i = h('input', { type: type, value: value, placeholder: ph || '' }); return { el: h('div', { class: 'f' }, [h('label', { text: label }), i]), i: i }; }
    var name = fld('Project name', 'text', 'My show'), folder = fld('Project folder', 'text', '', 'where the project and all its templates are saved');
    var first = fld('First template', 'text', 'Template 1'), w = fld('Width', 'number', 1920), hh = fld('Height', 'number', 1080), fps = fld('Frames / second', 'number', 50), secs = fld('Length (seconds)', 'number', 5);
    var err = h('p', { class: 'hint warn' });
    box.appendChild(h('div', { class: 'start-h' }, [h('div', { class: 'start-title', text: 'New project' })]));
    box.appendChild(name.el);
    box.appendChild(h('div', { class: 'f' }, [h('label', { text: 'Project folder' }), folder.i, h('button', { text: 'Browse...', onclick: function () { Api.pickFolder().then(function (f) { if (f) folder.i.value = f; }); } })]));
    box.appendChild(h('p', { class: 'hint', text: 'The project file is kept in this folder and every template is exported into it, named after its composition. Point it at (or inside) your CasparCG template folder to go straight to air.' }));
    box.appendChild(first.el);
    box.appendChild(h('div', { class: 'grid' }, [w.el, hh.el, fps.el, secs.el]));
    box.appendChild(h('p', { class: 'hint', text: 'Use 50 or 25 frames per second for PAL channels (1080i50, 1080p50, 1080p25); 60 or 30 for NTSC.' }));
    box.appendChild(err);
    box.appendChild(h('div', { class: 'pbar' }, [
      h('button', { class: 'primary big', text: 'Create project', onclick: function () {
        var p = App.blankProject(), c = p.comps[0], f = +fps.i.value || 50;
        p.name = name.i.value.trim() || 'Untitled';
        p.exportFolder = folder.i.value.trim();
        if (Api.desktop && !p.exportFolder) { err.textContent = 'Choose a project folder first.'; return; }
        c.name = first.i.value.trim() || 'Template 1';
        c.w = Math.max(1, Math.round(+w.i.value || 1920)); c.h = Math.max(1, Math.round(+hh.i.value || 1080));
        c.fps = f; c.duration = Math.max(1, Math.round((+secs.i.value || 5) * f));
        App.load(p);
        IO.hideStart();
        if (p.exportFolder && Api.desktop) IO.save(false);
      } }),
      h('button', { class: 'big', text: 'Back', onclick: home })
    ]));
    name.i.focus(); name.i.select();
  }
  document.body.appendChild(bg);
  if (newForm) form(); else home();
};

/* The project that goes inside one exported template: only the open composition, the compositions it uses, and their assets. */
IO.exportProject = function (compId) {
  var p = App.project, keep = {}, assets = {}, fonts = {}, allFonts = false, ids = {};
  (function walk(id, d) {
    if (keep[id] || d > 8) return;
    var c = App.comp(id);
    keep[c.id] = 1;
    c.layers.forEach(function (L) { if (L.type === 'comp') walk(L.comp, d + 1); });
  })(compId, 0);
  var comps = p.comps.filter(function (c) { return keep[c.id]; });
  comps.forEach(function (c) { c.layers.forEach(function (L) {
    ids[L.id] = 1;
    if (L.asset && p.assets[L.asset]) assets[L.asset] = p.assets[L.asset];
    if (L.type === 'text' || L.type === 'table' || L.type === 'chart' || L.type === 'crawl') { fonts[L.font] = 1; if (L.split && L.split.on && L.split.font) fonts[L.split.font] = 1; if (L.bind && L.bind.font) allFonts = true; }
    if (L.styles && L.styles.on) (L.styles.segs || []).forEach(function (sg) { if (sg.font) fonts[sg.font] = 1; });
    if (L.type === 'crawl' && L.sepImg && p.assets[L.sepImg]) assets[L.sepImg] = p.assets[L.sepImg];
    if (L.tex && L.tex.on && L.tex.kind === 'image' && p.assets[L.tex.asset]) assets[L.tex.asset] = p.assets[L.tex.asset];
    if (L.tex && L.tex.cgKey) { var tps = p.texPresets || {}; for (var tpn in tps) if (tps[tpn].tex && tps[tpn].tex.kind === 'image' && p.assets[tps[tpn].tex.asset]) assets[tps[tpn].tex.asset] = p.assets[tps[tpn].tex.asset]; }
    if (L.type === 'lottie') allFonts = true;
  }); });
  for (var id in p.assets) if (p.assets[id].type === 'font' && (allFonts || fonts[p.assets[id].family])) assets[id] = p.assets[id];
  var out = {}, k;
  for (k in p) out[k] = p[k];
  out.name = App.comp(compId).name; out.rootComp = compId; out.comps = comps; out.assets = assets;
  out.actions = (p.actions || []).filter(function (a) { return (!a.target || a.target === 'main') ? (!a.comp || a.comp === compId) : !!ids[a.target]; });
  delete out.imported;
  delete out.exportFolder; delete out.caspar;
  return out;
};

/* the fonts a template's text uses, embedded from the fonts installed on this computer (desktop app) */
IO.GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial)$/i;
IO.embedSystemFonts = async function (p) {
  var rep = { embedded: [], missing: [], restricted: [] };
  if (!N || !N.fontFaces) return rep;
  var have = {}, want = {}, k;
  for (k in App.project.assets) if (App.project.assets[k].type === 'font') have[String(App.project.assets[k].family).toLowerCase()] = 1;
  function use(fam, w, it) {
    fam = String(fam || '').trim(); if (!fam || IO.GENERIC.test(fam) || have[fam.toLowerCase()]) return;
    w = Math.round((+w || 400) / 100) * 100; it = !!(it === true || it === 'on');
    want[fam.toLowerCase() + '|' + w + '|' + it] = { family: fam, weight: w, italic: it };
  }
  p.comps.forEach(function (c) { c.layers.forEach(function (L) {
    if (!/^(text|table|chart|crawl)$/.test(L.type)) return;
    var f = L.font || 'Arial', w = L.weight || 400;
    use(f, w, L.italic);
    if (L.type !== 'text') use(f, 700, false);
    if (L.split && L.split.on) use(L.split.font || f, L.split.weight || w, L.split.italic);
    if (L.styles && L.styles.on) (L.styles.segs || []).forEach(function (sg) { use(sg.font || f, sg.weight || w, sg.italic === 'off' ? false : (sg.italic || L.italic)); });
  }); });
  var list = Object.keys(want).map(function (x) { return want[x]; });
  if (!list.length) return rep;
  var got = await N.fontFaces(list), files = {};
  got.forEach(function (g) {
    var label = g.family + (g.weight && g.weight !== 400 ? ' ' + g.weight : '') + (g.italic ? ' italic' : '');
    if (g.missing) { rep.missing.push(label); return; }
    if (g.restricted) { rep.restricted.push(label); return; }
    var id = 'sysfont_' + (g.family + '_' + (g.exact ? g.faceWeight + (g.faceItalic ? 'i' : '') : g.file)).replace(/[^A-Za-z0-9_]/g, '_');
    if (files[id]) return; files[id] = 1;
    p.assets[id] = { id: id, type: 'font', name: g.file, family: g.family, src: g.src, weight: g.exact ? g.faceWeight : undefined, italic: g.exact ? g.faceItalic : undefined, embedded: true };
    rep.embedded.push(label);
  });
  return rep;
};
IO.fontNote = function (r) {
  if (!r) return '';
  var s = [];
  if (r.embedded.length) s.push('fonts embedded: ' + r.embedded.join(', '));
  if (r.missing.length) s.push('not installed on this PC (add them under Assets > Fonts): ' + r.missing.join(', '));
  if (r.restricted.length) s.push('licence does not allow embedding: ' + r.restricted.join(', '));
  return s.length ? '  -  ' + s.join('; ') : '';
};
IO.buildHTML = async function (compId) {
  var p = IO.exportProject(compId || App.compId), root = App.comp(p.rootComp), usesLottie = false;
  try { IO.lastFonts = await IO.embedSystemFonts(p); } catch (e) { IO.lastFonts = null; }
  p.comps.forEach(function (c) { c.layers.forEach(function (L) { if (L.type === 'lottie') usesLottie = true; }); });
  var rt = await Api.readApp('runtime.js'), lot = '';
  if (usesLottie) {
    try { lot = await Api.readApp('lottie'); }
    catch (e) { throw new Error('This project uses Lottie but the Lottie player was not found. Run the installer (npm install) once.'); }
  }
  function safe(s) { return s.replace(/<\/script/gi, '<\\/script'); }
  var json = JSON.stringify(p).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
  var fields = Panels.fieldList().map(function (f) { return f.key; }).join(', ') || '(none)';
  var acts = (p.actions || []).map(function (a) { return a.name; }).filter(function (n, i, arr) { return arr.indexOf(n) === i; }).join(', ') || '(none)';
  var boot = '(function(){var project=JSON.parse(document.getElementById("cg-project").textContent);' +
    'CGRuntime.installFonts(project,document);' +
    'var player=new CGRuntime.Player(project,document.getElementById("stage"),{live:true});' +
    'CGRuntime.bindCaspar(player,window);window.cgPlayer=player;' +
    'if(/preview/.test(location.hash)){document.documentElement.style.background="#2b2b2b";' +
    'document.addEventListener("keydown",function(e){var k=(e.key||"").toLowerCase();if(k==="p")play();if(k==="n")next();if(k==="s")stop();});' +
    'setTimeout(function(){play();},300);}})();';
  return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>' + esc(p.name) + '</title>\n' +
    '<!--\n  CasparCG HTML template made with CG Motion. Open this file in CG Motion to edit it.\n' +
    '  Size: ' + root.w + 'x' + root.h + ' @ ' + root.fps + ' fps\n' +
    '  Data fields: ' + fields.replace(/--/g, '- -') + '\n  Invokes: ' + acts.replace(/--/g, '- -') + '\n' +
    '  Browser test: add #preview to the address, then P = play, N = next, S = stop.\n-->\n' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;}#stage{position:absolute;left:0;top:0;}</style>\n' +
    '</head>\n<body>\n<div id="stage"></div>\n' +
    '<script id="cg-project" type="application/json">' + json + '</script>\n' +
    (lot ? '<script>' + safe(lot) + '</script>\n' : '') +
    '<script>' + safe(rt) + '</script>\n<script>' + boot + '</script>\n</body>\n</html>\n';
};
/* the template(s) a composition belongs to: itself when nothing uses it, otherwise every top-level composition that contains it */
IO.templatesFor = function (id) {
  id = id || App.compId;
  var roots = IO.templateIds();
  if (roots.indexOf(id) >= 0) return [id];
  var out = roots.filter(function (r) {
    var seen = {};
    return (function has(c, d) {
      if (c === id) return true;
      if (seen[c] || d > 8) return false; seen[c] = 1;
      return App.comp(c).layers.some(function (L) { return L.type === 'comp' && has(L.comp, d + 1); });
    })(r, 0);
  });
  return out.length ? out : [id];
};
/* run fn with another composition counted as the open one (names, fields and invokes follow it) */
IO.asComp = function (id, fn) { var keep = App.compId; App.compId = id; try { return fn(); } finally { App.compId = keep; } };
IO.writeTemplate = function (id, folder) {
  var name = IO.asComp(id, function () { return IO.safeName(); }) + '.html';
  return IO.buildHTMLFor(id).then(function (html) {
    var done = (folder && Api.desktop) ? Api.writeTo(folder, name, html) : Api.save({ name: name, path: null, data: html, kind: 'template' });
    return done.then(function (p) { return p ? { path: p, name: App.comp(id).name, mb: html.length / 1048576 } : null; });
  });
};
/* Export template: the template the open composition belongs to (a pre-comp exports the template(s) using it) */
IO.exportTemplate = function (onlyThis) {
  var folder = App.project.exportFolder, open = App.comp(), ids = onlyThis ? [open.id] : IO.templatesFor(open.id), done = [];
  return ids.reduce(function (pr, id) { return pr.then(function () { return IO.writeTemplate(id, folder).then(function (r) { if (r) done.push(r); }); }); }, Promise.resolve()).then(function () {
    if (!done.length) return null;
    var via = ids.length && ids[0] !== open.id ? '"' + open.name + '" is part of ' + done.map(function (r) { return '"' + r.name + '"'; }).join(', ') + ', so that was exported: ' : '';
    UI.status(via + (done.length === 1 ? 'exported "' + done[0].name + '" to ' + done[0].path + '  (' + done[0].mb.toFixed(2) + ' MB)' : 'exported ' + done.map(function (r) { return r.path; }).join(', ')) + IO.fontNote(IO.lastFonts));
    return done.length === 1 ? done[0].path : done.map(function (r) { return r.path; });
  }).catch(function (e) { UI.status('Export failed: ' + e.message, true); });
};
/* The variables of the open template as CSV: one row per field, plus one row per invoke. */
IO.buildCSV = function () {
  var c = App.comp(), tpl = IO.safeName(), rows = [['Template', 'Kind', 'Name', 'Type', 'Default', 'Description', 'Copy']];
  var TYPES = { text: 'text', image: 'image', colour: 'colour', number: 'number', toggle: 'toggle', 'lottie text': 'text', value: 'text' };
  Panels.fieldList().forEach(function (f) {
    rows.push([tpl, 'field', f.key, TYPES[f.kind] || 'text', f.def == null ? '' : f.def, f.hint || '', f.copy == null ? '' : f.copy]);
  });
  var ids = {};
  IO.exportProject(c.id).comps.forEach(function (k) { k.layers.forEach(function (L) { ids[L.id] = L.name; }); });
  var listed = {};
  IO.exportProject(c.id).actions.forEach(function (a) {
    if (listed[a.name]) return;
    listed[a.name] = 1;
    rows.push([tpl, 'invoke', a.name, 'invoke', '', (a.target && a.target !== 'main' ? ids[a.target] : 'Main timeline') + ' frames ' + a.from + '-' + a.to, '']);
  });
  function cell(v) { v = String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  return '\uFEFF' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
};
IO.exportCSV = function () {
  var folder = App.project.exportFolder, name = IO.safeName() + '.csv', csv = IO.buildCSV();
  var done = (folder && Api.desktop) ? Api.writeTo(folder, name, csv) : Api.save({ name: name, path: null, data: csv, kind: 'csv' });
  return done.then(function (p) { if (p) UI.status('Variables exported to ' + p); return p; }).catch(function (e) { UI.status('CSV export failed: ' + e.message, true); });
};
/* ================= variables sheet (PDF): every template's fields and invokes, with a still frame ================= */
/* templates = compositions that are not used inside another composition */
IO.templateIds = function () {
  var used = {}, cs = App.project.comps;
  cs.forEach(function (c) { c.layers.forEach(function (L) { if (L.type === 'comp') used[L.comp] = 1; }); });
  var roots = cs.filter(function (c) { return !used[c.id]; });
  return (roots.length ? roots : cs).map(function (c) { return c.id; });
};
/* the hold point: the first stop marker, or the middle of the timeline */
IO.holdFrame = function (c) {
  var m = (c.markers || []).map(function (x) { return typeof x === 'number' ? x : x.t; }).filter(function (t) { return t > 0; }).sort(function (a, b) { return a - b; });
  return m.length ? Math.max(0, Math.min(c.duration - 1, m[0])) : Math.round((c.duration - 1) / 2);
};
IO.templateInfo = function (id) {
  var keep = App.compId; App.compId = id;
  try {
    var c = App.comp(id), p = IO.exportProject(id), names = {};
    p.comps.forEach(function (k) { k.layers.forEach(function (L) { names[L.id] = L.name; }); });
    var cas = App.project.caspar || { channel: 1, layer: 20 }, seen = {};
    var invokes = (p.actions || []).filter(function (a) { if (seen[a.name]) return false; seen[a.name] = 1; return true; }).map(function (a) {
      return { name: a.name, plays: a.target && a.target !== 'main' ? (names[a.target] || 'a composition layer') : 'Main timeline', from: a.from, to: a.to, loop: a.loop || '',
        cmd: 'CG ' + cas.channel + '-' + cas.layer + ' INVOKE 1 "' + a.name + '"' };
    });
    var fields = Panels.fieldList();
    var data = {}; fields.forEach(function (f) { if (!f.cell) data[f.key] = f.def == null ? '' : String(f.def); });
    return { id: id, name: c.name, file: IO.safeName(c.name), w: c.w, h: c.h, fps: c.fps, duration: c.duration, frame: IO.holdFrame(c), fields: fields, invokes: invokes,
      markers: (c.markers || []).length, add: 'CG ' + cas.channel + '-' + cas.layer + ' ADD 1 "' + IO.safeName(c.name) + '" 1 "' + JSON.stringify(data).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' };
  } finally { App.compId = keep; }
};
IO.buildHTMLFor = function (id) { var keep = App.compId; App.compId = id; return IO.buildHTML(id).then(function (h) { App.compId = keep; return h; }, function (e) { App.compId = keep; throw e; }); };
/* a still frame of a template as CasparCG shows it: desktop renders the exported template off screen */
IO.still = function (t) {
  if (!N || !N.snapshot) return Promise.resolve(null);
  return IO.buildHTMLFor(t.id).then(function (html) { return N.snapshot({ html: html, w: t.w, h: t.h, frame: t.frame }); }).catch(function () { return null; });
};
IO.sheetHTML = function (list, opts) {
  opts = opts || {};
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var TYPES = { text: 'Text', image: 'Picture', colour: 'Colour', number: 'Number', toggle: 'On / off', 'lottie text': 'Text', value: 'Value' };
  var p = App.project, cas = p.caspar || {}, date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  var totF = 0, totI = 0; list.forEach(function (t) { totF += t.fields.length; totI += t.invokes.length; });
  var css = '@page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}body{margin:0;font:9.5pt/1.45 "Segoe UI",Inter,Arial,sans-serif;color:#1d2125;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.cover{display:flex;align-items:center;gap:14px;padding:0 0 10px;border-bottom:3px solid #00c26a;margin-bottom:12px}.cover img{height:46px}.cover h1{margin:0;font-size:20pt;letter-spacing:-.3px}.cover .sub{color:#5b6670;font-size:9pt}' +
    '.summary{display:flex;gap:8px;margin:0 0 14px}.summary div{flex:1;background:#f3f6f8;border-radius:6px;padding:7px 10px}.summary b{display:block;font-size:14pt}.summary span{color:#5b6670;font-size:8pt}' +
    '.toc{columns:2;margin:0 0 16px;padding:0;list-style:none;font-size:9pt}.toc li{padding:1px 0}.toc b{color:#00a85c}' +
    '.tpl{break-before:page}.tpl.first{break-before:auto}.th{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #00c26a;padding-bottom:4px;margin-bottom:8px}.th h2{margin:0;font-size:15pt}.th .meta{color:#5b6670;font-size:8.5pt}' +
    '.frame{position:relative;border-radius:6px;overflow:hidden;margin:0 0 10px;background:#25282b;background-image:linear-gradient(45deg,#2c3034 25%,transparent 25%,transparent 75%,#2c3034 75%),linear-gradient(45deg,#2c3034 25%,transparent 25%,transparent 75%,#2c3034 75%);background-size:16px 16px;background-position:0 0,8px 8px}' +
    '.frame img,.frame iframe{display:block;width:100%;border:0}.frame .tag{position:absolute;right:8px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;font-size:7.5pt;padding:2px 6px;border-radius:3px}.noframe{padding:28px;text-align:center;color:#9aa4ad}' +
    'h3{font-size:10.5pt;margin:12px 0 5px;color:#0b7a46}table{width:100%;border-collapse:collapse;font-size:8.6pt;break-inside:auto}tr{break-inside:avoid}th{text-align:left;background:#e9f9f0;color:#0b5c36;font-weight:600;padding:4px 6px;border-bottom:1px solid #b9e6cd}' +
    'td{padding:4px 6px;border-bottom:1px solid #e3e8ec;vertical-align:top}td.k{font-family:Consolas,"Courier New",monospace;font-weight:600;white-space:nowrap}td.d{color:#3b444c;max-width:60mm;word-break:break-word}.sw{display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid #0003;vertical-align:-1px;margin-right:4px}' +
    'code,.cmd{font-family:Consolas,"Courier New",monospace;font-size:8pt}.cmd{display:block;background:#f3f6f8;border-radius:4px;padding:6px 8px;word-break:break-all;white-space:pre-wrap}.none{color:#8a949c;font-style:italic}.cell td{color:#5b6670}.foot{margin-top:10px;color:#8a949c;font-size:7.5pt}';
  var out = ['<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + e(p.name) + ' - variables</title><style>' + css + '</style></head><body>'];
  out.push('<div class="cover">' + (opts.logo ? '<img src="' + opts.logo + '">' : '') + '<div><h1>' + e(p.name || 'CG Motion project') + '</h1><div class="sub">Template variables and invokes &middot; ' + e(date) + ' &middot; CasparCG ' + e((cas.channel || 1) + '-' + (cas.layer || 20)) + '</div></div></div>');
  out.push('<div class="summary"><div><b>' + list.length + '</b><span>template' + (list.length === 1 ? '' : 's') + '</span></div><div><b>' + totF + '</b><span>fields</span></div><div><b>' + totI + '</b><span>invokes</span></div></div>');
  if (list.length > 1) out.push('<ul class="toc">' + list.map(function (t, i) { return '<li><b>' + (i + 1) + '</b> ' + e(t.name) + ' <span style="color:#8a949c">(' + t.fields.filter(function (f) { return !f.cell; }).length + ' fields, ' + t.invokes.length + ' invokes)</span></li>'; }).join('') + '</ul>');
  list.forEach(function (t, i) {
    out.push('<section class="tpl' + (i === 0 ? ' first' : '') + '"><div class="th"><h2>' + e(t.name) + '</h2><span class="meta">' + e(t.file) + '.html &middot; ' + t.w + '&times;' + t.h + ' &middot; ' + t.fps + ' fps &middot; ' + (Math.round(t.duration / t.fps * 10) / 10) + ' s</span></div>');
    if (t.still) out.push('<div class="frame"><img src="' + t.still + '"><span class="tag">frame ' + t.frame + '</span></div>');
    else if (opts.live && t.html) out.push('<div class="frame" style="aspect-ratio:' + t.w + '/' + t.h + '"><iframe data-frame="' + t.frame + '" style="width:' + t.w + 'px;height:' + t.h + 'px;transform-origin:0 0" srcdoc="' + e(t.html) + '"></iframe><span class="tag">frame ' + t.frame + '</span></div>');
    else out.push('<div class="frame noframe">No preview</div>');
    var main = t.fields.filter(function (f) { return !f.cell; }), cells = t.fields.filter(function (f) { return f.cell; });
    out.push('<h3>Fields (' + main.length + ')</h3>');
    if (main.length) {
      out.push('<table><tr><th>Field</th><th>Type</th><th>Default</th><th>What it is</th></tr>');
      main.forEach(function (f) {
        var def = f.def == null ? '' : String(f.def), sw = f.kind === 'colour' && /^#/.test(def) ? '<span class="sw" style="background:' + e(def) + '"></span>' : '';
        out.push('<tr><td class="k">' + e(f.key) + '</td><td>' + e(TYPES[f.kind] || 'Text') + '</td><td class="d">' + sw + (def ? e(def.length > 140 ? def.slice(0, 140) + '...' : def).replace(/\n/g, '<br>') : '<span class="none">empty</span>') + '</td><td class="d">' + e(f.hint || '') + (f.copy != null ? ' (copy ' + e(f.copy) + ')' : '') + '</td></tr>');
      });
      out.push('</table>');
    } else out.push('<p class="none">This template has no fields.</p>');
    if (cells.length) {
      out.push('<h3>Cell fields (' + cells.length + ')</h3><table class="cell"><tr><th>Field</th><th>Type</th><th>Default</th><th>What it is</th></tr>');
      cells.forEach(function (f) { out.push('<tr><td class="k">' + e(f.key) + '</td><td>' + e(TYPES[f.kind] || 'Text') + '</td><td class="d">' + e(f.def == null ? '' : f.def) + '</td><td class="d">' + e(f.hint || '') + '</td></tr>'); });
      out.push('</table>');
    }
    out.push('<h3>Invokes (' + t.invokes.length + ')</h3>');
    if (t.invokes.length) {
      out.push('<table><tr><th>Invoke</th><th>Plays</th><th>Frames</th><th>CasparCG command</th></tr>');
      t.invokes.forEach(function (a) { out.push('<tr><td class="k">' + e(a.name) + '</td><td>' + e(a.plays) + '</td><td>' + e(a.from) + '&ndash;' + e(a.to) + (a.loop ? ' (' + e(a.loop === 'pingpong' ? 'back and forth' : 'loops') + ')' : '') + '</td><td><code>' + e(a.cmd) + '</code></td></tr>'); });
      out.push('</table>');
    } else out.push('<p class="none">No invokes.</p>');
    out.push('<h3>Load it with its default data</h3><div class="cmd">' + e(t.add) + '</div>');
    out.push('<p class="foot">Then CG ' + e((cas.channel || 1) + '-' + (cas.layer || 20)) + ' NEXT plays on from a stop marker, and STOP plays it out' + (t.markers ? '' : ' (this template has no stop marker)') + '. UPDATE sends new field data.</p></section>');
  });
  out.push('</body></html>');
  return out.join('');
};
IO.exportVariablesPDF = function () {
  var ids = IO.templateIds(), list = ids.map(IO.templateInfo);
  var name = IO.safeName(App.project.name || 'CG Motion') + ' - variables.pdf';
  UI.status('Making the variables sheet (' + list.length + ' template' + (list.length === 1 ? '' : 's') + ')...', true);
  var logo = fetch('logo.png').then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }); }).catch(function () { return null; });
  if (!N || !N.savePdf) {
    /* browser: a print window with live frames; choose "Save as PDF" */
    return Promise.all([logo].concat(list.map(function (t) { return IO.buildHTMLFor(t.id).then(function (h) { t.html = h; }); }))).then(function (r) {
      var html = IO.sheetHTML(list, { logo: r[0], live: true }), w = window.open('', '_blank');
      if (!w) { UI.status('Allow pop-ups to make the variables sheet.', true); return null; }
      w.document.open(); w.document.write(html); w.document.close();
      w.addEventListener('load', function () {
        w.document.querySelectorAll('iframe[data-frame]').forEach(function (f) {
          var fit = function () { f.style.transform = 'scale(' + (f.parentNode.clientWidth / parseFloat(f.style.width)) + ')'; }; fit();
          f.addEventListener('load', function () { try { f.contentWindow.gotoFrame(+f.dataset.frame); } catch (er) {} });
        });
        setTimeout(function () { w.focus(); w.print(); }, 1200);
      });
      UI.status('Variables sheet opened: choose "Save as PDF" in the print dialog.');
      return w;
    });
  }
  return logo.then(function (lg) {
    return list.reduce(function (pr, t) { return pr.then(function () { return IO.still(t).then(function (s) { t.still = s; }); }); }, Promise.resolve()).then(function () {
      var html = IO.sheetHTML(list, { logo: lg });
      return N.savePdf({ html: html, name: name, folder: App.project.exportFolder || '' });
    });
  }).then(function (p) { if (p) UI.status('Variables sheet saved: ' + p); return p; }).catch(function (e) { UI.status('Could not make the variables sheet: ' + e.message, true); });
};
/* CasparCG panel: writes the template the open composition belongs to */
IO.exportTo = function (folder) {
  var id = IO.templatesFor(App.compId)[0];
  return IO.writeTemplate(id, folder).then(function (r) { if (r) UI.status('Exported ' + r.path + IO.fontNote(IO.lastFonts)); return r && r.path; });
};

/* ================= toolbar, shortcuts, start ================= */
var Main = {};
Main.setTool = function (t) {
  App.tool = t;
  UI.docs.forEach(function (d) { d.body.classList.remove('tool-select', 'tool-text', 'tool-rect', 'tool-ellipse', 'tool-hand'); d.body.classList.add('tool-' + t); });
  $$('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
};
Main.del = function () {
  if (App.selKeys.length) {
    App.comp().layers.forEach(function (L) {
      for (var n in L.a) {
        var last = L.a[n][L.a[n].length - 1];
        L.a[n] = L.a[n].filter(function (k) { return App.selKeys.indexOf(k) < 0; });
        if (!L.a[n].length) { delete L.a[n]; L.p[n] = last.v; }
      }
    });
    App.selKeys = [];
    App.commit(); App.emit('sel');
  } else if (App.sel.length) { App.deleteLayers(App.sel.slice()); App.commit(); App.emit('sel'); }
};
Main.cmds = {
  csv: function () { IO.exportCSV(); }, varsPdf: function () { IO.exportVariablesPDF(); }, tutorial: function () { IO.openTutorial(); }, importGt: function () { IO.importGt(); }, importPsd: function () { IO.importPsd(); }, importAffinity: function () { IO.importAffinity(); }, guide: function () { Api.openGuide().then(function (r) { UI.status(r && r.error ? r.error : 'Opened the guide.', !!(r && r.error)); }); }, shortcuts: function () { IO.showShortcuts(); }, optimise: function () { Panels.optimiseAll(); }, copy: function () { App.copy(); }, paste: function () { App.paste(); },
  selall: function () { App.sel = App.comp().layers.map(function (L) { return L.id; }); App.emit('sel'); },
  up: function () { App.moveLayers(-1); }, down: function () { App.moveLayers(1); },
  toolText: function () { Main.setTool('text'); }, toolRect: function () { Main.setTool('rect'); }, toolEllipse: function () { Main.setTool('ellipse'); }, toolHand: function () { Main.setTool(App.tool === 'hand' ? 'select' : 'hand'); },
  trackT: function () { App.ui.trackpad = !App.ui.trackpad; try { localStorage.setItem('cgm.trackpad', App.ui.trackpad ? '1' : ''); } catch (e) {} UI.status(App.ui.trackpad ? 'Trackpad scrolling: two fingers move the view, pinch zooms.' : 'Mouse wheel: the wheel zooms, Shift + wheel moves sideways.'); },
  guidesT: function () { App.ui.guides = !App.ui.guides; $('#guides').checked = App.ui.guides; Stage.drawOverlay(); },
  snapT: function () { App.ui.snap = App.ui.snap === false; $('#snap').checked = App.ui.snap; },
  resetLayout: function () { Dock.reset(); },
  'new': IO.newProject, projects: function () { IO.showStart(); }, open: IO.open, save: function () { IO.save(false); }, saveas: function () { IO.save(true); }, 'export': function () { IO.exportTemplate(); }, exportOnly: function () { IO.exportTemplate(true); },
  undo: App.undo, redo: App.redo, dup: App.duplicate, dupComp: function () { Panels.duplicateComp(App.compId); }, precomp: App.precompose, del: Main.del,
  'null': function () { App.addLayer('null'); },
  table: function () { App.addLayer('table'); }, chart: function () { App.addLayer('chart'); }, crawl: function () { App.addLayer('crawl'); },
  repeat: function () {
    var sel = App.selLayers(), c = App.comp();
    if (!sel.length) { UI.status('Select the layers that make up one row (or one column) first.'); return; }
    function setup(CL, gap) { CL.rep = { on: true, n: 5, dir: 'v', gap: gap, stagger: 0, first: 1, countKey: '' }; App.sel = [CL.id]; App.commit(); App.emit('sel'); UI.status('Repeater made. Set copies, direction and spacing under "Composition layer" in the inspector.'); }
    if (sel.length === 1 && sel[0].type === 'comp') { setup(sel[0], (sel[0].rep && sel[0].rep.gap) || 100); return; }
    var y0 = Infinity, y1 = -Infinity;
    sel.forEach(function (L) { var it = Stage.item(L.id); if (!it) return; var b = Stage.bbox(it); y0 = Math.min(y0, b[1]); y1 = Math.max(y1, b[3]); });
    var gap = isFinite(y0) ? Math.round(y1 - y0 + 10) : 100, p = App.precompose();
    if (p) p.then(function (CL) { if (CL) setup(CL, gap); });
  },
  slot: function () { App.addLayer('image', { name: 'Image slot', asset: '', key: Inspector.nextKey(), fit: 'contain', prefix: '', suffix: '', p: { w: 300, h: 300, ax: 150, ay: 150 } }); },
  fit: function () { Stage.fit(); },
  nodes: function () { Nodes.toggle(); },
  z100: function () { var r = Stage.wrap.getBoundingClientRect(), c = App.comp(); Stage.fitMode = false; Stage.zoom = 1; Stage.panX = (r.width - c.w) / 2; Stage.panY = (r.height - c.h) / 2; Stage.layout(); },
  home: function () { App.setTime(0); }, end: function () { App.setTime(App.comp().duration - 1); },
  prevf: function () { App.setTime(App.time - 1); }, nextf: function () { App.setTime(App.time + 1); },
  play: function () { if (App.liveMode) App.setTime(App.time); App.togglePlay(); },
  prevk: function () { Timeline.jumpKey(-1); }, nextk: function () { Timeline.jumpKey(1); },
  marker: function () { Timeline.addMarker(); },
  loop: function () { Timeline.addLoop(); },
  ease: function () { App.applyEase({ type: 'preset', id: 'e_ease' }); }
};

Main.key = function (e) {
  var tag = e.target.tagName, typing = /INPUT|TEXTAREA|SELECT/.test(tag) && !(tag === 'INPUT' && /checkbox|range|color/.test(e.target.type));
  var k = e.key, ctrl = e.ctrlKey || e.metaKey, C = Main.cmds;
  if ($('.modal-bg')) return;
  if (ctrl) {
    var lk = k.toLowerCase();
    if (lk === 's') { e.preventDefault(); IO.save(e.shiftKey); return; }
    if (lk === 'o') { e.preventDefault(); IO.open(); return; }
    if (lk === 'n') { e.preventDefault(); IO.newProject(); return; }
    if (lk === 'e') { e.preventDefault(); IO.exportTemplate(); return; }
    if (typing) return;
    if (lk === 'z') { e.preventDefault(); if (e.shiftKey) App.redo(); else App.undo(); }
    else if (lk === 'y') { e.preventDefault(); App.redo(); }
    else if (lk === 'd') { e.preventDefault(); if (e.shiftKey) Panels.duplicateComp(App.compId); else App.duplicate(); }
    else if (lk === 'c') { if (e.shiftKey) { e.preventDefault(); App.precompose(); } else App.copy(); }
    else if (lk === 'v') { e.preventDefault(); App.paste(); }
    else if (lk === 'a') { e.preventDefault(); App.sel = App.comp().layers.map(function (L) { return L.id; }); App.emit('sel'); }
    else if (k === '[') { e.preventDefault(); App.moveLayers(1); }
    else if (k === ']') { e.preventDefault(); App.moveLayers(-1); }
    return;
  }
  if (typing) { if (k === 'Escape') e.target.blur(); return; }
  var step = e.shiftKey ? 10 : 1;
  switch (k) {
    case ' ': e.preventDefault(); if (!e.repeat) { Stage.space = true; Main.spaceAt = Date.now(); } break;
    case 'Delete': case 'Backspace': e.preventDefault(); Main.del(); break;
    case 'ArrowLeft': e.preventDefault(); Stage.nudge(-step, 0); break;
    case 'ArrowRight': e.preventDefault(); Stage.nudge(step, 0); break;
    case 'ArrowUp': e.preventDefault(); Stage.nudge(0, -step); break;
    case 'ArrowDown': e.preventDefault(); Stage.nudge(0, step); break;
    case 'Home': C.home(); break;
    case 'End': C.end(); break;
    case ',': case 'PageUp': e.preventDefault(); App.setTime(App.time - step); break;
    case '.': case 'PageDown': e.preventDefault(); App.setTime(App.time + step); break;
    case 'j': case 'J': C.prevk(); break;
    case 'k': case 'K': C.nextk(); break;
    case 'm': case 'M': C.marker(); break;
    case 'F9': e.preventDefault(); C.ease(); break;
    case 'F1': e.preventDefault(); C.guide(); break;
    case 'v': case 'V': Main.setTool('select'); break;
    case 't': case 'T': Main.setTool('text'); break;
    case 'r': case 'R': Main.setTool('rect'); break;
    case 'o': case 'O': Main.setTool('ellipse'); break;
    case 'h': case 'H': Main.setTool('hand'); break;
    case 'u': case 'U':
      var ls = App.selLayers(), open = ls.some(function (L) { return !App.ui.expanded[L.id]; });
      ls.forEach(function (L) { App.ui.expanded[L.id] = open; });
      Timeline.build(); break;
    case '[': case ']':
      App.selLayers().forEach(function (L) {
        var t = Math.round(App.time);
        if (e.altKey) { if (k === '[') L.start = Math.min(t, L.end - 1); else L.end = Math.max(t + 1, L.start + 1); }
        else {
          var d = k === '[' ? t - L.start : t + 1 - L.end;
          L.start += d; L.end += d;
          for (var n in L.a) L.a[n].forEach(function (q) { q.t += d; });
        }
      });
      App.commit(); break;
    case 'Escape': Main.setTool('select'); App.selKeys = []; App.emit('sel'); break;
  }
};

Main.keyUp = function (e) {
  if (e.key !== ' ' || !Stage.space) return;
  Stage.space = false;
  if (Date.now() - Main.spaceAt < 350 && !Main.panned) Main.cmds.play();
  Main.panned = false;
};
Main.init = function () {
  document.querySelectorAll('[data-cmd]').forEach(function (b) {
    b.addEventListener('click', function () { var f = Main.cmds[b.dataset.cmd]; if (f) f(); b.blur(); });
  });
  document.querySelectorAll('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { Main.setTool(b.dataset.tool); b.blur(); }); });
  $('#guides').addEventListener('change', function () { App.ui.guides = this.checked; Stage.drawOverlay(); this.blur(); });
  $('#snap').addEventListener('change', function () { App.ui.snap = this.checked; this.blur(); });
  UI.addDoc(document);
  window.addEventListener('unload', function () { Dock.closeFloats(); });
  window.addEventListener('beforeunload', function (e) { if (!N && App.dirty && !window.__test) { e.preventDefault(); e.returnValue = ''; } });
  try { App.ui.trackpad = localStorage.getItem('cgm.trackpad') === '1'; } catch (e1) {}
  try { var cu = JSON.parse(localStorage.getItem('cgm.ui') || '{}'); App.ui.collapsed = cu.collapsed || {}; } catch (e0) { App.ui.collapsed = {}; }
  Dock.init(); Menu.init();
  Stage.init(); Timeline.init(); Inspector.init(); Panels.init(); Nodes.init();
  Stage.wrap.addEventListener('contextmenu', function (e) { Menu.layer(e, Stage.hit(Stage.toComp(e))); });
  Timeline.left.addEventListener('contextmenu', function (e) { var row = e.target.closest('.tl-row'); Menu.layer(e, row ? App.layer(row.dataset.id) : null); });
  Main.setTool('select');
  if (N && N.onOpenFile) N.onOpenFile(function (p) { IO.openFile(p); });
  App.load(App.blankProject());
  if (!window.__test) IO.showStart();
  /* the splash with the RegemarkFP logo stays up a moment, then fades into the start screen */
  var sp = document.getElementById('splash');
  if (sp) {
    if (window.__test || N) sp.parentNode.removeChild(sp);
    else setTimeout(function () { sp.classList.add('out'); setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 500); }, Math.max(300, 1600 - performance.now()));
  }
  if (window.__noLottie || !window.lottie) UI.status('Lottie player not installed yet - everything else works. Run the installer once to enable Lottie layers.');
  window.__booted = true;
  if (N && N.booted) N.booted();
};
window.addEventListener('DOMContentLoaded', Main.init);
