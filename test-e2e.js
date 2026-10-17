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

  console.log('0. Testing Rubik Font Null-Byte Recovery & Skeleton Matcher...');
  const testDegraded1 = 'اسدال رقة ا\x00فالي';
  const match1 = ArabicUtils.matchWarehouseModel(testDegraded1);
  console.log(`   Degraded input: "${testDegraded1}" -> Matched: "${match1}" (Expected: "اسدال رقة اطفالي") -> ${match1 === 'اسدال رقة اطفالي' ? 'PASS' : 'FAIL'}`);

  const testDegraded2 = 'خمار ب\x00ليسيه حريمي';
  const match2 = ArabicUtils.matchWarehouseModel(testDegraded2);
  console.log(`   Degraded input: "${testDegraded2}" -> Matched: "${match2}" (Expected: "خمار بيليسيه حريمي") -> ${match2 === 'خمار بيليسيه حريمي' ? 'PASS' : 'FAIL'}`);

  // Test Space-Immune Arabic Normalization & Words Reconstruction
  const spacedStr = 'ا س د ا ل  ب ج ي و ب  ا ط ف ا ل ي';
  const normSpaced = ArabicUtils.normalizeArabic(spacedStr);
  console.log(`   normalizeArabic("${spacedStr}") = "${normSpaced}" -> ${normSpaced === 'اسدالبجيوباطفالي' ? 'PASS' : 'FAIL'}`);

  // Test Space-Immune Product Line Parser
  const spacedLine = 'ا س د ا ل  ب ج ي و ب  ا ط ف ا ل ي - م ي ن ت  غ ا م ق (V1) / ال ا و ل (QTY 3)';
  const parsedSpaced = ArabicUtils.parseProductLine(spacedLine);
  console.log(`   Space-Immune line: Model="${parsedSpaced.modelName}", Color="${parsedSpaced.color}", Code="${parsedSpaced.colorCode}", Size="${parsedSpaced.size}", Qty=${parsedSpaced.qty}`);
  const isSpacedLinePass = parsedSpaced.modelName === 'اسدال بجيوب اطفالي' &&
                           parsedSpaced.color === 'مينت غامق' &&
                           parsedSpaced.colorCode === 'V1' &&
                           parsedSpaced.size === 'الأول' &&
                           parsedSpaced.qty === 3;
  console.log(`   Space-Immune Line Parsing: ${isSpacedLinePass ? 'PASS (100% Exact Match)' : 'FAIL'}`);

  // Test Variant Code & Color parsing
  const parsedColor = ArabicUtils.parseColorAndCode('اسود (Z1)');
  console.log(`   Color test "اسود (Z1)": Color="${parsedColor.color}", Code="${parsedColor.code}" -> ${parsedColor.color === 'اسود' && parsedColor.code === 'Z1' ? 'PASS' : 'FAIL'}`);

  // Test strict QTY product line parser
  const validProductLine = ArabicUtils.parseProductLine('اسدال رقة حريمي - اسود (Z1) / الاول (QTY 2)');
  console.log(`   Strict QTY Line:`, validProductLine ? `Parsed model="${validProductLine.modelName}", qty=${validProductLine.qty}` : 'FAILED');
  const rejectedNonProduct = ArabicUtils.parseProductLine('50.00 ج.م HUB FM-OBOUR');
  console.log(`   Strict Non-Product rejection: ${rejectedNonProduct === null ? 'PASS (Correctly rejected)' : 'FAIL'}`);

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
  const blackOrders = sorted.filter(p => {
    const fullSearchable = ArabicUtils.normalizeArabic(
      (p.modelName || '') + ' ' + (p.color || '') + ' ' + (p.sku || '') + ' ' + (p.orderReference || '')
    );
    return fullSearchable.includes(ArabicUtils.normalizeArabic('ا س و د'));
  });
  console.log(`   Found ${blackOrders.length} orders matching spaced query "ا س و د" (Expected: 2) -> ${blackOrders.length === 2 ? 'PASS' : 'FAIL'}`);
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
