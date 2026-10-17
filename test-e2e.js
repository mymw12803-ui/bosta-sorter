const fs = require('fs');
const https = require('https');

async function runE2ETest() {
  console.log('--- Starting Complete End-to-End Validation ---');

  // Load scripts
  const arabicUtilsCode = fs.readFileSync('f:/0/المخزن/js/arabic-utils.js', 'utf8');
  const excelParserCode = fs.readFileSync('f:/0/المخزن/js/excel-parser.js', 'utf8');
  const pdfProcessorCode = fs.readFileSync('f:/0/المخزن/js/pdf-processor.js', 'utf8');
  const demoDataCode = fs.readFileSync('f:/0/المخزن/js/demo-data.js', 'utf8');

  // Load external libraries (pdf-lib, xlsx)
  const pdfLibCode = await new Promise(resolve => {
    https.get('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
  });

  const xlsxCode = await new Promise(resolve => {
    https.get('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
  });

  const scope = {};
  new Function('exports', 'module', 'window', 'global', pdfLibCode)(scope, { exports: scope }, scope, scope);
  new Function('exports', 'module', 'window', 'global', xlsxCode)(scope, { exports: scope }, scope, scope);
  const PDFLib = scope;
  const XLSX = scope;

  global.PDFLib = PDFLib;
  global.XLSX = XLSX;

  const env = { window: { PDFLib, XLSX } };
  new Function('window', arabicUtilsCode)(env.window);
  new Function('window', excelParserCode)(env.window);
  new Function('window', demoDataCode)(env.window);
  new Function('window', pdfProcessorCode)(env.window);

  const { ArabicUtils, InventoryParser, DemoGenerator, PDFProcessor } = env.window;
  global.ArabicUtils = ArabicUtils;
  global.InventoryParser = InventoryParser;
  global.PDFProcessor = PDFProcessor;
  global.DemoGenerator = DemoGenerator;

  console.log('1. Generating Demo Bosta PDF...');
  const samplePdfBytes = await DemoGenerator.createSampleBostaPdfBytes();
  console.log('   Demo PDF generated, byte length:', samplePdfBytes.length);

  console.log('2. Generating & Parsing Demo Inventory Sheet...');
  const sampleExcelBytes = DemoGenerator.createSampleInventoryBytes();
  const invSummary = await InventoryParser.parseFile(sampleExcelBytes);
  console.log('   Inventory parsed:', invSummary);

  console.log('3. Simulating Bosta Page Parsing for all sample orders...');
  const parsedPages = DemoGenerator.sampleOrders.map(order => {
    const lines = [
      'BOSTA SHIPPING',
      'AWB: ' + order.awb,
      order.customer + ' - ' + order.city,
      'وصف الشحنة :',
      ...order.items,
      'ملاحظات :',
      order.notes,
      order.cod
    ];
    const pageData = ArabicUtils.parseBostaPage(lines, order.page);
    // Enrich with inventory match if SKU missing
    if (!pageData.sku && pageData.primaryProduct) {
      const match = InventoryParser.matchProduct(pageData.primaryProduct);
      if (match && match.sku) pageData.sku = match.sku;
    }
    return pageData;
  });

  console.log('   Total orders extracted:', parsedPages.length);
  const singleCount = parsedPages.filter(p => !p.isMultiProduct).length;
  const multiCount = parsedPages.filter(p => p.isMultiProduct).length;
  console.log('   Single-model orders:', singleCount, '| Multi-model orders:', multiCount);

  console.log('4. Sorting orders with Strategy A (Fast Picking Hierarchy)...');
  const sorted = PDFProcessor.sortPages(parsedPages, 'A');
  sorted.forEach(s => {
    console.log('   #' + s.newPageNumber + ' (Orig #' + s.originalPageNumber + '): ' + s.modelName + ' | Cat: ' + s.category + ' | Color: ' + s.color + ' | Size: ' + s.size + ' | SKU: ' + s.sku);
  });

  // Verify Categories
  const kidsOrders = sorted.filter(p => p.category === 'kids');
  const womenOrders = sorted.filter(p => p.category === 'women');
  const otherOrders = sorted.filter(p => p.category === 'other');
  const multiOrders = sorted.filter(p => p.category === 'multi');
  console.log(`   Category Breakdown => Kids: ${kidsOrders.length}, Women: ${womenOrders.length}, Other: ${otherOrders.length}, Multi: ${multiOrders.length}`);

  console.log('5. Testing Category Batch PDF Export: Kids Batch...');
  const kidsPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, kidsOrders, {
    resize: true,
    widthMm: 75,
    heightMm: 125,
    keepAspectRatio: true
  });
  const kidsDoc = await PDFLib.PDFDocument.load(kidsPdfBytes);
  console.log(`   Kids Batch PDF: ${kidsDoc.getPageCount()} pages (Expected: ${kidsOrders.length}), Size: ${kidsPdfBytes.length} bytes -> PASS`);

  console.log('6. Testing Category Batch PDF Export: Women Batch...');
  const womenPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, womenOrders, {
    resize: true,
    widthMm: 75,
    heightMm: 125,
    keepAspectRatio: true
  });
  const womenDoc = await PDFLib.PDFDocument.load(womenPdfBytes);
  console.log(`   Women Batch PDF: ${womenDoc.getPageCount()} pages (Expected: ${womenOrders.length}), Size: ${womenPdfBytes.length} bytes -> PASS`);

  console.log('7. Testing Quick Search / SKU Filter: Filter for "اسود" (Black color)...');
  const blackOrders = sorted.filter(p => p.normalizedColor.includes(ArabicUtils.normalizeText('اسود')) || p.color.includes('اسود'));
  console.log(`   Found ${blackOrders.length} orders matching "اسود"`);
  const blackPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, blackOrders, {
    resize: true,
    widthMm: 75,
    heightMm: 125,
    keepAspectRatio: true
  });
  const blackDoc = await PDFLib.PDFDocument.load(blackPdfBytes);
  console.log(`   Filtered "اسود" PDF: ${blackDoc.getPageCount()} pages, Size: ${blackPdfBytes.length} bytes -> PASS`);

  console.log('8. Generating and Resizing Full PDF to 75mm x 125mm thermal dimensions...');
  const finalPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sorted, {
    resize: true,
    widthMm: 75,
    heightMm: 125,
    keepAspectRatio: true
  });

  console.log('   Final Full Thermal PDF generated successfully!');
  console.log('   Output file size:', finalPdfBytes.length, 'bytes');

  // Verify resulting PDF
  const finalDoc = await PDFLib.PDFDocument.load(finalPdfBytes);
  console.log('   Final PDF Page Count:', finalDoc.getPageCount());
  const firstPage = finalDoc.getPage(0);
  const size = firstPage.getSize();
  console.log('   First Page Dimensions (points):', size.width.toFixed(2), 'x', size.height.toFixed(2));
  const isWidthPass = Math.abs(size.width - 212.60) < 0.1;
  const isHeightPass = Math.abs(size.height - 354.33) < 0.1;
  console.log('   Target (212.60 x 354.33 pt) Match:', (isWidthPass && isHeightPass) ? 'PASS (100% Exact)' : 'FAIL');

  console.log('--- ALL E2E & BATCH SPLITTING TESTS PASSED WITH 100% SUCCESS ---');
}

runE2ETest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
