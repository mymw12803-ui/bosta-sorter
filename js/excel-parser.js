/**
 * Excel / CSV Inventory Parser using SheetJS
 * Parses warehouse inventory export files (Shopify, Salla, Zid, Custom)
 * Standard columns: Handle, Title, Option1 Value, Option2 Value, SKU
 */

const InventoryParser = {
  inventoryItems: [],
  skuMap: new Map(), // key -> item
  normalizedLookup: new Map(), // normalized key -> item
  skuPriorityOrder: new Map(), // sku -> index (0, 1, 2...) for custom inventory order
  skuOrderMap: new Map(), // Map 1 (by SKU): normalizeText(row['SKU']) -> rowIndex
  productOrderMap: new Map(), // Map 2 (by Title + Color + Size): compositeKey -> rowIndex
  spaceImmuneLookup: new Map(), // space-stripped title -> index

  /**
   * Resets loaded inventory data
   */
  reset() {
    this.inventoryItems = [];
    this.skuMap.clear();
    this.normalizedLookup.clear();
    this.skuPriorityOrder.clear();
    this.skuOrderMap.clear();
    this.productOrderMap.clear();
    this.spaceImmuneLookup.clear();
  },

  /**
   * Parse ArrayBuffer of Excel (.xlsx) or CSV file (e.g. inventory_export_1.csv)
   */
  async parseFile(arrayBuffer) {
    this.reset();
    if (typeof XLSX === 'undefined') {
      throw new Error('مكتبة SheetJS غير محملة. يرجى التحقق من اتصال الإنترنت.');
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('ملف الإكسيل فارغ ولا يحتوي على أوراق عمل.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      throw new Error('لم يتم العثور على أي صفوف أو بيانات داخل ملف المخزون.');
    }

    let index = 0;
    for (const row of rawRows) {
      // Find columns with flexible aliases
      const title = this.findFieldValue(row, ['Title', 'title', 'اسم المنتج', 'اسم الموديل', 'المنتج', 'Product Name']);
      const option1 = this.findFieldValue(row, ['Option1 Value', 'Option1', 'اللون', 'Color', 'Variant Color', 'option1_value']);
      const option2 = this.findFieldValue(row, ['Option2 Value', 'Option2', 'المقاس', 'Size', 'Variant Size', 'option2_value']);
      const sku = this.findFieldValue(row, ['SKU', 'sku', 'رمز المنتج', 'كود الصنف', 'Variant SKU', 'Sku']);
      const handle = this.findFieldValue(row, ['Handle', 'handle', 'المعرف']);

      if (title || sku) {
        const rowIndex = index++;
        const item = {
          index: rowIndex,
          rowIndex: rowIndex,
          title: String(title).trim(),
          color: String(option1).trim(),
          size: String(option2).trim(),
          sku: String(sku).trim().toUpperCase(),
          handle: String(handle).trim()
        };

        this.inventoryItems.push(item);

        // Map 1 (by SKU): skuOrderMap.set(normalizeText(row['SKU']), rowIndex)
        if (item.sku) {
          this.skuMap.set(item.sku, item);
          this.skuPriorityOrder.set(item.sku, rowIndex);

          const normSku = ArabicUtils.normalizeText(item.sku);
          if (!this.skuOrderMap.has(normSku)) {
            this.skuOrderMap.set(normSku, rowIndex);
          }
          if (!this.skuOrderMap.has(item.sku.toUpperCase())) {
            this.skuOrderMap.set(item.sku.toUpperCase(), rowIndex);
          }
        }

        // Map 2 (by Title + Color + Size):
        // compositeKey = normalizeArabic(row['Title'] + ' ' + (row['Option1 Value'] || '') + ' ' + (row['Option2 Value'] || ''))
        // productOrderMap.set(compositeKey, rowIndex)
        if (item.title) {
          const compositeKey = ArabicUtils.normalizeArabic(item.title + ' ' + (item.color || '') + ' ' + (item.size || ''));
          if (!this.productOrderMap.has(compositeKey)) {
            this.productOrderMap.set(compositeKey, rowIndex);
          }

          // Fallback composite: Title + Color
          const titleColorKey = ArabicUtils.normalizeArabic(item.title + ' ' + (item.color || ''));
          if (!this.productOrderMap.has(titleColorKey)) {
            this.productOrderMap.set(titleColorKey, rowIndex);
          }

          // Fallback: Title only
          const titleKey = ArabicUtils.normalizeArabic(item.title);
          if (!this.productOrderMap.has(titleKey)) {
            this.productOrderMap.set(titleKey, rowIndex);
          }
          if (!this.spaceImmuneLookup.has(titleKey)) {
            this.spaceImmuneLookup.set(titleKey, rowIndex);
          }

          // Normalized lookup for attribute matching
          const normTitle = ArabicUtils.normalizeText(item.title);
          const normColor = ArabicUtils.normalizeText(item.color);
          const normSize = ArabicUtils.normalizeText(item.size);

          if (normTitle) {
            const fullKey = `${normTitle}__${normColor}__${normSize}`;
            if (!this.normalizedLookup.has(fullKey)) {
              this.normalizedLookup.set(fullKey, item);
            }
            const tcKey = `${normTitle}__${normColor}`;
            if (!this.normalizedLookup.has(tcKey)) {
              this.normalizedLookup.set(tcKey, item);
            }
            if (!this.normalizedLookup.has(normTitle)) {
              this.normalizedLookup.set(normTitle, item);
            }
          }
        }
      }
    }

    return {
      totalItems: this.inventoryItems.length,
      uniqueSkus: this.skuMap.size
    };
  },

  /**
   * Helper to inspect row for matching column names
   */
  findFieldValue(row, possibleNames) {
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
   * Match parsed Bosta order item with inventory records to enrich SKU and priority
   */
  matchProduct(product) {
    if (!product || this.inventoryItems.length === 0) return null;

    const normTitle = product.normalizedModel || ArabicUtils.normalizeText(product.modelName);
    const normColor = product.normalizedColor || ArabicUtils.normalizeText(product.color);
    const normSize = product.normalizedSize || ArabicUtils.normalizeText(product.size);

    // 1. Try full match (title + color + size)
    const fullKey = `${normTitle}__${normColor}__${normSize}`;
    if (this.normalizedLookup.has(fullKey)) {
      return this.normalizedLookup.get(fullKey);
    }

    // 2. Try title + color match
    const titleColorKey = `${normTitle}__${normColor}`;
    if (this.normalizedLookup.has(titleColorKey)) {
      return this.normalizedLookup.get(titleColorKey);
    }

    // 3. Try partial title match
    for (const [key, item] of this.normalizedLookup.entries()) {
      if (normTitle && (key.includes(normTitle) || normTitle.includes(key))) {
        if (!normColor || item.color === product.color || ArabicUtils.normalizeText(item.color) === normColor) {
          return item;
        }
      }
    }

    return null;
  },

  /**
   * Get priority index for SKU based on inventory file sequence
   */
  getSKUPriority(sku) {
    if (!sku) return 999999;
    const upper = sku.toUpperCase();
    if (this.skuOrderMap.has(upper)) {
      return this.skuOrderMap.get(upper);
    }
    const norm = ArabicUtils.normalizeText(sku);
    if (this.skuOrderMap.has(norm)) {
      return this.skuOrderMap.get(norm);
    }
    return 999999;
  },

  /**
   * Retrieves picking walk sequence priority rowIndex for an order or product
   * 1. Check if the order has a matching SKU code in the notes/description and look up its rowIndex
   * 2. If no SKU is found, match product title, color, and size against productOrderMap
   * 3. Return matched rowIndex ascending so items appear in exact warehouse CSV order
   */
  getWalkIndex(orderOrProduct) {
    if (!orderOrProduct) return 999999;
    if (this.inventoryItems.length === 0 && this.skuOrderMap.size === 0) return 999999;

    // 1. First check if order has an explicit SKU or SKU in notes/description:
    if (orderOrProduct.sku) {
      const prio = this.getSKUPriority(orderOrProduct.sku);
      if (prio !== 999999) return prio;
    }

    // Scan notes and description for embedded SKU codes (e.g. ba014e2, Ac055ca4, fa099k1)
    const notesAndDesc = `${orderOrProduct.rawNotes || ''} ${orderOrProduct.rawDescription || ''}`;
    if (notesAndDesc) {
      const tokens = notesAndDesc.match(/[a-zA-Z0-9_-]{5,15}/g);
      if (tokens) {
        for (const token of tokens) {
          const prio = this.getSKUPriority(token);
          if (prio !== 999999) return prio;
        }
      }
    }

    // If multi-product order, evaluate each product's SKU
    if (Array.isArray(orderOrProduct.products) && orderOrProduct.products.length > 0) {
      let minSkuIdx = 999999;
      for (const p of orderOrProduct.products) {
        if (p.sku) {
          const prio = this.getSKUPriority(p.sku);
          if (prio !== 999999) minSkuIdx = Math.min(minSkuIdx, prio);
        }
      }
      if (minSkuIdx !== 999999) return minSkuIdx;
    }

    // 2. If no SKU is found, match order's product title, color, and size against productOrderMap:
    const primaryProd = (Array.isArray(orderOrProduct.products) && orderOrProduct.products[0]) ? orderOrProduct.products[0] : null;
    const model = orderOrProduct.modelName || (primaryProd ? primaryProd.modelName : '') || orderOrProduct.title || '';
    const color = orderOrProduct.color || (primaryProd ? primaryProd.color : '') || '';
    const size = orderOrProduct.size || (primaryProd ? primaryProd.size : '') || '';

    // A) Exact composite: Title + Color + Size
    const fullComposite = ArabicUtils.normalizeArabic(`${model} ${color} ${size}`);
    if (fullComposite && this.productOrderMap.has(fullComposite)) {
      return this.productOrderMap.get(fullComposite);
    }

    // B) Secondary: Title + Color
    const titleColor = ArabicUtils.normalizeArabic(`${model} ${color}`);
    if (titleColor && this.productOrderMap.has(titleColor)) {
      return this.productOrderMap.get(titleColor);
    }

    // C) Tertiary: Title only
    const titleOnly = ArabicUtils.normalizeArabic(model);
    if (titleOnly && this.productOrderMap.has(titleOnly)) {
      return this.productOrderMap.get(titleOnly);
    }

    // D) Evaluate each item in products array
    if (Array.isArray(orderOrProduct.products) && orderOrProduct.products.length > 0) {
      let minProdIdx = 999999;
      for (const p of orderOrProduct.products) {
        const pComposite = ArabicUtils.normalizeArabic(`${p.modelName} ${p.color || ''} ${p.size || ''}`);
        if (this.productOrderMap.has(pComposite)) {
          minProdIdx = Math.min(minProdIdx, this.productOrderMap.get(pComposite));
          continue;
        }
        const pTC = ArabicUtils.normalizeArabic(`${p.modelName} ${p.color || ''}`);
        if (this.productOrderMap.has(pTC)) {
          minProdIdx = Math.min(minProdIdx, this.productOrderMap.get(pTC));
          continue;
        }
        const pT = ArabicUtils.normalizeArabic(p.modelName);
        if (this.productOrderMap.has(pT)) {
          minProdIdx = Math.min(minProdIdx, this.productOrderMap.get(pT));
        }
      }
      if (minProdIdx !== 999999) return minProdIdx;
    }

    // E) Substring matching fallback against productOrderMap
    if (titleOnly) {
      for (const [key, idx] of this.productOrderMap.entries()) {
        if (key && (key.includes(titleOnly) || titleOnly.includes(key))) {
          return idx;
        }
      }
    }

    return 999999;
  }
};

window.InventoryParser = InventoryParser;
