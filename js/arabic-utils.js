/**
 * Bosta Shipping Label & Arabic Text Processing Utilities
 * - Rubik Font CMap Null-Byte Recovery (via pako decompress & patch)
 * - Built-in Warehouse Master Catalog & Smart Fuzzy/Skeleton Matcher
 * - Strict Coordinate & Pattern Line Extraction for Bosta Labels (bbox 212.63 x 354.25 pt)
 */

const ArabicUtils = {
  // Built-in Warehouse Master Catalog (55 official products from Shopify inventory)
  WAREHOUSE_TITLES: [
    "اسدال رقة اطفالي", "اسدال رقة حريمي", "اسدال مشجر اطفالي", "جيبة بطانة",
    "خمار مشجر بأكمام", "ملحفة صلاة مشجرة", "ملحفه جيب وتر بروف", "توتي باج",
    "اسدال بخمار أطفالي مشجر", "اسدال زهرة", "طقم صلاه فسكوز حريمي", "اسدال عباية",
    "خمار بدون اكمام سادة", "سجادة صلاة اطفالي صغيرة", "خمار بيليسيه اطفالي",
    "خمار بيليسيه حريمي", "اسدال بخمار حريمي مشجر", "خمار مشجر بدون اكمام",
    "اسدال مشجر", "جيبه صلاه فيسكوز", "خمار زبدة", "سجادة الهدي قطيفة",
    "اسدال فراشة", "اسدال بكشكشة", "ملحفه صلاه سادة", "اسدال فسكوز مشجر",
    "سجادة صلاة قطيفة مطبوعة", "سجادة صلاة اطفالي قطيفة", "اسدال بجيوب حريمي",
    "اسدال شريطه", "اسدال جوبير حريمي", "اسدال بنس حريمي", "اسدال بخمار حريمي سادة",
    "اسدال وقار سادة", "خمار بأكمام سادة", "جيبه صلاه ليكرا", "سجادة جيب",
    "طقم جيب وتر بروف", "جيبة صلاة وتر بروف", "طقم صلاه حريمي سادة",
    "طقم الاميرات حريمي", "طقم صلاه حريمي مشجر", "اسدال تلبيسه حريمي",
    "اسدال بخمار أطفالي", "اسدال مطرز", "اسدال بنس اطفالي", "طقم الاميرات اطفالي",
    "طقم صلاه اطفالي ساده", "طقم صلاه اطفالي مشجر", "طقم صلاه اطفالي فراشات",
    "اسدال جوبير اطفالي", "شنطة تهادوا تحابوا", "طقم صلاه حريمي قطعتين لون كشميري فراشات",
    "اسدال بجيوب اطفالي", "اسدال تلبيسه اطفالي"
  ],

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
    { start: 0x0175, end: 0x017F, unicode: '0643' }, // ك
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
   * Collapse spaced single Arabic letters like "ا س د ا ل ب ج ي و ب" -> "اسدال بجيوب"
   */
  reconstructArabicWords(rawLine) {
    if (!rawLine) return '';
    let line = rawLine.replace(/[\u0000\x00]/g, '').trim();
    // Collapse consecutive single Arabic letters separated by spaces: "ا س د ا ل" -> "اسدال"
    return line.replace(/(?<=[\u0600-\u06FF])\s+(?=[\u0600-\u06FF])/g, '');
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
   * Space-Immune & Skeleton Matcher for Warehouse Master Catalog
   * 1. Space-stripped comparison against WAREHOUSE_TITLES (sorted longest-first)
   * 2. Skeleton matching with wildcard handling for degraded Rubik font null-bytes
   */
  matchWarehouseModel(extractedModel) {
    if (!extractedModel) return '';

    const normSegment = this.normalizeArabic(extractedModel);
    if (!normSegment) return '';

    // Sort WAREHOUSE_TITLES longest-first so compound titles match first
    const sortedTitles = [...this.WAREHOUSE_TITLES].sort(
      (a, b) => this.normalizeArabic(b).length - this.normalizeArabic(a).length
    );

    // 1. Longest title where normalizeArabic(title) is contained in normSegment (or vice versa)
    for (const title of sortedTitles) {
      const normTitle = this.normalizeArabic(title);
      if (normTitle && (normSegment.includes(normTitle) || normTitle.includes(normSegment))) {
        return title;
      }
    }

    // 2. Word-level skeleton matcher (handles missing glyphs / null-bytes \x00)
    const cleanRaw = extractedModel.replace(/[\x00\u0000]/g, '?').trim();
    const extWords = cleanRaw.split(/\s+/).filter(Boolean);
    let bestCandidate = this.reconstructArabicWords(extractedModel);
    let highestScore = -1;

    for (const candidate of this.WAREHOUSE_TITLES) {
      const candWords = candidate.split(/\s+/).filter(Boolean);
      if (Math.abs(candWords.length - extWords.length) > 1) continue;

      let score = 0;
      const minWords = Math.min(candWords.length, extWords.length);

      for (let w = 0; w < minWords; w++) {
        const eW = this.normalizeArabic(extWords[w]);
        const cW = this.normalizeArabic(candWords[w]);

        if (eW === cW) {
          score += 10;
        } else {
          let matches = 0;
          let wildcards = 0;
          let diffs = 0;
          const minL = Math.min(eW.length, cW.length);

          if (Math.abs(eW.length - cW.length) <= 1) {
            for (let k = 0; k < minL; k++) {
              if (eW[k] === '?') wildcards++;
              else if (eW[k] === cW[k]) matches++;
              else diffs++;
            }
            if (diffs === 0 && (matches > 0 || wildcards > 0)) {
              score += (matches * 2) + wildcards;
            }
          }
        }
      }

      if (score > highestScore && score >= 6) {
        highestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
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

    if (norm === '1' || norm.includes('الاول')) return 'الأول';
    if (norm === '2' || norm.includes('الثاني')) return 'الثاني';
    if (norm === '3' || norm.includes('الثالث')) return 'الثالث';
    if (norm === '4' || norm.includes('الرابع')) return 'الرابع';

    const knownSizes = ["الأول", "الثاني", "الثالث", "الرابع", "XXL", "XL", "L", "M", "S"];
    for (const s of knownSizes) {
      const normS = this.normalizeArabic(s);
      if (normS === norm || norm.includes(normS)) {
        return s;
      }
    }

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

    // Remove QTY from line
    let clean = line.replace(/\(?(?:(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)[:\s]*\d+|\d+\s*(?:Q\s*T\s*Y|Y\s*T\s*Q|QTY)|[0-9]+\s*x)\)?/gi, '')
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
    }

    // Reconstruct clean official model, color, and size
    const modelName = this.matchWarehouseModel(rawModel);
    const { color, code: colorCode } = this.parseColorAndCode(rawColor);
    const size = this.parseSize(rawSize);

    // Reconstruct clean product line text with proper spaces:
    // e.g. "اسدال بجيوب حريمي - كحلي / الاول (1 QTY)"
    const formattedParts = [modelName];
    if (color) formattedParts.push(`- ${color}${colorCode ? ` (${colorCode})` : ''}`);
    if (size) formattedParts.push(`/ ${size}`);
    formattedParts.push(`(${qty} QTY)`);
    const formattedLineText = formattedParts.join(' ');

    return {
      modelName,
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
  parseBostaPage(lines, pageNumber) {
    const products = [];
    let trackingNumber = '';
    let orderReference = '';
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
        products.push(parsedProduct);
        lastProductIndex = i;
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
    const skuMatch = fullNotesText.match(/\b([a-zA-Z]{2}\d{3}[a-zA-Z0-9]{2,3})\b/i);
    if (skuMatch) {
      sku = skuMatch[1].toUpperCase();
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
      totalPieces,
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
}
