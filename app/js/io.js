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
    return UI.pickFiles('.cgm,.html,.json,.loo').then(function (fs) {
      if (!fs.length) return null;
      return UI.readFile(fs[0], 'text').then(function (t) { return { path: fs[0].name, data: t }; });
    });
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
    ['Ctrl+C / V / D', 'Copy, paste, duplicate'], ['Ctrl+Shift+C', 'Pre-compose'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+S / O / N / E', 'Save, open, new, export'],
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
      h('button', { class: 'big', text: 'Open project...', title: 'CG Motion projects (.cgm), exported templates (.html) and Loopic projects (.loo)', onclick: function () { IO.open(); } }),
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

IO.buildHTML = async function (compId) {
  var p = IO.exportProject(compId || App.compId), root = App.comp(p.rootComp), usesLottie = false;
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
IO.exportTemplate = function () {
  var folder = App.project.exportFolder, name = IO.safeName() + '.html';
  return IO.buildHTML().then(function (html) {
    var done = (folder && Api.desktop) ? Api.writeTo(folder, name, html) : Api.save({ name: name, path: null, data: html, kind: 'template' });
    return done.then(function (p) { if (p) UI.status('Exported "' + App.comp().name + '" to ' + p + '  (' + (html.length / 1048576).toFixed(2) + ' MB)'); return p; });
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
IO.exportTo = function (folder) {
  return IO.buildHTML().then(function (html) { return Api.writeTo(folder, IO.safeName() + '.html', html); }).then(function (p) { UI.status('Exported ' + p); return p; });
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
  csv: function () { IO.exportCSV(); }, tutorial: function () { IO.openTutorial(); }, guide: function () { Api.openGuide().then(function (r) { UI.status(r && r.error ? r.error : 'Opened the guide.', !!(r && r.error)); }); }, shortcuts: function () { IO.showShortcuts(); }, optimise: function () { Panels.optimiseAll(); }, copy: function () { App.copy(); }, paste: function () { App.paste(); },
  selall: function () { App.sel = App.comp().layers.map(function (L) { return L.id; }); App.emit('sel'); },
  up: function () { App.moveLayers(-1); }, down: function () { App.moveLayers(1); },
  toolText: function () { Main.setTool('text'); }, toolRect: function () { Main.setTool('rect'); }, toolEllipse: function () { Main.setTool('ellipse'); }, toolHand: function () { Main.setTool(App.tool === 'hand' ? 'select' : 'hand'); },
  trackT: function () { App.ui.trackpad = !App.ui.trackpad; try { localStorage.setItem('cgm.trackpad', App.ui.trackpad ? '1' : ''); } catch (e) {} UI.status(App.ui.trackpad ? 'Trackpad scrolling: two fingers move the view, pinch zooms.' : 'Mouse wheel: the wheel zooms, Shift + wheel moves sideways.'); },
  guidesT: function () { App.ui.guides = !App.ui.guides; $('#guides').checked = App.ui.guides; Stage.drawOverlay(); },
  snapT: function () { App.ui.snap = App.ui.snap === false; $('#snap').checked = App.ui.snap; },
  resetLayout: function () { Dock.reset(); },
  'new': IO.newProject, projects: function () { IO.showStart(); }, open: IO.open, save: function () { IO.save(false); }, saveas: function () { IO.save(true); }, 'export': IO.exportTemplate,
  undo: App.undo, redo: App.redo, dup: App.duplicate, precomp: App.precompose, del: Main.del,
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
    else if (lk === 'd') { e.preventDefault(); App.duplicate(); }
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
};
window.addEventListener('DOMContentLoaded', Main.init);
