/**
 * Bosta Shipping Label & Arabic Text Processing Utilities
 * - Rubik Font CMap Null-Byte Recovery (via pako decompress & patch)
 * - Built-in Warehouse Master Catalog & Smart Fuzzy/Skeleton Matcher
 * - Strict Coordinate & Pattern Line Extraction for Bosta Labels (bbox 212.63 x 354.25 pt)
 */

const ArabicUtils = {
  // Master Warehouse Shelf Catalog (from official layout document بلا عنوان (1).pdf & inventory_export_1.csv)
  WAREHOUSE_SHELF_CATALOG: [
    // --- قسم الأطفالي (Kids Shelf Sequence) ---
    { id: 101, canonical: "اسدال تلبيسه اطفالي", keywords: ["تلبيسه اطفالي", "تلبيسه يلافطا"], dept: "kids" },
    { id: 102, canonical: "اسدال بنس اطفالي", keywords: ["بنس اطفالي"], dept: "kids" },
    { id: 103, canonical: "طقم الاميرات اطفالي", keywords: ["اميرات اطفالي", "الاميرات اطفالي"], dept: "kids" },
    { id: 104, canonical: "اسدال بخمار اطفالي مشجر", keywords: ["بخمار اطفالي مشجر"], dept: "kids" },
    { id: 105, canonical: "اسدال بخمار اطفالي سادة", keywords: ["بخمار اطفالي"], dept: "kids" },
    { id: 106, canonical: "اسدال رقة اطفالي", keywords: ["رقه اطفالي"], dept: "kids" },
    { id: 107, canonical: "خمار بيليسيه اطفالي", keywords: ["بيليسيه اطفالي"], dept: "kids" },
    { id: 108, canonical: "اسدال جوبير اطفالي", keywords: ["جوبير اطفالي"], dept: "kids" },
    { id: 109, canonical: "اسدال مشجر اطفالي", keywords: ["اسدال مشجر اطفالي"], dept: "kids" },
    { id: 110, canonical: "اسدال بجيوب اطفالي", keywords: ["بجيوب اطفالي", "جيوب اطفالي"], dept: "kids" },

    // --- قسم الحريمي والخمارات وأطقم الصلاة (Women & Prayer Sets Shelf Sequence) ---
    { id: 201, canonical: "اسدال مشجر حريمي", keywords: ["اسدال مشجر حريمي", "فسكوز مشجر", "اسدال مشجر"], dept: "women" },
    { id: 202, canonical: "ملحفه صلاه سادة", keywords: ["ملحفه صلاه ساده", "ملحفه صلاه فسكوز ساده"], dept: "women" },
    { id: 203, canonical: "ملحفة صلاة مشجرة", keywords: ["ملحفه صلاه مشجره", "ملحفه صلاه فسكوز مشجر"], dept: "women" },
    { id: 204, canonical: "خمار بيليسيه حريمي", keywords: ["خمار بيليسيه حريمي", "خمار بيليسيه"], dept: "women" },
    { id: 205, canonical: "خمار مشجر بدون اكمام", keywords: ["بدون اكمام مشجر", "مشجر بدون اكمام"], dept: "women" },
    { id: 206, canonical: "خمار بدون اكمام سادة", keywords: ["بدون اكمام ساده", "خمار زبده"], dept: "women" },
    { id: 207, canonical: "خمار مشجر بأكمام", keywords: ["خمار مشجر باكمام"], dept: "women" },
    { id: 208, canonical: "خمار بأكمام سادة", keywords: ["خمار باكمام ساده"], dept: "women" },
    { id: 209, canonical: "اسدال بجيوب حريمي", keywords: ["بجيوب حريمي"], dept: "women" },
    { id: 210, canonical: "طقم صلاه فسكوز حريمي", keywords: ["طقم صلاه فسكوز"], dept: "women" },
    { id: 211, canonical: "اسدال بخمار حريمي مشجر", keywords: ["بخمار حريمي مشجر"], dept: "women" },
    { id: 212, canonical: "اسدال بخمار حريمي سادة", keywords: ["بخمار حريمي ساده", "بخمار حريمي"], dept: "women" },
    { id: 213, canonical: "اسدال رقة حريمي", keywords: ["رقه حريمي"], dept: "women" },
    { id: 214, canonical: "اسدال بكشكشة", keywords: ["بكشكشه", "كشكشه"], dept: "women" },
    { id: 215, canonical: "اسدال بنس حريمي", keywords: ["بنس حريمي"], dept: "women" },
    { id: 216, canonical: "طقم الاميرات حريمي", keywords: ["اميرات حريمي", "الاميرات حريمي"], dept: "women" },
    { id: 217, canonical: "اسدال شريطه", keywords: ["شريطه حريمي", "شريطه"], dept: "women" },
    { id: 218, canonical: "اسدال مطرز", keywords: ["مطرز"], dept: "women" },
    { id: 219, canonical: "اسدال جوبير حريمي", keywords: ["جوبير حريمي"], dept: "women" },
    { id: 220, canonical: "اسدال تلبيسه حريمي", keywords: ["تلبيسه حريمي"], dept: "women" },
    { id: 221, canonical: "اسدال وقار سادة", keywords: ["وقار"], dept: "women" },
    { id: 222, canonical: "اسدال عباية", keywords: ["عبايه"], dept: "women" },
    { id: 223, canonical: "اسدال زهرة", keywords: ["زهره"], dept: "women" },
    { id: 224, canonical: "اسدال فراشة", keywords: ["فراشه"], dept: "women" },
    { id: 225, canonical: "جيبه صلاه فيسكوز", keywords: ["جيبه فسكوز", "جيبه صلاه فيسكوز"], dept: "women" },
    { id: 226, canonical: "طقم صلاه حريمي مشجر", keywords: ["طقم صلاه حريمي مشجر", "طقم صلاه حريمي قطعتين"], dept: "women" },
    { id: 227, canonical: "طقم صلاه حريمي سادة", keywords: ["طقم صلاه حريمي ساده"], dept: "women" },

    // --- أطقم صلاة أطفالي مرتبة بالمقاس (4 ثم 3 ثم 2 ثم 1 - مشجر ثم سادة) ---
    { id: 301, canonical: "طقم صلاه اطفالي مشجر", sizeFilter: "الرابع", keywords: ["طقم صلاه اطفالي مشجر", "طقم صلاه اطفالي فراشات"], dept: "kids" },
    { id: 302, canonical: "طقم صلاه اطفالي ساده", sizeFilter: "الرابع", keywords: ["طقم صلاه اطفالي ساده"], dept: "kids" },
    { id: 303, canonical: "طقم صلاه اطفالي مشجر", sizeFilter: "الثالث", keywords: ["طقم صلاه اطفالي مشجر", "طقم صلاه اطفالي فراشات"], dept: "kids" },
    { id: 304, canonical: "طقم صلاه اطفالي ساده", sizeFilter: "الثالث", keywords: ["طقم صلاه اطفالي ساده"], dept: "kids" },
    { id: 305, canonical: "طقم صلاه اطفالي مشجر", sizeFilter: "الثاني", keywords: ["طقم صلاه اطفالي مشجر", "طقم صلاه اطفالي فراشات"], dept: "kids" },
    { id: 306, canonical: "طقم صلاه اطفالي ساده", sizeFilter: "الثاني", keywords: ["طقم صلاه اطفالي ساده"], dept: "kids" },
    { id: 307, canonical: "طقم صلاه اطفالي مشجر", sizeFilter: "الاول", keywords: ["طقم صلاه اطفالي مشجر", "طقم صلاه اطفالي فراشات"], dept: "kids" },
    { id: 308, canonical: "طقم صلاه اطفالي ساده", sizeFilter: "الاول", keywords: ["طقم صلاه اطفالي ساده"], dept: "kids" },
    { id: 309, canonical: "جيبه صلاه ليكرا", keywords: ["جيبه صلاه ليكرا", "ليكرا"], dept: "women" },

    // --- قسم السجاد العادي (Non-Pocket Prayer Rugs) ---
    { id: 401, canonical: "سجادة صلاة اطفالي قطيفة", keywords: ["سجاده صلاه اطفالي قطيفه", "سجاد اطفالي", "سجاده صلاه اطفالي صغيره"], dept: "rug_regular" },
    { id: 402, canonical: "سجادة صلاة قطيفة مطبوعة", keywords: ["سجاده صلاه قطيفه مطبوعه", "سجاد حريمي", "سجاده الهدي قطيفه"], dept: "rug_regular" },

    // --- قسم الجيب ووتر بروف (Pocket & Waterproof Group - Placed at the VERY END) ---
    { id: 501, canonical: "طقم جيب وتر بروف", keywords: ["طقم وتر بروف", "طقم جيب وتر بروف"], dept: "pocket_waterproof" },
    { id: 502, canonical: "جيبة صلاة وتر بروف", keywords: ["جيبه وتر بروف", "جيبه صلاه وتر بروف"], dept: "pocket_waterproof" },
    { id: 503, canonical: "ملحفه جيب وتر بروف", keywords: ["ملحفه وتر بروف", "ملحفه جيب وتر بروف"], dept: "pocket_waterproof" },
    { id: 504, canonical: "جيبة بطانة", keywords: ["بطانه وتر بروف", "جيبه بطانه"], dept: "pocket_waterproof" },
    { id: 505, canonical: "سجادة جيب", keywords: ["سجاده وتر بروف", "سجاده جيب"], dept: "pocket_waterproof" }
  ],

  // Defaults derived from WAREHOUSE_SHELF_CATALOG
  get DEFAULT_WAREHOUSE_TITLES() {
    return Array.from(new Set(this.WAREHOUSE_SHELF_CATALOG.map(item => item.canonical)));
  },
  get DEFAULT_WAREHOUSE_ROUTE_SEQUENCE() {
    return this.WAREHOUSE_SHELF_CATALOG.map(item => item.canonical);
  },

  // Active Mutable Warehouse Titles & Route Sequence
  get WAREHOUSE_TITLES() {
    if (this._warehouseTitles) return this._warehouseTitles;
    return this.DEFAULT_WAREHOUSE_TITLES;
  },
  set WAREHOUSE_TITLES(val) {
    this._warehouseTitles = val;
  },

  get WAREHOUSE_ROUTE_SEQUENCE() {
    if (this._warehouseRouteSeq) return this._warehouseRouteSeq;
    return this.DEFAULT_WAREHOUSE_ROUTE_SEQUENCE;
  },
  set WAREHOUSE_ROUTE_SEQUENCE(val) {
    this._warehouseRouteSeq = val;
  },

  /**
   * Initializes catalog from localStorage if previously stored
   */
  initCatalogFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedRoute = localStorage.getItem('bosta_warehouse_route_sequence');
      const savedTitles = localStorage.getItem('bosta_warehouse_titles');
      if (savedRoute) {
        const parsed = JSON.parse(savedRoute);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.WAREHOUSE_ROUTE_SEQUENCE = parsed;
        }
      }
      if (savedTitles) {
        const parsedTitles = JSON.parse(savedTitles);
        if (Array.isArray(parsedTitles) && parsedTitles.length > 0) {
          this.WAREHOUSE_TITLES = parsedTitles;
        }
      }
      this.syncGlobalCatalog();
    } catch (e) {
      console.warn('Error loading catalog from localStorage:', e);
    }
  },

  /**
   * Dynamically appends new products to the route sequence and catalog
   */
  addProductsToCatalog(items, saveToStorage = true) {
    if (!items || !Array.isArray(items)) {
      return { addedCount: 0, totalRouteCount: this.WAREHOUSE_ROUTE_SEQUENCE.length, addedItems: [] };
    }
    const addedItems = [];

    for (const rawItem of items) {
      const itemTitle = (typeof rawItem === 'string' ? rawItem : (rawItem.title || rawItem.modelName || '')).trim();
      if (!itemTitle || itemTitle.length < 2) continue;

      // Check if already in WAREHOUSE_ROUTE_SEQUENCE
      const normNew = itemTitle.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "");
      let existsInRoute = false;
      for (const existing of this.WAREHOUSE_ROUTE_SEQUENCE) {
        const normExist = existing.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "");
        if (normExist === normNew || normExist.includes(normNew) || normNew.includes(normExist)) {
          existsInRoute = true;
          break;
        }
      }

      if (!existsInRoute) {
        this.WAREHOUSE_ROUTE_SEQUENCE.push(itemTitle);
        addedItems.push(itemTitle);
      }

      // Also ensure presence in WAREHOUSE_TITLES
      let existsInTitles = this.WAREHOUSE_TITLES.some(t => {
        const normExist = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "");
        return normExist === normNew;
      });
      if (!existsInTitles) {
        this.WAREHOUSE_TITLES.push(itemTitle);
      }
    }

    if (saveToStorage && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('bosta_warehouse_route_sequence', JSON.stringify(this.WAREHOUSE_ROUTE_SEQUENCE));
        localStorage.setItem('bosta_warehouse_titles', JSON.stringify(this.WAREHOUSE_TITLES));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }

    this.syncGlobalCatalog();

    return {
      addedCount: addedItems.length,
      totalRouteCount: this.WAREHOUSE_ROUTE_SEQUENCE.length,
      addedItems
    };
  },

  /**
   * Restores catalog back to default 50 master route items
   */
  resetCatalogToDefault() {
    this.WAREHOUSE_ROUTE_SEQUENCE = [...this.DEFAULT_WAREHOUSE_ROUTE_SEQUENCE];
    this.WAREHOUSE_TITLES = [...this.DEFAULT_WAREHOUSE_TITLES];

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('bosta_warehouse_route_sequence');
        localStorage.removeItem('bosta_warehouse_titles');
      } catch (e) {
        console.warn('LocalStorage clear error:', e);
      }
    }

    this.syncGlobalCatalog();

    return {
      totalRouteCount: this.WAREHOUSE_ROUTE_SEQUENCE.length
    };
  },

  /**
   * Removes a product from the active route sequence
   */
  removeProductFromCatalog(target) {
    const idx = typeof target === 'number' ? target : this.WAREHOUSE_ROUTE_SEQUENCE.indexOf(target);
    if (idx >= 0 && idx < this.WAREHOUSE_ROUTE_SEQUENCE.length) {
      const removed = this.WAREHOUSE_ROUTE_SEQUENCE.splice(idx, 1)[0];
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('bosta_warehouse_route_sequence', JSON.stringify(this.WAREHOUSE_ROUTE_SEQUENCE));
        } catch (e) {}
      }
      this.syncGlobalCatalog();
      return { removed, totalRouteCount: this.WAREHOUSE_ROUTE_SEQUENCE.length };
    }
    return { removed: null, totalRouteCount: this.WAREHOUSE_ROUTE_SEQUENCE.length };
  },

  /**
   * Synchronizes active catalog to global and PDFProcessor objects
   */
  syncGlobalCatalog() {
    if (typeof window !== 'undefined') {
      window.WAREHOUSE_ROUTE_SEQUENCE = this.WAREHOUSE_ROUTE_SEQUENCE;
      if (window.PDFProcessor) {
        window.PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE = this.WAREHOUSE_ROUTE_SEQUENCE;
      }
    }
    if (typeof global !== 'undefined') {
      global.WAREHOUSE_ROUTE_SEQUENCE = this.WAREHOUSE_ROUTE_SEQUENCE;
      if (global.PDFProcessor) {
        global.PDFProcessor.WAREHOUSE_ROUTE_SEQUENCE = this.WAREHOUSE_ROUTE_SEQUENCE;
      }
    }
  },

  /**
   * Extracts candidate new products from parsed pages that are not in current catalog
   */
  extractDiscoveredProductsFromPages(pages) {
    if (!pages || !Array.isArray(pages)) return [];
    const discovered = new Map();

    for (const page of pages) {
      const products = page.products || (page.primaryProduct ? [page.primaryProduct] : []);
      for (const prod of products) {
        const desc = prod.description || prod.formattedLineText || prod.rawLineText || prod.modelName || '';
        const rank = this.getWarehouseRouteRank(desc);
        if (rank === 999) {
          let candidate = prod.modelName || desc;
          candidate = candidate.replace(/\([^)]*\)/g, '').replace(/\b(QTY|qty)\s*\d+/gi, '').trim();
          candidate = candidate.replace(/[-–—/].*$/, '').trim();
          if (candidate.length >= 3 && !/^\d+$/.test(candidate) && !/^[A-Za-z0-9_-]+$/.test(candidate)) {
            const norm = candidate.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "");
            if (!discovered.has(norm)) {
              discovered.set(norm, {
                modelName: candidate,
                samplePage: page.originalPageNumber || page.newPageNumber || 1,
                rawSnippet: desc
              });
            }
          }
        }
      }
    }

    return Array.from(discovered.values());
  },

  // Helper to find the physical picking index (Rank 0..N) for any given product
  getWarehouseRouteRank(productDescription, size = '') {
    if (!productDescription) return 999999;
    if (typeof InventoryParser !== 'undefined' && typeof InventoryParser.getItemRank === 'function') {
      const r = InventoryParser.getItemRank({ modelName: productDescription, size });
      if (r !== 999999) return r;
    }
    const match = this.matchCanonicalProduct(productDescription, size);
    if (match && typeof match.shelfRank === 'number' && match.shelfRank !== 999999) {
      return match.shelfRank;
    }
    return 999999;
  },

  // Helper to compute route rank for an entire order (minimum route index among its items)
  getOrderRouteRank(order) {
    if (!order) return 999999;
    if (typeof InventoryParser !== 'undefined' && typeof InventoryParser.getOrderExcelRank === 'function') {
      const r = InventoryParser.getOrderExcelRank(order);
      if (r !== 999999) return r;
    }
    if (order.products && order.products.length > 0) {
      const ranks = order.products.map(p => {
        const desc = p.description || p.formattedLineText || p.rawLineText || p.modelName || '';
        return this.getWarehouseRouteRank(desc, p.size || '');
      });
      return Math.min(...ranks);
    }
    const fallbackDesc = order.description || order.modelName || order.rawDescription || '';
    return this.getWarehouseRouteRank(fallbackDesc, order.size || '');
  },

  // Known standard colors
  KNOWN_COLORS: [
    "اسود", "أسود", "كشميري", "كشمير", "مينت غامق", "مينت", "كافيه", "بيج فاتح", "بيج",
    "لبني", "موف", "بينك", "بترولي", "بتنجاني", "زيتي", "زيتوني", "اخضر", "أخضر",
    "ازرق", "أزرق", "كحلي", "نبيتي", "لافندر", "سكري", "رمادي غامق", "جراي",
    "اوف وايت", "أبيض", "ابيض", "بني", "وردي", "أصفر", "اصفر", "الأقصى"
  ],

  // Known sizes
  KNOWN_SIZES: ["الاول", "الأول", "الثاني", "الثالث", "الرابع", "1", "2", "3", "4"],

  // Fixed Rubik font subset Glyph ID mapping table for connected Arabic presentation glyphs
  RUBIK_GLYPH_RANGES: [
    { start: 0x0137, end: 0x0137, unicode: '0627' }, // ا
    { start: 0x0138, end: 0x0139, unicode: '0622' }, // آ
    { start: 0x013A, end: 0x013A, unicode: '0623' }, // أ
    { start: 0x013B, end: 0x013B, unicode: '0625' }, // إ
    { start: 0x013C, end: 0x0140, unicode: '0626' }, // ئ
    { start: 0x0141, end: 0x0143, unicode: '0628' }, // ب
    { start: 0x0144, end: 0x0146, unicode: '062A' }, // ت
    { start: 0x0147, end: 0x0149, unicode: '062B' }, // ث
    { start: 0x014A, end: 0x014C, unicode: '062C' }, // ج
    { start: 0x014D, end: 0x014F, unicode: '062D' }, // ح
    { start: 0x0150, end: 0x0152, unicode: '062E' }, // خ
    { start: 0x0153, end: 0x0153, unicode: '062F' }, // د
    { start: 0x0154, end: 0x0154, unicode: '0630' }, // ذ
    { start: 0x0155, end: 0x0155, unicode: '0631' }, // ر
    { start: 0x0156, end: 0x0156, unicode: '0632' }, // ز
    { start: 0x0157, end: 0x0159, unicode: '0633' }, // س
    { start: 0x015A, end: 0x015C, unicode: '0634' }, // ش
    { start: 0x015D, end: 0x015F, unicode: '0635' }, // ص
    { start: 0x0160, end: 0x0162, unicode: '0636' }, // ض
    { start: 0x0163, end: 0x0165, unicode: '0637' }, // ط
    { start: 0x0166, end: 0x0168, unicode: '0638' }, // ظ
    { start: 0x0169, end: 0x016B, unicode: '0639' }, // ع
    { start: 0x016C, end: 0x016E, unicode: '063A' }, // غ
    { start: 0x016F, end: 0x0171, unicode: '0641' }, // ف
    { start: 0x0172, end: 0x0174, unicode: '0642' }, // ق
    { start: 0x0175, end: 0x0179, unicode: '0643' }, // ك
    { start: 0x017A, end: 0x017C, unicode: '0642' }, // ق (Fixes: طقم -> طكم, قطيفة -> كطيفة, الأقصى -> ألكصى)
    { start: 0x017D, end: 0x017F, unicode: '0643' }, // ك (Ensures: كشميري, بكشكشة remain with ك)
    { start: 0x0180, end: 0x0182, unicode: '0644' }, // ل
    { start: 0x0183, end: 0x0185, unicode: '0645' }, // م
    { start: 0x0186, end: 0x0188, unicode: '0646' }, // ن
    { start: 0x0189, end: 0x018B, unicode: '0647' }, // ه
    { start: 0x018C, end: 0x018C, unicode: '0629' }, // ة
    { start: 0x018D, end: 0x018D, unicode: '0648' }, // و
    { start: 0x018E, end: 0x018F, unicode: '0649' }, // ى
    { start: 0x0190, end: 0x0192, unicode: '064A' }, // ي
    { start: 0x0196, end: 0x0197, unicode: '06440627' }, // لا
    { start: 0x019A, end: 0x019B, unicode: '06440623' }, // لأ
    { start: 0x019C, end: 0x019D, unicode: '06440625' }  // لإ
  ],

  /**
   * Decompress and patch /ToUnicode CMap in memory using pako.js
   * Replaces null byte mappings <0000> for Rubik subset fonts
   */
  patchPdfCMap(pdfBytes) {
    if (typeof pako === 'undefined' || !pdfBytes) return pdfBytes;

    try {
      const u8 = new Uint8Array(pdfBytes);
      const latin1 = [];
      const len = u8.byteLength;
      
      // Build replacement bfchar block for Rubik font
      const bfcharList = [];
      // Space mappings: glyph 0003 and 0020 represent space ' '
      bfcharList.push('<0003> <0020>');
      bfcharList.push('<0020> <0020>');

      for (const item of this.RUBIK_GLYPH_RANGES) {
        for (let c = item.start; c <= item.end; c++) {
          const hexC = c.toString(16).padStart(4, '0').toUpperCase();
          bfcharList.push(`<${hexC}> <${item.unicode}>`);
        }
      }
      // Add digits (0x01A2..0x01AB & 0x01AC..0x01B5)
      for (let c = 0x01A2; c <= 0x01AB; c++) {
        const uDigit = (0x0030 + (c - 0x01A2)).toString(16).padStart(4, '0');
        bfcharList.push(`<${c.toString(16).padStart(4, '0').toUpperCase()}> <${uDigit}>`);
      }
      for (let c = 0x01AC; c <= 0x01B5; c++) {
        const uDigit = (0x0030 + (c - 0x01AC)).toString(16).padStart(4, '0');
        bfcharList.push(`<${c.toString(16).padStart(4, '0').toUpperCase()}> <${uDigit}>`);
      }
      // Parentheses
      bfcharList.push('<01B6> <0028>');
      bfcharList.push('<01B8> <0028>');
      bfcharList.push('<01B7> <0029>');
      bfcharList.push('<01B9> <0029>');

      const patchBlock = `\n${bfcharList.length} beginbfchar\n${bfcharList.join('\n')}\nendbfchar\n`;

      // Search for stream segments
      let modified = false;
      const chunks = [];
      let cursor = 0;

      // Fast scan for 'stream' keywords
      const streamMarker = [115, 116, 114, 101, 97, 109]; // 'stream'
      const endstreamMarker = [101, 110, 100, 115, 116, 114, 101, 97, 109]; // 'endstream'

      let i = 0;
      while (i < len - 10) {
        let match = true;
        for (let m = 0; m < 6; m++) {
          if (u8[i + m] !== streamMarker[m]) { match = false; break; }
        }

        if (match) {
          // Found 'stream', skip newline (\r\n or \n)
          let streamStart = i + 6;
          if (u8[streamStart] === 13 && u8[streamStart + 1] === 10) streamStart += 2;
          else if (u8[streamStart] === 10) streamStart += 1;

          // Find 'endstream'
          let streamEnd = -1;
          for (let k = streamStart; k < len - 9; k++) {
            let endMatch = true;
            for (let e = 0; e < 9; e++) {
              if (u8[k + e] !== endstreamMarker[e]) { endMatch = false; break; }
            }
            if (endMatch) {
              streamEnd = k;
              // backtrack trailing whitespace/newline
              if (u8[streamEnd - 1] === 10) streamEnd--;
              if (u8[streamEnd - 1] === 13) streamEnd--;
              break;
            }
          }

          if (streamEnd > streamStart) {
            const streamBytes = u8.subarray(streamStart, streamEnd);
            try {
              const decompressed = pako.inflate(streamBytes, { to: 'string' });
              if (decompressed.includes('begincmap') && (decompressed.includes('<0000>') || decompressed.includes('0137'))) {
                let patchedText = decompressed;
                if (patchedText.includes('<0137> <01A1> <0000>')) {
                  patchedText = patchedText.replace('<0137> <01A1> <0000>', '');
                }
                patchedText = patchedText.replace('endcmap', patchBlock + 'endcmap');

                const recompressed = pako.deflate(patchedText);

                // Slice leading chunk up to streamStart
                chunks.push(u8.subarray(cursor, streamStart));
                chunks.push(recompressed);
                cursor = streamEnd;
                modified = true;
                i = streamEnd + 9;
                continue;
              }
            } catch (_) {
              // Not a deflate stream or not a CMap, ignore
            }
          }
        }
        i++;
      }

      if (modified) {
        chunks.push(u8.subarray(cursor));
        let totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        return merged.buffer;
      }
    } catch (e) {
      console.warn('PDF CMap patch skipped:', e);
    }

    return pdfBytes;
  },

  /**
   * 100% Space-Immune Arabic Normalizer
   * Strips all spaces, diacritics, and normalizes alefs, taa marbuta, and yaa
   */
  normalizeArabic(str) {
    if (!str) return '';
    return str
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىي]/g, 'ي')
      .replace(/[\u064B-\u065F\u0640\u0000]/g, '')
      .replace(/\s+/g, ''); // Strip ALL spaces for 100% immune comparison
  },

  /**
   * Sanitizes Arabic text extracted from PDF streams to fix known CMap and bidi anomalies
   */
  cleanArabicStreamText(text) {
    if (!text || typeof text !== 'string') return '';
    let str = text;

    // Replace glyph 0003 / 0020 control codes with regular space
    str = str.replace(/[\u0003\x03\u0000\x00]/g, ' ');

    // Fix Lam-Alef ligature glitches ("ص ال ه" -> "صلاه", "ا ال ول" -> "الاول", "ا ال مر ات" -> "الاميرات")
    str = str.replace(/ص\s*ال\s*ه/g, 'صلاه');
    str = str.replace(/ص\s*لا\s*ه/g, 'صلاه');
    str = str.replace(/ا\s*ال\s*ول/g, 'الاول');
    str = str.replace(/ا\s*ال\s*مر\s*ات/g, 'الاميرات');
    str = str.replace(/ال\s*امر\s*ات/g, 'الاميرات');

    // Explicit restoration for spaced/split sizes
    str = str.replace(/ا\s*ل\s*أ?\s*و\s*ل|ال\s*أ?\s*ول|ا\s*لا\s*و\s*ل/g, 'الأول');
    str = str.replace(/ا\s*ل\s*ث\s*ا\s*ن\s*[ييى]|ال\s*ثان[ييى]/g, 'الثاني');
    str = str.replace(/ا\s*ل\s*ث\s*ا\s*ل\s*ث|ال\s*ثالث/g, 'الثالث');
    str = str.replace(/ا\s*ل\s*ر\s*ا\s*ب\s*ع|ال\s*رابع/g, 'الرابع');

    // Fix Haa vs Haa/Dal glitches ("هدريمي" -> "حريمي")
    str = str.replace(/هدريمي/g, 'حريمي');
    str = str.replace(/هد\s*ريمي/g, 'حريمي');

    // Fix word boundary mergers
    str = str.replace(/وتربر\s*وف/g, 'وتر بروف');
    str = str.replace(/جيبهص\s*ال\s*هليكرا/g, 'جيبه صلاه ليكرا');
    str = str.replace(/جيبهص\s*الهليكرا/g, 'جيبه صلاه ليكرا');
    str = str.replace(/جيبه\s*صلاه\s*ليكرا/g, 'جيبه صلاه ليكرا');

    // Collapse multiple internal spaces
    str = str.replace(/[ \t]+/g, ' ').trim();
    return str;
  },

  /**
   * Restores natural Arabic words with proper spaces, matching against official catalog
   */
  reconstructArabicWords(rawLine) {
    if (!rawLine) return '';
    let line = this.cleanArabicStreamText(rawLine);

    // 1. If line contains a catalog title, return official catalog title with exact spaces
    const norm = this.normalizeArabic(line);
    const sortedTitles = [...this.WAREHOUSE_TITLES].sort(
      (a, b) => this.normalizeArabic(b).length - this.normalizeArabic(a).length
    );
    for (const title of sortedTitles) {
      if (norm.includes(this.normalizeArabic(title))) {
        return title;
      }
    }

    // 2. Only collapse spaces if line consists predominantly of spaced single Arabic letters (e.g. "ا س د ا ل")
    const tokens = line.split(/\s+/).filter(Boolean);
    const isSingleLetters = tokens.length >= 3 && (tokens.filter(t => t.length === 1 && /[\u0600-\u06FF]/.test(t)).length / tokens.length) > 0.6;
    if (isSingleLetters) {
      return line.replace(/(?<=(?:^|\s)[\u0600-\u06FF])\s+(?=[\u0600-\u06FF](?:\s|$))/g, '');
    }

    // 3. Otherwise preserve natural spaces!
    return line;
  },

  /**
   * Normalizes Arabic text for grouping, matching and comparison
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    let str = text;

    // Remove Tashkeel / Diacritics
    str = str.replace(/[\u064B-\u065F\u0670]/g, '');

    // Remove Tatweel / Kashida
    str = str.replace(/\u0640/g, '');

    // Normalize Alefs (أ, إ, آ, ٱ -> ا)
    str = str.replace(/[أإآٱ]/g, 'ا');

    // Normalize Taa Marbuta to Haa (ة -> ه) for grouping
    str = str.replace(/ة/g, 'ه');

    // Normalize Yaa / Alef Maksura (ى, ي, ی -> ي)
    str = str.replace(/[ىيى]/g, 'ي');

    // Normalize Kaf
    str = str.replace(/ك|ک/g, 'ك');

    // Convert Arabic-Indic numerals (٠-٩) to standard (0-9)
    str = str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

    // Clean whitespace
    str = str.replace(/\s+/g, ' ').trim().toLowerCase();

    return str;
  },

  /**
   * Normalizes Arabic text strictly for fuzzy matching:
   * Strips all diacritics, unifies أ/إ/آ/ٱ -> ا, ة -> ه, ى/ي -> ي, ك/ک -> ك,
   * normalizes Unicode Presentation Forms (NFKC), and collapses whitespace.
   */
  normalizeForMatching(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640\u0000\x00-\x1F]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىي]/g, 'ي')
      .replace(/[كک]/g, 'ك')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Computes Levenshtein edit distance between two strings
   */
  levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const v0 = new Array(b.length + 1);
    const v1 = new Array(b.length + 1);

    for (let i = 0; i <= b.length; i++) v0[i] = i;

    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
    }
    return v0[b.length];
  },

  /**
   * Computes token overlap score with fuzzy token matching
   */
  tokenOverlapScore(tokensCanonical, tokensLine) {
    if (!tokensCanonical || !tokensLine) return 0;
    let matches = 0;
    for (const tC of tokensCanonical) {
      if (tokensLine.includes(tC)) {
        matches++;
      } else {
        for (const tL of tokensLine) {
          if (tC.length >= 4 && tL.length >= 4 && Math.abs(tC.length - tL.length) <= 1) {
            if (this.levenshteinDistance(tC, tL) <= 1) {
              matches += 0.85;
              break;
            }
          }
        }
      }
    }
    return matches;
  },

  /**
   * Master Smart Fuzzy Product Name Matcher against WAREHOUSE_SHELF_CATALOG
   * Combines warehouse shelf guide (بلا عنوان (1).pdf) & SKU sheet (inventory_export_1.csv)
   * Resolves scrambled/mixed names, degraded Rubik glyphs, and reversed bidi streams.
   */
  matchCanonicalProduct(rawLine, preferredSize = '') {
    if (!rawLine || typeof rawLine !== 'string') {
      return {
        id: 999,
        canonical: '',
        dept: 'other',
        shelfRank: 999999,
        score: 0
      };
    }

    const cleaned = this.cleanArabicStreamText(rawLine);
    const normLine = this.normalizeForMatching(cleaned);
    const normLineNoSpaces = normLine.replace(/\s+/g, '');
    const tokensLine = normLine.split(/\s+/).filter(t => t.length > 1 && !/^\d+$/.test(t));

    // Detect size from rawLine or preferredSize
    let detectedSize = '';
    const normSizeToCheck = this.normalizeForMatching(preferredSize || rawLine);
    if (normSizeToCheck.includes('رابع') || normSizeToCheck.includes('4')) detectedSize = 'الرابع';
    else if (normSizeToCheck.includes('ثالث') || normSizeToCheck.includes('3')) detectedSize = 'الثالث';
    else if (normSizeToCheck.includes('ثاني') || normSizeToCheck.includes('2')) detectedSize = 'الثاني';
    else if (normSizeToCheck.includes('اول') || normSizeToCheck.includes('1')) detectedSize = 'الاول';

    let bestEntry = null;
    let bestScore = -999;
    let bestIndex = 999999;

    for (let idx = 0; idx < this.WAREHOUSE_SHELF_CATALOG.length; idx++) {
      const entry = this.WAREHOUSE_SHELF_CATALOG[idx];
      let score = 0;

      const normCanonical = this.normalizeForMatching(entry.canonical);
      const normCanonicalNoSpaces = normCanonical.replace(/\s+/g, '');
      const tokensCanonical = normCanonical.split(/\s+/).filter(Boolean);

      // 1. Keyword Matching (exact & space-stripped)
      let keywordMatched = false;
      let maxKeywordLen = 0;
      if (entry.keywords && entry.keywords.length > 0) {
        for (const kw of entry.keywords) {
          const normKw = this.normalizeForMatching(kw);
          const normKwNoSpaces = normKw.replace(/\s+/g, '');
          if (normLine.includes(normKw) || normLineNoSpaces.includes(normKwNoSpaces)) {
            keywordMatched = true;
            if (normKw.length > maxKeywordLen) {
              maxKeywordLen = normKw.length;
            }
          }
        }
      }

      if (keywordMatched) {
        score += 85 + (maxKeywordLen * 3);
      }

      // 2. Exact Canonical Substring Match
      if (normLine.includes(normCanonical) || normLineNoSpaces.includes(normCanonicalNoSpaces)) {
        score += 100 + (normCanonical.length * 3);
      }

      // 3. Token Overlap
      const overlap = this.tokenOverlapScore(tokensCanonical, tokensLine);
      const overlapRatio = tokensCanonical.length > 0 ? (overlap / tokensCanonical.length) : 0;
      score += (overlapRatio * 60);

      // 4. Character-Skeleton / Levenshtein Distance
      const dist = this.levenshteinDistance(normCanonicalNoSpaces, normLineNoSpaces);
      const maxLen = Math.max(normCanonicalNoSpaces.length, normLineNoSpaces.length);
      const sim = maxLen > 0 ? (1 - dist / maxLen) : 0;
      if (sim > 0.5) {
        score += (sim * 45);
      }

      // 5. Size Filter (for kids prayer sets 301..308: 4 then 3 then 2 then 1)
      if (entry.sizeFilter) {
        if (detectedSize && entry.sizeFilter === detectedSize) {
          score += 70; // Exact size match bonus
        } else if (detectedSize && entry.sizeFilter !== detectedSize) {
          score -= 120; // Strong penalty for wrong size
        }
      }

      // 6. Department Sanity Penalties & Bonuses
      const hasKidsWord = normLine.includes('اطفال') || normLine.includes('يلافط');
      const hasWomenWord = normLine.includes('حريمي');
      if (hasKidsWord && entry.dept === 'women') {
        score -= 100;
      }
      if (hasWomenWord && entry.dept === 'kids') {
        score -= 100;
      }

      // Pocket & Waterproof Group vs Regular Rugs vs Garments
      const isPocketOrWaterproofLine = normLine.includes('وتر') || normLine.includes('بروف') || normLine.includes('بطانه') ||
                                       normLine.includes('سجاده جيب') || normLine.includes('سجادة جيب') ||
                                       normLine.includes('طقم جيب') || normLine.includes('ملحفه جيب') || normLine.includes('ملحفة جيب') ||
                                       normLine.includes('جيبه جيب') || normLine.includes('جيبة جيب');

      const isRegularRugLine = (normLine.includes('سجاد') || normLine.includes('سجاده')) && !isPocketOrWaterproofLine;

      if (isPocketOrWaterproofLine) {
        if (entry.dept === 'pocket_waterproof') {
          score += 60;
        } else {
          score -= 130;
        }
      } else {
        if (entry.dept === 'pocket_waterproof') {
          score -= 90;
        }
      }

      if (isRegularRugLine) {
        if (entry.dept === 'rug_regular') {
          score += 60;
        } else {
          score -= 130;
        }
      } else {
        if (entry.dept === 'rug_regular') {
          score -= 90;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
        bestIndex = idx;
      }
    }

    if (bestEntry && bestScore >= 35) {
      return {
        id: bestEntry.id,
        canonical: bestEntry.canonical,
        dept: bestEntry.dept,
        sizeFilter: bestEntry.sizeFilter || null,
        shelfRank: bestIndex,
        score: bestScore
      };
    }

    // Fallback: clean reconstruction
    return {
      id: 999,
      canonical: this.reconstructArabicWords(rawLine),
      dept: 'other',
      shelfRank: 999999,
      score: bestScore
    };
  },

  /**
   * Identifies the primary department for an entire order ('kids', 'women', 'rug_regular', 'pocket_waterproof', or 'other')
   */
  getOrderDepartment(order) {
    if (!order) return 'other';

    // If order has products array
    if (Array.isArray(order.products) && order.products.length > 0) {
      const depts = order.products.map(p => {
        if (p.dept && p.dept !== 'other') return p.dept;
        const text = p.description || p.formattedLineText || p.rawLineText || p.modelName || '';
        const match = this.matchCanonicalProduct(text, p.size || '');
        return match.dept;
      });

      // Priority: Pocket/Waterproof items are strictly isolated at the very end
      if (depts.includes('pocket_waterproof')) return 'pocket_waterproof';
      if (depts.includes('rug_regular')) return 'rug_regular';
      if (depts.includes('kids')) return 'kids';
      if (depts.includes('women')) return 'women';
    }

    // Fallback on order title / description / model
    const text = `${order.modelName || ''} ${order.title || ''} ${order.rawDescription || ''} ${order.fullNormalizedDesc || ''}`;
    const match = this.matchCanonicalProduct(text, order.size || '');
    return match.dept || 'other';
  },

  isPocketWaterproofItem(orderOrProduct) {
    return this.getOrderDepartment(orderOrProduct) === 'pocket_waterproof';
  },

  isRegularRugItem(orderOrProduct) {
    return this.getOrderDepartment(orderOrProduct) === 'rug_regular';
  },

  isCarpetItem(orderOrProduct) {
    const dept = this.getOrderDepartment(orderOrProduct);
    return dept === 'rug_regular' || dept === 'pocket_waterproof';
  },

  /**
   * Space-Immune & Skeleton Matcher for Warehouse Master Catalog
   * Delegates to matchCanonicalProduct for official canonical shelf name
   */
  matchWarehouseModel(extractedModel) {
    if (!extractedModel) return '';
    const match = this.matchCanonicalProduct(extractedModel);
    if (match && match.canonical) {
      return match.canonical;
    }
    return this.reconstructArabicWords(extractedModel);
  },

  normalize(s) {
    if (!s) return '';
    return s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ').trim();
  },

  /**
   * Space-Immune Color and Variant Code Parser
   * Matches normalizeArabic(colorSegment) against KNOWN_COLORS (sorted longest-first)
   * Extracts codes like (Z1), (V1), (W3), (N1)
   */
  parseColorAndCode(rawColor) {
    if (!rawColor) return { color: '', code: '' };

    let code = '';
    const codeMatch = rawColor.match(/\(?([A-Za-z]{1,2}\d{1,2})\)?/);
    if (codeMatch) {
      code = codeMatch[1].toUpperCase();
    }

    // Clean code out of color text
    let cleanColor = rawColor.replace(/\(?([A-Za-z]{1,2}\d{1,2})\)?/g, '').replace(/[\x00\u0000]/g, '').trim();
    const normColorSegment = this.normalizeArabic(cleanColor);

    // Sort KNOWN_COLORS longest-first so "مينت غامق" matches before "مينت", and "بيج فاتح" before "بيج"
    const sortedColors = [...this.KNOWN_COLORS].sort(
      (a, b) => this.normalizeArabic(b).length - this.normalizeArabic(a).length
    );

    let matchedColor = '';
    for (const c of sortedColors) {
      const normC = this.normalizeArabic(c);
      if (normC && (normColorSegment.includes(normC) || normC.includes(normColorSegment))) {
        matchedColor = c;
        break;
      }
    }

    if (!matchedColor) {
      matchedColor = this.reconstructArabicWords(cleanColor);
    }

    return { color: matchedColor, code };
  },

  /**
   * Space-Immune Size Parser
   * Matches normalizeArabic(sizeSegment) against ["الأول", "الثاني", "الثالث", "الرابع"] and standards
   */
  parseSize(rawSize) {
    if (!rawSize) return '';
    const clean = rawSize.replace(/[\x00\u0000]/g, '').trim();
    const norm = this.normalizeArabic(clean);

    if (norm === '1' || norm.includes('الاول') || /ا\s*ل\s*أ?\s*و\s*ل/.test(clean)) return 'الأول';
    if (norm === '2' || norm.includes('الثاني') || /ا\s*ل\s*ث\s*ا\s*ن\s*[ييى]/.test(clean)) return 'الثاني';
    if (norm === '3' || norm.includes('الثالث') || /ا\s*ل\s*ث\s*ا\s*ل\s*ث/.test(clean)) return 'الثالث';
    if (norm === '4' || norm.includes('الرابع') || /ا\s*ل\s*ر\s*ا\s*ب\s*ع/.test(clean)) return 'الرابع';

    const knownSizes = ["الأول", "الثاني", "الثالث", "الرابع", "XXL", "XL", "L", "M", "S"];
    for (const s of knownSizes) {
      const normS = this.normalizeArabic(s);
      if (normS === norm || norm.includes(normS)) {
        return s;
      }
    }

    if (norm === 'ال' || norm === 'ا') return '';

    return this.reconstructArabicWords(clean);
  },

  /**
   * Space-Immune Product Line Parser (QTY lines):
   * For every line that contains QTY (or Q T Y / Y T Q):
   * Split by '-' (Model from Color/Size) and by '/' (Color from Size)
   */
  parseProductLine(line) {
    if (!line || typeof line !== 'string') return null;

    // Filter out forbidden headers and lines immediately
    if (/م\.ج|ج\.م|HUB|Tracking\s*Number|Order\s*Reference|FM-OBOUR|EC-|Created:|\+201/i.test(line)) {
      return null;
    }

    // MUST contain QTY (or Q T Y / Y T Q)
    if (!/Q\s*T\s*Y|Y\s*T\s*Q|QTY/i.test(line)) {
      return null;
    }

    // Extract quantity (e.g. 1, 2, 3, 4) next to QTY
    let qty = 1;
    const qtyMatch = line.match(/(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)[:\s]*(\d+)|\((\d+)\s*(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)\)|\((?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)\s*(\d+)\)|(\d+)\s*(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)/i);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[4], 10) || 1;
    }

    // Sanitize text glitches (Lam-Alef, Haa, space codes)
    let sanitizedLine = this.cleanArabicStreamText(line);

    // Check full line for size patterns before any splitting
    const normFull = this.normalizeArabic(sanitizedLine);
    let fullLineSize = '';
    if (normFull.includes('الرابع') || /ا\s*ل\s*ر\s*ا\s*ب\s*ع/.test(sanitizedLine)) fullLineSize = 'الرابع';
    else if (normFull.includes('الثالث') || /ا\s*ل\s*ث\s*ا\s*ل\s*ث/.test(sanitizedLine)) fullLineSize = 'الثالث';
    else if (normFull.includes('الثاني') || /ا\s*ل\s*ث\s*ا\s*ن\s*[ييى]/.test(sanitizedLine)) fullLineSize = 'الثاني';
    else if (normFull.includes('الاول') || /ا\s*ل\s*أ?\s*و\s*ل/.test(sanitizedLine)) fullLineSize = 'الأول';

    // Remove QTY from line
    let clean = sanitizedLine.replace(/\(?(?:(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)[:\s]*\d+|\d+\s*(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)|[0-9]+\s*x)\)?/gi, '')
                             .replace(/(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)/gi, '')
                             .trim();

    // Split by '-' and '/'
    let rawModel = clean;
    let rawColor = '';
    let rawSize = '';

    if (clean.includes('-') && clean.includes('/')) {
      const dashIdx = clean.indexOf('-');
      const slashIdx = clean.indexOf('/');
      if (dashIdx < slashIdx) {
        rawModel = clean.substring(0, dashIdx).trim();
        rawColor = clean.substring(dashIdx + 1, slashIdx).trim();
        rawSize = clean.substring(slashIdx + 1).trim();
      } else {
        rawModel = clean.substring(0, slashIdx).trim();
        rawSize = clean.substring(slashIdx + 1, dashIdx).trim();
        rawColor = clean.substring(dashIdx + 1).trim();
      }
    } else if (clean.includes('-')) {
      const parts = clean.split('-');
      rawModel = parts[0].trim();
      rawColor = parts.slice(1).join('-').trim();
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      rawModel = parts[0].trim();
      rawSize = parts.slice(1).join('/').trim();
    } else {
      // If neither '-' nor '/', match against catalog directly
      const normClean = this.normalizeArabic(clean);
      const sortedTitles = [...this.WAREHOUSE_TITLES].sort(
        (a, b) => this.normalizeArabic(b).length - this.normalizeArabic(a).length
      );
      for (const title of sortedTitles) {
        const normT = this.normalizeArabic(title);
        if (normClean.includes(normT)) {
          rawModel = title;
          rawColor = normClean.replace(normT, '');
          break;
        }
      }
    }

    // Reconstruct clean official model from catalog with proper spaces & smart fuzzy canonical matcher
    let size = this.parseSize(rawSize);

    // If size after splitting by / is empty or equals 'ال' or 'ا', recover from full line or SKU
    if (!size || size === 'ال' || size === 'ا') {
      if (fullLineSize) {
        size = fullLineSize;
      } else if (typeof InventoryParser !== 'undefined' && typeof InventoryParser.skuRankMap !== 'undefined') {
        const skuTokenMatch = sanitizedLine.match(/[a-zA-Z0-9_-]{5,15}/);
        if (skuTokenMatch) {
          const skuCode = skuTokenMatch[0];
          if (/1$/.test(skuCode)) size = 'الأول';
          else if (/2$/.test(skuCode)) size = 'الثاني';
          else if (/3$/.test(skuCode)) size = 'الثالث';
          else if (/4$/.test(skuCode)) size = 'الرابع';
        }
      }
    }

    const { color, code: colorCode } = this.parseColorAndCode(rawColor);
    const canonicalMatch = this.matchCanonicalProduct(rawModel, size);
    const modelName = (canonicalMatch && canonicalMatch.canonical) ? canonicalMatch.canonical : this.matchWarehouseModel(rawModel);

    // Format the final displayed line cleanly as:
    // [اسم الموديل المعتمد] - [اللون] / [المقاس] (QTY X)
    // Examples:
    // طقم الاميرات اطفالي - بتنجاني / الرابع (1 QTY)
    // سجادة صلاة قطيفة مطبوعة - الأقصى (3 QTY)
    let formattedLineText = modelName;
    if (color && size) {
      formattedLineText += ` - ${color}${colorCode ? ` (${colorCode})` : ''} / ${size}`;
    } else if (color) {
      formattedLineText += ` - ${color}${colorCode ? ` (${colorCode})` : ''}`;
    } else if (size) {
      formattedLineText += ` / ${size}`;
    }
    formattedLineText += ` (${qty} QTY)`;

    return {
      modelName,
      canonicalId: canonicalMatch ? canonicalMatch.id : 999,
      canonicalTitle: canonicalMatch ? canonicalMatch.canonical : modelName,
      dept: canonicalMatch ? canonicalMatch.dept : 'other',
      shelfRank: canonicalMatch ? canonicalMatch.shelfRank : 999999,
      color,
      colorCode,
      size,
      qty,
      formattedLineText,
      raw: line,
      normalizedModel: this.normalizeArabic(modelName),
      normalizedColor: this.normalizeArabic(color),
      normalizedSize: this.normalizeArabic(size)
    };
  },

  /**
   * 100% Reliable Category Detection (Kids vs Women vs Others)
   * Checks both normalized clean description AND raw visual stream patterns (including reversed glyphs)
   */
  detectCategoryFromRawStream(rawText, cleanDescription) {
    const raw = rawText || '';
    const clean = cleanDescription || '';

    // Check both normalized clean description AND raw visual stream patterns
    const combined = (clean + ' ' + raw).replace(/\s+/g, '');
    const normCombined = this.normalizeArabic(clean + ' ' + raw);

    // Kids patterns: "اطفال", "اطفالي", and visual stream reverse "يلافط", "افط"
    const isKids = combined.includes('اطفال') ||
                   combined.includes('اطفالي') ||
                   combined.includes('يلافط') ||
                   combined.includes('افط') ||
                   normCombined.includes('اطفال') ||
                   normCombined.includes('اطفالي') ||
                   normCombined.includes('يلافط') ||
                   normCombined.includes('افط');

    // Women patterns: "حريمي", and visual stream reverse "يميرح", "يمرح"
    const isWomen = combined.includes('حريمي') ||
                    combined.includes('يميرح') ||
                    combined.includes('يمرح') ||
                    normCombined.includes('حريمي') ||
                    normCombined.includes('يميرح') ||
                    normCombined.includes('يمرح');

    return {
      isKids,
      isWomen,
      isOther: !isKids && !isWomen
    };
  },

  /**
   * Intelligently parses extracted text items from a Bosta label page.
   * Uses exact geometry & strict filters:
   * - Filters out non-product lines
   * - Total Pieces Badge from pill line or QTY sum
   * - Order Reference & Tracking Number
   * - Notes & embedded SKUs
   */
  parseBostaPage(lines, pageNumber, rawItems = []) {
    const products = [];
    let trackingNumber = '';
    let orderReference = '';
    let customerName = '';
    let city = '';
    const notesLines = [];
    let lastProductIndex = -1;

    // Standard Egyptian cities for detection
    const egyptianCities = [
      'القاهرة', 'الجيزة', 'الإسكندرية', 'الاسكندرية', 'القليوبية', 'الدقهلية',
      'الشرقية', 'المنوفية', 'الغربية', 'كفر الشيخ', 'البحيرة', 'دمياط',
      'بورسعيد', 'الإسماعيلية', 'الاسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء',
      'بني سويف', 'الفيوم', 'المنيا', 'أسيوط', 'اسيوط', 'سوهاج', 'قنا', 'الأقصر', 'الاقصر',
      'أسوان', 'اسوان', 'البحر الأحمر', 'البحر الاحمر', 'الوادي الجديد', 'مطروح'
    ];

    let pillPiecesInt = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Customer Name extraction from Bosta header "توصيل إلى:" or "Customer:"
      if (!customerName) {
        if (/توصيل\s*إ?لى|Deliver\s*to|Customer[:\s]/i.test(line)) {
          let after = line.replace(/^.*?(?:توصيل\s*إ?لى|Deliver\s*to|Customer)[:\s]*/i, '').trim();
          after = after.replace(/التاجر[:\s]*خيام.*|خيام\s*لملابس.*|khaim.*/i, '').trim();
          if (after && after.length >= 2 && !/^\+?\d+$/.test(after) && !/AWB|Order|QTY|قطعة|عطق|COD/i.test(after)) {
            customerName = after;
          } else if (i + 1 < lines.length) {
            let nextL = lines[i + 1].trim();
            nextL = nextL.replace(/التاجر[:\s]*خيام.*|خيام\s*لملابس.*|khaim.*/i, '').trim();
            if (nextL && nextL.length >= 2 && !/^\+?\d+$/.test(nextL) && !/AWB|Order|QTY|قطعة|عطق|COD|توصيل|محافظة|القاهرة|الجيزة|الإسكندرية/i.test(nextL)) {
              customerName = nextL;
            }
          }
        }
      }

      // 1. Total Pieces extraction from pill line (e.g., [4 قطع], 1 قطعة, قطع 4, فتح الشحنة : نعم)
      if (!pillPiecesInt) {
        const piecesMatch = line.match(/(?:\[|\b)(\d+)\s*(?:قطع|قطعة|قطعه|عطق|Pieces?)(?:\]|\b)/i) ||
                            line.match(/(?:\[|\b)(?:قطع|قطعة|قطعه|عطق|Pieces?)\s*(\d+)(?:\]|\b)/i);
        if (piecesMatch) {
          pillPiecesInt = parseInt(piecesMatch[1] || piecesMatch[2], 10) || 0;
        }
      }

      // 2. Order Reference / Barcode Code (e.g. EXC-U5111-353, SY-KHIAM-4972, U998-0245)
      if (!orderReference) {
        const refMatch = line.match(/(?:Order\s*Ref(?:erence)?|مرجع الطلب|كود الشحنة)[:\s]*([A-Za-z0-9_-]+)/i) ||
                         line.match(/\b([A-Z]{2,5}-[A-Z0-9]{3,10}-[0-9]{2,6})\b/i);
        if (refMatch) {
          orderReference = refMatch[1].trim();
        }
      }

      // 3. Tracking Number (AWB)
      if (!trackingNumber) {
        const trackingMatch = line.match(/(?:Tracking(?:\s*Number)?|رقم الشحنة|رقم التتبع|AWB)[:\s]*([0-9]{8,15})/i) ||
                              line.match(/\b([0-9]{9,11})\b/);
        if (trackingMatch) {
          trackingNumber = trackingMatch[1];
        }
      }

      // 4. Egyptian City
      if (!city) {
        for (const c of egyptianCities) {
          if (line.includes(c)) {
            city = c;
            break;
          }
        }
      }

      // 5. Product Line extraction (STRICT: only lines with QTY)
      const parsedProduct = this.parseProductLine(line);
      if (parsedProduct) {
        parsedProduct.description = parsedProduct.description || parsedProduct.formattedLineText || parsedProduct.rawLineText || parsedProduct.modelName;
        products.push(parsedProduct);
        lastProductIndex = i;
      }
    }

    // Secondary geometry fallback for customerName if rawItems are present (X >= 100 on right side)
    if (!customerName && Array.isArray(rawItems) && rawItems.length > 0) {
      const deliverToItem = rawItems.find(it => (it.x >= 100 || it.x >= 120) && /توصيل\s*إ?لى/i.test(it.str || ''));
      if (deliverToItem) {
        const candidate = rawItems
          .filter(it => it.x >= 90 && it.y < deliverToItem.y && it.y >= deliverToItem.y - 25 && it.str && it.str.trim())
          .sort((a, b) => b.x - a.x)
          .map(it => it.str.trim())
          .join(' ')
          .replace(/التاجر[:\s]*خيام.*|خيام\s*لملابس.*|khaim.*/i, '')
          .trim();
        if (candidate && candidate.length >= 2 && !/^\d+$/.test(candidate)) {
          customerName = candidate;
        }
      }
    }

    // Collect notes between last product line and footer
    if (lastProductIndex !== -1) {
      for (let k = lastProductIndex + 1; k < lines.length; k++) {
        const l = lines[k].trim();
        if (!l) continue;
        if (/Tracking|Order\s*Ref|bosta|EC-|FM-/i.test(l)) break;
        if (/ملاحظات|ملاحظه/i.test(l)) continue;
        notesLines.push(l);
      }
    }

    // Sum QTY of products and cross-check with pill badge
    const sumQty = products.reduce((acc, p) => acc + (p.qty || 1), 0);
    const piecesCount = Math.max(pillPiecesInt, sumQty) || 1;
    const totalPieces = piecesCount === 1 ? '1 قطعة' : `${piecesCount} قطع`;

    // Detect embedded SKU in notes or products
    let sku = '';
    const fullNotesText = notesLines.join(' ');
    
    // 1. Try matching tokens against InventoryParser.skuRankMap
    if (typeof InventoryParser !== 'undefined' && InventoryParser.skuRankMap && InventoryParser.skuRankMap.size > 0) {
      const allText = `${fullNotesText} ${lines.join(' ')}`;
      const tokens = allText.match(/[a-zA-Z0-9_-]{5,15}/g);
      if (tokens) {
        for (const token of tokens) {
          if (InventoryParser.skuRankMap.has(token.toLowerCase())) {
            sku = token.toUpperCase();
            break;
          }
        }
      }
    }

    // 2. Fallback regex
    if (!sku) {
      const skuMatch = fullNotesText.match(/\b([a-zA-Z]{2}\d{3}[a-zA-Z0-9]{1,4})\b/i);
      if (skuMatch) {
        sku = skuMatch[1].toUpperCase();
      }
    }

    // PERMANENT FIX: 100% Reliable Category Detection (Kids vs Women vs Others)
    const cleanDescription = products.map(p => `${p.modelName} ${p.color || ''} ${p.size || ''}`).join(' ');
    const rawText = lines.join(' ') + ' ' + notesLines.join(' ');
    const { isKids, isWomen, isOther } = this.detectCategoryFromRawStream(rawText, cleanDescription);
    const isMulti = piecesCount > 1 || products.length > 1;
    const isSingle = piecesCount === 1;

    let category = 'other';
    if (isKids && isWomen) {
      category = 'multi';
    } else if (isKids) {
      category = 'kids';
    } else if (isWomen) {
      category = 'women';
    } else if (isMulti) {
      category = 'multi';
    } else {
      category = 'other';
    }

    // Multi-product order check
    const isMultiProduct = isMulti;
    const primaryProduct = products[0] || {
      modelName: 'بوليصة غير محددة',
      color: '',
      colorCode: '',
      size: '',
      qty: 1,
      normalizedModel: '',
      normalizedColor: '',
      normalizedSize: ''
    };

    // Full description string for Level 2 similarity tie-breaker
    const sortedProductDescs = [...products]
      .sort((a, b) => (a.modelName || '').localeCompare(b.modelName || '', 'ar'))
      .map(p => `${p.modelName} ${p.color || ''} ${p.size || ''}`)
      .join(' - ');
    const fullNormalizedDesc = this.normalizeArabic(sortedProductDescs || primaryProduct.modelName);

    return {
      originalPageNumber: pageNumber,
      trackingNumber: trackingNumber || (orderReference ? orderReference : `AWB-${pageNumber}`),
      orderReference: orderReference || trackingNumber,
      piecesCount,
      totalPieces: piecesCount,
      totalPiecesInt: piecesCount,
      totalPiecesStr: totalPieces,
      routeRank: (typeof InventoryParser !== 'undefined')
        ? InventoryParser.getOrderExcelRank({ sku, products, modelName: primaryProduct.modelName, rawNotes: fullNotesText, rawDescription: products.map(p => p.raw).join('\n') })
        : this.getOrderRouteRank({ products, modelName: primaryProduct.modelName, rawDescription: products.map(p => p.raw).join('\n') }),
      excelRank: (typeof InventoryParser !== 'undefined')
        ? InventoryParser.getOrderExcelRank({ sku, products, modelName: primaryProduct.modelName, rawNotes: fullNotesText, rawDescription: products.map(p => p.raw).join('\n') })
        : 999999,
      walkIndex: (typeof InventoryParser !== 'undefined')
        ? InventoryParser.getOrderExcelRank({ sku, products, modelName: primaryProduct.modelName, rawNotes: fullNotesText, rawDescription: products.map(p => p.raw).join('\n') })
        : 999999,
      city: city || 'مصر',
      products,
      isMultiProduct,
      isKids,
      isWomen,
      isOther,
      isMulti,
      isSingle,
      totalItemsCount: piecesCount,
      fullNormalizedDesc,
      hasRecognizedDescription: products.length > 0,
      modelName: primaryProduct.modelName,
      color: primaryProduct.color,
      colorCode: primaryProduct.colorCode,
      size: primaryProduct.size,
      sku,
      category,
      customerName: customerName || `عميل #${pageNumber}`,
      dept: this.getOrderDepartment({ products, modelName: primaryProduct.modelName, rawDescription: products.map(p => p.raw).join('\n') }),
      rawNotes: fullNotesText,
      rawDescription: products.map(p => p.raw).join('\n'),
      normalizedModel: primaryProduct.normalizedModel,
      normalizedColor: primaryProduct.normalizedColor,
      normalizedSize: primaryProduct.normalizedSize
    };
  },

  /**
   * Helper rank for sorting sizes logically
   */
  getSizeRank(sizeStr) {
    if (!sizeStr) return 999;
    const s = this.normalize(sizeStr);
    if (s.includes('اول') || s === '1' || s.includes('s')) return 1;
    if (s.includes('ثاني') || s === '2' || s.includes('m')) return 2;
    if (s.includes('ثالث') || s === '3' || s.includes('l')) return 3;
    if (s.includes('رابع') || s === '4' || s.includes('xl')) return 4;
    return 100;
  },

  /**
   * Category metadata
   */
  getCategoryMeta(cat) {
    switch (cat) {
      case 'kids':
        return { label: '🧸 أطفالي', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20' };
      case 'women':
        return { label: '👗 حريمي', badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20' };
      case 'multi':
        return { label: '🛍️ أوردر متعدد', badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20' };
      default:
        return { label: '📦 منتجات أخرى', badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20' };
    }
  }
};

if (typeof window !== 'undefined') {
  window.ArabicUtils = ArabicUtils;
  ArabicUtils.initCatalogFromStorage();
  window.WAREHOUSE_ROUTE_SEQUENCE = ArabicUtils.WAREHOUSE_ROUTE_SEQUENCE;
  window.getWarehouseRouteRank = ArabicUtils.getWarehouseRouteRank.bind(ArabicUtils);
  window.getOrderRouteRank = ArabicUtils.getOrderRouteRank.bind(ArabicUtils);
}
