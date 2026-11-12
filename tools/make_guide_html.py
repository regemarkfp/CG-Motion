# Builds docs/guide-print.html from docs/guide.md and the screenshots in docs/images (see index.json).
# Then: node tools/make_guide_pdf.js  ->  docs/CG Motion Guide.pdf.  Run both from the project folder.
import re, base64, os, json, html, markdown
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'docs', 'images')
idx = json.load(open(os.path.join(IMG, 'index.json'), encoding='utf-8'))
md = open(os.path.join(ROOT, 'docs', 'guide.md'), encoding='utf-8').read()
md = re.sub(r'^Oct .*?@Ruan\s*$', '', md, flags=re.M)
missing = []
def pic(m):
    alt = m.group(1).replace('\\]', ']').rstrip('\\')
    f = idx.get(alt)
    if f and os.path.exists(os.path.join(IMG, f)):
        b = base64.b64encode(open(os.path.join(IMG, f), 'rb').read()).decode()
        return '\n<figure><img src="data:image/png;base64,%s"><figcaption>%s</figcaption></figure>\n' % (b, html.escape(alt))
    missing.append(alt); return ''
md = re.sub(r'&#91;image: (.*?)\\\]', pic, md)
body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'sane_lists'])
logo = base64.b64encode(open(os.path.join(IMG, 'logo.png'), 'rb').read()).decode()
version = json.load(open(os.path.join(ROOT, 'package.json')))['version'].rsplit('.0', 1)[0] if json.load(open(os.path.join(ROOT, 'package.json')))['version'].endswith('.0') else json.load(open(os.path.join(ROOT, 'package.json')))['version']
page = '''<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font-family: "Segoe UI", Inter, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1d2125; }
.cover { height: 250mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover img { width: 70mm; margin-bottom: 10mm; } .cover h1 { font-size: 34pt; margin: 0; border: 0; } .cover p { font-size: 13pt; color: #555; margin: 4mm 0 0; }
h1 { font-size: 22pt; border-bottom: 3px solid #00c26a; padding-bottom: 4pt; margin-top: 0; }
h2 { font-size: 16pt; color: #0b5c36; border-bottom: 2px solid #00c26a; padding-bottom: 3pt; margin-top: 18pt; page-break-before: always; }
h3 { font-size: 12.5pt; color: #0b7a46; margin: 14pt 0 4pt; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; page-break-inside: avoid; } th, td { border: 1px solid #d0d5da; padding: 4pt 6pt; vertical-align: top; text-align: left; } th { background: #e9f9f0; }
code { font-family: Consolas, monospace; background: #f1f3f5; padding: 0 3px; border-radius: 3px; font-size: 9.5pt; }
pre code { display: block; padding: 6pt 8pt; white-space: pre-wrap; }
figure { margin: 10pt 0; page-break-inside: avoid; text-align: center; } figure img { max-width: 100%; max-height: 120mm; border: 1px solid #ccd; border-radius: 4px; }
figcaption { font-size: 8.5pt; color: #666; margin-top: 3pt; } li { margin: 2pt 0; }
</style></head><body><div class="cover"><img src="data:image/png;base64,''' + logo + '''"><h1 style="display:block;border:0">CG Motion</h1><p>User guide &middot; version ''' + version + '''</p><p>RegemarkFP &middot; Capturing life in motion</p></div>''' + body + '</body></html>'
open(os.path.join(ROOT, 'docs', 'guide-print.html'), 'w', encoding='utf-8').write(page)
print('missing pictures:', missing)
