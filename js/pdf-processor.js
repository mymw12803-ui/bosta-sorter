/**
 * PDF Processing Engine
 * - In-memory Rubik CMap patching (using pako)
 * - Text extraction & strict line grouping (tolerance ±2.5 pt, Y descending, X descending)
 * - Multi-level warehouse sorting (Fast Picking Strategy A, B, C)
 * - Fast, zero-loss thermal PDF resizing (75mm x 125mm = 212.60 x 354.33 pt)
 */

const PDFProcessor = {
  // Conversion constant: 1 mm = 2.83464567 PDF points (72 pt / 25.4 mm)
  MM_TO_PT: 2.83464567,

  // Master Warehouse Route Sequence (dynamically synced with ArabicUtils and localStorage)
  get WAREHOUSE_ROUTE_SEQUENCE() {
    if (typeof ArabicUtils !== 'undefined' && ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE) {
      return ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE;
    }
    return this._routeSequence || [];
  },
  set WAREHOUSE_ROUTE_SEQUENCE(val) {
    this._routeSequence = val;
    if (typeof ArabicUtils !== 'undefined') {
      ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE = val;
    }
  },

  // Helper to find the physical picking index (Rank 0..N) for any given product
  getWarehouseRouteRank(productDescription) {
    if (typeof InventoryParser !== 'undefined' && typeof InventoryParser.getItemRank === 'function') {
      const r = InventoryParser.getItemRank({ modelName: productDescription });
      if (r !== 999999) return r;
    }
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.getWarehouseRouteRank === 'function') {
      return ArabicUtils.getWarehouseRouteRank(productDescription);
    }
    return 999999;
  },

  // Helper to compute physical picking rank for an entire order (minimum SKU/item rank)
  getOrderRouteRank(order) {
    if (!order) return 999999;
    if (typeof InventoryParser !== 'undefined' && typeof InventoryParser.getOrderExcelRank === 'function') {
      return InventoryParser.getOrderExcelRank(order);
    }
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.getOrderRouteRank === 'function') {
      return ArabicUtils.getOrderRouteRank(order);
    }
    return 999999;
  },

  /**
   * Initializes pdf.js worker
   */
  initPdfJs() {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('مكتبة pdf.js غير محملة. يرجى التحقق من اتصال الإنترنت.');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  },

  /**
   * Merges multiple PDF Uint8Arrays / ArrayBuffers into a single unified document
   */
  async mergePdfBuffers(buffersArray, onProgress) {
    const pdfLibModule = typeof PDFLib !== 'undefined' ? PDFLib : (typeof global !== 'undefined' ? global.PDFLib : null);
    if (!pdfLibModule) throw new Error('مكتبة pdf-lib غير متوفرة لدمج الملفات.');
    const mergedDoc = await pdfLibModule.PDFDocument.create();

    for (let fIdx = 0; fIdx < buffersArray.length; fIdx++) {
      if (onProgress) {
        onProgress({
          current: fIdx + 1,
          total: buffersArray.length,
          percent: Math.round(((fIdx + 1) / buffersArray.length) * 100),
          phase: `دمج ملف PDF رقم ${fIdx + 1} من ${buffersArray.length}...`
        });
      }
      await new Promise(r => setTimeout(r, 0));
      const srcDoc = await pdfLibModule.PDFDocument.load(buffersArray[fIdx], { ignoreEncryption: true });
      const indices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
      copiedPages.forEach(p => mergedDoc.addPage(p));
    }
    return await mergedDoc.save();
  },

  /**
   * Extract text and metadata from all pages in the PDF with CMap recovery
   */
  async extractPages(arrayBuffer, onProgress) {
    this.initPdfJs();

    // 1. Safe clone
    const safeBuffer = arrayBuffer.slice(0);

    // 2. Patch /ToUnicode CMaps in memory using Rubik glyph table if pako is available
    let bufferToLoad = safeBuffer;
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.patchPdfCMap === 'function') {
      bufferToLoad = ArabicUtils.patchPdfCMap(safeBuffer);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: bufferToLoad,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const extractedData = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (onProgress) {
        onProgress({
          current: pageNum,
          total: numPages,
          percent: Math.round((pageNum / numPages) * 100),
          phase: `قراءة وتحليل البوليصة ${pageNum} من أصل ${numPages}...`
        });
      }
      // Non-blocking yield to browser event loop so UI never freezes
      await new Promise(r => setTimeout(r, 0));

      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items into lines based on Y coordinate (tolerance ±2.5 pt)
      const items = textContent.items.map(item => ({
        str: ArabicUtils.cleanArabicStreamText(item.str),
        rawStr: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height
      }));

      // Sort items top-to-bottom (Y descending)
      items.sort((a, b) => b.y - a.y || b.x - a.x);

      const lines = [];
      let currentLine = [];
      let currentY = null;

      for (const item of items) {
        if (!item.rawStr && !item.str) continue;
        const isWhitespaceOnly = !item.str || item.str.trim() === '';
        // If it's a space or width > 3pt, keep it as space token
        if (isWhitespaceOnly && (item.width > 2.5 || item.rawStr === '\u0003' || item.rawStr === ' ')) {
          item.isSpace = true;
        } else if (isWhitespaceOnly) {
          continue;
        }

        if (currentY === null || Math.abs(item.y - currentY) > 2.5) {
          if (currentLine.length > 0) {
            lines.push(this.reconstructLineFromItems(currentLine));
          }
          currentLine = [item];
          currentY = item.y;
        } else {
          currentLine.push(item);
        }
      }

      if (currentLine.length > 0) {
        lines.push(this.reconstructLineFromItems(currentLine));
      }

      // Parse Bosta Arabic format strictly
      const parsed = ArabicUtils.parseBostaPage(lines, pageNum, items);

      // If inventory sheet was loaded, enrich with SKU matching and walkIndex
      if (typeof InventoryParser !== 'undefined') {
        if (!parsed.sku && parsed.modelName) {
          const match = InventoryParser.matchProduct(parsed);
          if (match && match.sku) {
            parsed.sku = match.sku;
            parsed.matchedInventory = match;
          }
        }
        parsed.walkIndex = InventoryParser.getWalkIndex(parsed);
      } else {
        parsed.walkIndex = 999999;
      }

      // Enrich with routeRank from 50 master warehouse sequence
      parsed.routeRank = typeof parsed.routeRank === 'number' ? parsed.routeRank : this.getOrderRouteRank(parsed);

      extractedData.push(parsed);
    }

    return extractedData;
  },

  /**
   * Helper to reconstruct a single line from text items preserving word spaces
   */
  reconstructLineFromItems(lineItems) {
    if (!lineItems || lineItems.length === 0) return '';
    // Sort horizontally for RTL: X descending (right to left)
    lineItems.sort((a, b) => b.x - a.x);

    let lineStr = '';
    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (it.isSpace) {
        if (lineStr.length > 0 && !lineStr.endsWith(' ')) lineStr += ' ';
        continue;
      }
      const text = (it.str || '').trim();
      if (!text) continue;

      if (lineStr.length > 0 && !lineStr.endsWith(' ')) {
        const prev = lineItems[i - 1];
        // In RTL, prev is to the right (higher X). Distance: prev.x - (it.x + it.width)
        const gap = prev ? (prev.x - (it.x + (it.width || 0))) : 0;
        if (gap > 2.5 || (prev && prev.isSpace)) {
          lineStr += ' ';
        } else {
          lineStr += ' ';
        }
      }
      lineStr += text;
    }

    return ArabicUtils.cleanArabicStreamText(lineStr);
  },

  /**
   * Helper to determine piece group rank:
   * Rank 1: Large orders (3+ pieces)
   * Rank 2: Two-piece orders (2 pieces)
   * Rank 3: Single-piece orders (1 piece)
   * Rank 4: Unrecognized / empty description
   */
  getPieceGroup(item) {
    if (!item.hasRecognizedDescription) return 4;
    const count = item.piecesCount || item.totalItemsCount || 1;
    if (count >= 3) return 1;
    if (count === 2) return 2;
    return 3;
  },

  /**
   * Helper to determine department rank:
   * Rank 1: Women ("حريمي")
   * Rank 2: Kids ("أطفالي")
   * Rank 3: Others ("سجاد", "شنط", etc.)
   */
  getDeptRank(item) {
    if (item.isWomen) return 1;
    if (item.isKids) return 2;
    return 3;
  },

  /**
   * Legacy strategy 1 helper kept for backwards compatibility
   */
  getStrategy1GroupRank(item) {
    if (!item.hasRecognizedDescription) return 6;
    const count = item.piecesCount || item.totalItemsCount || 1;
    if (count >= 3) return 1;
    if (count === 2) return 2;
    if (item.isWomen) return 3;
    if (item.isKids) return 4;
    return 5;
  },

  /**
   * Strict Multi-Level Sorting Pipeline:
   * Level 1 (Primary - Mandatory): Total Pieces Count Descending:
   *   Group A: Large Orders (3+ pieces: 8, 7, 6, 5, 4, 3...).
   *   Group B: Two-Piece Orders (2 قطع).
   *   Group C: Single-Piece Orders (1 قطعة) placed strictly at the end.
   *   if (b.totalPieces !== a.totalPieces) return b.totalPieces - a.totalPieces;
   *
   * Level 2 (Secondary): Master Route Sequence (0 to 49):
   *   For single-piece orders: sort strictly by getWarehouseRouteRank(order.products[0].description).
   *   For multi-piece orders: compute minimum route index among order's items
   *     Math.min(...order.products.map(p => getWarehouseRouteRank(p.description)))
   *     so order is picked at earliest aisle encounter, followed by model/color/size tie-breakers.
   *
   * Level 3 (Optional): If an Inventory CSV/SKU sheet is uploaded:
   *   Use uploaded CSV's row sequence as tie-breaker within identical route ranks.
  /**
   * Helper to inspect items in an order for regular prayer rugs and waterproof/pocket items
   */
  getOrderRugAndWaterproofAnalysis(order) {
    const products = (order.products && Array.isArray(order.products) && order.products.length > 0)
      ? order.products
      : [];

    let hasRegularRug = false;
    let regularRugCount = 0;
    let hasPocketWaterproof = false;
    let pocketWaterproofCount = 0;
    let otherCount = 0;

    for (const p of products) {
      const text = `${p.modelName || ''} ${p.title || ''} ${p.rawLineText || ''} ${p.description || ''}`;
      const qty = p.qty || 1;
      const dept = p.dept || ((typeof ArabicUtils !== 'undefined') ? ArabicUtils.matchCanonicalProduct(text, p.size || '').dept : 'other');

      if (dept === 'pocket_waterproof' || (typeof ArabicUtils !== 'undefined' && ArabicUtils.isPocketWaterproofItem(p))) {
        hasPocketWaterproof = true;
        pocketWaterproofCount += qty;
      } else if (dept === 'rug_regular' || (typeof ArabicUtils !== 'undefined' && ArabicUtils.isRegularRugItem(p))) {
        hasRegularRug = true;
        regularRugCount += qty;
      } else {
        otherCount += qty;
      }
    }

    // Fallback if products was empty
    if (products.length === 0) {
      const count = order.piecesCount || 1;
      const text = `${order.modelName || ''} ${order.title || ''} ${order.rawDescription || ''} ${order.fullNormalizedDesc || ''}`;
      if (typeof ArabicUtils !== 'undefined' && ArabicUtils.isPocketWaterproofItem(order)) {
        hasPocketWaterproof = true;
        pocketWaterproofCount = count;
      } else if (typeof ArabicUtils !== 'undefined' && ArabicUtils.isRegularRugItem(order)) {
        hasRegularRug = true;
        regularRugCount = count;
      } else {
        otherCount = count;
      }
    }

    const totalPieces = typeof order.piecesCount === 'number'
      ? order.piecesCount
      : (parseInt(order.totalPieces, 10) || (regularRugCount + pocketWaterproofCount + otherCount) || 1);

    const hasOtherProductWithRug = hasRegularRug && (
      otherCount > 0 ||
      hasPocketWaterproof ||
      (products.length > 1 && products.some(p => !ArabicUtils.isRegularRugItem(p))) ||
      totalPieces > regularRugCount
    );

    return {
      hasRegularRug,
      regularRugCount,
      hasPocketWaterproof,
      pocketWaterproofCount,
      otherCount,
      totalPieces,
      hasOtherProductWithRug
    };
  },

  /**
   * Exact New Sorting & Grouping Hierarchy:
   * Classifies order into one of the exact Main Buckets (1 to 8):
   * Bucket 1 — Large Orders (4+ Pieces, sorted descending: 8 -> 7 -> 6 -> 5 -> 4 قطع)
   * Bucket 2 — Three-Piece Orders (3 قطع without non-pocket rugs)
   * Bucket 3 — Orders Containing a Regular Prayer Rug WITH Another Product (مع منتج آخر)
   * Bucket 4 — Two-Piece Orders (2 قطع) + Single Regular Prayer Rug at the End of Twos (أواخر الاثنينات):
   *   - Subgroup 4A: Normal 2-piece orders (2 قطع)
   *   - Subgroup 4B: Single Regular Prayer Rug (سجادة واحدة فقط ليست جيب)
   * Bucket 5 — Single-Piece Women Orders (1 قطعة - الحريمي)
   * Bucket 6 — Single-Piece Kids Orders (1 قطعة - الأطفالي)
   * Bucket 7 — Single-Piece Other Items (Bags/Accessories)
   * Bucket 8 (FINAL GROUP) — Pocket & Waterproof Orders (مجموعة الجيب ووتر بروف في نهاية البوالص)
   * Bucket 9 — Unrecognized Orders
   */
  classifyOrderBucket(order) {
    if (order.hasRecognizedDescription === false) {
      return { bucket: 9, subBucket: '', name: 'غير معرّف' };
    }

    const analysis = this.getOrderRugAndWaterproofAnalysis(order);
    const count = analysis.totalPieces;

    // Bucket 8 (FINAL GROUP AT THE END OF THE PDF) — Pocket & Waterproof Orders:
    // All single-piece orders (or pure waterproof/pocket orders) whose product description contains جيب OR وتر بروف
    if (analysis.hasPocketWaterproof && (count === 1 || (analysis.otherCount === 0 && !analysis.hasRegularRug))) {
      return { bucket: 8, subBucket: '', name: 'مجموعة الجيب ووتر بروف' };
    }

    // Bucket 3 — Orders Containing a Regular Prayer Rug WITH Another Product (مع منتج آخر):
    // Any order where at least one item is a regular prayer rug AND the order has another product with it.
    // Placed strictly between the 3-piece orders (الثلاثات) and the 2-piece orders (الاثنينات)!
    if (analysis.hasRegularRug && analysis.hasOtherProductWithRug) {
      return { bucket: 3, subBucket: '', name: 'سجادة صلاة مع منتج آخر' };
    }

    // Bucket 1 — Large Orders (4+ Pieces, excluding Rug+Other):
    if (count >= 4) {
      return { bucket: 1, subBucket: '', name: 'أوردرات كبيرة (4 قطع فأكثر)' };
    }

    // Bucket 2 — Three-Piece Orders (3 قطع without non-pocket rugs):
    if (count === 3) {
      return { bucket: 2, subBucket: '', name: 'أوردرات 3 قطع' };
    }

    // Bucket 4 — Two-Piece Orders (2 قطع) + Single Regular Prayer Rug at the End of Twos (أواخر الاثنينات):
    // Subgroup 4A: Normal 2-piece orders (2 قطع)
    if (count === 2) {
      return { bucket: 4, subBucket: '4A', name: 'أوردرات قطعتين (2 قطعة)' };
    }
    // Subgroup 4B (At the very end of 2-piece orders / في أواخر الاثنينات): Any order consisting ONLY of a Single Regular Prayer Rug!
    if (count === 1 && analysis.hasRegularRug && analysis.otherCount === 0 && !analysis.hasPocketWaterproof) {
      return { bucket: 4, subBucket: '4B', name: 'سجادة صلاة فردية عادية' };
    }

    // Single-Piece Orders (1 piece):
    if (count === 1) {
      const dept = order.dept || ((typeof ArabicUtils !== 'undefined') ? ArabicUtils.getOrderDepartment(order) : 'other');

      // Bucket 5 — Single-Piece Women Orders (1 قطعة - الحريمي excluding جيب/وتر بروف)
      if (dept === 'women') {
        return { bucket: 5, subBucket: '', name: 'أوردرات حريمي قطعة واحدة' };
      }

      // Bucket 6 — Single-Piece Kids Orders (1 قطعة - الأطفالي excluding جيب/وتر بروف)
      if (dept === 'kids') {
        return { bucket: 6, subBucket: '', name: 'أوردرات أطفالي قطعة واحدة' };
      }

      // Bucket 7 — Single-Piece Other Items (Bags/Accessories excluding جيب/وتر بروف)
      return { bucket: 7, subBucket: '', name: 'أوردرات أصناف أخرى قطعة واحدة' };
    }

    // Fallback if pieces count > 1 but couldn't be categorized
    if (count >= 4) return { bucket: 1, subBucket: '', name: 'أوردرات كبيرة (4+ قطع)' };
    if (count === 3) return { bucket: 2, subBucket: '', name: 'أوردرات 3 قطع' };
    if (count === 2) return { bucket: 4, subBucket: '4A', name: 'أوردرات قطعتين' };
    return { bucket: 7, subBucket: '', name: 'أخرى' };
  },

  /**
   * Universal Multi-Tiered Sorting Pipeline using the Exact 8-Bucket Hierarchy
   */
  sortPages(pages, options = {}) {
    const list = [...pages];
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    let opts = options;
    if (typeof options === 'string') {
      opts = { strategy: options, useWalkSequence: true };
    }
    const useWalkSequence = opts.useWalkSequence !== false;

    // Pre-calculate pieces count, department, and Master Excel Rank for stability
    for (const item of list) {
      const count = typeof item.totalPieces === 'number'
        ? item.totalPieces
        : (item.piecesCount || item.totalItemsCount || parseInt(item.totalPieces, 10) || 1);
      item.piecesCount = count;
      item.totalPieces = count;
      item.dept = item.dept || (typeof ArabicUtils !== 'undefined' ? ArabicUtils.getOrderDepartment(item) : 'other');
      item.excelRank = (typeof InventoryParser !== 'undefined')
        ? InventoryParser.getOrderExcelRank(item)
        : this.getOrderRouteRank(item);
      item.routeRank = item.excelRank;

      // Classify into exact 8-Bucket Hierarchy
      const bInfo = this.classifyOrderBucket(item);
      item.bucket = bInfo.bucket;
      item.subBucket = bInfo.subBucket;
      item.bucketName = bInfo.name;
    }

    list.sort((a, b) => {
      // Unrecognized/empty pages are pushed to the end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Tier 1 (Mandatory & Primary): Main Bucket (1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9)
      if (a.bucket !== b.bucket) {
        return a.bucket - b.bucket;
      }

      // Inside Bucket 4: Subgroup 4A (2-Piece Orders) come before Subgroup 4B (Single Regular Rugs at the end of twos)
      if (a.bucket === 4 && a.subBucket !== b.subBucket) {
        return (a.subBucket === '4A') ? -1 : 1;
      }

      // Inside Bucket 1: Total Pieces descending (8 -> 7 -> 6 -> 5 -> 4)
      if (a.bucket === 1 && ((b.piecesCount || 1) !== (a.piecesCount || 1))) {
        return (b.piecesCount || 1) - (a.piecesCount || 1);
      }

      // Tier 2 (Secondary): Master Excel SKU Sequence Rank (0 to N from sheet بعد الترتيب)
      // Maps each SKU or item text to physical warehouse picking aisle order
      const rankA = typeof a.excelRank === 'number' ? a.excelRank : 999999;
      const rankB = typeof b.excelRank === 'number' ? b.excelRank : 999999;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // Tie Breakers within identical piece count and Excel row rank:
      // Model Name
      const modelA = a.normalizedModel || a.modelName || '';
      const modelB = b.normalizedModel || b.modelName || '';
      const modelCmp = arCollator.compare(modelA, modelB);
      if (modelCmp !== 0) return modelCmp;

      // Color / Variant Code
      const colorA = a.normalizedColor || a.color || '';
      const colorB = b.normalizedColor || b.color || '';
      const colorCmp = arCollator.compare(colorA, colorB);
      if (colorCmp !== 0) return colorCmp;

      // Size Rank: الأول -> الثاني -> الثالث -> الرابع
      const sizeA = ArabicUtils.getSizeRank(a.normalizedSize || a.size);
      const sizeB = ArabicUtils.getSizeRank(b.normalizedSize || b.size);
      if (sizeA !== sizeB) return sizeA - sizeB;

      // Full Description Tie-Breaker
      const descA = a.fullNormalizedDesc || a.rawDescription || '';
      const descB = b.fullNormalizedDesc || b.rawDescription || '';
      const descCmp = arCollator.compare(descA, descB);
      if (descCmp !== 0) return descCmp;

      return a.originalPageNumber - b.originalPageNumber;
    });

    return list.map((item, idx) => ({
      ...item,
      newPageNumber: idx + 1
    }));
  },

  /**
   * Stamps clean sequential reference #X inside the bottom-left corner of "وصف الشحنة"
   * (Shipment Description) box, directly above the horizontal divider line of the "Tracking Number" box.
   * Exact Coordinates on a 212.60 x 354.33 pt page:
   *   - Horizontal (X): 14 pt from left edge (~7% from left edge, aligned above Tracking Number)
   *   - Vertical (Y): 82 pt from bottom edge (within 80..92 pt bottom-up, ~262..274 pt top-down)
   * Clean white background pill (44 x 18 pt) with thin black border and bold black text #X (12 pt).
   * NEVER covers return address, barcode, or Arabic description text.
   * NEVER called on blank separator pages.
   */
  stampLabelSequenceNumber(page, seqNumber, font) {
    if (!page || !seqNumber || !font) return;
    const { rgb } = (typeof PDFLib !== 'undefined' ? PDFLib : (typeof global !== 'undefined' ? global.PDFLib : null));

    const numText = `#${seqNumber}`;
    const fontSize = 12; // Bold 12pt
    const textW = font.widthOfTextAtSize(numText, fontSize);

    // Box dimensions: width 44pt (gracefully expands for 4+ digits), height 18pt
    const pillW = Math.max(44, textW + 10);
    const pillH = 18;

    // Exact placement in Red Box Zone: bottom-left of "وصف الشحنة", above Tracking Number divider
    const x = 14;
    const y = 82;

    // Draw clean white background pill with thin black border
    page.drawRectangle({
      x,
      y,
      width: pillW,
      height: pillH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.0
    });

    // Draw bold black text #X centered inside the pill
    const textX = x + (pillW - textW) / 2;
    const textY = y + (pillH - fontSize) / 2 + 2;

    page.drawText(numText, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0)
    });
  },

  /**
   * Generates an enhanced batch pick list sheet (75mm x 125mm = 212.60 x 354.33 pt)
   * 1. Header Attribution: 📦 بطاقة تجهيز المخزن (تابعة للبوالص السابقة ⬆️) | من بوليصة [#Start] إلى [#End]
   * 2. Body Items Checklist: Model + Color + Size + Total QTY with [ ] checkbox
   * 3. Bottom Orders Breakdown Box: #, Order Ref, AWB, Qty cross-verification table
   */
  async createPickListSheet(outDoc, batch, batchType = 'large') {
    const totalOrders = batch.length;
    let totalPieces = 0;
    const itemMap = new Map();

    const startNum = (batch[0] && batch[0].newPageNumber) ? batch[0].newPageNumber : 1;
    const endNum = (batch[batch.length - 1] && batch[batch.length - 1].newPageNumber) ? batch[batch.length - 1].newPageNumber : batch.length;

    for (const order of batch) {
      const orderPieces = order.piecesCount || order.totalItemsCount || (order.products ? order.products.reduce((a, b) => a + (b.qty || 1), 0) : 1);
      totalPieces += orderPieces;

      const items = (order.products && order.products.length > 0)
        ? order.products
        : [{
            modelName: order.modelName || 'صنف غير محدد',
            color: order.color || '',
            colorCode: order.colorCode || '',
            size: order.size || '',
            qty: orderPieces,
            sku: order.sku || ''
          }];

      for (const it of items) {
        let itemSku = it.sku || order.sku || '';
        const model = it.modelName || order.modelName || 'صنف غير محدد';
        const color = it.color || '';
        const colorCode = it.colorCode || '';
        const size = it.size || '';
        const qty = it.qty || 1;

        if (!itemSku && typeof InventoryParser !== 'undefined') {
          const match = InventoryParser.matchProduct({
            modelName: model,
            color: color,
            size: size
          });
          if (match && match.sku) {
            itemSku = match.sku;
          }
        }

        const key = itemSku ? itemSku : `${model}|${color}|${size}`;

        let walkIdx = 999999;
        if (typeof InventoryParser !== 'undefined') {
          walkIdx = InventoryParser.getWalkIndex({
            sku: itemSku,
            primaryProduct: it,
            modelName: model,
            color: color,
            size: size
          });
        }
        if (walkIdx === 999999 && typeof order.walkIndex === 'number') {
          walkIdx = order.walkIndex;
        }

        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.qty += qty;
          if (walkIdx < existing.walkIndex) existing.walkIndex = walkIdx;
        } else {
          let displayName = model;
          if (color && size) {
            displayName += ` - ${color}${colorCode ? ` (${colorCode})` : ''} / ${size}`;
          } else if (color) {
            displayName += ` - ${color}${colorCode ? ` (${colorCode})` : ''}`;
          } else if (size) {
            displayName += ` / ${size}`;
          }

          itemMap.set(key, {
            sku: itemSku,
            name: displayName,
            qty: qty,
            walkIndex: walkIdx
          });
        }
      }
    }

    const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => {
      if (a.walkIndex !== b.walkIndex) return a.walkIndex - b.walkIndex;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });

    // Check if running in browser with canvas support
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = 886;
      canvas.height = 1476;
      const ctx = canvas.getContext('2d');

      // Crisp pure white background for thermal printer
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer heavy border (pure black for thermal contrast)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      // 1. Header Banner (Solid black, height 135px)
      ctx.fillStyle = '#000000';
      ctx.fillRect(6, 6, canvas.width - 12, 135);

      // Line 1: Header Attribution
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 27px "Alexandria", "Cairo", sans-serif';
      ctx.fillText('📦 بطاقة تجهيز المخزن (تابعة للبوالص السابقة ⬆️)', canvas.width / 2, 44);

      // Line 2: Batch Summary Range
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 23px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`الدفعة: من بوليصة [ #${startNum} ] إلى [ #${endNum} ]`, canvas.width / 2, 84);

      // Line 3: Meta
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`إجمالي: ${totalPieces} قطعة  |  ${totalOrders} أوردرات`, canvas.width / 2, 118);

      // Subtitle banner for items list (height 36px)
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(6, 143, canvas.width - 12, 36);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(6, 143, canvas.width - 12, 36);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 18px "Alexandria", "Cairo", sans-serif';
      ctx.fillText('📋 قائمة الأصناف المجمعة للالتقاط (Pick List Checklist):', canvas.width / 2, 167);

      // Calculate Bottom Orders Table dimensions
      const orderRowHeight = 28;
      const bottomTableRowsHeight = Math.min(batch.length, 10) * orderRowHeight;
      const bottomTableTotalHeight = 34 + 30 + bottomTableRowsHeight + 40;
      const bottomSectionY = canvas.height - bottomTableTotalHeight - 6;

      // 2. Items Table Header (height 38px)
      const itemsHeaderY = 182;
      ctx.fillStyle = '#000000';
      ctx.fillRect(6, itemsHeaderY, canvas.width - 12, 38);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('[ ]', 840, itemsHeaderY + 26);
      ctx.fillText('اسم الموديل واللون والمقاس', 530, itemsHeaderY + 26);
      ctx.fillText('كود SKU', 200, itemsHeaderY + 26);
      ctx.fillText('الكمية', 65, itemsHeaderY + 26);

      // Available height for items rows
      const itemsStartY = itemsHeaderY + 38;
      const availableItemsHeight = bottomSectionY - 10 - itemsStartY;
      const rowCount = Math.max(aggregatedItems.length, 1);
      const itemRowHeight = Math.min(50, Math.max(28, Math.floor(availableItemsHeight / rowCount)));

      let curItemY = itemsStartY;
      for (let idx = 0; idx < aggregatedItems.length; idx++) {
        if (curItemY + itemRowHeight > bottomSectionY - 6) break;
        const it = aggregatedItems[idx];
        const isEven = idx % 2 === 0;

        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(6, curItemY, canvas.width - 12, itemRowHeight);

        // Dividing line
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(6, curItemY + itemRowHeight);
        ctx.lineTo(canvas.width - 6, curItemY + itemRowHeight);
        ctx.stroke();

        // Col 1: Small square checkbox
        const boxSize = Math.min(24, Math.max(16, itemRowHeight - 10));
        const boxY = curItemY + (itemRowHeight - boxSize) / 2;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(827, boxY, boxSize, boxSize);

        // Col 2: Name
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        const fontSize = itemRowHeight >= 45 ? 18 : (itemRowHeight >= 36 ? 16 : 13);
        ctx.font = `bold ${fontSize}px "Alexandria", "Cairo", sans-serif`;
        let displayName = it.name || '';
        if (displayName.length > 35) {
          displayName = displayName.substring(0, 33) + '...';
        }
        ctx.fillText(displayName, 800, curItemY + itemRowHeight * 0.65);

        // Col 3: SKU Pill
        if (it.sku) {
          const pillW = 140;
          const pillH = Math.min(28, Math.max(20, itemRowHeight - 8));
          const pillX = 130;
          const pillY = curItemY + (itemRowHeight - pillH) / 2;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 4);
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          const skuFontSize = itemRowHeight >= 40 ? 15 : 12;
          ctx.font = `bold ${skuFontSize}px monospace`;
          ctx.fillText(it.sku, pillX + pillW / 2, pillY + pillH * 0.72);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'center';
          ctx.font = 'bold 15px monospace';
          ctx.fillText('-', 200, curItemY + itemRowHeight * 0.65);
        }

        // Col 4: Qty
        const qtyW = 55;
        const qtyH = Math.min(30, Math.max(22, itemRowHeight - 6));
        const qtyX = 38;
        const qtyY = curItemY + (itemRowHeight - qtyH) / 2;

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(qtyX, qtyY, qtyW, qtyH, 4);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const qtyFontSize = itemRowHeight >= 40 ? 19 : 15;
        ctx.font = `bold ${qtyFontSize}px sans-serif`;
        ctx.fillText(`${it.qty}`, qtyX + qtyW / 2, qtyY + qtyH * 0.74);

        curItemY += itemRowHeight;
      }

      // 3. Bottom Orders Breakdown Box (جدول مطابقة الأوردرات بالأسفل)
      let curBottomY = bottomSectionY;

      // Section Title Banner
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, curBottomY, canvas.width - 12, 34);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 17px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`📋 جدول مطابقة بوالص الدفعة (${totalOrders} أوردرات من [#${startNum}] إلى [#${endNum}])`, canvas.width / 2, curBottomY + 23);

      curBottomY += 34;

      // Bottom Table Header (30px)
      ctx.fillStyle = '#000000';
      ctx.fillRect(6, curBottomY, canvas.width - 12, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px "Alexandria", "Cairo", sans-serif';
      ctx.fillText('التسلسل (#)', 795, curBottomY + 20);
      ctx.fillText('كود الأوردر (Order Ref)', 565, curBottomY + 20);
      ctx.fillText('رقم البوليصة (AWB)', 305, curBottomY + 20);
      ctx.fillText('القطع (Qty)', 75, curBottomY + 20);

      curBottomY += 30;

      // Bottom Table Rows for each order in this batch
      for (let bIdx = 0; bIdx < batch.length; bIdx++) {
        if (bIdx >= 10) break; // Keep inside printable bounds
        const ord = batch[bIdx];
        const isOrdEven = bIdx % 2 === 0;

        ctx.fillStyle = isOrdEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(6, curBottomY, canvas.width - 12, orderRowHeight);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(6, curBottomY + orderRowHeight);
        ctx.lineTo(canvas.width - 6, curBottomY + orderRowHeight);
        ctx.stroke();

        const ordSeq = ord.newPageNumber || (bIdx + 1);
        const ordRef = ord.orderReference || ord.trackingNumber || '-';
        const ordAwb = ord.trackingNumber || '-';
        const ordQty = ord.piecesCount || ord.totalItemsCount || (ord.products ? ord.products.reduce((a, b) => a + (b.qty || 1), 0) : 1);

        // Col 1: Sequence #
        ctx.fillStyle = '#0284c7';
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`[ #${ordSeq} ]`, 795, curBottomY + 19);

        // Col 2: Order Ref
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';
        let refStr = String(ordRef);
        if (refStr.length > 20) refStr = refStr.substring(0, 18) + '...';
        ctx.fillText(refStr, 565, curBottomY + 19);

        // Col 3: AWB
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 13px monospace';
        let awbStr = String(ordAwb);
        if (awbStr.length > 20) awbStr = awbStr.substring(0, 18) + '...';
        ctx.fillText(awbStr, 305, curBottomY + 19);

        // Col 4: Qty
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${ordQty} ق`, 75, curBottomY + 19);

        curBottomY += orderRowHeight;
      }

      // Footer Banner
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, curBottomY, canvas.width - 12, 38);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, curBottomY, canvas.width - 12, 38);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`تأكد من مطابقة أرقام البوالص [#${startNum}] إلى [#${endNum}] مع البوالص السابقة لهذه البطاقة ⬆️`, canvas.width / 2, curBottomY + 24);

      const dataUrl = canvas.toDataURL('image/png');
      const pngImage = await outDoc.embedPng(dataUrl);
      const page = outDoc.addPage([212.60, 354.33]);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: 212.60,
        height: 354.33
      });
      return page;
    } else {
      // Node.js fallback for tests
      const page = outDoc.addPage([212.60, 354.33]);
      const { rgb, StandardFonts } = (typeof PDFLib !== 'undefined' ? PDFLib : global.PDFLib);
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const regFont = await outDoc.embedFont(StandardFonts.Helvetica);

      page.drawRectangle({
        x: 4,
        y: 4,
        width: 204.6,
        height: 346.33,
        borderWidth: 2,
        borderColor: rgb(0, 0, 0),
        color: rgb(1, 1, 1)
      });

      page.drawRectangle({
        x: 4,
        y: 354.33 - 45,
        width: 204.6,
        height: 41,
        color: rgb(0, 0, 0)
      });

      page.drawText(`PICK LIST (PREVIOUS LABELS ^) | [#${startNum}] TO [#${endNum}]`, {
        x: 10,
        y: 354.33 - 22,
        size: 8,
        font: font,
        color: rgb(1, 1, 1)
      });

      page.drawText(`BATCH: ${totalPieces} PCS | ${totalOrders} ORDERS`, {
        x: 10,
        y: 354.33 - 36,
        size: 8,
        font: font,
        color: rgb(0.9, 0.8, 0.2)
      });

      page.drawRectangle({
        x: 4,
        y: 354.33 - 62,
        width: 204.6,
        height: 16,
        color: rgb(0.9, 0.9, 0.9)
      });

      page.drawText('[ ]', { x: 10, y: 354.33 - 57, size: 7, font: font, color: rgb(0, 0, 0) });
      page.drawText('ITEM / SKU', { x: 30, y: 354.33 - 57, size: 7, font: font, color: rgb(0, 0, 0) });
      page.drawText('QTY', { x: 185, y: 354.33 - 57, size: 7, font: font, color: rgb(0, 0, 0) });

      let curY = 354.33 - 78;
      for (const it of aggregatedItems) {
        if (curY < 130) break;
        page.drawRectangle({
          x: 10,
          y: curY,
          width: 8,
          height: 8,
          borderWidth: 1,
          borderColor: rgb(0, 0, 0)
        });

        const label = it.sku ? `SKU: ${it.sku}` : `Item #${aggregatedItems.indexOf(it) + 1}`;
        page.drawText(label, { x: 23, y: curY + 1, size: 7, font: regFont, color: rgb(0, 0, 0) });
        page.drawText(`x${it.qty}`, { x: 185, y: curY + 1, size: 8, font: font, color: rgb(0, 0, 0) });

        curY -= 14;
      }

      // Bottom Orders Breakdown Table in Node fallback
      page.drawRectangle({
        x: 4,
        y: 115,
        width: 204.6,
        height: 14,
        color: rgb(0.08, 0.1, 0.15)
      });
      page.drawText(`BATCH ORDERS CHECK: [#${startNum}] TO [#${endNum}]`, {
        x: 10,
        y: 119,
        size: 7,
        font: font,
        color: rgb(1, 1, 1)
      });

      page.drawRectangle({
        x: 4,
        y: 101,
        width: 204.6,
        height: 14,
        color: rgb(0.9, 0.9, 0.9)
      });
      page.drawText('# | ORDER REF | AWB | QTY', {
        x: 10,
        y: 105,
        size: 6.5,
        font: font,
        color: rgb(0, 0, 0)
      });

      let ordY = 89;
      for (let bIdx = 0; bIdx < batch.length; bIdx++) {
        if (ordY < 20 || bIdx >= 8) break;
        const ord = batch[bIdx];
        const ref = ord.orderReference || ord.trackingNumber || '-';
        const awb = ord.trackingNumber || '-';
        const pCount = ord.piecesCount || ord.totalItemsCount || 1;
        const seq = ord.newPageNumber || (bIdx + 1);

        page.drawText(`#${seq} | ${ref} | ${awb} | ${pCount} PCS`, {
          x: 10,
          y: ordY,
          size: 6.5,
          font: regFont,
          color: rgb(0.1, 0.1, 0.1)
        });
        ordY -= 11;
      }

      return page;
    }
  },

  /**
   * Adjusts page size to thermal 75x125 mm (212.60 x 354.33 pt) full-bleed.
   * - Already-sized pages (e.g. 190..235 x 330..380 pt like pdf24_مدمج.pdf [212.63 x 354.25]):
   *   Do NOT shrink the page or add extra outer margins! Keep 1:1 full size.
   * - Resizing standard A4/A6 or other non-thermal Bosta PDFs to 75x125 mm:
   *   Scale tightly to fill 98% to 100% of the page width and height, leaving only 1-2mm (~3pt) safety margin.
   */
  applyThermalResize(page, options = {}) {
    if (!page) return;
    const targetW = options.targetWidth || 212.60;
    const targetH = options.targetHeight || 354.33;

    const { width: origW, height: origH } = page.getSize();

    // 1. If already ~75x125mm (e.g. 190..235 x 330..380 pt, like pdf24_مدمج.pdf [212.63 x 354.25]):
    // Do NOT shrink the page or add extra outer margins! Keep 1:1 full size.
    if (origW >= 190 && origW <= 235 && origH >= 330 && origH <= 380) {
      page.setSize(targetW, targetH);
      return;
    }

    // 2. When resizing standard A4/A6 or other non-thermal Bosta PDFs to 75x125mm (212.60 x 354.33 pt):
    // Scale tightly to fill 98% to 100% of the 212.60 x 354.33 pt page width and height,
    // leaving only 1-2mm (~3pt) safety margin at the edges.
    const safetyMargin = 3; // ~1mm safety margin
    const availW = targetW - (safetyMargin * 2);
    const availH = targetH - (safetyMargin * 2);

    const scale = Math.min(availW / origW, availH / origH);
    const scaledW = origW * scale;
    const scaledH = origH * scale;

    page.scale(scale, scale);
    page.setSize(targetW, targetH);
    const offsetX = (targetW - scaledW) / 2;
    const offsetY = (targetH - scaledH) / 2;
    page.translateContent(offsetX, offsetY);
  },

  /**
   * Generates Master Manifest / Pick List Summary Sheet at the beginning of the PDF
   * (75mm x 125mm = 212.60 x 354.33 pt)
   */
  async createMasterManifestSheet(outDoc, sortedPages) {
    const totalOrders = sortedPages.length;
    let totalPieces = 0;
    const itemMap = new Map();

    for (const order of sortedPages) {
      const orderPieces = order.piecesCount || order.totalItemsCount || (order.products ? order.products.reduce((a, b) => a + (b.qty || 1), 0) : 1);
      totalPieces += orderPieces;

      const items = (order.products && order.products.length > 0)
        ? order.products
        : [{
            modelName: order.modelName || 'صنف غير محدد',
            color: order.color || '',
            size: order.size || '',
            qty: orderPieces,
            sku: order.sku || ''
          }];

      for (const it of items) {
        let itemSku = it.sku || order.sku || '';
        const model = it.modelName || order.modelName || 'صنف غير محدد';
        const color = it.color || '';
        const size = it.size || '';
        const qty = it.qty || 1;

        if (!itemSku && typeof InventoryParser !== 'undefined') {
          const match = InventoryParser.matchProduct({ modelName: model, color, size });
          if (match && match.sku) itemSku = match.sku;
        }

        const key = itemSku ? itemSku : `${model}|${color}|${size}`;
        if (!itemMap.has(key)) {
          let walkIdx = 999999;
          if (typeof InventoryParser !== 'undefined') {
            walkIdx = InventoryParser.getWalkIndex({ sku: itemSku, modelName: model, color, size });
          }
          itemMap.set(key, {
            name: `${model}${color ? ` - ${color}` : ''}${size ? ` / ${size}` : ''}`,
            sku: itemSku,
            qty,
            walkIndex: walkIdx
          });
        } else {
          itemMap.get(key).qty += qty;
        }
      }
    }

    const aggregatedItems = Array.from(itemMap.values());
    aggregatedItems.sort((a, b) => {
      if (a.walkIndex !== b.walkIndex) return a.walkIndex - b.walkIndex;
      return b.qty - a.qty;
    });

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = 886; // 300 DPI for 75 mm
      canvas.height = 1476; // 300 DPI for 125 mm
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header Banner
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 8, canvas.width - 16, 110);

      ctx.fillStyle = '#2dd4bf';
      ctx.font = 'bold 28px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📋 بيان تجهيز البضاعة (Master Manifest)', canvas.width / 2, 50);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`إجمالي البوالص: ${totalOrders} | إجمالي القطع المطلوبة: ${totalPieces} قطعة`, canvas.width / 2, 88);

      // Table Header (40px)
      const tableStartY = 126;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, tableStartY, canvas.width - 16, 38);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('اسم الموديل واللون والمقاس', 810, tableStartY + 25);

      ctx.textAlign = 'center';
      ctx.fillText('كود الـ SKU', 210, tableStartY + 25);
      ctx.fillText('الكمية', 68, tableStartY + 25);
      ctx.fillText('تجهيز', 848, tableStartY + 25);

      // Table Rows
      const rowHeight = Math.min(46, Math.max(30, Math.floor((canvas.height - tableStartY - 80) / Math.max(1, Math.min(aggregatedItems.length, 24)))));
      let curY = tableStartY + 38;

      for (let idx = 0; idx < aggregatedItems.length; idx++) {
        if (curY + rowHeight > canvas.height - 45) break;
        const it = aggregatedItems[idx];
        const isEven = idx % 2 === 0;

        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(8, curY, canvas.width - 16, rowHeight);

        // Divider
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(8, curY, canvas.width - 16, rowHeight);

        // Checkbox
        const boxSize = 20;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(838, curY + (rowHeight - boxSize) / 2, boxSize, boxSize);

        // Name
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'right';
        ctx.font = 'bold 15px "Alexandria", "Cairo", sans-serif';
        let dName = it.name;
        if (dName.length > 40) dName = dName.substring(0, 38) + '...';
        ctx.fillText(dName, 810, curY + rowHeight * 0.65);

        // SKU
        if (it.sku) {
          ctx.fillStyle = '#0f766e';
          ctx.textAlign = 'center';
          ctx.font = 'bold 14px monospace';
          ctx.fillText(it.sku, 210, curY + rowHeight * 0.65);
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.font = 'bold 14px monospace';
          ctx.fillText('-', 210, curY + rowHeight * 0.65);
        }

        // Qty Pill
        const qtyW = 55;
        const qtyH = Math.min(28, rowHeight - 6);
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(40, curY + (rowHeight - qtyH) / 2, qtyW, qtyH, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${it.qty}`, 40 + qtyW / 2, curY + (rowHeight - qtyH) / 2 + qtyH * 0.72);

        curY += rowHeight;
      }

      // Footer
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(8, canvas.height - 38, canvas.width - 16, 30);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('قم بتجهيز كافة الأصناف الموضحة أعلاه من ممرات المخزن قبل البدء في التغليف 📦', canvas.width / 2, canvas.height - 18);

      const dataUrl = canvas.toDataURL('image/png');
      const pngImage = await outDoc.embedPng(dataUrl);
      const page = outDoc.addPage([212.60, 354.33]);
      page.drawImage(pngImage, { x: 0, y: 0, width: 212.60, height: 354.33 });
      return page;
    } else {
      // Node.js fallback
      const page = outDoc.addPage([212.60, 354.33]);
      const { rgb, StandardFonts } = (typeof PDFLib !== 'undefined' ? PDFLib : global.PDFLib);
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      page.drawText(`MASTER PICK LIST | ${totalOrders} ORDERS | ${totalPieces} PCS`, {
        x: 10,
        y: 330,
        size: 8,
        font,
        color: rgb(0, 0, 0)
      });
      return page;
    }
  },

  /**
   * Generates final sorted PDF (Pure 1:1 binary copy with full-bleed thermal resize and separators)
   * Critical Update #1:
   * 1. Completely REMOVED small thermal pick-list summary cards ("بطاقة تجهيز المخزن").
   * 2. PDF ONLY contains sorted Bosta shipping labels and blank white separator pages between major groups:
   *    - Major Group 1: Large orders (3+ pieces)
   *    - Blank separator page [212.60, 354.33]
   *    - Major Group 2: Two-piece orders (2 pieces)
   *    - Blank separator page [212.60, 354.33]
   *    - Major Group 3: Single-piece orders (1 piece), with blank separator before carpets section
   * 3. Sequential reference #X stamped on shipping labels ONLY inside Red Box Zone (never on separators).
   */
  async generateSortedPDF(masterPdfBytes, sortedPages, options = {}, onProgress) {
    const pdfLibModule = typeof PDFLib !== 'undefined' ? PDFLib : (typeof global !== 'undefined' ? global.PDFLib : null);
    if (!pdfLibModule) {
      throw new Error('مكتبة pdf-lib غير محملة. يرجى التأكد من اتصال الإنترنت.');
    }

    const bytes = masterPdfBytes || (typeof window !== 'undefined' ? window.rawUntouchedPdfBytes : null);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error('بيانات ملف الـ PDF الأصلي غير متوفرة.');
    }

    if (!sortedPages || sortedPages.length === 0) {
      throw new Error('لا توجد صفحات محددة للتصدير.');
    }

    const insertSeparators = options.insertBlankSeparators !== false;

    try {
      const safeBuffer = bytes.slice(0);
      const srcDoc = await pdfLibModule.PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const outDoc = await pdfLibModule.PDFDocument.create();

      // Embed standard font for sequential label stamping
      const stampFont = await outDoc.embedFont(pdfLibModule.StandardFonts.HelveticaBold);

      // Prepend Master Manifest summary page if explicitly requested
      if (options.insertMasterManifest === true) {
        await this.createMasterManifestSheet(outDoc, sortedPages);
      }

      // Partition sorted pages into major groups
      const largeOrders = [];
      const twoPieceOrders = [];
      const singleOrders = [];
      // Partition sorted pages into the exact 8 Main Buckets (+ Bucket 9 for unrecognized)
      const buckets = {
        1: [], // Bucket 1: Large Orders (4+ Pieces, sorted descending: 8 -> 7 -> 6 -> 5 -> 4)
        2: [], // Bucket 2: Three-Piece Orders (3 Pieces without non-pocket rugs)
        3: [], // Bucket 3: Orders Containing a Regular Prayer Rug WITH Another Product
        4: [], // Bucket 4: Two-Piece Orders (4A) + Single Regular Prayer Rug at the End of Twos (4B)
        5: [], // Bucket 5: Single-Piece Women Orders (1 Piece - الحريمي)
        6: [], // Bucket 6: Single-Piece Kids Orders (1 Piece - الأطفالي)
        7: [], // Bucket 7: Single-Piece Other Items (Bags/Accessories)
        8: [], // Bucket 8 (FINAL GROUP AT THE END): Pocket & Waterproof Orders
        9: []  // Bucket 9: Unrecognized Orders
      };

      for (const p of sortedPages) {
        let b = p.bucket;
        if (!b) {
          const bInfo = this.classifyOrderBucket(p);
          b = bInfo.bucket;
          p.bucket = b;
          p.subBucket = bInfo.subBucket;
        }
        if (buckets[b]) {
          buckets[b].push(p);
        } else {
          buckets[9].push(p);
        }
      }

      let processedCount = 0;
      const totalOrdersToProcess = sortedPages.length;

      // Helper to copy and add orders with sequential label stamp in the Red Box Zone
      const addOrderLabels = async (ordersList) => {
        if (!ordersList || ordersList.length === 0) return;
        const indices = ordersList.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
        const copied = await outDoc.copyPages(srcDoc, indices);
        for (let i = 0; i < copied.length; i++) {
          processedCount++;
          if (onProgress) {
            onProgress({
              current: processedCount,
              total: totalOrdersToProcess,
              percent: Math.round((processedCount / totalOrdersToProcess) * 100),
              phase: 'تجهيز بوالص الشحن وترقيمها وتنسيق الأبعاد الحرارية'
            });
          }
          await new Promise(r => setTimeout(r, 0));
          const cp = copied[i];
          const order = ordersList[i];
          const seqNum = (typeof order === 'object' && order.newPageNumber) ? order.newPageNumber : processedCount;

          // Full-bleed thermal resize if enabled
          if (options.thermalResize !== false) {
            this.applyThermalResize(cp, options);
          }

          // Stamp sequence number box onto shipping labels ONLY (Red Box Zone)
          this.stampLabelSequenceNumber(cp, seqNum, stampFont);

          outDoc.addPage(cp);
        }
      };

      // Sequentially export buckets 1 to 8 (and 9) with 75x125mm Blank Separator Page between each non-empty bucket
      let printedAnyBucket = false;
      for (let b = 1; b <= 9; b++) {
        const list = buckets[b];
        if (!list || list.length === 0) continue;

        if (insertSeparators && printedAnyBucket) {
          // 75x125 mm (212.60 x 354.33 pt) Blank Separator Page
          outDoc.addPage([212.60, 354.33]);
        }

        await addOrderLabels(list);
        printedAnyBucket = true;
      }

      return await outDoc.save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      throw new Error(`فشل إنشاء ملف الـ PDF: ${err.message || err}`);
    }
  },

  /**
   * Helper to build aggregated products and customer reference directory data for A4 Pick-List (Strictly NO SKU)
   */
  buildA4PickListData(sortedPages) {
    const totalOrders = sortedPages.length;
    let totalPieces = 0;
    const productMap = new Map();

    for (let idx = 0; idx < sortedPages.length; idx++) {
      const order = sortedPages[idx];
      const seqNum = order.newPageNumber || (idx + 1);
      const custName = order.customerName || order.customer || `عميل #${seqNum}`;
      const orderPieces = typeof order.piecesCount === 'number'
        ? order.piecesCount
        : (parseInt(order.totalPieces, 10) || 1);
      totalPieces += orderPieces;

      const prods = (order.products && Array.isArray(order.products) && order.products.length > 0)
        ? order.products
        : ((order.items && Array.isArray(order.items) && order.items.length > 0)
            ? order.items
            : [{
                modelName: order.modelName || 'صنف غير محدد',
                color: order.color || '',
                size: order.size || '',
                qty: orderPieces
              }]);

      for (const p of prods) {
        const model = p.modelName || p.title || p.name || order.modelName || 'صنف غير محدد';
        const color = p.color || '';
        const size = p.size || '';
        const qty = p.qty || 1;

        let displayName = p.displayName;
        if (!displayName) {
          if (p.title && !color && !size) {
            displayName = p.title;
          } else {
            displayName = `${model}${color ? ` - ${color}` : ''}${size ? ` / ${size}` : ''}`;
          }
        }
        const key = displayName;

        if (!productMap.has(key)) {
          let shelfRank = 999999;
          if (typeof ArabicUtils !== 'undefined') {
            shelfRank = ArabicUtils.getWarehouseRouteRank(model, size);
          }
          productMap.set(key, {
            name: displayName,
            title: displayName,
            totalQty: qty,
            shelfRank,
            orderRefs: [{ seqNum, customerName: custName, qty }]
          });
        } else {
          const entry = productMap.get(key);
          entry.totalQty += qty;
          entry.orderRefs.push({ seqNum, customerName: custName, qty });
        }
      }
    }

    const aggregatedProducts = Array.from(productMap.values());
    aggregatedProducts.sort((a, b) => {
      if (a.shelfRank !== b.shelfRank) return a.shelfRank - b.shelfRank;
      return b.totalQty - a.totalQty;
    });

    const orderDirectory = sortedPages.map((order, idx) => {
      const seqNum = order.newPageNumber || (idx + 1);
      const custName = order.customerName || order.customer || `عميل #${seqNum}`;
      const pieces = typeof order.piecesCount === 'number'
        ? order.piecesCount
        : (parseInt(order.totalPieces, 10) || 1);

      let itemsDesc = '';
      if (order.products && Array.isArray(order.products) && order.products.length > 0) {
        itemsDesc = order.products.map(p => `${p.modelName || order.modelName || 'صنف'}${p.color ? ` - ${p.color}` : ''}${p.size ? ` / ${p.size}` : ''} (${p.qty || 1} قطعة)`).join(' + ');
      } else if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        itemsDesc = order.items.map(p => `${p.title || p.modelName || p} (${p.qty || 1} قطعة)`).join(' + ');
      } else {
        itemsDesc = `${order.modelName || 'صنف غير محدد'}${order.color ? ` - ${order.color}` : ''}${order.size ? ` / ${order.size}` : ''} (${pieces} قطعة)`;
      }

      return {
        seqNum,
        customerName: custName,
        pieces,
        itemsDesc
      };
    });

    return {
      totalOrders,
      totalPieces,
      aggregatedProducts,
      orderDirectory
    };
  },

  /**
   * Generates a completely standalone Multi-Page A4 Pick-List & Customer Order Directory PDF (Strictly NO SKU)
   * Standard A4 portrait: 210mm x 297mm (595.28 x 841.89 pt)
   */
  async generateA4PickListPDF(sortedPages, options = {}) {
    const pdfLibModule = (typeof PDFLib !== 'undefined' ? PDFLib : (typeof window !== 'undefined' ? window.PDFLib : global.PDFLib));
    if (!pdfLibModule) {
      throw new Error('مكتبة PDFLib غير محملة');
    }

    const data = this.buildA4PickListData(sortedPages);
    const outDoc = await pdfLibModule.PDFDocument.create();

    // Check if browser canvas is available
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvasWidth = 1240; // 150 DPI A4 portrait
      const canvasHeight = 1754;
      const margin = 50;
      const contentW = canvasWidth - (margin * 2);

      const canvasPages = [];
      let currentCanvas = document.createElement('canvas');
      currentCanvas.width = canvasWidth;
      currentCanvas.height = canvasHeight;
      let ctx = currentCanvas.getContext('2d');
      canvasPages.push(currentCanvas);

      const initCanvasPage = (c, isFirstPage = false) => {
        const cx = c.getContext('2d');
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Header Banner
        cx.fillStyle = '#0f172a';
        cx.fillRect(margin, margin, contentW, isFirstPage ? 110 : 70);

        cx.fillStyle = '#2dd4bf';
        cx.font = 'bold 24px "Alexandria", "Cairo", sans-serif';
        cx.textAlign = 'center';
        cx.fillText('📋 كشف تجهيز المخزن وبيان بوالص العملاء (A4)', canvasWidth / 2, margin + (isFirstPage ? 45 : 42));

        if (isFirstPage) {
          cx.fillStyle = '#ffffff';
          cx.font = 'bold 15px "Alexandria", "Cairo", sans-serif';
          cx.fillText(`إجمالي البوالص: ${data.totalOrders} أوردر  |  إجمالي القطع الكلي: ${data.totalPieces} قطعة  |  بدون أكواد SKU`, canvasWidth / 2, margin + 85);
        }
      };

      initCanvasPage(currentCanvas, true);
      let curY = margin + 130;

      const checkPageOverflow = (neededHeight) => {
        if (curY + neededHeight > canvasHeight - 70) {
          currentCanvas = document.createElement('canvas');
          currentCanvas.width = canvasWidth;
          currentCanvas.height = canvasHeight;
          ctx = currentCanvas.getContext('2d');
          initCanvasPage(currentCanvas, false);
          canvasPages.push(currentCanvas);
          curY = margin + 85;
        }
      };

      // --- SECTION 1: Aggregated Products Pick Table ---
      checkPageOverflow(70);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(margin, curY, contentW, 36);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('📦 أولاً: جدول تجميع المنتجات والكميات المطلوبة (مرتب حسب مسار الرفوف بالمخزن)', canvasWidth - margin - 15, curY + 24);
      curY += 40;

      // Table Header
      checkPageOverflow(34);
      ctx.fillStyle = '#334155';
      ctx.fillRect(margin, curY, contentW, 30);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';

      ctx.textAlign = 'center';
      ctx.fillText('تجهيز', canvasWidth - margin - 25, curY + 20);
      ctx.fillText('#', canvasWidth - margin - 65, curY + 20);

      ctx.textAlign = 'right';
      ctx.fillText('اسم المنتج واللون والمقاس المعتمد', canvasWidth - margin - 95, curY + 20);

      ctx.textAlign = 'center';
      ctx.fillText('إجمالي الكمية', margin + 460, curY + 20);

      ctx.textAlign = 'right';
      ctx.fillText('أرقام الأوردرات وأسماء العملاء المسحوب لها الصنف', margin + 410, curY + 20);
      curY += 32;

      // Rows for Section 1
      for (let idx = 0; idx < data.aggregatedProducts.length; idx++) {
        const prod = data.aggregatedProducts[idx];
        const rowH = 36;
        checkPageOverflow(rowH);

        const isEven = idx % 2 === 0;
        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(margin, curY, contentW, rowH);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin, curY, contentW, rowH);

        // Checkbox
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(canvasWidth - margin - 35, curY + (rowH - 18) / 2, 18, 18);

        // Sequence Number
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, canvasWidth - margin - 65, curY + rowH * 0.65);

        // Product Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';
        ctx.textAlign = 'right';
        let pName = prod.name;
        if (pName.length > 38) pName = pName.substring(0, 36) + '..';
        ctx.fillText(pName, canvasWidth - margin - 95, curY + rowH * 0.65);

        // Quantity Badge
        const qW = 50;
        const qH = 22;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(margin + 435, curY + (rowH - qH) / 2, qW, qH, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${prod.totalQty}`, margin + 435 + qW / 2, curY + (rowH - qH) / 2 + 16);

        // Orders & Customer Names
        ctx.fillStyle = '#334155';
        ctx.font = '11px "Alexandria", "Cairo", sans-serif';
        ctx.textAlign = 'right';
        const refsText = prod.orderRefs.map(r => `أوردر #${r.seqNum} (${r.customerName}${r.qty > 1 ? ` - ${r.qty}ق` : ''})`).join(' ، ');
        let displayRefs = refsText;
        if (displayRefs.length > 55) displayRefs = displayRefs.substring(0, 53) + '..';
        ctx.fillText(displayRefs, margin + 410, curY + rowH * 0.65);

        curY += rowH;
      }

      curY += 25;

      // --- SECTION 2: Order-to-Customer Reference Table ---
      checkPageOverflow(70);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(margin, curY, contentW, 36);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px "Alexandria", "Cairo", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('📑 ثانياً: كشف ربط أرقام الأوردرات بالعملاء ومحتوياتها (دليل البوالص المسلسلة من #1 إلى #N)', canvasWidth - margin - 15, curY + 24);
      curY += 40;

      // Table Header Section 2
      checkPageOverflow(34);
      ctx.fillStyle = '#334155';
      ctx.fillRect(margin, curY, contentW, 30);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';

      ctx.textAlign = 'center';
      ctx.fillText('رقم الأوردر على البوليصة', canvasWidth - margin - 90, curY + 20);

      ctx.textAlign = 'right';
      ctx.fillText('اسم العميل (من البوليصة)', canvasWidth - margin - 200, curY + 20);

      ctx.textAlign = 'center';
      ctx.fillText('إجمالي القطع', margin + 570, curY + 20);

      ctx.textAlign = 'right';
      ctx.fillText('المنتجات المطلوبة داخل الأوردر (بدون SKU)', margin + 510, curY + 20);
      curY += 32;

      // Rows for Section 2
      for (let idx = 0; idx < data.orderDirectory.length; idx++) {
        const ord = data.orderDirectory[idx];
        const rowH = 34;
        checkPageOverflow(rowH);

        const isEven = idx % 2 === 0;
        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(margin, curY, contentW, rowH);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin, curY, contentW, rowH);

        // Sequence badge
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(canvasWidth - margin - 110, curY + (rowH - 22) / 2, 48, 22, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${ord.seqNum}`, canvasWidth - margin - 86, curY + (rowH - 22) / 2 + 16);

        // Customer Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';
        ctx.textAlign = 'right';
        let cName = ord.customerName;
        if (cName.length > 25) cName = cName.substring(0, 23) + '..';
        ctx.fillText(cName, canvasWidth - margin - 160, curY + rowH * 0.65);

        // Total Pieces
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px "Alexandria", "Cairo", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${ord.pieces} قطعة`, margin + 570, curY + rowH * 0.65);

        // Products Summary
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px "Alexandria", "Cairo", sans-serif';
        ctx.textAlign = 'right';
        let iDesc = ord.itemsDesc;
        if (iDesc.length > 65) iDesc = iDesc.substring(0, 63) + '..';
        ctx.fillText(iDesc, margin + 510, curY + rowH * 0.65);

        curY += rowH;
      }

      // Add footers & embed all canvas pages into PDF
      const totalPages = canvasPages.length;
      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const c = canvasPages[pIdx];
        const cx = c.getContext('2d');
        cx.fillStyle = '#64748b';
        cx.font = 'bold 13px "Alexandria", "Cairo", sans-serif';
        cx.textAlign = 'center';
        cx.fillText(`صفحة ${pIdx + 1} من ${totalPages}  |  منظومة تجهيز المخزن المعتمدة  |  كشف مطبوعات A4 رسمي`, canvasWidth / 2, canvasHeight - 25);

        const dataUrl = c.toDataURL('image/png');
        const pngImage = await outDoc.embedPng(dataUrl);
        const pdfPage = outDoc.addPage([595.28, 841.89]);
        pdfPage.drawImage(pngImage, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }

      return await outDoc.save();
    } else {
      // Node.js fallback (standard vector A4 pages)
      const page = outDoc.addPage([595.28, 841.89]);
      const { rgb, StandardFonts } = pdfLibModule;
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      page.drawRectangle({ x: 20, y: 841.89 - 80, width: 595.28 - 40, height: 60, color: rgb(0.06, 0.09, 0.16) });
      page.drawText('WAREHOUSE A4 PICK LIST & CUSTOMER DIRECTORY (NO SKU)', { x: 40, y: 841.89 - 50, size: 14, font, color: rgb(1, 1, 1) });
      page.drawText(`Orders: ${data.totalOrders} | Total Pieces: ${data.totalPieces} | Products: ${data.aggregatedProducts.length}`, { x: 40, y: 841.89 - 70, size: 10, font, color: rgb(0.2, 0.8, 0.7) });
      return await outDoc.save();
    }
  },

  /**
   * Opens clean printable HTML view formatted for native browser A4 printing
   */
  openA4PrintWindow(sortedPages) {
    if (typeof window === 'undefined') return;
    const data = this.buildA4PickListData(sortedPages);

    const win = window.open('', '_blank');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة لفتح كشف الطباعة');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف تجهيز المخزن وبيان العملاء (A4)</title>
  <link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: 'Alexandria', sans-serif; direction: rtl; margin: 0; padding: 12px; color: #0f172a; font-size: 11px; background: #fff; }
    .banner { background: #0f172a; color: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; text-align: center; }
    .banner h1 { margin: 0 0 6px 0; font-size: 20px; color: #2dd4bf; }
    .banner-stats { font-size: 13px; font-weight: bold; }
    .sec-title { background: #1e293b; color: #38bdf8; padding: 8px 12px; font-size: 13px; font-weight: bold; border-radius: 6px; margin: 18px 0 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
    th { background: #334155; color: #fff; padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: middle; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge-qty { background: #0f172a; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; display: inline-block; }
    .badge-ord { background: #e11d48; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .chk { width: 14px; height: 14px; border: 1.5px solid #000; display: inline-block; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; text-align: left;">
    <button onclick="window.print()" style="background: #0f766e; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-family: inherit; font-weight: bold; cursor: pointer;">🖨️ طباعة الآن (Ctrl + P)</button>
  </div>
  <div class="banner">
    <h1>📋 كشف تجهيز المخزن وبيان بوالص العملاء (A4)</h1>
    <div class="banner-stats">إجمالي البوالص: ${data.totalOrders} أوردر  |  إجمالي القطع الكلي: ${data.totalPieces} قطعة  |  بدون أكواد SKU</div>
  </div>

  <div class="sec-title">📦 أولاً: جدول تجميع المنتجات والكميات المطلوبة (مرتب حسب مسار الرفوف بالمخزن)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">تجهيز</th>
        <th style="width: 30px; text-align: center;">#</th>
        <th>اسم المنتج واللون والمقاس المعتمد</th>
        <th style="width: 80px; text-align: center;">إجمالي الكمية</th>
        <th>أرقام الأوردرات وأسماء العملاء المسحوب لها الصنف</th>
      </tr>
    </thead>
    <tbody>
      ${data.aggregatedProducts.map((p, i) => `
        <tr>
          <td style="text-align: center;"><span class="chk"></span></td>
          <td style="text-align: center;">${i + 1}</td>
          <td><b>${p.name}</b></td>
          <td style="text-align: center;"><span class="badge-qty">${p.totalQty}</span></td>
          <td>${p.orderRefs.map(r => `<span class="badge-ord">#${r.seqNum}</span> ${r.customerName}${r.qty > 1 ? ` (${r.qty}ق)` : ''}`).join(' ، ')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="sec-title">📑 ثانياً: كشف ربط أرقام الأوردرات بالعملاء ومحتوياتها (دليل البوالص المسلسلة)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 90px; text-align: center;">رقم الأوردر</th>
        <th style="width: 140px;">اسم العميل</th>
        <th style="width: 80px; text-align: center;">إجمالي القطع</th>
        <th>المنتجات المطلوبة داخل الأوردر (بدون SKU)</th>
      </tr>
    </thead>
    <tbody>
      ${data.orderDirectory.map(o => `
        <tr>
          <td style="text-align: center;"><span class="badge-ord">#${o.seqNum}</span></td>
          <td><b>${o.customerName}</b></td>
          <td style="text-align: center;"><b>${o.pieces} قطعة</b></td>
          <td>${o.itemsDesc}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

    win.document.write(html);
    win.document.close();
  },

  /**
   * Generates a single-page thermal PDF for quick individual printing
   */
  async generateSinglePagePDF(masterPdfBytes, originalPageNumber, options = {}) {
    return this.generateSortedPDF(masterPdfBytes, [{ originalPageNumber }], options);
  }
};

if (typeof window !== 'undefined') {
  window.PDFProcessor = PDFProcessor;
}
