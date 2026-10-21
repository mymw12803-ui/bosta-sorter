/**
 * Excel / CSV Inventory & Master Warehouse Route Parser using SheetJS
 * Exclusively driven by master Excel sheet (inventory_export_1.xlsx - Sheet: بعد الترتيب)
 * 546+ official warehouse items & SKUs defining physical picking aisle order (Rank 0..N)
 * Future-Proof: Dynamically stores uploaded catalog updates in localStorage
 */

const InventoryParser = {
  inventoryItems: [],
  skuRankMap: new Map(),       // normalized lowercase sku -> rowIndex (0..N)
  titleRankMap: new Map(),     // normalized Arabic title -> rowIndex (0..N)
  skuMap: new Map(),           // uppercase sku -> item
  skuOrderMap: new Map(),       // normalized / upper sku -> rowIndex (backwards compat)
  productOrderMap: new Map(),  // composite title+color+size -> rowIndex (backwards compat)
  spaceImmuneLookup: new Map(),// space-stripped title -> rowIndex

  /**
   * Resets loaded inventory data maps
   */
  reset() {
    this.inventoryItems = [];
    this.skuRankMap.clear();
    this.titleRankMap.clear();
    this.skuMap.clear();
    this.skuOrderMap.clear();
    this.productOrderMap.clear();
    this.spaceImmuneLookup.clear();
  },

  /**
   * Initializes catalog on application load:
   * 1. Check localStorage for updated catalog saved by user
   * 2. Fall back to bundled DEFAULT_INVENTORY_ITEMS (547 items from بعد الترتيب)
   */
  init() {
    let itemsToLoad = null;

    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('bosta_excel_inventory_items');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            itemsToLoad = parsed;
          }
        }
      } catch (e) {
        console.warn('Failed to load inventory from localStorage:', e);
      }
    }

    if (!itemsToLoad) {
      if (typeof DEFAULT_INVENTORY_ITEMS !== 'undefined' && Array.isArray(DEFAULT_INVENTORY_ITEMS)) {
        itemsToLoad = DEFAULT_INVENTORY_ITEMS;
      } else if (typeof window !== 'undefined' && window.DEFAULT_INVENTORY_ITEMS) {
        itemsToLoad = window.DEFAULT_INVENTORY_ITEMS;
      } else if (typeof global !== 'undefined' && global.DEFAULT_INVENTORY_ITEMS) {
        itemsToLoad = global.DEFAULT_INVENTORY_ITEMS;
      }
    }

    if (itemsToLoad && itemsToLoad.length > 0) {
      this.buildMaps(itemsToLoad);
    }
  },

  /**
   * Builds lookup maps from items array
   * Assigns sequential rank (0..N) matching warehouse aisle loop
   */
  buildMaps(items) {
    this.reset();
    this.inventoryItems = items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowIndex = typeof item.index === 'number' ? item.index : i;
      item.index = rowIndex;
      item.rowIndex = rowIndex;

      // 1. SKU Rank Map (normalized lowercase and uppercase)
      if (item.sku) {
        const rawSku = String(item.sku).trim();
        const lowerSku = rawSku.toLowerCase();
        const upperSku = rawSku.toUpperCase();

        if (!this.skuRankMap.has(lowerSku)) {
          this.skuRankMap.set(lowerSku, rowIndex);
        }
        this.skuMap.set(upperSku, item);
        this.skuOrderMap.set(lowerSku, rowIndex);
        this.skuOrderMap.set(upperSku, rowIndex);

        if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeText === 'function') {
          const normSku = ArabicUtils.normalizeText(rawSku);
          if (!this.skuOrderMap.has(normSku)) {
            this.skuOrderMap.set(normSku, rowIndex);
          }
        }
      }

      // 2. Title Rank Map (normalized Arabic text)
      if (item.title) {
        const rawTitle = String(item.title).trim();
        let normArabic = rawTitle;
        if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function') {
          normArabic = ArabicUtils.normalizeArabic(rawTitle);
        } else {
          normArabic = rawTitle.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, '');
        }

        if (normArabic && !this.titleRankMap.has(normArabic)) {
          this.titleRankMap.set(normArabic, rowIndex);
        }

        // Composite keys for backward compatibility
        const color = item.color || '';
        const size = item.size || '';
        const composite = normArabic + (color ? ' ' + color : '') + (size ? ' ' + size : '');
        const normComposite = (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function')
          ? ArabicUtils.normalizeArabic(composite)
          : composite.replace(/\s+/g, '');

        if (!this.productOrderMap.has(normComposite)) {
          this.productOrderMap.set(normComposite, rowIndex);
        }
        if (!this.productOrderMap.has(normArabic)) {
          this.productOrderMap.set(normArabic, rowIndex);
        }
        if (!this.spaceImmuneLookup.has(normArabic)) {
          this.spaceImmuneLookup.set(normArabic, rowIndex);
        }
      }
    }

    return {
      totalItems: this.inventoryItems.length,
      uniqueSkus: this.skuRankMap.size
    };
  },

  /**
   * Parse ArrayBuffer of Excel (.xlsx) or CSV file (e.g. inventory_export_1.xlsx)
   * Specifically targets sheet "بعد الترتيب" or sheets with columns "الصنف" and "SKU"
   * Saves parsed catalog to localStorage for future-proofing
   */
  async parseFile(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('مكتبة SheetJS غير محملة. يرجى التحقق من اتصال الإنترنت.');
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('ملف الإكسيل فارغ ولا يحتوي على أوراق عمل.');
    }

    // Target sheet "بعد الترتيب" or sheets containing "بعد" / "ترتيب"
    let targetSheetName = workbook.SheetNames.find(name => {
      const norm = name.trim().replace(/\s+/g, ' ');
      return norm.includes('بعد الترتيب') || (norm.includes('بعد') && norm.includes('ترتيب'));
    });

    // If not found by name, scan all sheets for columns "الصنف" and "SKU"
    if (!targetSheetName) {
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' });
        if (rows && rows.length > 0) {
          const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
          const hasSku = headerRow.some(h => h.includes('sku') || h.includes('رمز') || h.includes('كود'));
          const hasTitle = headerRow.some(h => h.includes('صنف') || h.includes('منتج') || h.includes('title'));
          if (hasSku && hasTitle) {
            targetSheetName = sheetName;
            break;
          }
        }
      }
    }

    // Fall back to first sheet
    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      throw new Error(`ورقة العمل "${targetSheetName}" فارغة ولا تحتوي على بيانات.`);
    }

    const newItems = [];
    let rowIndex = 0;

    for (const row of rawRows) {
      const title = this.findFieldValue(row, ['الصنف', 'Title', 'title', 'اسم المنتج', 'اسم الموديل', 'المنتج', 'Product Name', 'item']);
      const sku = this.findFieldValue(row, ['SKU', 'sku', 'رمز المنتج', 'كود الصنف', 'Variant SKU', 'Sku']);
      const option1 = this.findFieldValue(row, ['اللون', 'Option1 Value', 'Option1', 'Color', 'Variant Color', 'option1_value']);
      const option2 = this.findFieldValue(row, ['المقاس', 'Option2 Value', 'Option2', 'Size', 'Variant Size', 'option2_value']);

      if (title || sku) {
        newItems.push({
          index: rowIndex++,
          title: String(title || '').trim(),
          sku: String(sku || '').trim(),
          color: String(option1 || '').trim(),
          size: String(option2 || '').trim()
        });
      }
    }

    if (newItems.length === 0) {
      throw new Error('لم يتم العثور على أي أصناف أو أكواد SKU صالحة في الورقة المحددة.');
    }

    // Build active lookup maps
    this.buildMaps(newItems);

    // Save to localStorage for future-proof persistence
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('bosta_excel_inventory_items', JSON.stringify(newItems));
      } catch (e) {
        console.warn('Failed to save updated catalog to localStorage:', e);
      }
    }

    return {
      sheetName: targetSheetName,
      totalItems: this.inventoryItems.length,
      uniqueSkus: this.skuRankMap.size
    };
  },

  /**
   * Resets catalog to default pre-bundled 547 items from sheet بعد الترتيب
   * Clears localStorage override
   */
  resetToDefaultCatalog() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('bosta_excel_inventory_items');
      } catch (e) {
        console.warn('Failed to clear localStorage:', e);
      }
    }

    let defaultItems = [];
    if (typeof DEFAULT_INVENTORY_ITEMS !== 'undefined' && Array.isArray(DEFAULT_INVENTORY_ITEMS)) {
      defaultItems = DEFAULT_INVENTORY_ITEMS;
    } else if (typeof window !== 'undefined' && window.DEFAULT_INVENTORY_ITEMS) {
      defaultItems = window.DEFAULT_INVENTORY_ITEMS;
    } else if (typeof global !== 'undefined' && global.DEFAULT_INVENTORY_ITEMS) {
      defaultItems = global.DEFAULT_INVENTORY_ITEMS;
    }

    this.buildMaps(defaultItems);
    return {
      totalItems: this.inventoryItems.length,
      uniqueSkus: this.skuRankMap.size
    };
  },

  /**
   * Helper to inspect row object for matching column names
   */
  findFieldValue(row, possibleNames) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const trimmedKey = key.trim().toLowerCase();
      for (const name of possibleNames) {
        if (trimmedKey === name.toLowerCase()) {
          return row[key];
        }
      }
    }
    return '';
  },

  /**
   * Get warehouse physical picking row index (Rank) for SKU
   * Matches case-insensitively (e.g. ba014e2, Bb012E1)
   */
  getSKURank(sku) {
    if (!sku) return 999999;
    const lower = String(sku).trim().toLowerCase();
    if (this.skuRankMap.has(lower)) {
      return this.skuRankMap.get(lower);
    }
    return 999999;
  },

  /**
   * Smart fallback text matching for product description / model name
   * Matches normalized Arabic against catalog rows
   */
  getTitleRank(titleOrDesc) {
    if (!titleOrDesc) return 999999;
    let norm = '';
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function') {
      norm = ArabicUtils.normalizeArabic(titleOrDesc);
    } else {
      norm = String(titleOrDesc).replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, '');
    }

    if (!norm) return 999999;

    // 1. Exact normalized match
    if (this.titleRankMap.has(norm)) {
      return this.titleRankMap.get(norm);
    }

    // 2. Substring matching against catalog titles (longest title match first)
    let bestRank = 999999;
    let maxMatchLen = 0;

    for (const [key, rank] of this.titleRankMap.entries()) {
      if (norm.includes(key) || key.includes(norm)) {
        const matchLen = Math.min(norm.length, key.length);
        if (matchLen > maxMatchLen) {
          maxMatchLen = matchLen;
          bestRank = rank;
        }
      }
    }

    return bestRank;
  },

  /**
   * Retrieves picking walk sequence priority rowIndex for an individual product/item
   */
  getItemRank(item) {
    if (!item) return 999999;

    // 1. Try explicit SKU
    if (item.sku) {
      const r = this.getSKURank(item.sku);
      if (r !== 999999) return r;
    }

    // 2. Try product line text / model name + color + size
    const model = item.modelName || item.title || item.name || '';
    const color = item.color || '';
    const size = item.size || '';
    const desc = `${model} ${color} ${size}`.trim();

    if (desc) {
      const r = this.getTitleRank(desc);
      if (r !== 999999) return r;
    }

    if (model) {
      const r = this.getTitleRank(model);
      if (r !== 999999) return r;
    }

    return 999999;
  },

  /**
   * Computes the Master Excel Rank (0..N) for an entire order:
   * 1. Checks explicit order SKU or scans notes/description for embedded SKU codes (e.g. ba014e2, Bb012E1)
   * 2. For multi-piece orders: evaluates each product item and takes Math.min(...) (earliest aisle encounter)
   * 3. Fallback: smart Arabic text matching (Model + Color + Size)
   * Returns earliest row index in Excel sheet بعد الترتيب
   */
  getOrderExcelRank(order) {
    if (!order) return 999999;
    if (this.inventoryItems.length === 0 && this.skuRankMap.size === 0) return 999999;

    let minRank = 999999;

    // A. Check explicit order.sku
    if (order.sku) {
      const r = this.getSKURank(order.sku);
      if (r !== 999999) minRank = Math.min(minRank, r);
    }

    // B. Scan notes & description for embedded alphanumeric SKU codes (e.g. ba014e2, Bb012E1, eb033y0)
    const notesAndDesc = `${order.rawNotes || ''} ${order.rawDescription || ''} ${order.description || ''}`;
    if (notesAndDesc) {
      const tokens = notesAndDesc.match(/[a-zA-Z0-9_-]{5,15}/g);
      if (tokens) {
        for (const token of tokens) {
          const r = this.getSKURank(token);
          if (r !== 999999) {
            minRank = Math.min(minRank, r);
          }
        }
      }
    }

    // C. Check each item in order.products array
    if (Array.isArray(order.products) && order.products.length > 0) {
      for (const prod of order.products) {
        const prodRank = this.getItemRank(prod);
        if (prodRank !== 999999) {
          minRank = Math.min(minRank, prodRank);
        }
      }
    }

    // D. If still not matched, try smart title matching on primary product or order description
    if (minRank === 999999) {
      const primaryProd = (Array.isArray(order.products) && order.products[0]) ? order.products[0] : null;
      const model = order.modelName || (primaryProd ? primaryProd.modelName : '') || order.title || '';
      const color = order.color || (primaryProd ? primaryProd.color : '') || '';
      const size = order.size || (primaryProd ? primaryProd.size : '') || '';

      const composite = `${model} ${color} ${size}`.trim();
      if (composite) {
        const r = this.getTitleRank(composite);
        if (r !== 999999) minRank = Math.min(minRank, r);
      }

      if (minRank === 999999 && model) {
        const r = this.getTitleRank(model);
        if (r !== 999999) minRank = Math.min(minRank, r);
      }
    }

    return minRank;
  },

  /**
   * Backwards-compatible alias for getOrderExcelRank
   */
  getWalkIndex(orderOrProduct) {
    return this.getOrderExcelRank(orderOrProduct);
  },

  /**
   * Checks whether an order or product is a non-pocket regular prayer rug (rug_regular)
   */
  isRegularRug(orderOrProduct) {
    if (!orderOrProduct) return false;
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.isRegularRugItem === 'function') {
      return ArabicUtils.isRegularRugItem(orderOrProduct);
    }
    const text = `${orderOrProduct.modelName || ''} ${orderOrProduct.title || ''} ${orderOrProduct.rawDescription || ''} ${orderOrProduct.fullNormalizedDesc || ''}`;
    const norm = (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function')
      ? ArabicUtils.normalizeArabic(text)
      : text.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, '');
    const isWaterproof = norm.includes('وتر') || norm.includes('بروف') || norm.includes('بطانه') || norm.includes('جيب');
    return (norm.includes('سجاد') || norm.includes('سجاده')) && !isWaterproof;
  },

  /**
   * Checks whether an order or product is in the Pocket & Waterproof group (pocket_waterproof)
   */
  isPocketWaterproof(orderOrProduct) {
    if (!orderOrProduct) return false;
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.isPocketWaterproofItem === 'function') {
      return ArabicUtils.isPocketWaterproofItem(orderOrProduct);
    }
    const text = `${orderOrProduct.modelName || ''} ${orderOrProduct.title || ''} ${orderOrProduct.rawDescription || ''} ${orderOrProduct.fullNormalizedDesc || ''}`;
    const norm = (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function')
      ? ArabicUtils.normalizeArabic(text)
      : text.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, '');
    return norm.includes('وتر') || norm.includes('بروف') || norm.includes('بطانه') || norm.includes('سجاده جيب') || norm.includes('سجادة جيب');
  },

  /**
   * Checks whether an order or product is a carpet/prayer rug item
   * Used for inserting a 100% blank separator page before carpets in single-piece orders
   */
  isCarpetItem(orderOrProduct) {
    if (!orderOrProduct) return false;

    // Check SKU prefixes for carpets (e.g. ea030, ea032, eb033)
    const sku = (orderOrProduct.sku || '').toLowerCase();
    if (sku.startsWith('ea03') || sku.startsWith('eb03')) return true;

    // Check text for carpet keywords
    const text = `${orderOrProduct.modelName || ''} ${orderOrProduct.title || ''} ${orderOrProduct.rawDescription || ''} ${orderOrProduct.fullNormalizedDesc || ''}`;
    let norm = text;
    if (typeof ArabicUtils !== 'undefined' && typeof ArabicUtils.normalizeArabic === 'function') {
      norm = ArabicUtils.normalizeArabic(text);
    }
    if (norm.includes('سجاد') || norm.includes('سجاده')) {
      return true;
    }

    // Check if rank belongs to carpet section (row >= 540 in sheet بعد الترتيب)
    const rank = typeof orderOrProduct.excelRank === 'number'
      ? orderOrProduct.excelRank
      : this.getOrderExcelRank(orderOrProduct);
    if (rank >= 540 && rank !== 999999) {
      return true;
    }

    return false;
  },

  /**
   * Match product with inventory record for enriching metadata
   */
  matchProduct(product) {
    if (!product || this.inventoryItems.length === 0) return null;
    if (product.sku) {
      const upper = String(product.sku).trim().toUpperCase();
      if (this.skuMap.has(upper)) return this.skuMap.get(upper);
    }
    const rank = this.getItemRank(product);
    if (rank !== 999999 && rank < this.inventoryItems.length) {
      return this.inventoryItems[rank];
    }
    return null;
  }
};

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
  window.InventoryParser = InventoryParser;
  // Initialize from localStorage or DEFAULT_INVENTORY_ITEMS if available
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => InventoryParser.init());
  } else {
    InventoryParser.init();
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InventoryParser };
}
