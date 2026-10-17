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
        str: item.str,
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
        if (!item.str || item.str.trim() === '') continue;

        if (currentY === null || Math.abs(item.y - currentY) > 2.5) {
          if (currentLine.length > 0) {
            // Sort line horizontally (for Arabic RTL: X descending, right-to-left)
            currentLine.sort((a, b) => b.x - a.x);
            lines.push(currentLine.map(i => i.str).join(' '));
          }
          currentLine = [item];
          currentY = item.y;
        } else {
          currentLine.push(item);
        }
      }

      if (currentLine.length > 0) {
        currentLine.sort((a, b) => b.x - a.x);
        lines.push(currentLine.map(i => i.str).join(' '));
      }

      // Parse Bosta Arabic format strictly
      const parsed = ArabicUtils.parseBostaPage(lines, pageNum);

      // If inventory sheet was loaded, enrich with SKU matching
      if (typeof InventoryParser !== 'undefined' && InventoryParser.inventoryItems.length > 0) {
        if (!parsed.sku && parsed.modelName) {
          const match = InventoryParser.matchProduct(parsed.modelName);
          if (match && match.sku) {
            parsed.sku = match.sku;
            parsed.matchedInventory = match;
          }
        }
      }

      extractedData.push(parsed);
    }

    return extractedData;
  },

  /**
   * Sort pages according to warehouse picking strategies
   */
  sortPages(pages, strategy = 'A') {
    const list = [...pages];
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    list.sort((a, b) => {
      // Unrecognized/empty pages are pushed to the end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy A (Fast Warehouse Picking):
      // 1. Single-product orders first, Multi-product orders at the end
      // 2. Alphabetically by Model Name
      // 3. Alphabetically by Color
      // 4. By Size rank (الأول -> الثاني -> الثالث -> الرابع)
      // 5. Quantity
      if (strategy === 'A') {
        if (a.isMultiProduct !== b.isMultiProduct) {
          return a.isMultiProduct ? 1 : -1;
        }

        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        const colorCmp = arCollator.compare(a.normalizedColor, b.normalizedColor);
        if (colorCmp !== 0) return colorCmp;

        const rankA = ArabicUtils.getSizeRank(a.normalizedSize);
        const rankB = ArabicUtils.getSizeRank(b.normalizedSize);
        if (rankA !== rankB) return rankA - rankB;

        if (a.totalItemsCount !== b.totalItemsCount) {
          return a.totalItemsCount - b.totalItemsCount;
        }

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy B (All Orders grouped by First Product regardless of single/multi)
      if (strategy === 'B') {
        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        const colorCmp = arCollator.compare(a.normalizedColor, b.normalizedColor);
        if (colorCmp !== 0) return colorCmp;

        const rankA = ArabicUtils.getSizeRank(a.normalizedSize);
        const rankB = ArabicUtils.getSizeRank(b.normalizedSize);
        if (rankA !== rankB) return rankA - rankB;

        if (a.isMultiProduct !== b.isMultiProduct) {
          return a.isMultiProduct ? 1 : -1;
        }

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy C (Sort by SKU / Inventory Order)
      if (strategy === 'C') {
        const hasSkuA = Boolean(a.sku);
        const hasSkuB = Boolean(b.sku);

        if (hasSkuA && !hasSkuB) return -1;
        if (!hasSkuA && hasSkuB) return 1;

        if (hasSkuA && hasSkuB) {
          if (typeof InventoryParser !== 'undefined' && InventoryParser.skuPriorityOrder.size > 0) {
            const prioA = InventoryParser.getSKUPriority(a.sku);
            const prioB = InventoryParser.getSKUPriority(b.sku);
            if (prioA !== prioB) return prioA - prioB;
          }
          const skuCmp = a.sku.localeCompare(b.sku);
          if (skuCmp !== 0) return skuCmp;
        }

        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      return a.originalPageNumber - b.originalPageNumber;
    });

    return list.map((item, idx) => ({
      ...item,
      newPageNumber: idx + 1
    }));
  },

  /**
   * Generates final sorted and resized PDF (75mm x 125mm = 212.60 x 354.33 pt)
   * Instantaneous zero-loss output when page is already ~212.6 x 354.3 pt
   */
  async generateSortedPDF(masterPdfBytes, sortedPages, options = {}, onProgress) {
    if (typeof PDFLib === 'undefined') {
      throw new Error('مكتبة pdf-lib غير محملة. يرجى التأكد من اتصال الإنترنت.');
    }

    if (!masterPdfBytes || masterPdfBytes.byteLength === 0) {
      throw new Error('بيانات ملف الـ PDF الأصلي غير متوفرة.');
    }

    if (!sortedPages || sortedPages.length === 0) {
      throw new Error('لا توجد صفحات محددة للتصدير.');
    }

    const {
      resize = true,
      widthMm = 75,
      heightMm = 125,
      keepAspectRatio = true
    } = options;

    const targetWidthPt = widthMm * this.MM_TO_PT; // ~212.60 pt
    const targetHeightPt = heightMm * this.MM_TO_PT; // ~354.33 pt

    try {
      const safeBuffer = masterPdfBytes.slice(0);
      const srcDoc = await PDFLib.PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const outDoc = await PDFLib.PDFDocument.create();

      const sortedIndices = sortedPages.map(p => p.originalPageNumber - 1);
      const copiedPages = await outDoc.copyPages(srcDoc, sortedIndices);

      const total = copiedPages.length;

      for (let i = 0; i < total; i++) {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: total,
            percent: Math.round(((i + 1) / total) * 100),
            phase: 'تجهيز صفحات الطباعة الحرارية (75×125 ملم)'
          });
        }

        const page = copiedPages[i];
        const { width: origW, height: origH } = page.getSize();

        // Check if page is already thermal size ~212.6 x 354.3 pt (within ±3 pt)
        const isAlreadyThermal = Math.abs(origW - targetWidthPt) <= 4 && Math.abs(origH - targetHeightPt) <= 4;

        if (resize && !isAlreadyThermal) {
          if (keepAspectRatio) {
            const scale = Math.min(targetWidthPt / origW, targetHeightPt / origH);
            page.scale(scale, scale);
            page.setSize(targetWidthPt, targetHeightPt);

            const scaledW = origW * scale;
            const scaledH = origH * scale;
            const xOffset = (targetWidthPt - scaledW) / 2;
            const yOffset = (targetHeightPt - scaledH) / 2;
            page.translateContent(xOffset, yOffset);
          } else {
            page.scale(targetWidthPt / origW, targetHeightPt / origH);
            page.setSize(targetWidthPt, targetHeightPt);
          }
        }

        outDoc.addPage(page);
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
