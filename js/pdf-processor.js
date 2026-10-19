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
   */
  sortPages(pages, options = {}) {
    const list = [...pages];
    const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    let opts = options;
    if (typeof options === 'string') {
      opts = { strategy: options, useWalkSequence: true };
    }
    const useWalkSequence = opts.useWalkSequence !== false;

    // Pre-calculate pieces count and Master Excel Rank for stability
    for (const item of list) {
      const count = typeof item.totalPieces === 'number'
        ? item.totalPieces
        : (item.piecesCount || item.totalItemsCount || parseInt(item.totalPieces, 10) || 1);
      item.piecesCount = count;
      item.totalPieces = count;
      item.excelRank = (typeof InventoryParser !== 'undefined')
        ? InventoryParser.getOrderExcelRank(item)
        : this.getOrderRouteRank(item);
      item.routeRank = item.excelRank;
    }

    list.sort((a, b) => {
      // Unrecognized/empty pages are pushed to the end
      if (!a.hasRecognizedDescription && b.hasRecognizedDescription) return 1;
      if (a.hasRecognizedDescription && !b.hasRecognizedDescription) return -1;
      if (!a.hasRecognizedDescription && !b.hasRecognizedDescription) {
        return a.originalPageNumber - b.originalPageNumber;
      }

      // Tier 1 (Mandatory & Primary): Total Pieces Count Descending
      // Group 1: Large Orders (3+ pieces descending: 8, 7, 6, 5, 4, 3...)
      // Group 2: Two-Piece Orders (2 pieces)
      // Group 3: Single-Piece Orders (1 piece) at the very end of the print file
      const countA = a.piecesCount || 1;
      const countB = b.piecesCount || 1;
      if (countB !== countA) {
        return countB - countA;
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
   * Stamps a clean, small sequential reference box onto shipping labels ONLY.
   * Placement: bottom notes area around x = 160..185, y = 35..55
   * Sized ~26-32 pt x 12 pt with HelveticaBold font size 7.5 pt.
   * NEVER called on blank separator pages or batch pick-list sheets.
   */
  stampLabelSequenceNumber(page, seqNumber, font) {
    if (!page || !seqNumber || !font) return;
    const { width } = page.getSize();
    const numText = `[ #${seqNumber} ]`;
    const fontSize = 7.5;
    const textWidth = font.widthOfTextAtSize(numText, fontSize);

    // Box dimensions
    const boxWidth = Math.max(26, textWidth + 6);
    const boxHeight = 12;

    // Coordinate calculation: within x = 160..185, y = 35..55
    const x = Math.min(width - boxWidth - 10, Math.max(160, width - boxWidth - 14));
    const y = 42;

    const { rgb } = (typeof PDFLib !== 'undefined' ? PDFLib : (typeof global !== 'undefined' ? global.PDFLib : null));

    // Solid white background box with crisp black border
    page.drawRectangle({
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1
    });

    // Centered bold text
    const textX = x + (boxWidth - textWidth) / 2;
    const textY = y + (boxHeight - fontSize) / 2 + 1;

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
   * Generates final sorted PDF (Pure 1:1 binary copy)
   * Auto-Batching Pick Lists & Blank Separators:
   * 1. Large orders (3+ pieces): Batched <= 30 pieces. End of each batch: Page A (Pick List) + Page B (Blank Separator)
   * 2. Two-piece orders (2 pieces): Batched <= 10 pieces. End of each batch: Page A (Pick List) + Page B (Blank Separator)
   * 3. Single-piece orders (1 piece): NO pick lists and NO blank separators inside!
   * Stamping Rule:
   * Stamps small sequential reference box [ #1 ], [ #2 ] onto shipping labels ONLY!
   * NEVER stamps on blank separators or batch pick-list sheets.
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

      // Embed standard font for sequential label stamping
      const stampFont = await outDoc.embedFont(pdfLibModule.StandardFonts.HelveticaBold);

      if (!enableBatchPickLists) {
        // Simple direct 1:1 binary copy with sequential stamping on shipping labels
        const sortedIndices = sortedPages.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
        const copiedPages = await outDoc.copyPages(srcDoc, sortedIndices);
        for (let i = 0; i < copiedPages.length; i++) {
          if (onProgress) {
            onProgress({
              current: i + 1,
              total: copiedPages.length,
              percent: Math.round(((i + 1) / copiedPages.length) * 100),
              phase: 'تجهيز صفحات الطباعة (ترقيم البوالص ونسخ ثنائي 1:1)'
            });
          }
          const cp = copiedPages[i];
          const order = sortedPages[i];
          const seqNum = (typeof order === 'object' && order.newPageNumber) ? order.newPageNumber : (i + 1);

          // Stamp sequence number box onto shipping labels ONLY
          this.stampLabelSequenceNumber(cp, seqNum, stampFont);

          outDoc.addPage(cp);
        }
        return await outDoc.save();
      }

      // Partition sorted pages into groups
      const largeOrders = [];
      const twoPieceOrders = [];
      const singleOrders = [];
      const unrecognizedOrders = [];

      for (const p of sortedPages) {
        if (p.hasRecognizedDescription === false) {
          unrecognizedOrders.push(p);
          continue;
        }
        const count = typeof p.piecesCount === 'number' ? p.piecesCount : (parseInt(p.totalPieces, 10) || 1);
        if (count >= 3) {
          largeOrders.push(p);
        } else if (count === 2) {
          twoPieceOrders.push(p);
        } else {
          singleOrders.push(p);
        }
      }

      // Helper to copy and add orders in an array with sequential label stamp
      const addOrderLabels = async (ordersList) => {
        if (!ordersList || ordersList.length === 0) return;
        const indices = ordersList.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
        const copied = await outDoc.copyPages(srcDoc, indices);
        for (let i = 0; i < copied.length; i++) {
          const cp = copied[i];
          const order = ordersList[i];
          const seqNum = (typeof order === 'object' && order.newPageNumber) ? order.newPageNumber : (i + 1);

          // Stamp sequence number box onto shipping labels ONLY
          this.stampLabelSequenceNumber(cp, seqNum, stampFont);

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

      // 3. Single-Piece Orders (1 piece):
      // No batch pick-lists. Maintain sequential Excel rank order (Rank 0..N).
      // Insert a 100% blank separator page before entering carpets/prayer rugs section.
      if (singleOrders.length > 0) {
        let carpetSeparatorInserted = false;
        let nonCarpetPrinted = false;

        for (const order of singleOrders) {
          const isCarpet = (typeof InventoryParser !== 'undefined' && typeof InventoryParser.isCarpetItem === 'function')
            ? InventoryParser.isCarpetItem(order)
            : (order.fullNormalizedDesc || '').includes('سجاد');

          if (!carpetSeparatorInserted && isCarpet && nonCarpetPrinted) {
            outDoc.addPage([212.60, 354.33]);
            carpetSeparatorInserted = true;
          }
          if (!isCarpet) {
            nonCarpetPrinted = true;
          }
          await addOrderLabels([order]);
        }
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
