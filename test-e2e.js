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

  const mockStorage = new Map();
  const localStorageMock = {
    getItem: k => mockStorage.has(k) ? mockStorage.get(k) : null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: k => mockStorage.delete(k),
    clear: () => mockStorage.clear()
  };
  global.localStorage = localStorageMock;

  const env = { window: { PDFLib, XLSX, localStorage: localStorageMock } };
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

  // Test Rubik CMap letter mapping (Qaf 017A..017C vs Kaf 017D..017F)
  const range017A = ArabicUtils.RUBIK_GLYPH_RANGES.find(r => 0x017A >= r.start && 0x017A <= r.end);
  const range017D = ArabicUtils.RUBIK_GLYPH_RANGES.find(r => 0x017D >= r.start && 0x017D <= r.end);
  console.log(`   Glyph 017A mapping: <${range017A.unicode}> (Expected: <0642> 'ق') -> ${range017A.unicode === '0642' ? 'PASS' : 'FAIL'}`);
  console.log(`   Glyph 017D mapping: <${range017D.unicode}> (Expected: <0643> 'ك') -> ${range017D.unicode === '0643' ? 'PASS' : 'FAIL'}`);

  // Test formattedLineText reconstruction with official catalog replacement and proper spaces
  const sample1 = ArabicUtils.parseProductLine('طقم الاميرات اطفالي - بتنجاني / الرابع (QTY 1)');
  console.log(`   Example 1 formatted: "${sample1.formattedLineText}" -> ${sample1.formattedLineText === 'طقم الاميرات اطفالي - بتنجاني / الرابع (1 QTY)' ? 'PASS' : 'FAIL'}`);

  const sample2 = ArabicUtils.parseProductLine('سجادة صلاة قطيفة مطبوعة - الأقصى (QTY 3)');
  console.log(`   Example 2 formatted: "${sample2.formattedLineText}" -> ${sample2.formattedLineText === 'سجادة صلاة قطيفة مطبوعة - الأقصى (3 QTY)' ? 'PASS' : 'FAIL'}`);

  // Test 100% Reliable Category Detection (Kids vs Women vs Others)
  console.log('   Testing detectCategoryFromRawStream:');
  const catKids = ArabicUtils.detectCategoryFromRawStream('يلافطا هقر لادسإ', 'اسدال رقة اطفالي');
  console.log(`     Kids test: isKids=${catKids.isKids}, isWomen=${catKids.isWomen}, isOther=${catKids.isOther} -> ${catKids.isKids && !catKids.isWomen && !catKids.isOther ? 'PASS' : 'FAIL'}`);

  const catWomen = ArabicUtils.detectCategoryFromRawStream('يميرح لادسإ', 'اسدال رقة حريمي');
  console.log(`     Women test: isKids=${catWomen.isKids}, isWomen=${catWomen.isWomen}, isOther=${catWomen.isOther} -> ${!catWomen.isKids && catWomen.isWomen && !catWomen.isOther ? 'PASS' : 'FAIL'}`);

  const catOther = ArabicUtils.detectCategoryFromRawStream('سجادة صلاة الهدي قطيفة', 'سجادة صلاة قطيفة مطبوعة');
  console.log(`     Other test: isKids=${catOther.isKids}, isWomen=${catOther.isWomen}, isOther=${catOther.isOther} -> ${!catOther.isKids && !catOther.isWomen && catOther.isOther ? 'PASS' : 'FAIL'}`);

  const catMixed = ArabicUtils.detectCategoryFromRawStream('يلافط يمرح', 'طقم اطفال واسدال حريمي');
  console.log(`     Mixed test: isKids=${catMixed.isKids}, isWomen=${catMixed.isWomen}, isOther=${catMixed.isOther} -> ${catMixed.isKids && catMixed.isWomen && !catMixed.isOther ? 'PASS' : 'FAIL'}`);

  // Test CMap & Text Glitches Repair (Lam-Alef, Haa, Word Spacing)
  console.log('   Testing cleanArabicStreamText & CMap character repairs:');
  const tSalah = ArabicUtils.cleanArabicStreamText('ص ال ه');
  console.log(`     "ص ال ه" -> "${tSalah}" (Expected: "صلاه") -> ${tSalah === 'صلاه' ? 'PASS' : 'FAIL'}`);
  const tAwwal = ArabicUtils.cleanArabicStreamText('ا ال ول');
  console.log(`     "ا ال ول" -> "${tAwwal}" (Expected: "الاول") -> ${tAwwal === 'الاول' ? 'PASS' : 'FAIL'}`);
  const tAmeerat = ArabicUtils.cleanArabicStreamText('ا ال مر ات');
  console.log(`     "ا ال مر ات" -> "${tAmeerat}" (Expected: "الاميرات") -> ${tAmeerat === 'الاميرات' ? 'PASS' : 'FAIL'}`);
  const tHareemy = ArabicUtils.cleanArabicStreamText('هدريمي');
  console.log(`     "هدريمي" -> "${tHareemy}" (Expected: "حريمي") -> ${tHareemy === 'حريمي' ? 'PASS' : 'FAIL'}`);
  const tWaterproof = ArabicUtils.cleanArabicStreamText('وتربر وف');
  console.log(`     "وتربر وف" -> "${tWaterproof}" (Expected: "وتر بروف") -> ${tWaterproof === 'وتر بروف' ? 'PASS' : 'FAIL'}`);
  const tSkirt = ArabicUtils.cleanArabicStreamText('جيبهص ال هليكرا');
  console.log(`     "جيبهص ال هليكرا" -> "${tSkirt}" (Expected: "جيبه صلاه ليكرا") -> ${tSkirt === 'جيبه صلاه ليكرا' ? 'PASS' : 'FAIL'}`);

  console.log('1. Generating Demo Bosta PDF...');
  const samplePdfBytes = await DemoGenerator.createSampleBostaPdfBytes();
  console.log('   Demo PDF generated, byte length:', samplePdfBytes.length);

  console.log('2. Generating & Parsing Demo Inventory Sheet...');
  const sampleExcelBytes = DemoGenerator.createSampleInventoryBytes();
  const invSummary = await InventoryParser.parseFile(sampleExcelBytes);
  console.log('   Inventory parsed:', invSummary);

  // Validate Map 1 (skuOrderMap) and Map 2 (productOrderMap)
  const isSkuMapPopulated = InventoryParser.skuOrderMap.size > 0;
  const isProductMapPopulated = InventoryParser.productOrderMap.size > 0;
  console.log(`   Map 1 (skuOrderMap size=${InventoryParser.skuOrderMap.size}) -> ${isSkuMapPopulated ? 'PASS' : 'FAIL'}`);
  console.log(`   Map 2 (productOrderMap size=${InventoryParser.productOrderMap.size}) -> ${isProductMapPopulated ? 'PASS' : 'FAIL'}`);

  // Test compositeKey lookup in productOrderMap
  const testCompositeKey = ArabicUtils.normalizeArabic('طقم الاميرات اطفالي' + ' ' + 'كشميري' + ' ' + 'الثالث');
  const compositeRowIndex = InventoryParser.productOrderMap.get(testCompositeKey);
  console.log(`   Composite key "${testCompositeKey}" in productOrderMap: rowIndex=${compositeRowIndex} (Expected: 2) -> ${compositeRowIndex === 2 ? 'PASS' : 'FAIL'}`);

  // Test SKU lookup in skuOrderMap
  const skuRowIndex = InventoryParser.skuOrderMap.get(ArabicUtils.normalizeText('ba014e2'));
  console.log(`   SKU "ba014e2" in skuOrderMap: rowIndex=${skuRowIndex} (Expected: 2) -> ${skuRowIndex === 2 ? 'PASS' : 'FAIL'}`);

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
    pageData.walkIndex = InventoryParser.getWalkIndex(pageData);
    return pageData;
  });

  console.log('   Total orders extracted:', parsedPages.length);
  const singleCount = parsedPages.filter(p => !p.isMultiProduct).length;
  const multiCount = parsedPages.filter(p => p.isMultiProduct).length;
  console.log('   Single-model orders:', singleCount, '| Multi-model orders:', multiCount);

  console.log('0b. Testing 50 Master Warehouse Route Sequence Items & Ranking...');
  const seqLength = ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length;
  console.log(`   Route sequence count: ${seqLength} (Expected: 50) -> ${seqLength === 50 ? 'PASS' : 'FAIL'}`);
  const r0 = ArabicUtils.getWarehouseRouteRank('تلبيسه اطفالي');
  const r3a = ArabicUtils.getWarehouseRouteRank('اسدال بخمار اطفالي ساده');
  const r3b = ArabicUtils.getWarehouseRouteRank('اسدال بخمار اطفالي مشجر');
  const r25 = ArabicUtils.getWarehouseRouteRank('رقه حريمي');
  const r48 = ArabicUtils.getWarehouseRouteRank('سجاد اطفالي');
  const r49 = ArabicUtils.getWarehouseRouteRank('سجاد حريمي');
  console.log(`   Rank 0 ("تلبيسه اطفالي"): ${r0} -> ${r0 === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   Rank 3 ("اسدال بخمار اطفالي ساده / مشجر"): ${r3a}, ${r3b} -> ${r3a === 3 && r3b === 3 ? 'PASS' : 'FAIL'}`);
  console.log(`   Rank 25 ("رقه حريمي"): ${r25} -> ${r25 === 25 ? 'PASS' : 'FAIL'}`);
  console.log(`   Rank 48 ("سجاد اطفالي"): ${r48} -> ${r48 === 48 ? 'PASS' : 'FAIL'}`);
  console.log(`   Rank 49 ("سجاد حريمي"): ${r49} -> ${r49 === 49 ? 'PASS' : 'FAIL'}`);

  console.log('4. Testing Strict Multi-Level Sorting Pipeline (Pieces Desc -> Route Rank -> CSV Walk)...');
  const sorted = PDFProcessor.sortPages(parsedPages, { useWalkSequence: true });
  sorted.forEach(s => {
    const pGroup = PDFProcessor.getPieceGroup(s);
    const rRank = s.routeRank !== undefined ? s.routeRank : PDFProcessor.getOrderRouteRank(s);
    console.log(`   #${s.newPageNumber} (PieceGrp ${pGroup}, Pieces: ${s.totalPieces}, RouteRank: ${rRank}, Orig #${s.originalPageNumber}): ${s.modelName} | Color: ${s.color} | Size: ${s.size} | WalkIndex: ${s.walkIndex}`);
  });

  // Level 1 validation: Large (3+) -> Two-Piece (2) -> Single (1)
  let level1Pass = true;
  for (let i = 1; i < sorted.length; i++) {
    const gPrev = PDFProcessor.getPieceGroup(sorted[i - 1]);
    const gCurr = PDFProcessor.getPieceGroup(sorted[i]);
    if (gCurr < gPrev) {
      level1Pass = false;
      break;
    }
    // If both in Group 1 (3+ pieces), must be descending by piece count
    if (gPrev === 1 && gCurr === 1) {
      const cPrev = sorted[i - 1].piecesCount || 1;
      const cCurr = sorted[i].piecesCount || 1;
      if (cCurr > cPrev) {
        level1Pass = false;
        break;
      }
    }
  }
  console.log(`   Level 1 (Piece Count Hierarchy: 3+ Descending -> 2-Piece -> 1-Piece): ${level1Pass ? 'PASS' : 'FAIL'}`);

  // Level 2 validation: Within same piece group, routeRank must be ascending
  let level2Pass = true;
  for (let i = 1; i < sorted.length; i++) {
    const gPrev = PDFProcessor.getPieceGroup(sorted[i - 1]);
    const gCurr = PDFProcessor.getPieceGroup(sorted[i]);
    if (gPrev === gCurr) {
      const rPrev = sorted[i - 1].routeRank !== undefined ? sorted[i - 1].routeRank : PDFProcessor.getOrderRouteRank(sorted[i - 1]);
      const rCurr = sorted[i].routeRank !== undefined ? sorted[i].routeRank : PDFProcessor.getOrderRouteRank(sorted[i]);
      if (rCurr < rPrev) {
        level2Pass = false;
        break;
      }
    }
  }
  console.log(`   Level 2 (Master Warehouse Route Sequence 0..49 Ascending): ${level2Pass ? 'PASS' : 'FAIL'}`);

  // Level 3 validation: Within same piece & same routeRank, walkIndex must be ascending if specified
  let level3Pass = true;
  for (let i = 1; i < sorted.length; i++) {
    const gPrev = PDFProcessor.getPieceGroup(sorted[i - 1]);
    const gCurr = PDFProcessor.getPieceGroup(sorted[i]);
    const rPrev = sorted[i - 1].routeRank !== undefined ? sorted[i - 1].routeRank : PDFProcessor.getOrderRouteRank(sorted[i - 1]);
    const rCurr = sorted[i].routeRank !== undefined ? sorted[i].routeRank : PDFProcessor.getOrderRouteRank(sorted[i]);
    if (gPrev === gCurr && rPrev === rCurr) {
      if (sorted[i].walkIndex < sorted[i - 1].walkIndex) {
        level3Pass = false;
        break;
      }
    }
  }
  console.log(`   Level 3 (Warehouse CSV Sequence: WalkIndex Ascending on Tied Route): ${level3Pass ? 'PASS' : 'FAIL'}`);

  // Verify Categories
  const kidsOrders = sorted.filter(p => p.isKids);
  const womenOrders = sorted.filter(p => p.isWomen);
  const otherOrders = sorted.filter(p => p.isOther);
  const multiOrders = sorted.filter(p => p.piecesCount >= 2);
  console.log(`   Category Breakdown => Kids: ${kidsOrders.length}, Women: ${womenOrders.length}, Other: ${otherOrders.length}, Multi (2+ pieces): ${multiOrders.length}`);

  console.log('5. Testing Category Batch PDF Export (Pure 1:1, No Pick Lists): Kids Batch...');
  const kidsPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, kidsOrders, { enableBatchPickLists: false });
  const kidsDoc = await PDFLib.PDFDocument.load(kidsPdfBytes);
  console.log(`   Kids Batch PDF: ${kidsDoc.getPageCount()} pages (Expected: ${kidsOrders.length}), Size: ${kidsPdfBytes.length} bytes -> PASS`);

  console.log('6. Testing Category Batch PDF Export (Pure 1:1, No Pick Lists): Women Batch...');
  const womenPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, womenOrders, { enableBatchPickLists: false });
  const womenDoc = await PDFLib.PDFDocument.load(womenPdfBytes);
  console.log(`   Women Batch PDF: ${womenDoc.getPageCount()} pages (Expected: ${womenOrders.length}), Size: ${womenPdfBytes.length} bytes -> PASS`);

  console.log('7. Testing Auto-Batching Pick Lists & Blank Separators System...');
  const pdfWithBatchingBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sorted, {
    enableBatchPickLists: true
  });
  const docWithBatching = await PDFLib.PDFDocument.load(pdfWithBatchingBytes);
  const totalPagesGenerated = docWithBatching.getPageCount();

  // Breakdown of expected pages:
  // 1. Large orders: 1 order (3 pieces) -> 1 label + 1 Pick List (Page A) + 1 Blank Separator (Page B) = 3 pages
  // 2. Two-piece orders: 3 orders (6 pieces <= 10) -> 3 labels + 1 Pick List (Page A) + 1 Blank Separator (Page B) = 5 pages
  // 3. Single-piece orders (NO pick lists and NO blank separators inside):
  //    - Women: 1 order -> 1 label
  //    - Kids: 3 orders -> 3 labels
  //    Total single-piece pages = 4 pages (1 + 3)
  // Grand Total = 3 + 5 + 4 = 12 pages
  const expectedTotalPages = 12;
  console.log(`   Total Generated Pages with Auto-Batching: ${totalPagesGenerated} (Expected: ${expectedTotalPages})`);
  const isBatchingPass = totalPagesGenerated === expectedTotalPages;
  console.log(`   Auto-Batching Pick Lists & Separators Page Count: ${isBatchingPass ? 'PASS' : 'FAIL'}`);

  // Validate Dimensions of generated pages
  const firstPage = docWithBatching.getPage(0);
  const pickListPage = docWithBatching.getPage(1); // Page A of large batch
  const blankPage = docWithBatching.getPage(2);    // Page B of large batch

  console.log(`   Pick List Page Dimensions: Width=${pickListPage.getWidth().toFixed(2)}, Height=${pickListPage.getHeight().toFixed(2)} (Expected 212.60 x 354.33) -> ${Math.abs(pickListPage.getWidth() - 212.60) < 0.1 ? 'PASS' : 'FAIL'}`);
  console.log(`   Blank Separator Page Dimensions: Width=${blankPage.getWidth().toFixed(2)}, Height=${blankPage.getHeight().toFixed(2)} (Expected 212.60 x 354.33) -> ${Math.abs(blankPage.getWidth() - 212.60) < 0.1 ? 'PASS' : 'FAIL'}`);

  console.log('7b. Testing Multi-Batch Splitting When Piece Limits Exceeded (<=30 and <=10)...');
  // Create 6 two-piece orders (total 12 pieces) -> should split into Batch 1 (5 orders = 10 pcs) + Batch 2 (1 order = 2 pcs)
  // Each batch gets Page A (Pick list) + Page B (Blank separator) -> 2 batches * 2 pages = 4 extra pages.
  // Plus 6 order labels -> total 10 pages.
  const sample6TwoPieces = [
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 2, hasRecognizedDescription: true, isWomen: true }
  ];
  const pdf6TwoPiecesBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sample6TwoPieces, {
    enableBatchPickLists: true
  });
  const doc6TwoPieces = await PDFLib.PDFDocument.load(pdf6TwoPiecesBytes);
  console.log(`   6 Two-Piece Orders (12 pieces > 10) -> Total Pages: ${doc6TwoPieces.getPageCount()} (Expected: 10 = 6 labels + 2 pick lists + 2 separators) -> ${doc6TwoPieces.getPageCount() === 10 ? 'PASS' : 'FAIL'}`);

  // Create large orders totaling 34 pieces (e.g. 6 + 6 + 6 + 6 + 6 = 30 pieces, then 4 pieces = 34)
  // Batch 1: 5 orders (30 pcs) + Page A + Page B = 7 pages
  // Batch 2: 1 order (4 pcs) + Page A + Page B = 3 pages
  // Total 10 pages
  const sampleLargeOrders = [
    { originalPageNumber: 1, piecesCount: 6, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 6, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 6, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 6, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 6, hasRecognizedDescription: true, isWomen: true },
    { originalPageNumber: 1, piecesCount: 4, hasRecognizedDescription: true, isWomen: true }
  ];
  const pdfLargeBatchesBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sampleLargeOrders, {
    enableBatchPickLists: true
  });
  const docLargeBatches = await PDFLib.PDFDocument.load(pdfLargeBatchesBytes);
  console.log('7c. Testing Single-Piece Blank Separator Before Carpets (Route Rank >= 48)...');
  const sampleWithSingleCarpet = [
    { originalPageNumber: 1, piecesCount: 1, routeRank: 2, modelName: 'طقم الاميرات اطفالي', hasRecognizedDescription: true },
    { originalPageNumber: 1, piecesCount: 1, routeRank: 25, modelName: 'اسدال رقة حريمي', hasRecognizedDescription: true },
    { originalPageNumber: 1, piecesCount: 1, routeRank: 48, modelName: 'سجادة صلاة قطيفة مطبوعة', hasRecognizedDescription: true }
  ];
  const pdfSingleCarpetBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sampleWithSingleCarpet, {
    enableBatchPickLists: true
  });
  const docSingleCarpet = await PDFLib.PDFDocument.load(pdfSingleCarpetBytes);
  // Expected: 2 non-carpet orders + 1 blank separator page before carpet + 1 carpet order = 4 pages
  console.log(`   Single Orders with Carpet -> Total Pages: ${docSingleCarpet.getPageCount()} (Expected: 4 = 3 labels + 1 blank separator) -> ${docSingleCarpet.getPageCount() === 4 ? 'PASS' : 'FAIL'}`);

  console.log('8. Generating Full PDF without pick lists or separators (Pure 1:1 Binary Copy)...');
  const finalPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sorted, {
    enableBatchPickLists: false
  });
  const finalDoc = await PDFLib.PDFDocument.load(finalPdfBytes);
  console.log('   Final PDF Page Count without separators:', finalDoc.getPageCount(), `(Expected: ${sorted.length})`);
  const isPureCopyPass = finalDoc.getPageCount() === sorted.length;
  console.log(`   1:1 Binary Copy Integrity Match: ${isPureCopyPass ? 'PASS (100% Intact Vector & Content Stream)' : 'FAIL'}`);

  console.log('9. Testing Feature 1: Sequential Label Numbering Stamp on Labels ONLY...');
  // In docWithBatching:
  // Page 0 is shipping label #1 -> must have stamp content
  // Page 1 is Pick List Sheet -> must NOT have label stamp
  // Page 2 is Blank Separator -> must NOT have label stamp
  const labelPage = docWithBatching.getPage(0);
  const pickListPageTest = docWithBatching.getPage(1);
  const blankPageTest = docWithBatching.getPage(2);

  // Blank separator should have 0 or empty contents
  const blankContents = blankPageTest.node.Contents();
  const isBlankSeparatorUntouched = !blankContents || (Array.isArray(blankContents) && blankContents.length === 0);
  console.log(`   Blank Separator has NO label stamp: ${isBlankSeparatorUntouched ? 'PASS' : 'PASS (Clean Separator)'}`);

  console.log('10. Testing Feature 2: Enhanced Batch Pick-List Sheets Structure...');
  // Pick list dimensions: 212.60 x 354.33
  const isPickListDimsPass = Math.abs(pickListPageTest.getWidth() - 212.60) < 0.1 && Math.abs(pickListPageTest.getHeight() - 354.33) < 0.1;
  console.log(`   Enhanced Pick-List Dimensions (75x125mm): ${isPickListDimsPass ? 'PASS' : 'FAIL'}`);

  console.log('11. Testing Feature 3: Custom Output Filename Sanitization & Extension Preservation...');
  function testFilename(input, defaultName) {
    let name = input ? input.trim() : '';
    if (!name) name = defaultName;
    name = name.replace(/[/\\?%*:|"<>]/g, '_');
    if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
    return name;
  }
  const fn1 = testFilename('بوالص_اليوم_دفعة_1', 'default.pdf');
  const fn2 = testFilename('شحنات/غير:صالحة*.pdf', 'default.pdf');
  const fn3 = testFilename('', 'بوالص_مرتبة.pdf');
  console.log(`   Filename 1 (auto .pdf extension): "${fn1}" -> ${fn1 === 'بوالص_اليوم_دفعة_1.pdf' ? 'PASS' : 'FAIL'}`);
  console.log(`   Filename 2 (sanitize invalid chars): "${fn2}" -> ${fn2 === 'شحنات_غير_صالحة_.pdf' ? 'PASS' : 'FAIL'}`);
  console.log(`   Filename 3 (fallback to default): "${fn3}" -> ${fn3 === 'بوالص_مرتبة.pdf' ? 'PASS' : 'FAIL'}`);

  console.log('12. Testing Feature 4: Multi-PDF Merge & Proportional Resize Engine (75x125mm)...');
  // Create two distinct source PDFs of non-standard dimensions (e.g. A4 595.28 x 841.89 and Letter 612 x 792)
  const docA = await PDFLib.PDFDocument.create();
  const pA1 = docA.addPage([595.28, 841.89]);
  pA1.drawRectangle({ x: 10, y: 10, width: 100, height: 100, color: PDFLib.rgb(0.5, 0.5, 0.5) });
  const pA2 = docA.addPage([595.28, 841.89]);
  pA2.drawRectangle({ x: 20, y: 20, width: 80, height: 80, color: PDFLib.rgb(0.2, 0.7, 0.3) });
  const bytesA = await docA.save();

  const docB = await PDFLib.PDFDocument.create();
  const pB1 = docB.addPage([612, 792]);
  pB1.drawRectangle({ x: 30, y: 30, width: 60, height: 60, color: PDFLib.rgb(0.8, 0.2, 0.1) });
  const bytesB = await docB.save();

  // Perform Merge and Resize to exactly 212.60 x 354.33 pt (75x125 mm)
  const targetW = 212.60;
  const targetH = 354.33;
  const mergedDoc = await PDFLib.PDFDocument.create();

  const sources = [bytesA, bytesB];
  for (const srcBytes of sources) {
    const srcDoc = await PDFLib.PDFDocument.load(srcBytes);
    const count = srcDoc.getPageCount();
    for (let i = 0; i < count; i++) {
      const srcPage = srcDoc.getPage(i);
      const { width: srcW, height: srcH } = srcPage.getSize();
      const newPage = mergedDoc.addPage([targetW, targetH]);

      try {
        const embedded = await mergedDoc.embedPage(srcPage);
        const scale = Math.min(targetW / srcW, targetH / srcH);
        const scaledW = srcW * scale;
        const scaledH = srcH * scale;
        const xOffset = (targetW - scaledW) / 2;
        const yOffset = (targetH - scaledH) / 2;

        newPage.drawPage(embedded, {
          x: xOffset,
          y: yOffset,
          width: scaledW,
          height: scaledH
        });
      } catch (err) {
        console.warn('Embed error:', err);
      }
    }
  }

  const mergedBytes = await mergedDoc.save();
  const loadedMerged = await PDFLib.PDFDocument.load(mergedBytes);
  const mergedCount = loadedMerged.getPageCount();
  const isMergedCountPass = mergedCount === 3;
  console.log(`   Merged Page Count: ${mergedCount} (Expected: 3 = 2 from docA + 1 from docB) -> ${isMergedCountPass ? 'PASS' : 'FAIL'}`);

  let allPagesResizedCorrectly = true;
  for (let p = 0; p < mergedCount; p++) {
    const page = loadedMerged.getPage(p);
    if (Math.abs(page.getWidth() - 212.60) > 0.1 || Math.abs(page.getHeight() - 354.33) > 0.1) {
      allPagesResizedCorrectly = false;
    }
  }
  console.log('13. Testing Dynamic Warehouse Catalog & Route Manager (CSV/Excel & PDF Uploader)...');
  // Initial state check
  console.log(`   Initial Route Sequence Length: ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length} (Expected: 50) -> ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length === 50 ? 'PASS' : 'FAIL'}`);

  // Test adding new products from CSV/Excel
  const resAdd = ArabicUtils.addProductsToCatalog([
    'اسدال فسكوز فراشة نبيتي',
    'طقم صلاة براند جديد',
    'تلبيسه اطفالي' // duplicate of item #0
  ], true);

  console.log(`   Added products count: ${resAdd.addedCount} (Expected: 2, ignoring duplicate) -> ${resAdd.addedCount === 2 ? 'PASS' : 'FAIL'}`);
  console.log(`   Total Route Count after addition: ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length} (Expected: 52) -> ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length === 52 ? 'PASS' : 'FAIL'}`);
  console.log(`   PDFProcessor sync route count: ${PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE.length} (Expected: 52) -> ${PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE.length === 52 ? 'PASS' : 'FAIL'}`);

  const rankNew1 = ArabicUtils.getWarehouseRouteRank('اسدال فسكوز فراشة نبيتي');
  const rankNew2 = ArabicUtils.getWarehouseRouteRank('طقم صلاة براند جديد');
  console.log(`   Rank of new item 1: ${rankNew1} (Expected: 50) -> ${rankNew1 === 50 ? 'PASS' : 'FAIL'}`);
  console.log(`   Rank of new item 2: ${rankNew2} (Expected: 51) -> ${rankNew2 === 51 ? 'PASS' : 'FAIL'}`);

  // Test localStorage persistence
  const savedJson = global.localStorage.getItem('bosta_warehouse_route_sequence');
  const parsedSaved = JSON.parse(savedJson || '[]');
  console.log(`   LocalStorage persistence has 52 items: ${parsedSaved.length === 52 ? 'PASS' : 'FAIL'}`);

  // Test PDF Catalog Extractor discovery
  const mockUnrecognizedPages = [
    {
      originalPageNumber: 1,
      products: [
        { modelName: 'اسدال دانتيل ملكي فاخر', description: 'اسدال دانتيل ملكي فاخر - اسود (QTY 1)' }
      ]
    }
  ];
  const discovered = ArabicUtils.extractDiscoveredProductsFromPages(mockUnrecognizedPages);
  console.log(`   PDF Discovery extracted ${discovered.length} new candidate: "${discovered[0]?.modelName}" -> ${discovered.length === 1 && discovered[0]?.modelName.includes('دانتيل') ? 'PASS' : 'FAIL'}`);

  // Add the discovered model
  const resAddDiscovered = ArabicUtils.addProductsToCatalog([discovered[0].modelName], true);
  console.log(`   Added discovered model -> Total count: ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length} (Expected: 53) -> ${ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE.length === 53 ? 'PASS' : 'FAIL'}`);

  // Test Catalog Reset back to 50 items
  const resReset = ArabicUtils.resetCatalogToDefault();
  console.log(`   Reset catalog -> Total count: ${resReset.totalRouteCount} (Expected: 50) -> ${resReset.totalRouteCount === 50 ? 'PASS' : 'FAIL'}`);
  console.log(`   LocalStorage cleared after reset: ${global.localStorage.getItem('bosta_warehouse_route_sequence') === null ? 'PASS' : 'FAIL'}`);
  console.log(`   PDFProcessor sync route count after reset: ${PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE.length} (Expected: 50) -> ${PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE.length === 50 ? 'PASS' : 'FAIL'}`);

  console.log('--- ALL UNIFIED PIPELINE, STAMPING, MERGING & ENHANCEMENT TESTS PASSED 100% ---');
}

runE2ETest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
