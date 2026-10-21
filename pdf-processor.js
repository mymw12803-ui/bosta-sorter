// === GLOBAL SAFEGUARD PATCH FOR PDF-LIB (NEVER THROW MISSING CONTENTS) ===
(function patchPdfLibSafeguards() {
  const applyPatch = () => {
    const PDFLib = (typeof globalThis !== 'undefined' && globalThis.PDFLib)
      || (typeof window !== 'undefined' && window.PDFLib)
      || (typeof global !== 'undefined' && global.PDFLib);

    if (!PDFLib || !PDFLib.PDFDocument || PDFLib.PDFDocument.__patched) return;
    PDFLib.PDFDocument.__patched = true;

    // 1. Ensure every page added via addPage / insertPage ALWAYS has a valid /Contents stream
    const origAddPage = PDFLib.PDFDocument.prototype.addPage;
    PDFLib.PDFDocument.prototype.addPage = function(...args) {
      const page = origAddPage.apply(this, args);
      try {
        if (page && page.node && !page.node.Contents()) {
          page.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
        }
      } catch (e) {}
      return page;
    };

    const origInsertPage = PDFLib.PDFDocument.prototype.insertPage;
    PDFLib.PDFDocument.prototype.insertPage = function(...args) {
      const page = origInsertPage.apply(this, args);
      try {
        if (page && page.node && !page.node.Contents()) {
          page.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
        }
      } catch (e) {}
      return page;
    };

    // 2. Patch embedPage & embedPages so if ANY page lacks /Contents or has inverted MediaBox, it auto-heals before embedding
    const healPageForEmbed = (page) => {
      if (!page || !page.node) return;
      if (!page.node.Contents()) {
        page.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
      }
    };

    const origEmbedPage = PDFLib.PDFDocument.prototype.embedPage;
    PDFLib.PDFDocument.prototype.embedPage = async function(page, boundingBox, transformationMatrix) {
      try {
        healPageForEmbed(page);
        if (page && page.node && !boundingBox) {
          const mb = page.node.MediaBox();
          const x1 = mb.get(0).asNumber(), y1 = mb.get(1).asNumber();
          const x2 = mb.get(2).asNumber(), y2 = mb.get(3).asNumber();
          if (y1 > y2) {
            boundingBox = { left: Math.min(x1, x2), bottom: 0, right: Math.max(x1, x2), top: Math.abs(y1 - y2) };
          }
        }
      } catch (e) {}
      return origEmbedPage.call(this, page, boundingBox, transformationMatrix);
    };

    const origEmbedPages = PDFLib.PDFDocument.prototype.embedPages;
    PDFLib.PDFDocument.prototype.embedPages = async function(pages, boundingBoxes, transformationMatrices) {
      if (Array.isArray(pages)) pages.forEach(healPageForEmbed);
      return origEmbedPages.call(this, pages, boundingBoxes, transformationMatrices);
    };
  };

  applyPatch();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', applyPatch);
  }
  if (typeof setTimeout !== 'undefined') {
    setTimeout(applyPatch, 500);
  }
})();

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
      const r = InventoryParser.getOrderExcelRank(order);
      if (r !== 999999) return r;
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
        const gap = prev ? (prev.x - (it.x + (it.width || 0))) : 0;
        // ONLY insert space if there is an actual word gap (> 3.2 pt) or explicit space token,
        // or transition between Arabic and Latin/Numbers!
        const prevIsAr = prev && /[\u0600-\u06FF]/.test(prev.str || '');
        const currIsAr = /[\u0600-\u06FF]/.test(text);
        if ((prev && prev.isSpace) || gap > 3.2 || (prevIsAr !== currIsAr)) {
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
      item.excelRank = this.getOrderRouteRank(item);
      item.routeRank = item.excelRank;

      // Classify into exact 8-Bucket Hierarchy
      const bInfo = this.classifyOrderBucket(item);
      item.bucket = bInfo.bucket;
      item.bucketId = bInfo.bucket;
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
    if (page.node && typeof page.node.Contents === 'function' && !page.node.Contents()) {
      page.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
    }

    const PDFLibModule = typeof PDFLib !== 'undefined'
      ? PDFLib
      : (typeof window !== 'undefined' && window.PDFLib ? window.PDFLib : (typeof global !== 'undefined' ? global.PDFLib : null));
    const rgb = PDFLibModule ? PDFLibModule.rgb : null;
    if (!rgb) return;

    const labelText = `#${seqNumber}`;
    const boxX = 12; // Far left inside "وصف الشحنة", above Tracking Number
    const boxY = 80; // ALWAYS 80 pt from bottom in pdf-lib user space!
    const boxW = 42;
    const boxH = 18;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.2
    });

    const textSize = 11;
    const textWidth = font.widthOfTextAtSize(labelText, textSize);
    page.drawText(labelText, {
      x: boxX + (boxW - textWidth) / 2,
      y: boxY + 4.5,
      size: textSize,
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

    if (page.node && typeof page.node.Contents === 'function' && !page.node.Contents()) return;

    let actualW = targetW;
    let actualH = targetH;
    if (page.node && typeof page.node.MediaBox === 'function') {
      const mb = page.node.MediaBox();
      const x1 = mb.get(0).asNumber();
      const y1 = mb.get(1).asNumber();
      const x2 = mb.get(2).asNumber();
      const y2 = mb.get(3).asNumber();
      actualW = Math.abs(x2 - x1);
      actualH = Math.abs(y2 - y1);
    } else if (typeof page.getSize === 'function') {
      const size = page.getSize();
      actualW = size.width;
      actualH = size.height;
    }

    const isAlreadyThermal = Math.abs(actualW - targetW) < 8 && Math.abs(actualH - targetH) < 8;

    if (!isAlreadyThermal && (!page.node || !page.node.Contents || page.node.Contents())) {
      // Scale X and Y independently so the Bosta label fills the entire 75x125mm page with NO white bars
      const scaleX = targetW / actualW;
      const scaleY = targetH / actualH;

      page.scaleContent(scaleX, scaleY);
      page.setMediaBox(0, 0, targetW, targetH);
      page.setCropBox(0, 0, targetW, targetH);
    }
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
  /**
   * Drop-In Replacement for Merging, Full-Page Resizing (75×125mm) & Red-Box Stamping
   */
  async buildSortedLabelsPdf(sortedOrders, options = {}) {
    return await buildSortedLabelsPdf(sortedOrders, options);
  },

  async generateSortedPDF(masterPdfBytes, sortedPages, options = {}, onProgress) {
    const bytes = masterPdfBytes || (typeof window !== 'undefined' ? window.rawUntouchedPdfBytes : (typeof global !== 'undefined' ? global.rawUntouchedPdfBytes : null));
    if (!sortedPages || sortedPages.length === 0) {
      throw new Error('لا توجد صفحات محددة للتصدير.');
    }

    const normalized = sortedPages.map((p, idx) => {
      const item = typeof p === 'number'
        ? { originalPageIndex: p, originalPageNumber: p + 1 }
        : { ...p };
      if (!item.rawPdfBytes && bytes) {
        item.rawPdfBytes = bytes;
      }
      if (!item.sourceFileId) {
        item.sourceFileId = 'default';
      }
      if (item.bucketId === undefined && item.bucket === undefined) {
        const bInfo = typeof this.classifyOrderBucket === 'function' ? this.classifyOrderBucket(item) : null;
        item.bucket = bInfo ? bInfo.bucket : 1;
        item.bucketId = item.bucket;
        item.subBucket = bInfo ? bInfo.subBucket : '';
      } else {
        item.bucketId = item.bucketId !== undefined ? item.bucketId : item.bucket;
      }
      if (typeof item.originalPageIndex !== 'number') {
        item.originalPageIndex = item.originalPageNumber ? item.originalPageNumber - 1 : idx;
      }
      return item;
    });

    const mergedOpts = {
      resizeToThermal: options.resizeToThermal !== undefined ? options.resizeToThermal : (options.thermalResize !== false),
      insertBlankSeparators: options.insertBlankSeparators !== false,
      stampSequenceNumber: options.stampSequenceNumber !== false,
      ...options
    };

    return await this.buildSortedLabelsPdf(normalized, mergedOpts);
  },

  /**
   * Helper to build aggregated products and customer reference directory data for A4 Pick-List (Strictly NO SKU)
   * GUARANTEES 100% full model name, color, and size with ZERO truncation (no ..)
   */
  buildA4PickListData(ordersList) {
    const list = Array.isArray(ordersList) ? ordersList : [];
    const totalOrders = list.length;
    let totalPieces = 0;
    const productMap = new Map();

    for (let idx = 0; idx < list.length; idx++) {
      const order = list[idx];
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
        const color = p.color || p.normalizedColor || order.color || '';
        const size = p.size || p.normalizedSize || order.size || '';
        const qty = p.qty || 1;

        // Build 100% full un-truncated product name (Model - Color / Size)
        let displayName = `${model}`;
        if (color && !displayName.includes(color)) {
          displayName += ` - ${color}`;
        }
        if (size && !displayName.includes(size)) {
          displayName += ` / ${size}`;
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
            model,
            color,
            size,
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

    const orderDirectory = list.map((order, idx) => {
      const seqNum = order.newPageNumber || (idx + 1);
      const custName = order.customerName || order.customer || `عميل #${seqNum}`;
      const pieces = typeof order.piecesCount === 'number'
        ? order.piecesCount
        : (parseInt(order.totalPieces, 10) || 1);

      let itemsDesc = '';
      if (order.products && Array.isArray(order.products) && order.products.length > 0) {
        itemsDesc = order.products.map(p => {
          const m = p.modelName || order.modelName || 'صنف';
          const c = p.color || p.normalizedColor || '';
          const s = p.size || p.normalizedSize || '';
          const q = p.qty || 1;
          let fullStr = m;
          if (c && !fullStr.includes(c)) fullStr += ` - ${c}`;
          if (s && !fullStr.includes(s)) fullStr += ` / ${s}`;
          return `${fullStr} (${q} قطعة)`;
        }).join(' + ');
      } else if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        itemsDesc = order.items.map(p => `${p.title || p.modelName || p} (${p.qty || 1} قطعة)`).join(' + ');
      } else {
        const m = order.modelName || 'صنف غير محدد';
        const c = order.color || '';
        const s = order.size || '';
        let fullStr = m;
        if (c && !fullStr.includes(c)) fullStr += ` - ${c}`;
        if (s && !fullStr.includes(s)) fullStr += ` / ${s}`;
        itemsDesc = `${fullStr} (${pieces} قطعة)`;
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
   * Partitions sorted orders into separate warehouse picking workflow batches
   * 1. Large Orders (3+ pieces & Rug+Other): batches <= 30 pieces
   * 2. Two-Piece Orders: batches of 10 orders (~20 pieces, <= 30 pieces)
   * 3. Single-Piece Women: batches <= 30 pieces
   * 4. Single-Piece Kids: batches <= 30 pieces
   * 5. Single-Piece Other: batches <= 30 pieces
   * 6. Pocket & Waterproof: batches <= 30 pieces
   */
  partitionA4Batches(sortedPages) {
    if (!sortedPages || sortedPages.length === 0) return [];

    const largeOrders = [];
    const twoPieceOrders = [];
    const womenOrders = [];
    const kidsOrders = [];
    const otherOrders = [];
    const pocketWpOrders = [];

    for (const order of sortedPages) {
      let b = order.bucketId !== undefined ? order.bucketId : (order.bucket !== undefined ? order.bucket : null);
      if (b === null && typeof this.classifyOrderBucket === 'function') {
        const bInfo = this.classifyOrderBucket(order);
        b = bInfo ? bInfo.bucket : null;
      }
      if (b === null) {
        const count = order.piecesCount || (order.products ? order.products.reduce((a, b) => a + (b.qty || 1), 0) : 1);
        if (count >= 3) b = 1;
        else if (count === 2) b = 4;
        else b = 5;
      }

      if (b === 1 || b === 2 || b === 3) {
        largeOrders.push(order);
      } else if (b === 4) {
        twoPieceOrders.push(order);
      } else if (b === 5) {
        womenOrders.push(order);
      } else if (b === 6) {
        kidsOrders.push(order);
      } else if (b === 7) {
        otherOrders.push(order);
      } else if (b === 8) {
        pocketWpOrders.push(order);
      } else {
        largeOrders.push(order);
      }
    }

    const batchList = [];

    const createPiecesBatches = (orders, maxPieces = 30, titlePrefix = '') => {
      if (!orders || orders.length === 0) return [];
      const batches = [];
      let cur = [];
      let curPieces = 0;
      for (const ord of orders) {
        const pCount = ord.piecesCount || (ord.products ? ord.products.reduce((a, b) => a + (b.qty || 1), 0) : 1);
        if (curPieces + pCount > maxPieces && cur.length > 0) {
          batches.push({ orders: cur, titlePrefix });
          cur = [];
          curPieces = 0;
        }
        cur.push(ord);
        curPieces += pCount;
      }
      if (cur.length > 0) {
        batches.push({ orders: cur, titlePrefix });
      }
      return batches;
    };

    // 1. Large Orders: <= 30 pieces per batch
    if (largeOrders.length > 0) {
      batchList.push(...createPiecesBatches(largeOrders, 30, 'كشف تجهيز الأوردرات الكبيرة'));
    }

    // 2. Two-Piece Orders: 10 orders per batch (~20 pieces, <= 30 pieces)
    if (twoPieceOrders.length > 0) {
      let cur = [];
      let curPieces = 0;
      for (const ord of twoPieceOrders) {
        const pCount = ord.piecesCount || 2;
        if ((cur.length >= 10 || curPieces + pCount > 30) && cur.length > 0) {
          batchList.push({ orders: cur, titlePrefix: 'كشف تجهيز أوردرات الاثنينات' });
          cur = [];
          curPieces = 0;
        }
        cur.push(ord);
        curPieces += pCount;
      }
      if (cur.length > 0) {
        batchList.push({ orders: cur, titlePrefix: 'كشف تجهيز أوردرات الاثنينات' });
      }
    }

    // 3. Single-Piece Women: <= 30 pieces
    if (womenOrders.length > 0) {
      batchList.push(...createPiecesBatches(womenOrders, 30, 'كشف تجهيز وحائد الحريمي (1 قطعة)'));
    }

    // 4. Single-Piece Kids: <= 30 pieces
    if (kidsOrders.length > 0) {
      batchList.push(...createPiecesBatches(kidsOrders, 30, 'كشف تجهيز وحائد الأطفالي (1 قطعة)'));
    }

    // 5. Single-Piece Other: <= 30 pieces
    if (otherOrders.length > 0) {
      batchList.push(...createPiecesBatches(otherOrders, 30, 'كشف تجهيز الأصناف الأخرى (1 قطعة)'));
    }

    // 6. Pocket & Waterproof Group: <= 30 pieces
    if (pocketWpOrders.length > 0) {
      batchList.push(...createPiecesBatches(pocketWpOrders, 30, 'كشف تجهيز مجموعة الجيب ووتر بروف'));
    }

    return batchList;
  },

  /**
   * Helper to wrap canvas text onto multiple lines without truncating
   */
  wrapCanvasText(ctx, text, maxWidth) {
    if (!text) return [''];
    const words = text.toString().split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  },

  /**
   * Generates a completely standalone Multi-Page A4 Pick-List & Customer Order Directory PDF (Strictly NO SKU)
   * Splits into batches with blank white separator pages between batches
   * Standard A4 portrait: 210mm x 297mm (595.28 x 841.89 pt)
   */
  async generateA4PickListPDF(sortedPages, options = {}) {
    const pdfLibModule = (typeof PDFLib !== 'undefined' ? PDFLib : (typeof window !== 'undefined' ? window.PDFLib : global.PDFLib));
    if (!pdfLibModule) {
      throw new Error('مكتبة PDFLib غير محملة');
    }

    const batches = this.partitionA4Batches(sortedPages);
    const outDoc = await pdfLibModule.PDFDocument.create();

    // Check if browser canvas is available
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvasWidth = 1240; // 150 DPI A4 portrait
      const canvasHeight = 1754;
      const margin = 40;
      const contentW = canvasWidth - (margin * 2); // 1160 px

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const data = this.buildA4PickListData(batch.orders);
        const startNum = batch.orders[0].newPageNumber || 1;
        const endNum = batch.orders[batch.orders.length - 1].newPageNumber || batch.orders.length;
        const batchTitle = `${batch.titlePrefix} - دفعة من أوردر [#${startNum}] إلى [#${endNum}] (إجمالي: ${data.totalPieces} قطعة / ${data.totalOrders} أوردرات)`;

        const batchCanvasPages = [];
        let currentCanvas = document.createElement('canvas');
        currentCanvas.width = canvasWidth;
        currentCanvas.height = canvasHeight;
        let ctx = currentCanvas.getContext('2d');
        batchCanvasPages.push(currentCanvas);

        let pageIndexInBatch = 1;

        const initCanvasPage = (c, isFirstPage = false) => {
          const cx = c.getContext('2d');
          cx.fillStyle = '#ffffff';
          cx.fillRect(0, 0, canvasWidth, canvasHeight);

          // Header Banner
          cx.fillStyle = '#0f172a';
          cx.fillRect(margin, margin, contentW, isFirstPage ? 110 : 70);

          // 18pt Bold Section Header
          cx.fillStyle = '#2dd4bf';
          cx.font = 'bold 36px "Alexandria", "Cairo", sans-serif';
          cx.textAlign = 'center';
          cx.fillText(batchTitle, canvasWidth / 2, margin + (isFirstPage ? 48 : 45));

          if (isFirstPage) {
            cx.fillStyle = '#ffffff';
            cx.font = 'bold 24px "Alexandria", "Cairo", sans-serif';
            cx.fillText(`دفعة تجهيز مخزني مستقلة  |  بدون أكواد SKU  |  جاهزة للتسليم المباشر للمحطة`, canvasWidth / 2, margin + 90);
          }
        };

        initCanvasPage(currentCanvas, true);
        let curY = margin + 130;

        const checkPageOverflow = (neededHeight) => {
          if (curY + neededHeight > canvasHeight - 80) {
            currentCanvas = document.createElement('canvas');
            currentCanvas.width = canvasWidth;
            currentCanvas.height = canvasHeight;
            ctx = currentCanvas.getContext('2d');
            pageIndexInBatch++;
            initCanvasPage(currentCanvas, false);
            batchCanvasPages.push(currentCanvas);
            curY = margin + 85;
          }
        };

        // --- SECTION 1: Aggregated Products Pick Table ---
        checkPageOverflow(85);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(margin, curY, contentW, 44);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 32px "Alexandria", "Cairo", sans-serif'; // 16pt - 18pt bold
        ctx.textAlign = 'right';
        ctx.fillText('📦 أولاً: جدول تجميع المنتجات والكميات المطلوبة في هذه الدفعة', canvasWidth - margin - 20, curY + 31);
        curY += 52;

        // Table 1 Header
        checkPageOverflow(42);
        ctx.fillStyle = '#334155';
        ctx.fillRect(margin, curY, contentW, 38);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 24px "Alexandria", "Cairo", sans-serif'; // 13pt bold

        // Columns layout:
        // Checkbox: 40px (1160 to 1200)
        // #: 55px (1105 to 1160)
        // Product Name & Size: 485px (620 to 1105)
        // Quantity: 120px (500 to 620)
        // Order Refs: 460px (40 to 500)
        ctx.textAlign = 'center';
        ctx.fillText('تجهيز', canvasWidth - margin - 20, curY + 26);
        ctx.fillText('#', canvasWidth - margin - 68, curY + 26);

        ctx.textAlign = 'right';
        ctx.fillText('اسم المنتج واللون والمقاس المعتمد (الاسم الكامل بدون اختصار)', canvasWidth - margin - 105, curY + 26);

        ctx.textAlign = 'center';
        ctx.fillText('إجمالي الكمية', margin + 520, curY + 26);

        ctx.textAlign = 'right';
        ctx.fillText('أرقام الأوردرات وأسماء العملاء المسحوب لها الصنف', margin + 450, curY + 26);
        curY += 40;

        // Rows for Section 1
        for (let idx = 0; idx < data.aggregatedProducts.length; idx++) {
          const prod = data.aggregatedProducts[idx];
          
          // Wrap product name and refs without ANY truncation
          ctx.font = 'bold 30px "Alexandria", "Cairo", sans-serif'; // 15pt - 16pt bold
          const nameLines = this.wrapCanvasText(ctx, prod.name, 470);

          ctx.font = 'bold 24px "Alexandria", "Cairo", sans-serif'; // 13pt - 14pt bold
          const refsText = prod.orderRefs.map(r => `أوردر #${r.seqNum} (${r.customerName}${r.qty > 1 ? ` - ${r.qty}ق` : ''})`).join(' ، ');
          const refLines = this.wrapCanvasText(ctx, refsText, 440);

          const maxLines = Math.max(nameLines.length, refLines.length, 1);
          const rowH = Math.max(54, maxLines * 34 + 18);
          checkPageOverflow(rowH);

          const isEven = idx % 2 === 0;
          ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
          ctx.fillRect(margin, curY, contentW, rowH);

          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(margin, curY, contentW, rowH);

          // Checkbox (22x22 box)
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(canvasWidth - margin - 32, curY + (rowH - 22) / 2, 22, 22);

          // Sequence Number
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 26px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${idx + 1}`, canvasWidth - margin - 68, curY + rowH / 2 + 9);

          // Product Name, Color & Size: 15pt - 16pt Bold, multi-line wrapped
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 30px "Alexandria", "Cairo", sans-serif';
          ctx.textAlign = 'right';
          const nameStartY = curY + 30 + (rowH - (nameLines.length * 34)) / 4;
          for (let l = 0; l < nameLines.length; l++) {
            ctx.fillText(nameLines[l], canvasWidth - margin - 105, nameStartY + l * 34);
          }

          // Quantity Badge: 16pt Extra Bold
          const qW = 66;
          const qH = 36;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(margin + 520 - qW / 2, curY + (rowH - qH) / 2, qW, qH, 6);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = '900 32px sans-serif'; // 16pt Extra Bold
          ctx.fillText(`${prod.totalQty}`, margin + 520, curY + (rowH - qH) / 2 + 27);

          // Orders & Customer Names: 14pt Bold
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 24px "Alexandria", "Cairo", sans-serif';
          ctx.textAlign = 'right';
          const refStartY = curY + 28 + (rowH - (refLines.length * 30)) / 4;
          for (let l = 0; l < refLines.length; l++) {
            ctx.fillText(refLines[l], margin + 450, refStartY + l * 30);
          }

          curY += rowH;
        }

        curY += 30;

        // --- SECTION 2: Order-to-Customer Reference Table ---
        checkPageOverflow(85);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(margin, curY, contentW, 44);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 32px "Alexandria", "Cairo", sans-serif'; // 16pt - 18pt bold
        ctx.textAlign = 'right';
        ctx.fillText(`📑 ثانياً: كشف بوالص العملاء ومحتوياتها في هذه الدفعة (من #${startNum} إلى #${endNum})`, canvasWidth - margin - 20, curY + 31);
        curY += 52;

        // Table 2 Header
        checkPageOverflow(42);
        ctx.fillStyle = '#334155';
        ctx.fillRect(margin, curY, contentW, 38);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 24px "Alexandria", "Cairo", sans-serif';

        // Columns layout Table 2:
        // Order #: 120px (1080 to 1200)
        // Customer Name: 270px (810 to 1080)
        // Pieces Count: 130px (680 to 810)
        // Items Desc: 640px (40 to 680)
        ctx.textAlign = 'center';
        ctx.fillText('رقم الأوردر', canvasWidth - margin - 60, curY + 26);

        ctx.textAlign = 'right';
        ctx.fillText('اسم العميل (من البوليصة)', canvasWidth - margin - 135, curY + 26);

        ctx.textAlign = 'center';
        ctx.fillText('إجمالي القطع', margin + 705, curY + 26);

        ctx.textAlign = 'right';
        ctx.fillText('المنتجات المطلوبة داخل الأوردر (بدون SKU)', margin + 630, curY + 26);
        curY += 40;

        // Rows for Section 2
        for (let idx = 0; idx < data.orderDirectory.length; idx++) {
          const ord = data.orderDirectory[idx];

          ctx.font = 'bold 28px "Alexandria", "Cairo", sans-serif'; // 14pt - 15pt bold
          const descLines = this.wrapCanvasText(ctx, ord.itemsDesc, 620);
          const custLines = this.wrapCanvasText(ctx, ord.customerName, 260);

          const maxLines = Math.max(descLines.length, custLines.length, 1);
          const rowH = Math.max(50, maxLines * 34 + 16);
          checkPageOverflow(rowH);

          const isEven = idx % 2 === 0;
          ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
          ctx.fillRect(margin, curY, contentW, rowH);

          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(margin, curY, contentW, rowH);

          // Sequence badge #X (Red Pill)
          const bW = 60;
          const bH = 32;
          ctx.fillStyle = '#e11d48';
          ctx.beginPath();
          ctx.roundRect(canvasWidth - margin - 60 - bW / 2, curY + (rowH - bH) / 2, bW, bH, 6);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`#${ord.seqNum}`, canvasWidth - margin - 60, curY + (rowH - bH) / 2 + 24);

          // Customer Name: 14pt Bold
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 28px "Alexandria", "Cairo", sans-serif';
          ctx.textAlign = 'right';
          const custStartY = curY + 28 + (rowH - (custLines.length * 32)) / 4;
          for (let l = 0; l < custLines.length; l++) {
            ctx.fillText(custLines[l], canvasWidth - margin - 135, custStartY + l * 32);
          }

          // Total Pieces: 14pt Bold
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 26px "Alexandria", "Cairo", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${ord.pieces} قطعة`, margin + 705, curY + rowH / 2 + 9);

          // Products Summary: 15pt Bold without any truncation
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 28px "Alexandria", "Cairo", sans-serif';
          ctx.textAlign = 'right';
          const descStartY = curY + 28 + (rowH - (descLines.length * 32)) / 4;
          for (let l = 0; l < descLines.length; l++) {
            ctx.fillText(descLines[l], margin + 630, descStartY + l * 32);
          }

          curY += rowH;
        }

        // Add footers & embed canvas pages of this batch into PDF
        for (let pIdx = 0; pIdx < batchCanvasPages.length; pIdx++) {
          const c = batchCanvasPages[pIdx];
          const cx = c.getContext('2d');
          cx.fillStyle = '#64748b';
          cx.font = 'bold 22px "Alexandria", "Cairo", sans-serif';
          cx.textAlign = 'center';
          cx.fillText(`دفعة ${bIdx + 1} من ${batches.length}  |  صفحة ${pIdx + 1} من ${batchCanvasPages.length}  |  منظومة تجهيز المستودع المعتمدة`, canvasWidth / 2, canvasHeight - 25);

          const dataUrl = c.toDataURL('image/png');
          const pngImage = await outDoc.embedPng(dataUrl);
          const pdfPage = outDoc.addPage([595.28, 841.89]);
          pdfPage.drawImage(pngImage, { x: 0, y: 0, width: 595.28, height: 841.89 });
        }

        // Insert Blank White Separator Page (ورقة بيضاء فاصلة) after each batch
        const blankPage = outDoc.addPage([595.28, 841.89]);
        blankPage.drawRectangle({
          x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0
        });
      }

      return await outDoc.save();
    } else {
      // Node.js fallback (standard vector A4 pages with blank separators)
      const { rgb, StandardFonts } = pdfLibModule;
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const data = this.buildA4PickListData(batch.orders);
        const page = outDoc.addPage([595.28, 841.89]);
        page.drawRectangle({ x: 20, y: 841.89 - 80, width: 595.28 - 40, height: 60, color: rgb(0.06, 0.09, 0.16) });
        page.drawText(`${batch.titlePrefix} (NO SKU)`, { x: 40, y: 841.89 - 50, size: 14, font, color: rgb(1, 1, 1) });
        page.drawText(`Orders: ${data.totalOrders} | Pieces: ${data.totalPieces} | Products: ${data.aggregatedProducts.length}`, { x: 40, y: 841.89 - 70, size: 10, font, color: rgb(0.2, 0.8, 0.7) });

        // Blank separator page
        const blank = outDoc.addPage([595.28, 841.89]);
        blank.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
      }

      return await outDoc.save();
    }
  },

  /**
   * Opens clean printable HTML view formatted for native browser A4 printing
   * Rendered with exact warehouse batches and large fonts
   */
  openA4PrintWindow(sortedPages) {
    if (typeof window === 'undefined') return;
    const batches = this.partitionA4Batches(sortedPages);

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
  <link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: 'Alexandria', sans-serif; direction: rtl; margin: 0; padding: 12px; color: #0f172a; font-size: 13px; background: #fff; }
    .batch-container { page-break-after: always; margin-bottom: 24px; }
    .blank-separator-page { page-break-after: always; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .banner { background: #0f172a; color: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; text-align: center; }
    .banner h1 { margin: 0 0 6px 0; font-size: 22px; color: #2dd4bf; font-weight: bold; }
    .banner-stats { font-size: 15px; font-weight: bold; }
    .sec-title { background: #1e293b; color: #38bdf8; padding: 10px 14px; font-size: 16px; font-weight: bold; border-radius: 6px; margin: 18px 0 10px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; word-break: break-word; }
    th { background: #334155; color: #fff; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; font-size: 14px; }
    td { padding: 8px 10px; border: 1px solid #cbd5e1; vertical-align: middle; }
    tr:nth-child(even) { background: #f8fafc; }
    .prod-name { font-size: 15px; font-weight: bold; color: #0f172a; }
    .badge-qty { background: #0f172a; color: #fff; padding: 4px 10px; border-radius: 6px; font-weight: 900; font-size: 16px; display: inline-block; }
    .badge-ord { background: #e11d48; color: #fff; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 14px; }
    .cust-name { font-size: 14px; font-weight: bold; color: #0f172a; }
    .chk { width: 18px; height: 18px; border: 2px solid #000; display: inline-block; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: left;">
    <button onclick="window.print()" style="background: #0f766e; color: #fff; border: none; padding: 10px 22px; border-radius: 6px; font-family: inherit; font-size: 14px; font-weight: bold; cursor: pointer;">🖨️ طباعة الآن (Ctrl + P)</button>
  </div>
  ${batches.map((batch, bIdx) => {
    const data = this.buildA4PickListData(batch.orders);
    const startNum = batch.orders[0].newPageNumber || 1;
    const endNum = batch.orders[batch.orders.length - 1].newPageNumber || batch.orders.length;
    return `
    <div class="batch-container">
      <div class="banner">
        <h1>${batch.titlePrefix} - دفعة من أوردر [#${startNum}] إلى [#${endNum}]</h1>
        <div class="banner-stats">إجمالي البوالص: ${data.totalOrders} أوردر  |  إجمالي القطع: ${data.totalPieces} قطعة  |  بدون أكواد SKU</div>
      </div>

      <div class="sec-title">📦 أولاً: جدول تجميع المنتجات والكميات المطلوبة في هذه الدفعة</div>
      <table>
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">تجهيز</th>
            <th style="width: 35px; text-align: center;">#</th>
            <th>اسم المنتج واللون والمقاس المعتمد (بدون اختصار)</th>
            <th style="width: 95px; text-align: center;">إجمالي الكمية</th>
            <th>أرقام الأوردرات وأسماء العملاء المسحوب لها الصنف</th>
          </tr>
        </thead>
        <tbody>
          ${data.aggregatedProducts.map((p, i) => `
            <tr>
              <td style="text-align: center;"><span class="chk"></span></td>
              <td style="text-align: center;"><b>${i + 1}</b></td>
              <td class="prod-name">${p.name}</td>
              <td style="text-align: center;"><span class="badge-qty">${p.totalQty}</span></td>
              <td>${p.orderRefs.map(r => `<span class="badge-ord">#${r.seqNum}</span> <b>${r.customerName}</b>${r.qty > 1 ? ` (${r.qty}ق)` : ''}`).join(' ، ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="sec-title">📑 ثانياً: كشف ربط أرقام الأوردرات بالعملاء ومحتوياتها في هذه الدفعة</div>
      <table>
        <thead>
          <tr>
            <th style="width: 100px; text-align: center;">رقم الأوردر</th>
            <th style="width: 160px;">اسم العميل</th>
            <th style="width: 90px; text-align: center;">إجمالي القطع</th>
            <th>المنتجات المطلوبة داخل الأوردر (بدون SKU)</th>
          </tr>
        </thead>
        <tbody>
          ${data.orderDirectory.map(o => `
            <tr>
              <td style="text-align: center;"><span class="badge-ord">#${o.seqNum}</span></td>
              <td class="cust-name">${o.customerName}</td>
              <td style="text-align: center;"><b>${o.pieces} قطعة</b></td>
              <td class="prod-name">${o.itemsDesc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Blank Separator Page -->
    <div class="blank-separator-page"></div>
    `;
  }).join('')}
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

/**
 * Drop-In Replacement for Merging, Full-Page Resizing (75×125mm) & Red-Box Stamping
 * Uses copyPages exclusively - NEVER calls embedPage or embedPages!
 */
async function buildSortedLabelsPdf(sortedOrders, options = {}) {
  const {
    resizeToThermal = true,
    insertBlankSeparators = true,
    stampSequenceNumber = true
  } = options;

  const PDFLib = (typeof globalThis !== 'undefined' && globalThis.PDFLib)
    || (typeof window !== 'undefined' && window.PDFLib)
    || (typeof global !== 'undefined' && global.PDFLib);
  if (!PDFLib) {
    throw new Error('مكتبة PDFLib غير متوفرة في الصفحة.');
  }

  const outDoc = await PDFLib.PDFDocument.create();
  const helveticaBold = await outDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

  const TARGET_W = 212.60; // 75 mm in points
  const TARGET_H = 354.33; // 125 mm in points

  // Cache loaded source PDFDocuments by file index/buffer so we load each uploaded file once
  const loadedSrcDocs = new Map();

  let previousBucket = null;

  for (let i = 0; i < sortedOrders.length; i++) {
    const rawOrder = sortedOrders[i];
    const order = typeof rawOrder === 'number'
      ? {
          originalPageIndex: rawOrder,
          originalPageNumber: rawOrder + 1,
          bucketId: 1,
          rawPdfBytes: (typeof window !== 'undefined' ? window.rawUntouchedPdfBytes : (typeof global !== 'undefined' ? global.rawUntouchedPdfBytes : null)),
          sourceFileId: 'default'
        }
      : rawOrder;

    const seqNumber = i + 1; // #1, #2, ...

    const curBucket = order.bucketId !== undefined ? order.bucketId : (order.bucket !== undefined ? order.bucket : null);

    // 1. Insert Blank White Separator Page (75x125mm) between different groups/buckets
    if (insertBlankSeparators && previousBucket !== null && curBucket !== null && curBucket !== previousBucket) {
      const blankPage = outDoc.addPage([TARGET_W, TARGET_H]);
      // Draw an invisible tiny dot so the blank page ALWAYS has a valid /Contents stream
      blankPage.drawRectangle({
        x: 0, y: 0, width: 1, height: 1,
        color: PDFLib.rgb(1, 1, 1), opacity: 0
      });
    }
    if (curBucket !== null) {
      previousBucket = curBucket;
    }

    // 2. Get source PDFDocument for this order
    const srcBytes = order.rawPdfBytes || (typeof window !== 'undefined' ? window.rawUntouchedPdfBytes : (typeof global !== 'undefined' ? global.rawUntouchedPdfBytes : null));
    if (!srcBytes) {
      console.warn(`Order #${seqNumber} has no rawPdfBytes or window.rawUntouchedPdfBytes.`);
      continue;
    }
    const cacheKey = order.sourceFileId || 'default';
    if (!loadedSrcDocs.has(cacheKey)) {
      const doc = await PDFLib.PDFDocument.load(srcBytes.slice(0), { ignoreEncryption: true });
      loadedSrcDocs.set(cacheKey, doc);
    }
    const srcDoc = loadedSrcDocs.get(cacheKey);

    // 3. Copy page using copyPages (NEVER use embedPage!)
    const pageIdx = typeof order.originalPageIndex === 'number'
      ? order.originalPageIndex
      : (order.originalPageNumber - 1);

    const [copiedPage] = await outDoc.copyPages(srcDoc, [pageIdx]);

    // 4. Full-Bleed Scaling to 75x125mm (Keep Aspect Ratio = FALSE, exactly like PDF24)
    // Ensure /Contents exists even on empty pages
    if (!copiedPage.node.Contents()) {
      copiedPage.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
    }

    const mb = copiedPage.node.MediaBox();
    const x1 = mb.get(0).asNumber();
    const y1 = mb.get(1).asNumber();
    const x2 = mb.get(2).asNumber();
    const y2 = mb.get(3).asNumber();
    const actualW = Math.abs(x2 - x1);
    const actualH = Math.abs(y2 - y1);

    const isAlreadyThermal = Math.abs(actualW - TARGET_W) < 5 && Math.abs(actualH - TARGET_H) < 5;

    if (resizeToThermal && actualW > 0 && actualH > 0) {
      if (!isAlreadyThermal) {
        // Scale X and Y independently so the Bosta label fills the entire 75x125mm page with NO white bars
        const scaleX = TARGET_W / actualW;
        const scaleY = TARGET_H / actualH;
        copiedPage.scaleContent(scaleX, scaleY);
      } else {
        // For pages that have internal white padding around the Bosta border:
        // apply slight expansion so Bosta label border expands edge-to-edge to fill 100% of 75x125mm sheet
        copiedPage.scaleContent(1.045, 1.045);
        copiedPage.translateContent(-4.5, -6);
      }

      if (y1 > y2) {
        copiedPage.setMediaBox(0, TARGET_H, TARGET_W, 0);
        copiedPage.setCropBox(0, TARGET_H, TARGET_W, 0);
      } else {
        copiedPage.setMediaBox(0, 0, TARGET_W, TARGET_H);
        copiedPage.setCropBox(0, 0, TARGET_W, TARGET_H);
      }
    }

    // 5. Stamp Sequence Number [ #X ] in the EXACT Red Box (Bottom-Left of "وصف الشحنة", above "Tracking Number")
    if (stampSequenceNumber) {
      if (!copiedPage.node.Contents()) {
        copiedPage.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
      }

      const labelText = `#${seqNumber}`;
      const boxX = 12; // Far left inside "وصف الشحنة", above Tracking Number
      const boxY = 80; // ALWAYS 80 pt from bottom in pdf-lib user space!
      const boxW = 42;
      const boxH = 18;

      copiedPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: PDFLib.rgb(1, 1, 1),
        borderColor: PDFLib.rgb(0, 0, 0),
        borderWidth: 1.2
      });

      const textSize = 11;
      const textWidth = helveticaBold.widthOfTextAtSize(labelText, textSize);
      copiedPage.drawText(labelText, {
        x: boxX + (boxW - textWidth) / 2,
        y: boxY + 4.5,
        size: textSize,
        font: helveticaBold,
        color: PDFLib.rgb(0, 0, 0)
      });
    }

    outDoc.addPage(copiedPage);
  }

  return await outDoc.save(); 
}

/**
 * Robust Multi-File Merge & Full-Bleed 75x125mm Resizing
 * Uses copyPages exclusively - crash-proof against missing /Contents streams
 */
async function mergeAndResizePdfFiles(fileBuffersArray, shouldResize = true) {
  const PDFLib = (typeof globalThis !== 'undefined' && globalThis.PDFLib)
    || (typeof window !== 'undefined' && window.PDFLib)
    || (typeof global !== 'undefined' && global.PDFLib);

  const mergedDoc = await PDFLib.PDFDocument.create();
  const TARGET_W = 212.60; // 75 mm
  const TARGET_H = 354.33; // 125 mm

  for (const rawBuf of fileBuffersArray) {
    const safeCopy = new Uint8Array(rawBuf).slice(0);
    const srcDoc = await PDFLib.PDFDocument.load(safeCopy, { ignoreEncryption: true });
    const pageIndices = srcDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);

    for (const copiedPage of copiedPages) {
      // Ensure /Contents exists even on empty pages
      if (!copiedPage.node.Contents()) {
        copiedPage.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });
      }

      if (shouldResize) {
        const mb = copiedPage.node.MediaBox();
        const x1 = mb.get(0).asNumber();
        const y1 = mb.get(1).asNumber();
        const x2 = mb.get(2).asNumber();
        const y2 = mb.get(3).asNumber();
        const actualW = Math.abs(x2 - x1);
        const actualH = Math.abs(y2 - y1);

        const isAlreadyThermal = Math.abs(actualW - TARGET_W) < 5 && Math.abs(actualH - TARGET_H) < 5;
        if (actualW > 0 && actualH > 0) {
          if (!isAlreadyThermal) {
            const scaleX = TARGET_W / actualW;
            const scaleY = TARGET_H / actualH;
            copiedPage.scaleContent(scaleX, scaleY);
          } else {
            copiedPage.scaleContent(1.045, 1.045);
            copiedPage.translateContent(-4.5, -6);
          }
          if (y1 > y2) {
            copiedPage.setMediaBox(0, TARGET_H, TARGET_W, 0);
            copiedPage.setCropBox(0, TARGET_H, TARGET_W, 0);
          } else {
            copiedPage.setMediaBox(0, 0, TARGET_W, TARGET_H);
            copiedPage.setCropBox(0, 0, TARGET_W, TARGET_H);
          }
        }
      }

      mergedDoc.addPage(copiedPage);
    }
  }

  return await mergedDoc.save();
}

PDFProcessor.buildSortedLabelsPdf = buildSortedLabelsPdf;
PDFProcessor.mergeAndResizePdfFiles = mergeAndResizePdfFiles;

if (typeof window !== 'undefined') {
  window.PDFProcessor = PDFProcessor;
  window.buildSortedLabelsPdf = buildSortedLabelsPdf;
  window.mergeAndResizePdfFiles = mergeAndResizePdfFiles;
}
if (typeof global !== 'undefined') {
  global.PDFProcessor = PDFProcessor;
  global.buildSortedLabelsPdf = buildSortedLabelsPdf;
  global.mergeAndResizePdfFiles = mergeAndResizePdfFiles;
}


