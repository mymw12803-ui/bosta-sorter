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

  /**
   * Resets loaded inventory data
   */
  reset() {
    this.inventoryItems = [];
    this.skuMap.clear();
    this.normalizedLookup.clear();
    this.skuPriorityOrder.clear();
  },

  /**
   * Parse ArrayBuffer of Excel (.xlsx) or CSV file
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
        const item = {
          index: index++,
          title: String(title).trim(),
          color: String(option1).trim(),
          size: String(option2).trim(),
          sku: String(sku).trim().toUpperCase(),
          handle: String(handle).trim()
        };

        this.inventoryItems.push(item);

        if (item.sku) {
          this.skuMap.set(item.sku, item);
          this.skuPriorityOrder.set(item.sku, item.index);
        }

        // Build normalized keys for matching
        const normTitle = ArabicUtils.normalizeText(item.title);
        const normColor = ArabicUtils.normalizeText(item.color);
        const normSize = ArabicUtils.normalizeText(item.size);

        if (normTitle) {
          // Full combo: title + color + size
          const fullKey = `${normTitle}__${normColor}__${normSize}`;
          if (!this.normalizedLookup.has(fullKey)) {
            this.normalizedLookup.set(fullKey, item);
          }

          // Combo: title + color
          const titleColorKey = `${normTitle}__${normColor}`;
          if (!this.normalizedLookup.has(titleColorKey)) {
            this.normalizedLookup.set(titleColorKey, item);
          }

          // Just title
          if (!this.normalizedLookup.has(normTitle)) {
            this.normalizedLookup.set(normTitle, item);
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

    const normTitle = product.normalizedModel;
    const normColor = product.normalizedColor;
    const normSize = product.normalizedSize;

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
    if (this.skuPriorityOrder.has(upper)) {
      return this.skuPriorityOrder.get(upper);
    }
    return 999999;
  }
};

window.InventoryParser = InventoryParser;
