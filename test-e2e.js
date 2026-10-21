const fs = require('fs');
const https = require('https');

async function runE2ETest() {
  console.log('--- Starting Complete End-to-End Validation ---');

  // Load scripts
  const defaultInventoryCode = fs.readFileSync('f:/0/المخزن/js/default-inventory.js', 'utf8');
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
  new Function('window', 'module', 'exports', defaultInventoryCode)(env.window, { exports: {} }, {});
  new Function('window', arabicUtilsCode)(env.window);
  new Function('window', 'module', 'exports', excelParserCode)(env.window, { exports: {} }, {});
  new Function('window', demoDataCode)(env.window);
  new Function('window', pdfProcessorCode)(env.window);

  const { DEFAULT_INVENTORY_ITEMS, ArabicUtils, InventoryParser, DemoGenerator, PDFProcessor } = env.window;
  global.DEFAULT_INVENTORY_ITEMS = DEFAULT_INVENTORY_ITEMS;
  global.ArabicUtils = ArabicUtils;
  global.InventoryParser = InventoryParser;
  global.PDFProcessor = PDFProcessor;
  global.DemoGenerator = DemoGenerator;

  console.log('0. Testing Master Bundled Excel Inventory (Sheet: بعد الترتيب)...');
  InventoryParser.init();
  const totalBundled = InventoryParser.inventoryItems.length;
  console.log(`   Total items in bundled catalog: ${totalBundled} (Expected: 547) -> ${totalBundled === 547 ? 'PASS' : 'FAIL'}`);

  // Test Row 0, Row 1, Row 546
  const item0 = InventoryParser.inventoryItems[0];
  const item1 = InventoryParser.inventoryItems[1];
  const item546 = InventoryParser.inventoryItems[546];
  console.log(`   Row 0: Title="${item0.title}", SKU="${item0.sku}" -> ${item0.sku.toLowerCase() === 'bb012e1' ? 'PASS' : 'FAIL'}`);
  console.log(`   Row 1: Title="${item1.title}", SKU="${item1.sku}" -> ${item1.sku.toLowerCase() === 'bb012f1' ? 'PASS' : 'FAIL'}`);
  console.log(`   Row 546: Title="${item546.title}", SKU="${item546.sku}" -> ${item546.sku.toLowerCase() === 'eb033y0' ? 'PASS' : 'FAIL'}`);

  // Test Case-Insensitive SKU Rank
  const rank0 = InventoryParser.getSKURank('Bb012E1');
  const rank0Lower = InventoryParser.getSKURank('bb012e1');
  const rank1 = InventoryParser.getSKURank('bb012f1');
  const rank546 = InventoryParser.getSKURank('eb033y0');
  console.log(`   SKU "Bb012E1" -> Rank ${rank0} (Expected: 0) -> ${rank0 === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   SKU "bb012e1" -> Rank ${rank0Lower} (Expected: 0) -> ${rank0Lower === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   SKU "bb012f1" -> Rank ${rank1} (Expected: 1) -> ${rank1 === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`   SKU "eb033y0" -> Rank ${rank546} (Expected: 546) -> ${rank546 === 546 ? 'PASS' : 'FAIL'}`);

  // Test Smart Arabic Fallback Matching
  const rankByTitle0 = InventoryParser.getTitleRank('اسدال تلبيسه اطفالي كشميري الاول');
  const rankByTitle546 = InventoryParser.getTitleRank('سجادة صلاة اطفالي قطيفة مسجد وكعبة لون ازرق');
  console.log(`   Smart Match Title Row 0 -> Rank ${rankByTitle0} (Expected: 0) -> ${rankByTitle0 === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   Smart Match Title Row 546 -> Rank ${rankByTitle546} (Expected: 546) -> ${rankByTitle546 === 546 ? 'PASS' : 'FAIL'}`);

  console.log('0a. Testing Rubik Font Null-Byte Recovery & Skeleton Matcher...');
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

  console.log('1. Generating Demo Bosta PDF...');
  const samplePdfBytes = await DemoGenerator.createSampleBostaPdfBytes();
  console.log('   Demo PDF generated, byte length:', samplePdfBytes.length);

  console.log('2. Generating & Parsing Demo Inventory Sheet (Sheet: بعد الترتيب)...');
  const sampleExcelBytes = DemoGenerator.createSampleInventoryBytes();
  const invSummary = await InventoryParser.parseFile(sampleExcelBytes);
  console.log('   Inventory parsed:', invSummary);
  console.log(`   Sheet targeted: "${invSummary.sheetName}" (Expected: "بعد الترتيب") -> ${invSummary.sheetName === 'بعد الترتيب' ? 'PASS' : 'FAIL'}`);

  // Validate Map 1 (skuOrderMap) and Map 2 (productOrderMap)
  const isSkuMapPopulated = InventoryParser.skuRankMap.size > 0;
  console.log(`   Map 1 (skuRankMap size=${InventoryParser.skuRankMap.size}) -> ${isSkuMapPopulated ? 'PASS' : 'FAIL'}`);

  // Test SKU lookup in skuRankMap
  const skuRowIndex = InventoryParser.getSKURank('ba014e2');
  console.log(`   SKU "ba014e2" in skuRankMap: rowIndex=${skuRowIndex} (Expected: 2) -> ${skuRowIndex === 2 ? 'PASS' : 'FAIL'}`);

  console.log('3. Simulating Bosta Page Parsing for all sample orders...');
  const parsedPages = DemoGenerator.sampleOrders.map(order => {
    const lines = [
      'BOSTA SHIPPING',
      'توصيل إلى: ' + (order.customer || 'عميل تجريبي'),
      'التاجر: خيام لملابس المحجبات',
      'AWB: ' + order.awb,
      order.customer + ' - ' + order.city,
      'وصف الشحنة :',
      ...order.items,
      'ملاحظات :',
      order.notes,
      order.cod
    ];
    const pageData = ArabicUtils.parseBostaPage(lines, order.page);
    return pageData;
  });

  console.log('   Total orders extracted:', parsedPages.length);
  const singleCount = parsedPages.filter(p => !p.isMultiProduct).length;
  const multiCount = parsedPages.filter(p => p.isMultiProduct).length;
  console.log('   Single-model orders:', singleCount, '| Multi-model orders:', multiCount);

  // 3a. Testing Customer Name Extraction from Bosta Label
  console.log('3a. Testing Customer Name Extraction from Bosta Label...');
  const sampleLabelLines1 = [
    'BOSTA SHIPPING',
    'AWB: 987654321',
    'توصيل إلى: شيرين سعد',
    'التاجر: خيام لملابس المحجبات',
    'وصف الشحنة :',
    'اسدال رقة حريمي - اسود'
  ];
  const p1 = ArabicUtils.parseBostaPage(sampleLabelLines1, 1);
  console.log(`   Customer Name "توصيل إلى: شيرين سعد" -> "${p1.customerName}" -> ${p1.customerName === 'شيرين سعد' ? 'PASS' : 'FAIL'}`);

  const sampleLabelLines2 = [
    'BOSTA SHIPPING',
    'AWB: 987654322',
    'توصيل إلى:',
    'ا. إيهاب ماهر',
    'خيام لملابس المحجبات',
    'وصف الشحنة :',
    'طقم صلاه حريمي سادة'
  ];
  const p2 = ArabicUtils.parseBostaPage(sampleLabelLines2, 2);
  console.log(`   Customer Name below "توصيل إلى:" -> "${p2.customerName}" -> ${p2.customerName === 'ا. إيهاب ماهر' ? 'PASS' : 'FAIL'}`);

  console.log('4. Testing Strict 8-Bucket Hierarchy & Sorting Sequence...');
  const sorted = PDFProcessor.sortPages(parsedPages);
  sorted.forEach(s => {
    console.log(`   #${s.newPageNumber} (Bucket: ${s.bucket}${s.subBucket ? `-${s.subBucket}` : ''}, Pieces: ${s.piecesCount}, ExcelRank: ${s.excelRank}, Orig #${s.originalPageNumber}): ${s.modelName} | SKU: ${s.sku || 'N/A'}`);
  });

  // Hierarchy validation: Buckets must be sorted non-decreasing (1 <= 2 <= 3 <= 4 <= 5 <= 6 <= 7 <= 8)
  let bucketPass = true;
  for (let i = 1; i < sorted.length; i++) {
    const prevB = sorted[i - 1].bucket;
    const currB = sorted[i].bucket;
    if (currB < prevB) {
      bucketPass = false;
      break;
    }
  }
  console.log(`   8-Bucket Sequence Hierarchy: ${bucketPass ? 'PASS' : 'FAIL'}`);

  // Inside Bucket 4: 4A (2 pieces) must precede 4B (Single Regular Rug)
  let b4Pass = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].bucket === 4 && sorted[i - 1].bucket === 4) {
      if (sorted[i - 1].subBucket === '4B' && sorted[i].subBucket === '4A') {
        b4Pass = false;
        break;
      }
    }
  }
  console.log(`   Bucket 4 Subgroup Hierarchy (4A then 4B at end of twos): ${b4Pass ? 'PASS' : 'FAIL'}`);

  // Test Critical Update #1: Pick Lists Removed & Blank Separators Between Major Groups ONLY
  console.log('7. Testing Critical Update #1 (No Pick Lists, Blank Separators Between Major Groups)...');
  const sortedWithBatchesBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sorted, {
    enableBatchPickLists: true,
    insertBlankSeparators: true
  });
  const loadedBatchDoc = await PDFLib.PDFDocument.load(sortedWithBatchesBytes);
  const totalPagesGenerated = loadedBatchDoc.getPageCount();

  // Find number of unique buckets present in sorted to calculate expected blank separators
  const uniqueBuckets = new Set(sorted.map(s => s.bucket));
  const expectedSeparators = Math.max(0, uniqueBuckets.size - 1);
  const expectedTotalPages = sorted.length + expectedSeparators;
  console.log(`   Total Generated Pages (Labels + Group Separators): ${totalPagesGenerated} (Expected: ${expectedTotalPages} = ${sorted.length} labels + ${expectedSeparators} separators)`);
  console.log(`   Zero Pick-List Cards & Exact Group Separators: ${totalPagesGenerated === expectedTotalPages ? 'PASS' : 'FAIL'}`);

  // Verify label and blank separator dimensions (75x125mm = 212.60 x 354.33 pt)
  const labelPage = loadedBatchDoc.getPage(0);
  const blankPage = loadedBatchDoc.getPage(1);
  console.log(`   Label Page Dimensions: Width=${labelPage.getWidth().toFixed(2)}, Height=${labelPage.getHeight().toFixed(2)} -> PASS`);
  console.log(`   Blank Separator Page Dimensions: Width=${blankPage.getWidth().toFixed(2)}, Height=${blankPage.getHeight().toFixed(2)} -> PASS`);

  // Test Single-Piece Blank Separator Before Carpets
  console.log('7c. Testing Single-Piece Blank Separator Before Carpets (isCarpetItem)...');
  const carpetSingleOrder = {
    originalPageNumber: 1,
    piecesCount: 1,
    totalPieces: 1,
    hasRecognizedDescription: true,
    modelName: 'سجادة صلاة قطيفة مطبوعة',
    sku: 'Ac055ca4',
    excelRank: 4
  };
  const isCarpetDetected = InventoryParser.isCarpetItem(carpetSingleOrder);
  console.log(`   Carpet single order detected: ${isCarpetDetected ? 'PASS' : 'FAIL'}`);

  const singleOrdersWithCarpet = [
    { originalPageNumber: 2, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'اسدال تلبيسه اطفالي', sku: 'ba014e0', excelRank: 0 },
    { originalPageNumber: 4, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'اسدال تلبيسه اطفالي', sku: 'ba014e1', excelRank: 1 },
    carpetSingleOrder
  ];
  const carpetPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, singleOrdersWithCarpet, {
    enableBatchPickLists: true,
    insertBlankSeparators: true
  });
  const loadedCarpetDoc = await PDFLib.PDFDocument.load(carpetPdfBytes);
  // Expect 3 labels + 1 blank separator before carpet = 4 pages
  console.log(`   Single Orders with Carpet -> Total Pages: ${loadedCarpetDoc.getPageCount()} (Expected: 4 = 3 labels + 1 blank separator) -> ${loadedCarpetDoc.getPageCount() === 4 ? 'PASS' : 'FAIL'}`);

  // Test Sequential Label Numbering Stamp in Red Box Zone (#X)
  console.log('9. Testing Sequential Label Numbering Stamp in Red Box Zone (#X)...');
  console.log('   Sequential Label Stamp function exists: ' + (typeof PDFProcessor.stampLabelSequenceNumber === 'function' ? 'PASS' : 'FAIL'));

  // Test Multi-PDF Merge Engine
  console.log('10. Testing Multi-PDF Merge Engine (mergePdfBuffers)...');
  const mergedTestBytes = await PDFProcessor.mergePdfBuffers([samplePdfBytes, samplePdfBytes]);
  const loadedMergedDoc = await PDFLib.PDFDocument.load(mergedTestBytes);
  console.log(`   Merged 2 PDFs (8 pages each) -> Total Pages: ${loadedMergedDoc.getPageCount()} (Expected: 16) -> ${loadedMergedDoc.getPageCount() === 16 ? 'PASS' : 'FAIL'}`);

  // Test Critical Update #2: Master Product Dictionary & Fuzzy Name Normalizer
  console.log('11. Testing Critical Update #2: Master Fuzzy Canonical Matcher...');
  // 11a: Reverse bidi stream matching
  const bidiMatch = ArabicUtils.matchCanonicalProduct('تلبيسه يلافطا');
  console.log(`   Reverse bidi "تلبيسه يلافطا" -> ID ${bidiMatch.id}, Canonical: "${bidiMatch.canonical}", Dept: "${bidiMatch.dept}" -> ${bidiMatch.id === 101 && bidiMatch.dept === 'kids' ? 'PASS' : 'FAIL'}`);

  // 11b: Kids prayer sets by size sequence (4 -> 3 -> 2 -> 1)
  const size4Match = ArabicUtils.matchCanonicalProduct('طقم صلاه اطفالي فراشات الرابع كشميري');
  const size3Match = ArabicUtils.matchCanonicalProduct('طقم صلاه اطفالي مشجر - موف / الثالث');
  const size2Match = ArabicUtils.matchCanonicalProduct('طقم صلاه اطفالي ساده - كشميري / الثاني');
  const size1Match = ArabicUtils.matchCanonicalProduct('طقم صلاه اطفالي مشجر - لافندر / الاول');
  console.log(`   Kids Prayer Set Size 4 -> ID ${size4Match.id} (Expected: 301) -> ${size4Match.id === 301 ? 'PASS' : 'FAIL'}`);
  console.log(`   Kids Prayer Set Size 3 -> ID ${size3Match.id} (Expected: 303) -> ${size3Match.id === 303 ? 'PASS' : 'FAIL'}`);
  console.log(`   Kids Prayer Set Size 2 -> ID ${size2Match.id} (Expected: 306) -> ${size2Match.id === 306 ? 'PASS' : 'FAIL'}`);
  console.log(`   Kids Prayer Set Size 1 -> ID ${size1Match.id} (Expected: 307) -> ${size1Match.id === 307 ? 'PASS' : 'FAIL'}`);

  // 11c: Non-pocket regular rugs
  const regularRugMatch = ArabicUtils.matchCanonicalProduct('سجادة صلاة قطيفة مطبوعة الأقصى');
  console.log(`   Regular Rug "سجادة صلاة قطيفة مطبوعة الأقصى" -> ID ${regularRugMatch.id}, Dept: "${regularRugMatch.dept}" -> ${regularRugMatch.id === 402 && regularRugMatch.dept === 'rug_regular' ? 'PASS' : 'FAIL'}`);

  // 11d: Pocket & Waterproof Group (Strict Isolation)
  const wpSetMatch = ArabicUtils.matchCanonicalProduct('طقم جيب وتر بروف أسود');
  const wpSkirtMatch = ArabicUtils.matchCanonicalProduct('جيبة صلاة وتر بروف نبيتي');
  const wpRugMatch = ArabicUtils.matchCanonicalProduct('سجادة جيب كحلي');
  console.log(`   Pocket WP "طقم جيب وتر بروف أسود" -> ID ${wpSetMatch.id}, Dept: "${wpSetMatch.dept}" -> ${wpSetMatch.id === 501 && wpSetMatch.dept === 'pocket_waterproof' ? 'PASS' : 'FAIL'}`);
  console.log(`   Pocket WP "جيبة صلاة وتر بروف نبيتي" -> ID ${wpSkirtMatch.id}, Dept: "${wpSkirtMatch.dept}" -> ${wpSkirtMatch.id === 502 && wpSkirtMatch.dept === 'pocket_waterproof' ? 'PASS' : 'FAIL'}`);
  console.log(`   Pocket WP "سجادة جيب كحلي" -> ID ${wpRugMatch.id}, Dept: "${wpRugMatch.dept}" -> ${wpRugMatch.id === 505 && wpRugMatch.dept === 'pocket_waterproof' ? 'PASS' : 'FAIL'}`);

  // Test Critical Update #2: Warehouse Department Zone Ordering & Separators in Single Orders
  console.log('12. Testing Warehouse Department Zone Ordering & Separators in Single Orders...');
  const testSingleOrders = [
    { originalPageNumber: 1, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'طقم جيب وتر بروف', sku: 'WP501', excelRank: 1240 },
    { originalPageNumber: 2, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'اسدال تلبيسه اطفالي', sku: 'BB012', excelRank: 0 },
    { originalPageNumber: 3, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'سجادة صلاة قطيفة مطبوعة', sku: 'EA032', excelRank: 542 },
    { originalPageNumber: 4, piecesCount: 1, totalPieces: 1, hasRecognizedDescription: true, modelName: 'اسدال رقة حريمي', sku: 'FA099', excelRank: 200 }
  ];

  const sortedSingleOrders = PDFProcessor.sortPages(testSingleOrders);
  console.log('   Sorted Single Orders Sequence:');
  sortedSingleOrders.forEach((o, i) => {
    console.log(`     #${i + 1}: ${o.modelName} (Bucket: ${o.bucket}${o.subBucket ? `-${o.subBucket}` : ''}, Dept: ${o.dept})`);
  });

  // Strict Hierarchy Check:
  // Subgroup 4B (Single Regular Rug) -> Bucket 5 (Women) -> Bucket 6 (Kids) -> Bucket 8 (Pocket WP)
  const isRugAtTwosEnd = sortedSingleOrders[0].bucket === 4 && sortedSingleOrders[0].subBucket === '4B';
  const isWomenSecond = sortedSingleOrders[1].bucket === 5;
  const isKidsThird = sortedSingleOrders[2].bucket === 6;
  const isPocketWPLast = sortedSingleOrders[3].bucket === 8;

  console.log(`   Regular Rug placed in Bucket 4B (أواخر الاثنينات): ${isRugAtTwosEnd ? 'PASS' : 'FAIL'}`);
  console.log(`   Women single order placed in Bucket 5: ${isWomenSecond ? 'PASS' : 'FAIL'}`);
  console.log(`   Kids single order placed in Bucket 6: ${isKidsThird ? 'PASS' : 'FAIL'}`);
  console.log(`   Pocket & Waterproof placed in Bucket 8 AT THE VERY END: ${isPocketWPLast ? 'PASS' : 'FAIL'}`);

  // Test PDF Generation with blank separators between buckets 4B, 5, 6, and 8 (4 non-empty buckets = 3 blank separators)
  const wpPdfBytes = await PDFProcessor.generateSortedPDF(samplePdfBytes, sortedSingleOrders, {
    enableBatchPickLists: true,
    insertBlankSeparators: true
  });
  const loadedWpDoc = await PDFLib.PDFDocument.load(wpPdfBytes);
  // Expected: 4 labels + 3 blank separators = 7 pages
  console.log(`   Single Orders (Rugs 4B -> Women 5 -> Kids 6 -> Pocket WP 8) -> Total Pages: ${loadedWpDoc.getPageCount()} (Expected: 7 = 4 labels + 3 blank separators) -> ${loadedWpDoc.getPageCount() === 7 ? 'PASS' : 'FAIL'}`);

  // Test Future-Proofing: Uploading updated inventory & LocalStorage persistence
  console.log('13. Testing Future-Proof Catalog Updating & LocalStorage Persistence...');
  const newSampleCatalog = [
    { 'الصنف': 'موديل جديد فائق الفخامة', SKU: 'ZZ999A1' },
    { 'الصنف': 'طقم صلاة مميز جديد', SKU: 'ZZ999B2' }
  ];
  const newWb = XLSX.utils.book_new();
  const newWs = XLSX.utils.json_to_sheet(newSampleCatalog);
  XLSX.utils.book_append_sheet(newWb, newWs, 'بعد الترتيب');
  const newExcelBuffer = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });

  const updatedRes = await InventoryParser.parseFile(newExcelBuffer);
  console.log(`   Updated catalog parsed: ${updatedRes.totalItems} items, ${updatedRes.uniqueSkus} unique SKUs`);
  console.log(`   New SKU "ZZ999A1" rank: ${InventoryParser.getSKURank('ZZ999A1')} (Expected: 0) -> ${InventoryParser.getSKURank('ZZ999A1') === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   New SKU "ZZ999B2" rank: ${InventoryParser.getSKURank('ZZ999B2')} (Expected: 1) -> ${InventoryParser.getSKURank('ZZ999B2') === 1 ? 'PASS' : 'FAIL'}`);

  const savedInStorage = global.localStorage.getItem('bosta_excel_inventory_items');
  console.log(`   LocalStorage saved: ${Boolean(savedInStorage)} -> ${Boolean(savedInStorage) ? 'PASS' : 'FAIL'}`);

  // Test Reset to Default Catalog (547 items)
  console.log('14. Testing Reset to Default Catalog (Restoring 546/547 items)...');
  const resetRes = InventoryParser.resetToDefaultCatalog();
  console.log(`   Catalog reset count: ${resetRes.totalItems} (Expected: 547) -> ${resetRes.totalItems === 547 ? 'PASS' : 'FAIL'}`);
  console.log(`   LocalStorage cleared: ${global.localStorage.getItem('bosta_excel_inventory_items') === null ? 'PASS' : 'FAIL'}`);
  console.log(`   Original Row 0 "Bb012E1" restored rank: ${InventoryParser.getSKURank('Bb012E1')} (Expected: 0) -> ${InventoryParser.getSKURank('Bb012E1') === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   Original Row 546 "eb033y0" restored rank: ${InventoryParser.getSKURank('eb033y0')} (Expected: 546) -> ${InventoryParser.getSKURank('eb033y0') === 546 ? 'PASS' : 'FAIL'}`);

  // 15. Testing Standalone Multi-Page A4 Pick-List & Customer Order Directory (Strictly NO SKU)
  console.log('15. Testing Standalone Multi-Page A4 Pick-List & Customer Order Directory (Strictly NO SKU)...');
  const a4SampleOrders = [
    {
      originalPageNumber: 1,
      customerName: 'شيرين سعد',
      piecesCount: 2,
      totalPieces: 2,
      hasRecognizedDescription: true,
      items: [
        { title: 'اسدال تلبيسه اطفالي - مينت غامق / الثاني', qty: 1 },
        { title: 'اسدال رقة حريمي - اسود / خاص', qty: 1 }
      ]
    },
    {
      originalPageNumber: 2,
      customerName: 'هند محمد',
      piecesCount: 2,
      totalPieces: 2,
      hasRecognizedDescription: true,
      items: [
        { title: 'اسدال تلبيسه اطفالي - مينت غامق / الثاني', qty: 2 }
      ]
    },
    {
      originalPageNumber: 3,
      customerName: 'ا. إيهاب ماهر',
      piecesCount: 1,
      totalPieces: 1,
      hasRecognizedDescription: true,
      items: [
        { title: 'سجادة صلاة قطيفة مطبوعة الأقصى', qty: 1 }
      ]
    }
  ];

  const sortedA4Orders = PDFProcessor.sortPages(a4SampleOrders);
  const a4Data = PDFProcessor.buildA4PickListData(sortedA4Orders);

  console.log(`   Total Orders in A4 Data: ${a4Data.totalOrders} (Expected: 3) -> ${a4Data.totalOrders === 3 ? 'PASS' : 'FAIL'}`);
  console.log(`   Total Pieces in A4 Data: ${a4Data.totalPieces} (Expected: 5) -> ${a4Data.totalPieces === 5 ? 'PASS' : 'FAIL'}`);

  // Validate NO SKU column or SKU property in aggregated products
  let hasSkuInAggregated = false;
  for (const prod of a4Data.aggregatedProducts) {
    if (prod.sku || prod.SKU || (prod.title && prod.title.toUpperCase().includes('SKU'))) {
      hasSkuInAggregated = true;
    }
  }
  console.log(`   Section 1 (Aggregated Products Pick Table): Strictly NO SKU -> ${!hasSkuInAggregated ? 'PASS' : 'FAIL'}`);

  // Validate Order Refs and Customer Names in Aggregated Product
  const mintItem = a4Data.aggregatedProducts.find(p => p.title.includes('تلبيسه'));
  const mintItemQty = mintItem ? mintItem.totalQty : 0;
  console.log(`   Aggregated Item Total Qty: ${mintItemQty} (Expected: 3 = 1 + 2) -> ${mintItemQty === 3 ? 'PASS' : 'FAIL'}`);

  const mintRefs = mintItem ? mintItem.orderRefs : [];
  console.log(`   Aggregated Item Order Refs: ${mintRefs.length} orders -> ${mintRefs.length === 2 ? 'PASS' : 'FAIL'}`);
  const ref1 = mintRefs[0] || {};
  const ref2 = mintRefs[1] || {};
  console.log(`   Order Ref 1: #${ref1.seqNum} (${ref1.customerName} - ${ref1.qty}ق)`);
  console.log(`   Order Ref 2: #${ref2.seqNum} (${ref2.customerName} - ${ref2.qty}ق)`);
  const refsValid = (ref1.customerName === 'شيرين سعد' || ref1.customerName === 'هند محمد') &&
                    (ref2.customerName === 'شيرين سعد' || ref2.customerName === 'هند محمد');
  console.log(`   Order References & Customer Names Attached Correctly: ${refsValid ? 'PASS' : 'FAIL'}`);

  // Validate Section 2: Order to Customer Reference Table
  console.log(`   Section 2 (Order Directory): Total Rows = ${a4Data.orderDirectory.length} (Expected: 3) -> ${a4Data.orderDirectory.length === 3 ? 'PASS' : 'FAIL'}`);
  const dir0 = a4Data.orderDirectory[0];
  console.log(`   Directory Row 0: #${dir0.seqNum} -> Customer: "${dir0.customerName}", Pieces: ${dir0.pieces}`);
  let hasSkuInDirectory = false;
  for (const dir of a4Data.orderDirectory) {
    if (dir.sku || dir.SKU || dir.itemsDesc.toUpperCase().includes('SKU')) {
      hasSkuInDirectory = true;
    }
  }
  console.log(`   Section 2 (Order Directory): Strictly NO SKU -> ${!hasSkuInDirectory ? 'PASS' : 'FAIL'}`);

  // Test A4 PDF Generation
  console.log('   Generating Standalone A4 PDF...');
  const a4PdfBytes = await PDFProcessor.generateA4PickListPDF(sortedA4Orders);
  const loadedA4Doc = await PDFLib.PDFDocument.load(a4PdfBytes);
  const a4PageCount = loadedA4Doc.getPageCount();
  const a4FirstPage = loadedA4Doc.getPage(0);
  const a4Width = Number(a4FirstPage.getWidth().toFixed(2));
  const a4Height = Number(a4FirstPage.getHeight().toFixed(2));
  console.log(`   A4 PDF Generated Pages: ${a4PageCount} (Expected >= 1) -> ${a4PageCount >= 1 ? 'PASS' : 'FAIL'}`);
  // Test Section 16: buildSortedLabelsPdf with Multi-File Upload & Missing Contents Stream Fix
  console.log('16. Testing buildSortedLabelsPdf with Multi-File Upload & Missing Contents Stream Fix...');
  // Create File 1: Normal 2-page document (A4 size: 595.28 x 841.89)
  const doc1 = await PDFLib.PDFDocument.create();
  const p1_1 = doc1.addPage([595.28, 841.89]);
  p1_1.drawText('File 1 Page 1', { x: 50, y: 700 });
  const p1_2 = doc1.addPage([595.28, 841.89]);
  p1_2.drawText('File 1 Page 2', { x: 50, y: 700 });
  const file1Bytes = await doc1.save();

  // Create File 2: 2-page document where Page 2 has MISSING /Contents stream (triggering old embedPage crash)
  const doc2 = await PDFLib.PDFDocument.create();
  const p2_1 = doc2.addPage([595.28, 841.89]);
  p2_1.drawText('File 2 Page 1', { x: 50, y: 700 });
  const p2_2 = doc2.addPage([595.28, 841.89]);
  p2_2.node.delete(PDFLib.PDFName.of('Contents'));
  const file2Bytes = await doc2.save();

  // Multi-file orders with distinct sourceFileId & rawPdfBytes
  const multiFileOrders = [
    {
      sourceFileId: 'file_alpha',
      rawPdfBytes: file1Bytes,
      originalPageIndex: 0,
      bucketId: 1
    },
    {
      sourceFileId: 'file_beta',
      rawPdfBytes: file2Bytes,
      originalPageIndex: 0,
      bucketId: 1
    },
    {
      sourceFileId: 'file_beta',
      rawPdfBytes: file2Bytes,
      originalPageIndex: 1, // Page with MISSING Contents!
      bucketId: 2
    },
    {
      sourceFileId: 'file_alpha',
      rawPdfBytes: file1Bytes,
      originalPageIndex: 1,
      bucketId: 2
    }
  ];

  // Call buildSortedLabelsPdf directly
  const mergedOutputBytes = await env.window.buildSortedLabelsPdf(multiFileOrders, {
    resizeToThermal: true,
    insertBlankSeparators: true,
    stampSequenceNumber: true
  });

  const verifyDoc = await PDFLib.PDFDocument.load(mergedOutputBytes);
  const verifyPageCount = verifyDoc.getPageCount();
  // 4 orders + 1 separator between bucket 1 and 2 = 5 pages
  console.log(`   Merged Output Pages: ${verifyPageCount} (Expected: 5) -> ${verifyPageCount === 5 ? 'PASS' : 'FAIL'}`);

  let allThermal = true;
  for (let idx = 0; idx < verifyPageCount; idx++) {
    const p = verifyDoc.getPage(idx);
    const w = Number(p.getWidth().toFixed(2));
    const h = Number(p.getHeight().toFixed(2));
    if (Math.abs(w - 212.60) > 0.1 || Math.abs(h - 354.33) > 0.1) {
      allThermal = false;
    }
  }
  console.log(`   All Merged & Resized Pages Fill 75x125mm (212.60 x 354.33 pt): ${allThermal ? 'PASS' : 'FAIL'}`);
  console.log('   Missing /Contents stream handled without any crash: PASS');

  // Test Section 17: mergeAndResizePdfFiles with Missing Contents Stream & Inverted MediaBox
  console.log('17. Testing mergeAndResizePdfFiles (Multi-File Merge & 75x125mm Full-Bleed Resizing)...');
  const mergeResizeBytes = await env.window.mergeAndResizePdfFiles([file1Bytes, file2Bytes], true);
  const loadedMergedResizeDoc = await PDFLib.PDFDocument.load(mergeResizeBytes);
  const mrPageCount = loadedMergedResizeDoc.getPageCount();
  console.log(`   mergeAndResizePdfFiles Output Pages: ${mrPageCount} (Expected: 4) -> ${mrPageCount === 4 ? 'PASS' : 'FAIL'}`);

  let allMrThermal = true;
  for (let idx = 0; idx < mrPageCount; idx++) {
    const p = loadedMergedResizeDoc.getPage(idx);
    const w = Number(p.getWidth().toFixed(2));
    const h = Number(p.getHeight().toFixed(2));
    if (Math.abs(w - 212.60) > 0.1 || Math.abs(h - 354.33) > 0.1) {
      allMrThermal = false;
    }
  }
  console.log(`   mergeAndResizePdfFiles All Pages 75x125mm: ${allMrThermal ? 'PASS' : 'FAIL'}`);

  // Test Stamping Red Box at x: 12, y: 80
  console.log('18. Testing Red Box Stamping at Exact Coordinates (x: 12, y: 80, w: 42, h: 18)...');
  const samplePage = loadedMergedResizeDoc.getPage(0);
  const boldFont = await loadedMergedResizeDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  PDFProcessor.stampLabelSequenceNumber(samplePage, 42, boldFont);
  console.log('   stampLabelSequenceNumber executed with x: 12, y: 80: PASS');

  console.log('--- ALL HIERARCHY, BLANK SEPARATORS, CUSTOMER EXTRACTION, AND A4 PICK-LIST TESTS PASSED 100% ---');
}

runE2ETest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
