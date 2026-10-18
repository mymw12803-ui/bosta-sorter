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
          phase: 'قراءة وتحليل الباركود والبيانات'
        });
      }

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
      const parsed = ArabicUtils.parseBostaPage(lines, pageNum);

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
   * Helper to determine picking group rank for Strategy 1:
   * Rank 1: Large orders (3+ pieces)
   * Rank 2: Two-piece orders (2 pieces)
   * Rank 3: 1-piece Women (حريمي)
   * Rank 4: 1-piece Kids (أطفالي)
   * Rank 5: 1-piece Others (سجاد صلاة، شنط، إكسسوارات)
   * Rank 6: Unrecognized
   */
  getStrategy1GroupRank(item) {
    if (!item.hasRecognizedDescription) return 6;
    const count = item.piecesCount || item.totalItemsCount || 1;
    if (count >= 3) return 1;
    if (count === 2) return 2;
    // Single piece (1 قطعة):
    if (item.isWomen) return 3;
    if (item.isKids) return 4;
    return 5;
  },

  /**
   * Sort pages according to warehouse picking strategies:
   * Strategy 1 ('1' or 'A'): Optimized Warehouse Route (مسار المخزن العملي)
   * Strategy 2 ('2'): Pure Inventory Sheet Sequence (شيت المخزن فقط)
   * Strategy 3 ('3'): By Piece Count Only (عدد القطع فقط تنازلياً)
   * Strategy 4 ('4'): By Department (حسب الأقسام حريمي وأطفالي)
   */
  sortPages(pages, strategy = '1') {
    const list = [...pages];
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    list.sort((a, b) => {
      // Unrecognized/empty pages are pushed to the end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy 1 (Default - Optimized Warehouse Route / الترتيب العملي لمسار المخزن)
      if (strategy === '1' || strategy === 'A') {
        const rankA = this.getStrategy1GroupRank(a);
        const rankB = this.getStrategy1GroupRank(b);

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        // Within Group 1 (Large orders, >= 3 pieces): sorted descending by piece count
        if (rankA === 1) {
          const countA = a.piecesCount || a.totalItemsCount || 1;
          const countB = b.piecesCount || b.totalItemsCount || 1;
          if (countB !== countA) {
            return countB - countA;
          }
        }

        // Within each group / subgroup: sort by warehouse walk sequence index if available
        const walkA = typeof a.walkIndex === 'number' ? a.walkIndex : 999999;
        const walkB = typeof b.walkIndex === 'number' ? b.walkIndex : 999999;
        if (walkA !== walkB) {
          return walkA - walkB;
        }

        // Model Name Similarity
        const modelCmp = arCollator.compare(a.normalizedModel || '', b.normalizedModel || '');
        if (modelCmp !== 0) return modelCmp;

        // Color / Variant Code
        const colorCmp = arCollator.compare(a.normalizedColor || '', b.normalizedColor || '');
        if (colorCmp !== 0) return colorCmp;

        // Size Rank: الأول -> الثاني -> الثالث -> الرابع
        const sizeA = ArabicUtils.getSizeRank(a.normalizedSize);
        const sizeB = ArabicUtils.getSizeRank(b.normalizedSize);
        if (sizeA !== sizeB) return sizeA - sizeB;

        // Full Description Tie-Breaker
        const descCmp = arCollator.compare(a.fullNormalizedDesc || '', b.fullNormalizedDesc || '');
        if (descCmp !== 0) return descCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy 2 (Pure Inventory Sheet Sequence / الترتيب حسب شيت المخزن فقط)
      if (strategy === '2' || strategy === 'C') {
        const walkA = typeof a.walkIndex === 'number' ? a.walkIndex : 999999;
        const walkB = typeof b.walkIndex === 'number' ? b.walkIndex : 999999;
        if (walkA !== walkB) return walkA - walkB;

        const countA = a.piecesCount || a.totalItemsCount || 1;
        const countB = b.piecesCount || b.totalItemsCount || 1;
        if (countB !== countA) return countB - countA;

        const modelCmp = arCollator.compare(a.normalizedModel || '', b.normalizedModel || '');
        if (modelCmp !== 0) return modelCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy 3 (By Piece Count Only / الترتيب حسب عدد القطع فقط)
      if (strategy === '3') {
        const countA = a.piecesCount || a.totalItemsCount || 1;
        const countB = b.piecesCount || b.totalItemsCount || 1;
        if (countB !== countA) return countB - countA;

        const walkA = typeof a.walkIndex === 'number' ? a.walkIndex : 999999;
        const walkB = typeof b.walkIndex === 'number' ? b.walkIndex : 999999;
        if (walkA !== walkB) return walkA - walkB;

        const modelCmp = arCollator.compare(a.normalizedModel || '', b.normalizedModel || '');
        if (modelCmp !== 0) return modelCmp;

        const colorCmp = arCollator.compare(a.normalizedColor || '', b.normalizedColor || '');
        if (colorCmp !== 0) return colorCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy 4 (By Department / الترتيب حسب الأقسام حريمي وأطفالي)
      if (strategy === '4') {
        // Group: Women (1), Kids (2), Others (3)
        const deptA = a.isWomen ? 1 : (a.isKids ? 2 : 3);
        const deptB = b.isWomen ? 1 : (b.isKids ? 2 : 3);
        if (deptA !== deptB) return deptA - deptB;

        const countA = a.piecesCount || a.totalItemsCount || 1;
        const countB = b.piecesCount || b.totalItemsCount || 1;
        if (countB !== countA) return countB - countA;

        const walkA = typeof a.walkIndex === 'number' ? a.walkIndex : 999999;
        const walkB = typeof b.walkIndex === 'number' ? b.walkIndex : 999999;
        if (walkA !== walkB) return walkA - walkB;

        const modelCmp = arCollator.compare(a.normalizedModel || '', b.normalizedModel || '');
        if (modelCmp !== 0) return modelCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Legacy fallback (Option B)
      const modelCmp = arCollator.compare(a.normalizedModel || '', b.normalizedModel || '');
      if (modelCmp !== 0) return modelCmp;

      return a.originalPageNumber - b.originalPageNumber;
    });

    return list.map((item, idx) => ({
      ...item,
      newPageNumber: idx + 1
    }));
  },

  /**
   * Generates final sorted PDF (Pure 1:1 binary copy)
   * If options.insertBlankSeparators is true, inserts blank pages [212.60, 354.33] between groups.
   */
  async generateSortedPDF(masterPdfBytes, sortedPages, options = {}, onProgress) {
    if (typeof PDFLib === 'undefined') {
      throw new Error('مكتبة pdf-lib غير محملة. يرجى التأكد من اتصال الإنترنت.');
    }

    const bytes = masterPdfBytes || (typeof window !== 'undefined' ? window.rawUntouchedPdfBytes : null);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error('بيانات ملف الـ PDF الأصلي غير متوفرة.');
    }

    if (!sortedPages || sortedPages.length === 0) {
      throw new Error('لا توجد صفحات محددة للتصدير.');
    }

    try {
      const safeBuffer = bytes.slice(0);
      const srcDoc = await PDFLib.PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const outDoc = await PDFLib.PDFDocument.create();

      const sortedIndices = sortedPages.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));

      // Pure 1:1 binary copy - DO NOT call setSize, embedPage, scaleContent or setMediaBox!
      const copiedPages = await outDoc.copyPages(srcDoc, sortedIndices);

      const total = copiedPages.length;
      for (let i = 0; i < total; i++) {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: total,
            percent: Math.round(((i + 1) / total) * 100),
            phase: 'تجهيز صفحات الطباعة (نسخ ثنائي مباشر 1:1)'
          });
        }
        outDoc.addPage(copiedPages[i]);

        // Blank Separator Logic (صفحة بيضاء فاصلة بين المجموعات)
        if (options.insertBlankSeparators && i < total - 1) {
          const curPage = sortedPages[i];
          const nextPage = sortedPages[i + 1];
          if (curPage && nextPage) {
            const rankCur = this.getStrategy1GroupRank(curPage);
            const rankNext = this.getStrategy1GroupRank(nextPage);

            // Boundary transitions: 1->2, 2->3, 3->4, 4->5
            if (rankCur >= 1 && rankCur <= 4 && rankNext > rankCur && rankNext <= 5) {
              outDoc.addPage([212.60, 354.33]);
            }
          }
        }
      }

      return await outDoc.save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      throw new Error(`فشل إنشاء ملف الـ PDF: ${err.message || err}`);
    }
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
