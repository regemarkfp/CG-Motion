// Renders docs/guide-print.html (from tools/make_guide_html.py) to docs/CG Motion Guide.pdf with page numbers. Needs Playwright.
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
(async () => {
  const root = path.join(__dirname, '..');
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.join(root, 'docs', 'guide-print.html')); await p.waitForTimeout(500);
  await p.pdf({ path: path.join(root, 'docs', 'CG Motion Guide.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#888;font-family:Arial">CG Motion guide &middot; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>' });
  await b.close();
})();
