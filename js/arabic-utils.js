/**
 * Bosta Shipping Label & Arabic Text Processing Utilities
 * High accuracy normalization, text extraction and line parser for Egyptian e-commerce / Bosta AWBs.
 */

const ArabicUtils = {
  /**
   * Normalizes Arabic text for sorting and matching
   * Strips tashkeel, tatweel, standardizes alef, yaa, taa marbuta
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Fix visual Arabic character runs if detected
    let str = this.fixVisualArabic(text);

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

    // Collapse whitespace
    str = str.replace(/\s+/g, ' ').trim().toLowerCase();

    return str;
  },

  /**
   * Reverses Arabic character runs inside words,
   * while keeping English text, numbers, punctuation, and (1 QTY) / (QTY 1) intact.
   * Example: "مقط تارياملا يلافطا - يريمشك / ثلاثلا (1 QTY)"
   *       -> "طقم الاميرات اطفالي - كشميري / الثالث (1 QTY)"
   * Example: "مقط - كشميري / الثالث (QTY 1) ba014e2"
   *       -> "طقم - كشميري / الثالث (QTY 1) ba014e2"
   */
  reverseArabicRuns(text) {
    if (!text || typeof text !== 'string') return '';

    // Unicode range covering all Arabic character blocks, tashkeel, presentation forms
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g;

    return text.replace(arabicRegex, (match) => {
      return match.split('').reverse().join('');
    });
  },

  /**
   * Alias for reverseArabicRuns
   */
  reverseArabicWords(text) {
    return this.reverseArabicRuns(text);
  },

  /**
   * Checks if an Arabic string or token appears to be in visual reverse order
   * Indicators:
   * - Words starting with Taa Marbuta 'ة' (impossible in natural Arabic, e.g. ةنحشلا, ةفيطق)
   * - Common reversed Bosta tokens (مقط, يلافطا, يريمشك, فصو, ةنحشلا, تاحولم, ثلاثلا, يناثلا, لوالا)
   */
  isReversedArabic(text) {
    if (!text || typeof text !== 'string') return false;

    // Check for impossible Arabic word start: Taa Marbuta at the beginning of a word
    if (/(?:^|\s)ة[\u0600-\u06FF]+/i.test(text)) {
      return true;
    }

    const reversedKeywords = [
      'ةنحشلا', 'فصو', 'تاحولم', 'مقط', 'يلافطا', 'يريمشك',
      'تارياملا', 'ثلاثلا', 'يناثلا', 'لوالا', 'دوسا', 'ضيبا', 'لسرملا'
    ];
    return reversedKeywords.some(kw => text.includes(kw));
  },

  /**
   * Automatically fixes visual Arabic reversal in any text,
   * preserving English and numbers completely intact.
   */
  fixVisualArabic(text, force = false) {
    if (!text || typeof text !== 'string') return '';
    if (force || this.isReversedArabic(text)) {
      return this.reverseArabicRuns(text);
    }
    return text;
  },

  /**
   * Fallback whole-string reversal
   */
  reverseString(str) {
    if (!str) return '';
    return str.split('').reverse().join('');
  },

  /**
   * Extracts SKU patterns from notes or description text.
   * Typical Bosta format: 2 letters, 3 digits, 2-4 alphanumeric (e.g., ba014e2, eb033x0, Ac055ca4)
   * Also captures general alphanumeric SKU formats (e.g., PRD-1234, ABC123X, etc.)
   */
  extractSKU(text) {
    if (!text) return '';

    // Primary Bosta/Warehouse pattern (e.g. ba014e2, eb033x0, Ac055ca4)
    const specificPattern = /\b([a-zA-Z]{2}\d{3}[a-zA-Z0-9]{2,4})\b/i;
    const matchSpecific = text.match(specificPattern);
    if (matchSpecific) {
      return matchSpecific[1].toUpperCase();
    }

    // Secondary pattern: standard SKU codes (e.g., SKU-12345, AB-123-CD, etc.)
    const generalPattern = /\b(SKU[:\s-]*([A-Za-z0-9_-]{4,15}))\b/i;
    const matchGeneral = text.match(generalPattern);
    if (matchGeneral) {
      return matchGeneral[2].toUpperCase();
    }

    // Fallback: standalone code like BA0123 or similar
    const fallbackPattern = /\b([a-zA-Z]{1,3}[0-9]{3,6}[a-zA-Z0-9]{1,3})\b/;
    const matchFallback = text.match(fallbackPattern);
    if (matchFallback) {
      return matchFallback[1].toUpperCase();
    }

    return '';
  },

  /**
   * Parse a single product string into structured components:
   * Example: "طقم الاميرات اطفالي - كشميري / الثالث (QTY 1)"
   * Example: "سجادة صلاة قطيفة مطبوعة - الأقصى (QTY 3)"
   * Example: "اسدال رقة حريمي - اسود / L x2"
   */
  parseProductLine(line) {
    if (!line) return null;
    
    // Automatically fix visual Arabic reversal for natural Arabic UI preview and matching
    let cleanLine = this.fixVisualArabic(line).trim();

    // Check for quantity (supports: "(QTY 1)", "(1 QTY)", "QTY: 2", "(1x)", "x 2", "(2 قطعة)")
    let qty = 1;
    const qtyMatch = cleanLine.match(/(?:\(?\s*(?:QTY[:\s]*(\d+)|(\d+)\s*QTY)\s*\)?)|(?:\(?\s*(\d+)\s*[xX]\s*\)?)|(?:[xX]\s*(\d+))|(?:\((\d+)\s*(?:قطعة|قطع)\))/i);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[4] || qtyMatch[5] || '1', 10);
      cleanLine = cleanLine.replace(qtyMatch[0], '').trim();
    }

    let modelName = '';
    let color = '';
    let size = '';

    // Structure: [Model Name] - [Color/Variant] / [Size]
    if (cleanLine.includes('-')) {
      const dashParts = cleanLine.split('-');
      modelName = dashParts[0].trim();
      const remainder = dashParts.slice(1).join('-').trim();

      if (remainder.includes('/')) {
        const slashParts = remainder.split('/');
        color = slashParts[0].trim();
        size = slashParts.slice(1).join('/').trim();
      } else {
        color = remainder;
      }
    } else if (cleanLine.includes('/')) {
      // Structure without dash: [Model Name] / [Size]
      const slashParts = cleanLine.split('/');
      modelName = slashParts[0].trim();
      size = slashParts.slice(1).join('/').trim();
    } else {
      modelName = cleanLine;
    }

    // Extract any embedded SKU if present inside product text
    const embeddedSKU = this.extractSKU(line);

    return {
      raw: line.trim(),
      modelName: modelName.trim(),
      color: color.trim(),
      size: size.trim(),
      qty: isNaN(qty) ? 1 : qty,
      sku: embeddedSKU,
      normalizedModel: this.normalizeText(modelName),
      normalizedColor: this.normalizeText(color),
      normalizedSize: this.normalizeText(size)
    };
  },

  /**
   * Returns a numerical rank for clothing sizes so they sort in true physical order:
   * الاول (1) -> الثاني (2) -> الثالث (3) -> الرابع (4) -> الخامس (5)
   * or XS -> S -> M -> L -> XL -> XXL -> 3XL
   */
  getSizeRank(normalizedSize) {
    if (!normalizedSize) return 999;
    const s = normalizedSize.trim().toLowerCase();

    // Arabic Ordinals
    if (s.includes('اول')) return 1;
    if (s.includes('ثان')) return 2;
    if (s.includes('ثالث')) return 3;
    if (s.includes('رابع')) return 4;
    if (s.includes('خامس')) return 5;
    if (s.includes('سادس')) return 6;
    if (s.includes('سابع')) return 7;
    if (s.includes('ثامن')) return 8;

    // Standard Apparel
    if (s === 'xs') return 10;
    if (s === 's') return 20;
    if (s === 'm') return 30;
    if (s === 'l') return 40;
    if (s === 'xl') return 50;
    if (s === 'xxl' || s === '2xl') return 60;
    if (s === 'xxxl' || s === '3xl') return 70;
    if (s === '4xl') return 80;
    if (s === '5xl') return 90;

    // Direct numbers (e.g. 1, 2, 3 or shoe sizes 38, 40)
    const num = parseInt(s, 10);
    if (!isNaN(num)) {
      return 100 + num;
    }

    return 500;
  },

  /**
   * Intelligently parses extracted text items from a Bosta label page.
   * Reconstructs text lines and extracts:
   * - Tracking Number
   * - Products under "وصف الشحنة"
   * - Notes under "ملاحظات"
   * - Customer/City info if present
   */
  parseBostaPage(lines, pageNumber) {
    let isInDescription = false;
    let isInNotes = false;
    const descriptionLines = [];
    const notesLines = [];
    let trackingNumber = '';
    let orderReference = '';
    let totalPieces = '';
    let city = '';

    // Standard Egyptian cities for detection
    const egyptianCities = [
      'القاهرة', 'الجيزة', 'الإسكندرية', 'الاسكندرية', 'القليوبية', 'الدقهلية',
      'الشرقية', 'المنوفية', 'الغربية', 'كفر الشيخ', 'البحيرة', 'دمياط',
      'بورسعيد', 'الإسماعيلية', 'الاسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء',
      'بني سويف', 'الفيوم', 'المنيا', 'أسيوط', 'اسيوط', 'سوهاج', 'قنا', 'الأقصر', 'الاقصر',
      'أسوان', 'اسوان', 'البحر الأحمر', 'البحر الاحمر', 'الوادي الجديد', 'مطروح'
    ];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // Handle visual Arabic reversal while keeping English, numbers, and (1 QTY) intact
      line = this.fixVisualArabic(line);
      const normalizedLine = this.normalizeText(line);

      // 1. Extract Total Pieces Count (e.g., [4 قطع], 1 قطعة, 4 Pieces, عطق 4)
      if (!totalPieces) {
        const piecesMatch = line.match(/(?:\[|\b)(\d+)\s*(?:قطع|قطعة|قطعه|عطق|ةعطق|Pieces?)(?:\]|\b)/i) ||
                            line.match(/(?:\[|\b)(?:قطع|قطعة|قطعه|عطق|ةعطق|Pieces?)\s*(\d+)(?:\]|\b)/i);
        if (piecesMatch) {
          totalPieces = `${piecesMatch[1]} قطع`;
        }
      }

      // 2. Extract Tracking Number (AWB)
      if (!trackingNumber) {
        const trackingMatch = line.match(/(?:Tracking(?:\s*Number)?|رقم الشحنة|رقم التتبع|AWB)[:\s]*([0-9]{7,15})/i) ||
                              line.match(/\b([0-9]{8,12})\b/);
        if (trackingMatch) {
          trackingNumber = trackingMatch[1];
        }
      }

      // 3. Extract Order Reference / Barcode Code (e.g. EXC-U5111-353, ORD-1234, REF-99)
      if (!orderReference) {
        const refMatch = line.match(/(?:Order\s*Ref(?:erence)?|مرجع الطلب|كود الشحنة|كود الطلب|Ref)[:\s]*([A-Za-z0-9_-]+)/i) ||
                         line.match(/\b([A-Z]{2,5}-[A-Z0-9]{3,10}-[0-9]{2,6})\b/i);
        if (refMatch) {
          orderReference = refMatch[1].trim();
        }
      }

      // 4. Extract Egyptian City
      if (!city) {
        for (const c of egyptianCities) {
          if (line.includes(c)) {
            city = c;
            break;
          }
        }
      }

      // 5. Strict Section Boundaries
      const isDescriptionHeader = (
        normalizedLine.includes('وصف الشحنه') ||
        normalizedLine.includes('وصف الطلب') ||
        normalizedLine.includes('محتويات الشحنه') ||
        normalizedLine.includes('وصف الطرد') ||
        (normalizedLine.includes('وصف') && (normalizedLine.includes('شحنه') || normalizedLine.includes('طلب'))) ||
        /^(?:وصف\s*الشحن[ةه]|Description)$/i.test(normalizedLine)
      );

      const isNotesHeader = (
        normalizedLine.includes('ملاحظات') ||
        normalizedLine.includes('تعليمات التوصيل') ||
        normalizedLine.includes('ملاحظات الشحنه') ||
        normalizedLine.includes('notes')
      );

      const isOtherBoundaryHeader = (
        normalizedLine.includes('بيانات المرسل') ||
        normalizedLine.includes('بيانات المستلم') ||
        normalizedLine.includes('المرسل اليه') ||
        normalizedLine.includes('المبلغ المطلوب') ||
        normalizedLine.includes('cod') ||
        normalizedLine.includes('توقيع المستلم') ||
        normalizedLine.includes('الباركود') ||
        normalizedLine.includes('order reference') ||
        normalizedLine.includes('tracking number') ||
        normalizedLine.includes('مرجع الطلب')
      );

      if (isDescriptionHeader) {
        isInDescription = true;
        isInNotes = false;
        // Check if description line has items directly after colon
        const parts = line.split(/[:：]/);
        if (parts.length > 1 && parts.slice(1).join(':').trim()) {
          descriptionLines.push(parts.slice(1).join(':').trim());
        }
        continue;
      }

      if (isNotesHeader) {
        isInDescription = false;
        isInNotes = true;
        const parts = line.split(/[:：]/);
        if (parts.length > 1 && parts.slice(1).join(':').trim()) {
          notesLines.push(parts.slice(1).join(':').trim());
        }
        continue;
      }

      if (isOtherBoundaryHeader && isInDescription) {
        isInDescription = false;
      }

      if (isInDescription) {
        // Discard hub codes (e.g. FM-OBOUR, EC-05), phone numbers, prices (e.g. 50 ج.م), and tracking labels
        if (/^(?:FM-|EC-|CAI-|ALX-|HUB-)[A-Z0-9-]+$/i.test(line)) continue;
        if (/\b(?:\d+\s*(?:ج\.م|EGP|LE|جنيه))\b/i.test(line)) continue;
        if (/^(?:\+20|0020|01)[0-9]{8,9}$/.test(line.replace(/[\s-]/g, ''))) continue;
        if (/Tracking|Order\s*Reference/i.test(line)) continue;
        if (normalizedLine.includes('الكميه') && normalizedLine.includes('الصنف')) continue;

        descriptionLines.push(line);
      } else if (isInNotes) {
        notesLines.push(line);
      }
    }

    // Parse product items using strict quantity pattern splitting
    const parsedProducts = [];
    for (const dLine of descriptionLines) {
      // Split lines that merge multiple products together using quantity marker e.g. (1 QTY) or (QTY 1)
      const splitRegex = /(.+?\((?:QTY[:\s]*\d+|\d+\s*QTY|[0-9]+\s*(?:قطع|قطعة)|[0-9]+x)\))/gi;
      let match;
      let matchedAny = false;
      while ((match = splitRegex.exec(dLine)) !== null) {
        matchedAny = true;
        const prod = this.parseProductLine(match[1].trim());
        if (prod && prod.modelName) parsedProducts.push(prod);
      }

      if (!matchedAny) {
        // Line without merged pattern
        const subLines = dLine.split(/[;,،\n]/).map(s => s.trim()).filter(Boolean);
        for (const sub of subLines) {
          const prod = this.parseProductLine(sub);
          if (prod && prod.modelName) {
            parsedProducts.push(prod);
          }
        }
      }
    }

    // Check notes for SKU
    const combinedNotes = notesLines.join(' ');
    let detectedSKU = this.extractSKU(combinedNotes);
    if (!detectedSKU && parsedProducts.length > 0) {
      for (const p of parsedProducts) {
        if (p.sku) {
          detectedSKU = p.sku;
          break;
        }
      }
    }
    if (!detectedSKU) {
      for (const line of lines) {
        const candidate = this.extractSKU(line);
        if (candidate) {
          detectedSKU = candidate;
          break;
        }
      }
    }

    // Determine Single vs Multi product order
    let isMultiProduct = false;
    let totalItemsCount = 0;

    if (parsedProducts.length === 0) {
      isMultiProduct = false;
      totalItemsCount = totalPieces ? parseInt(totalPieces, 10) : 0;
    } else if (parsedProducts.length === 1) {
      isMultiProduct = false;
      totalItemsCount = totalPieces ? parseInt(totalPieces, 10) : (parsedProducts[0].qty || 1);
    } else {
      const first = parsedProducts[0];
      const allIdentical = parsedProducts.every(p => 
        p.normalizedModel === first.normalizedModel &&
        p.normalizedColor === first.normalizedColor &&
        p.normalizedSize === first.normalizedSize
      );

      if (allIdentical) {
        isMultiProduct = false;
        totalItemsCount = totalPieces ? parseInt(totalPieces, 10) : parsedProducts.reduce((sum, p) => sum + (p.qty || 1), 0);
      } else {
        isMultiProduct = true;
        totalItemsCount = totalPieces ? parseInt(totalPieces, 10) : parsedProducts.reduce((sum, p) => sum + (p.qty || 1), 0);
      }
    }

    // Fallback totalPieces if not extracted from pill
    if (!totalPieces && totalItemsCount > 0) {
      totalPieces = `${totalItemsCount} قطع`;
    }

    // Primary product for sorting
    const primaryProduct = parsedProducts.length > 0 ? parsedProducts[0] : null;

    const parsedData = {
      originalPageNumber: pageNumber,
      trackingNumber: trackingNumber || `AWB-${pageNumber}`,
      orderReference: orderReference || trackingNumber || `AWB-${pageNumber}`,
      totalPieces: totalPieces || `${totalItemsCount} قطع`,
      city: city || 'غير محدد',
      rawDescription: descriptionLines.join(' | ') || (lines.slice(0, 5).join(' ') || 'بدون وصف'),
      rawNotes: combinedNotes || '',
      products: parsedProducts,
      primaryProduct: primaryProduct,
      modelName: primaryProduct ? primaryProduct.modelName : 'غير محدد',
      color: primaryProduct ? primaryProduct.color : '',
      size: primaryProduct ? primaryProduct.size : '',
      normalizedModel: primaryProduct ? primaryProduct.normalizedModel : 'zzzz_unknown',
      normalizedColor: primaryProduct ? primaryProduct.normalizedColor : 'zzzz',
      normalizedSize: primaryProduct ? primaryProduct.normalizedSize : 'zzzz',
      sku: detectedSKU || '',
      isMultiProduct: isMultiProduct,
      totalItemsCount: totalItemsCount,
      hasRecognizedDescription: parsedProducts.length > 0
    };

    // Auto assign category: kids, women, other, multi
    parsedData.category = this.categorizeOrder(parsedData);

    return parsedData;
  },

  /**
   * Categorizes an order based on product lines and descriptions:
   * - 'kids': أطفال / Kids
   * - 'women': حريمي / Women
   * - 'other': منتجات أخرى / Others (سجاد، إكسسوارات، غير مصنف)
   * - 'multi': أوردرات متعددة / Multi-item Orders
   */
  categorizeOrder(item) {
    if (!item) return 'other';

    if (item.isMultiProduct) {
      return 'multi';
    }

    const fullText = (
      (item.modelName || '') + ' ' +
      (item.rawDescription || '') + ' ' +
      (item.products ? item.products.map(p => (p.modelName || '') + ' ' + (p.raw || '')).join(' ') : '')
    );
    const normalized = this.normalizeText(fullText);

    // 1. Kids: اطفال, اطفالي, بيبي, ولادي, بناتي (and visual reverse forms)
    if (
      normalized.includes('اطفال') ||
      normalized.includes('اطفالي') ||
      normalized.includes('بيبي') ||
      normalized.includes('ولادي') ||
      normalized.includes('بناتي') ||
      fullText.includes('يلافطا') ||
      fullText.includes('لافطا')
    ) {
      return 'kids';
    }

    // 2. Women: حريمي, نسائي, سيدات, اسدال, عبايه
    if (
      normalized.includes('حريمي') ||
      normalized.includes('نسائي') ||
      normalized.includes('سيدات') ||
      normalized.includes('اسدال') ||
      normalized.includes('عبايه') ||
      fullText.includes('يميرح')
    ) {
      return 'women';
    }

    return 'other';
  },

  /**
   * Get metadata for a given category (label, badge styles)
   */
  getCategoryMeta(categoryId) {
    switch (categoryId) {
      case 'kids':
        return {
          id: 'kids',
          label: 'أطفال / Kids',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        };
      case 'women':
        return {
          id: 'women',
          label: 'حريمي / Women',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        };
      case 'multi':
        return {
          id: 'multi',
          label: 'أوردرات متعددة / Multi-item',
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        };
      case 'other':
      default:
        return {
          id: 'other',
          label: 'منتجات أخرى / Others',
          badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20'
        };
    }
  }
};

window.ArabicUtils = ArabicUtils;
