/**
 * PDF Processing Engine
 * - Extracts text using pdf.js
 * - Performs multi-level sorting (Strategies A, B, C)
 * - Generates & resizes final ready-to-print thermal PDF (75mm x 125mm) using pdf-lib
 */

const PDFProcessor = {
  // Conversion constant: 1 mm = 2.83464567 PDF points (72 points / 25.4 mm)
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
   * Extract text and metadata from all pages in the PDF
   */
  async extractPages(arrayBuffer, onProgress) {
    this.initPdfJs();

    // Clone buffer safely before passing to pdf.js to prevent worker detachment
    const safeBuffer = arrayBuffer.slice(0);

    const loadingTask = pdfjsLib.getDocument({
      data: safeBuffer,
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
      
      // Group text items into lines based on Y coordinate (ty)
      const items = textContent.items.map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height
      }));

      // Sort items by Y descending (top to bottom)
      // Group items within a threshold (~4-5 pt) into the same line
      items.sort((a, b) => b.y - a.y || a.x - b.x);

      const lines = [];
      let currentLine = [];
      let currentY = null;

      for (const item of items) {
        if (!item.str || item.str.trim() === '') continue;

        if (currentY === null || Math.abs(item.y - currentY) > 5) {
          if (currentLine.length > 0) {
            // Sort line horizontally (for Arabic/RTL, preserve logical reading)
            currentLine.sort((a, b) => a.x - b.x);
            lines.push(currentLine.map(i => i.str).join(' '));
          }
          currentLine = [item];
          currentY = item.y;
        } else {
          currentLine.push(item);
        }
      }

      if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine.map(i => i.str).join(' '));
      }

      // Parse Bosta Arabic format
      const parsed = ArabicUtils.parseBostaPage(lines, pageNum);

      // If inventory data is available, enrich with SKU matching
      if (typeof InventoryParser !== 'undefined' && InventoryParser.inventoryItems.length > 0) {
        if (!parsed.sku && parsed.primaryProduct) {
          const match = InventoryParser.matchProduct(parsed.primaryProduct);
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
   * Sort pages according to selected strategy
   * @param {Array} pages - list of parsed page objects
   * @param {String} strategy - 'A', 'B', or 'C'
   */
  sortPages(pages, strategy = 'A') {
    const list = [...pages];

    // Arabic locale comparator for strings
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    list.sort((a, b) => {
      // Rule: Unrecognized/empty pages are always pushed to the very end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy A (Fast Picking):
      // 1. Single-product orders first, Multi-product orders second
      // 2. Alphabetically by Model Name
      // 3. Alphabetically by Color
      // 4. Alphabetically by Size
      // 5. Quantity
      if (strategy === 'A') {
        if (a.isMultiProduct !== b.isMultiProduct) {
          // false (single) comes before true (multi)
          return a.isMultiProduct ? 1 : -1;
        }

        // Compare Base Model Name
        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        // Compare Color
        const colorCmp = arCollator.compare(a.normalizedColor, b.normalizedColor);
        if (colorCmp !== 0) return colorCmp;

        // Compare Size with intelligent size ranking (الأول -> الثاني -> الثالث or S -> M -> L)
        const rankA = ArabicUtils.getSizeRank(a.normalizedSize);
        const rankB = ArabicUtils.getSizeRank(b.normalizedSize);
        if (rankA !== rankB) return rankA - rankB;

        const sizeCmp = arCollator.compare(a.normalizedSize, b.normalizedSize);
        if (sizeCmp !== 0) return sizeCmp;

        // Compare Item Count / Quantity
        if (a.totalItemsCount !== b.totalItemsCount) {
          return a.totalItemsCount - b.totalItemsCount;
        }

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy B (All Orders by First Product):
      // Group everything by Product -> Color -> Size regardless of single/multi
      if (strategy === 'B') {
        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        const colorCmp = arCollator.compare(a.normalizedColor, b.normalizedColor);
        if (colorCmp !== 0) return colorCmp;

        const rankA = ArabicUtils.getSizeRank(a.normalizedSize);
        const rankB = ArabicUtils.getSizeRank(b.normalizedSize);
        if (rankA !== rankB) return rankA - rankB;

        const sizeCmp = arCollator.compare(a.normalizedSize, b.normalizedSize);
        if (sizeCmp !== 0) return sizeCmp;

        if (a.isMultiProduct !== b.isMultiProduct) {
          return a.isMultiProduct ? 1 : -1;
        }

        return a.originalPageNumber - b.originalPageNumber;
      }

      // Strategy C (Sort by SKU):
      // Sort by detected SKU / inventory priority order
      if (strategy === 'C') {
        const hasSkuA = Boolean(a.sku);
        const hasSkuB = Boolean(b.sku);

        if (hasSkuA && !hasSkuB) return -1;
        if (!hasSkuA && hasSkuB) return 1;

        if (hasSkuA && hasSkuB) {
          // Check inventory sequence priority if available
          if (typeof InventoryParser !== 'undefined' && InventoryParser.skuPriorityOrder.size > 0) {
            const prioA = InventoryParser.getSKUPriority(a.sku);
            const prioB = InventoryParser.getSKUPriority(b.sku);
            if (prioA !== prioB) return prioA - prioB;
          }
          const skuCmp = a.sku.localeCompare(b.sku);
          if (skuCmp !== 0) return skuCmp;
        }

        // Fallback to Model Name then Color
        const modelCmp = arCollator.compare(a.normalizedModel, b.normalizedModel);
        if (modelCmp !== 0) return modelCmp;

        const colorCmp = arCollator.compare(a.normalizedColor, b.normalizedColor);
        if (colorCmp !== 0) return colorCmp;

        return a.originalPageNumber - b.originalPageNumber;
      }

      return a.originalPageNumber - b.originalPageNumber;
    });

    // Assign new sequential page numbers
    return list.map((item, idx) => ({
      ...item,
      newPageNumber: idx + 1
    }));
  },

  /**
   * Generates final sorted and resized PDF
   * Uses pdf-lib copyPages for robust vector fidelity and exact thermal dimensions (75mm x 125mm)
   */
  async generateSortedPDF(originalPdfBytes, sortedPages, options = {}, onProgress) {
    if (typeof PDFLib === 'undefined') {
      throw new Error('مكتبة pdf-lib غير محملة. يرجى التأكد من اتصال الإنترنت.');
    }

    if (!originalPdfBytes || originalPdfBytes.byteLength === 0) {
      throw new Error('بيانات ملف الـ PDF الأصلي فارغة أو غير متوفرة.');
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
      // Safe clone of original buffer so it is never detached or corrupted
      const safeBuffer = originalPdfBytes.slice(0);

      const sourceDoc = await PDFLib.PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const targetDoc = await PDFLib.PDFDocument.create();

      const sortedIndices = sortedPages.map(p => p.originalPageNumber - 1);
      const copiedPages = await targetDoc.copyPages(sourceDoc, sortedIndices);

      const total = copiedPages.length;

      for (let i = 0; i < total; i++) {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: total,
            percent: Math.round(((i + 1) / total) * 100),
            phase: 'تجهيز وتغيير حجم بوالص الشحن للحجم الحراري (75×125 ملم)'
          });
        }

        const page = copiedPages[i];

        if (resize) {
          const { width: origWidth, height: origHeight } = page.getSize();

          if (keepAspectRatio) {
            // Proportional scale to fit inside 75x125 mm
            const scale = Math.min(targetWidthPt / origWidth, targetHeightPt / origHeight);
            page.scale(scale, scale);
            page.setSize(targetWidthPt, targetHeightPt);

            // Centering inside the thermal page
            const scaledWidth = origWidth * scale;
            const scaledHeight = origHeight * scale;
            const xOffset = (targetWidthPt - scaledWidth) / 2;
            const yOffset = (targetHeightPt - scaledHeight) / 2;
            page.translateContent(xOffset, yOffset);
          } else {
            // Direct stretch
            const scaleX = targetWidthPt / origWidth;
            const scaleY = targetHeightPt / origHeight;
            page.scale(scaleX, scaleY);
            page.setSize(targetWidthPt, targetHeightPt);
          }
        }

        targetDoc.addPage(page);
      }

      // Save and return final PDF bytes
      const outputPdfBytes = await targetDoc.save();
      return outputPdfBytes;
    } catch (err) {
      console.error('Error generating PDF:', err);
      throw new Error(`فشل إنشاء ملف الـ PDF: ${err.message || err}`);
    }
  },

  /**
   * Generates a single-page thermal PDF for quick individual printing
   */
  async generateSinglePagePDF(originalPdfBytes, originalPageNumber, options = {}) {
    return this.generateSortedPDF(originalPdfBytes, [{ originalPageNumber }], options);
  }
};

window.PDFProcessor = PDFProcessor;
