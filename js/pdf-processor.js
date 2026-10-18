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
   * Unified Layered Sorting Pipeline:
   * - Layer 1 (MANDATORY & PRIMARY): Total Pieces Descending:
   *     1. Large Orders (3+ pieces, sorted 8, 7, 6, 5, 4, 3...)
   *     2. Two-Piece Orders (exactly 2 pieces)
   *     3. Single-Piece Orders (exactly 1 piece)
   * - Layer 2 (MANDATORY SECONDARY): Department Grouping:
   *     Women ("حريمي") first -> Kids ("أطفالي") second -> Others third
   * - Layer 3 (OPTIONAL VIA TOGGLE & UPLOAD): Warehouse CSV Sequence Order:
   *     Sorted by row index in CSV (walkIndex ascending)
   * - Sub-layer tie breakers: model, color, size rank, description, page
   */
  sortPages(pages, options = {}) {
    const list = [...pages];
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    let opts = options;
    if (typeof options === 'string') {
      opts = { strategy: options, useWalkSequence: true };
    }
    const useWalkSequence = opts.useWalkSequence !== false;

    list.sort((a, b) => {
      // Unrecognized/empty pages are pushed to the end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Layer 1: Total Pieces Group (Large 3+ -> Two-Piece 2 -> Single 1)
      const gA = this.getPieceGroup(a);
      const gB = this.getPieceGroup(b);
      if (gA !== gB) return gA - gB;

      // Within Group 1 (Large orders, 3+ pieces): Pieces descending (8, 7, 6, 5, 4, 3...)
      if (gA === 1) {
        const countA = a.piecesCount || a.totalItemsCount || 1;
        const countB = b.piecesCount || b.totalItemsCount || 1;
        if (countB !== countA) return countB - countA;
      }

      // Layer 2: Department Grouping: Women (1) -> Kids (2) -> Others (3)
      const deptA = this.getDeptRank(a);
      const deptB = this.getDeptRank(b);
      if (deptA !== deptB) return deptA - deptB;

      // Layer 3: Warehouse CSV Sequence Order (if enabled)
      if (useWalkSequence) {
        const walkA = typeof a.walkIndex === 'number' ? a.walkIndex : 999999;
        const walkB = typeof b.walkIndex === 'number' ? b.walkIndex : 999999;
        if (walkA !== walkB) return walkA - walkB;
      }

      // Tie Breakers:
      // Model Name
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
    });

    return list.map((item, idx) => ({
      ...item,
      newPageNumber: idx + 1
    }));
  },

  /**
   * Generates a pick list sheet (75mm x 125mm = 212.60 x 354.33 pt)
   * Clean high-contrast table or list with header:
   * 📦 بطاقة تجهيز المخزن | دفعة [X] قطعة | [Y] أوردرات
   * Columns/Rows: [ ] | اسم الموديل واللون والمقاس | كود SKU | الكمية
   */
  async createPickListSheet(outDoc, batch, batchType = 'large') {
    const totalOrders = batch.length;
    let totalPieces = 0;
    const itemMap = new Map();

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
        const itemSku = it.sku || order.sku || '';
        const model = it.modelName || order.modelName || 'صنف غير محدد';
        const color = it.color || '';
        const colorCode = it.colorCode || '';
        const size = it.size || '';
        const qty = it.qty || 1;

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

    const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => a.walkIndex - b.walkIndex);

    const titleSubtitle = batchType === 'large'
      ? `بطاقة تجميع الأوردرات الكبرى (دفعة ${totalPieces} قطعة)`
      : `بطاقة تجميع أوردرات القطعتين (دفعة ${totalPieces} قطعة)`;

    // Check if running in browser with canvas support
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = 886;
      canvas.height = 1476;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer heavy border
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      // Header Banner (Dark slate, height 160px)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 6, canvas.width - 12, 160);

      // Header Title
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px "Alexandria", "Cairo", sans-serif';
      ctx.fillText('📦 بطاقة تجهيز المخزن', canvas.width / 2, 60);

      // Header Meta
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 28px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`دفعة [ ${totalPieces} ] قطعة  |  [ ${totalOrders} ] أوردرات`, canvas.width / 2, 115);

      // Subtitle banner (height 55px)
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(6, 166, canvas.width - 12, 55);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 166, canvas.width - 12, 55);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 24px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(titleSubtitle, canvas.width / 2, 203);

      // Table Header (height 48px)
      const tableTop = 225;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(6, tableTop, canvas.width - 12, 48);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, tableTop, canvas.width - 12, 48);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px "Alexandria", "Cairo", sans-serif';
      ctx.fillText('تم', 840, tableTop + 32);
      ctx.fillText('اسم الموديل واللون والمقاس', 540, tableTop + 32);
      ctx.fillText('كود SKU', 200, tableTop + 32);
      ctx.fillText('الكمية', 65, tableTop + 32);

      // Rows
      let currentY = tableTop + 48;
      const availableHeight = canvas.height - currentY - 80;
      const rowCount = Math.max(aggregatedItems.length, 1);
      const rowHeight = Math.min(68, Math.max(42, Math.floor(availableHeight / rowCount)));

      for (let idx = 0; idx < aggregatedItems.length; idx++) {
        const it = aggregatedItems[idx];
        const isEven = idx % 2 === 0;

        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(6, currentY, canvas.width - 12, rowHeight);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(6, currentY + rowHeight);
        ctx.lineTo(canvas.width - 6, currentY + rowHeight);
        ctx.stroke();

        // Checkbox in Col 1
        const boxSize = Math.min(28, rowHeight - 16);
        const boxY = currentY + (rowHeight - boxSize) / 2;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeRect(825, boxY, boxSize, boxSize);

        // Col 2: Name
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'right';
        ctx.font = `bold ${rowHeight < 50 ? 18 : 22}px "Alexandria", "Cairo", sans-serif`;
        let displayName = it.name || '';
        if (displayName.length > 38) {
          displayName = displayName.substring(0, 36) + '...';
        }
        ctx.fillText(displayName, 795, currentY + rowHeight * 0.65);

        // Col 3: SKU Pill
        if (it.sku) {
          const pillW = 140;
          const pillH = Math.min(30, rowHeight - 12);
          const pillX = 130;
          const pillY = currentY + (rowHeight - pillH) / 2;

          ctx.fillStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 6);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#0284c7';
          ctx.textAlign = 'center';
          ctx.font = `bold ${rowHeight < 50 ? 16 : 19}px monospace`;
          ctx.fillText(it.sku, pillX + pillW / 2, pillY + pillH * 0.72);
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.font = 'italic 16px "Alexandria", "Cairo", sans-serif';
          ctx.fillText('-', 200, currentY + rowHeight * 0.65);
        }

        // Col 4: Qty badge
        const qtyW = 60;
        const qtyH = Math.min(34, rowHeight - 10);
        const qtyX = 35;
        const qtyY = currentY + (rowHeight - qtyH) / 2;

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(qtyX, qtyY, qtyW, qtyH, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `bold ${rowHeight < 50 ? 20 : 24}px sans-serif`;
        ctx.fillText(`${it.qty}`, qtyX + qtyW / 2, qtyY + qtyH * 0.75);

        currentY += rowHeight;
      }

      // Footer
      const footerY = canvas.height - 55;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, footerY, canvas.width - 12, 48);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, footerY);
      ctx.lineTo(canvas.width - 6, footerY);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Alexandria", "Cairo", sans-serif';
      ctx.fillText(`إجمالي الأصناف: ${aggregatedItems.length} صنف | إجمالي القطع: ${totalPieces} قطعة | مرتبة بمسار الممرات`, canvas.width / 2, footerY + 32);

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
        borderColor: rgb(0.1, 0.1, 0.2),
        color: rgb(1, 1, 1)
      });

      page.drawRectangle({
        x: 4,
        y: 354.33 - 45,
        width: 204.6,
        height: 41,
        color: rgb(0.06, 0.09, 0.16)
      });

      page.drawText('WAREHOUSE PICK LIST', {
        x: 35,
        y: 354.33 - 22,
        size: 11,
        font: font,
        color: rgb(1, 1, 1)
      });

      page.drawText(`BATCH: ${totalPieces} PCS | ${totalOrders} ORDERS`, {
        x: 30,
        y: 354.33 - 38,
        size: 9,
        font: font,
        color: rgb(0.2, 0.7, 0.9)
      });

      page.drawRectangle({
        x: 4,
        y: 354.33 - 62,
        width: 204.6,
        height: 16,
        color: rgb(0.9, 0.92, 0.95)
      });

      page.drawText('[ ] ITEM / SKU', { x: 10, y: 354.33 - 57, size: 7, font: font, color: rgb(0.1, 0.1, 0.2) });
      page.drawText('QTY', { x: 185, y: 354.33 - 57, size: 7, font: font, color: rgb(0.1, 0.1, 0.2) });

      let curY = 354.33 - 78;
      for (const it of aggregatedItems) {
        if (curY < 30) break;
        page.drawRectangle({
          x: 10,
          y: curY,
          width: 8,
          height: 8,
          borderWidth: 1,
          borderColor: rgb(0.1, 0.1, 0.1)
        });

        const label = it.sku ? `SKU: ${it.sku}` : `Item #${aggregatedItems.indexOf(it) + 1} (Walk: ${it.walkIndex})`;
        page.drawText(label, { x: 23, y: curY + 1, size: 7, font: regFont, color: rgb(0.1, 0.1, 0.2) });
        page.drawText(`x${it.qty}`, { x: 185, y: curY + 1, size: 8, font: font, color: rgb(0.1, 0.1, 0.2) });

        curY -= 14;
      }

      return page;
    }
  },

  /**
   * Generates final sorted PDF (Pure 1:1 binary copy)
   * Auto-Batching Pick Lists & Blank Separators:
   * 1. Large orders (3+ pieces): Batched <= 30 pieces. End of each batch: Page A (Pick List) + Page B (Blank Separator)
   * 2. Two-piece orders (2 pieces): Batched <= 10 pieces. End of each batch: Page A (Pick List) + Page B (Blank Separator)
   * 3. Single-piece orders (1 piece): NO pick lists. Department separation only (Women vs Kids vs Others) with blank separator
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

    const enableBatchPickLists = options.enableBatchPickLists !== false && options.insertBlankSeparators !== false;

    try {
      const safeBuffer = bytes.slice(0);
      const srcDoc = await pdfLibModule.PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const outDoc = await pdfLibModule.PDFDocument.create();

      if (!enableBatchPickLists) {
        // Simple direct 1:1 binary copy without batch pick lists or separators
        const sortedIndices = sortedPages.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
        const copiedPages = await outDoc.copyPages(srcDoc, sortedIndices);
        for (let i = 0; i < copiedPages.length; i++) {
          if (onProgress) {
            onProgress({
              current: i + 1,
              total: copiedPages.length,
              percent: Math.round(((i + 1) / copiedPages.length) * 100),
              phase: 'تجهيز صفحات الطباعة (نسخ ثنائي مباشر 1:1)'
            });
          }
          outDoc.addPage(copiedPages[i]);
        }
        return await outDoc.save();
      }

      // Partition sorted pages into groups
      const largeOrders = [];
      const twoPieceOrders = [];
      const singleWomen = [];
      const singleKids = [];
      const singleOthers = [];
      const unrecognizedOrders = [];

      for (const p of sortedPages) {
        const group = this.getPieceGroup(p);
        if (group === 1) {
          largeOrders.push(p);
        } else if (group === 2) {
          twoPieceOrders.push(p);
        } else if (group === 3) {
          const dept = this.getDeptRank(p);
          if (dept === 1) singleWomen.push(p);
          else if (dept === 2) singleKids.push(p);
          else singleOthers.push(p);
        } else {
          unrecognizedOrders.push(p);
        }
      }

      // Helper to copy and add orders in an array
      const addOrderLabels = async (ordersList) => {
        if (!ordersList || ordersList.length === 0) return;
        const indices = ordersList.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
        const copied = await outDoc.copyPages(srcDoc, indices);
        for (const cp of copied) {
          outDoc.addPage(cp);
        }
      };

      // 1. Large Orders (3+ pieces): Batched <= 30 pieces
      if (largeOrders.length > 0) {
        const largeBatches = [];
        let curBatch = [];
        let curPieces = 0;

        for (const order of largeOrders) {
          const pCount = order.piecesCount || order.totalItemsCount || 1;
          if (curBatch.length > 0 && curPieces + pCount > 30) {
            largeBatches.push(curBatch);
            curBatch = [order];
            curPieces = pCount;
          } else {
            curBatch.push(order);
            curPieces += pCount;
          }
        }
        if (curBatch.length > 0) largeBatches.push(curBatch);

        for (const batch of largeBatches) {
          await addOrderLabels(batch);
          // Insert Page A: Pick list sheet
          await this.createPickListSheet(outDoc, batch, 'large');
          // Insert Page B: 100% Blank separator
          outDoc.addPage([212.60, 354.33]);
        }
      }

      // 2. Two-Piece Orders (2 pieces): Batched <= 10 pieces (every 5 orders = 10 pieces)
      if (twoPieceOrders.length > 0) {
        const twoBatches = [];
        let curBatch2 = [];
        let curPieces2 = 0;

        for (const order of twoPieceOrders) {
          const pCount = order.piecesCount || order.totalItemsCount || 2;
          if (curBatch2.length > 0 && curPieces2 + pCount > 10) {
            twoBatches.push(curBatch2);
            curBatch2 = [order];
            curPieces2 = pCount;
          } else {
            curBatch2.push(order);
            curPieces2 += pCount;
          }
        }
        if (curBatch2.length > 0) twoBatches.push(curBatch2);

        for (const batch of twoBatches) {
          await addOrderLabels(batch);
          // Insert Page A: Pick list sheet
          await this.createPickListSheet(outDoc, batch, 'twopiece');
          // Insert Page B: 100% Blank separator
          outDoc.addPage([212.60, 354.33]);
        }
      }

      // 3. Single-Piece Orders (1 piece): NO pick lists! Separate departments with blank separator
      let hasPrecedingSingleGroup = false;

      if (singleWomen.length > 0) {
        await addOrderLabels(singleWomen);
        hasPrecedingSingleGroup = true;
      }

      if (singleKids.length > 0) {
        if (hasPrecedingSingleGroup) {
          outDoc.addPage([212.60, 354.33]); // Blank separator between Women and Kids
        }
        await addOrderLabels(singleKids);
        hasPrecedingSingleGroup = true;
      }

      if (singleOthers.length > 0) {
        if (hasPrecedingSingleGroup) {
          outDoc.addPage([212.60, 354.33]); // Blank separator between (Women/Kids) and Others
        }
        await addOrderLabels(singleOthers);
      }

      // 4. Unrecognized Orders (if any)
      if (unrecognizedOrders.length > 0) {
        await addOrderLabels(unrecognizedOrders);
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
