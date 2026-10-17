/**
 * Demo Data Generator
 * Creates realistic Bosta multi-page shipping labels PDF and inventory Excel sheet
 * for instant 1-click preview and testing without needing real files.
 */

const DemoGenerator = {
  sampleOrders: [
    {
      page: 1,
      awb: '24891021',
      customer: 'منى السيد',
      city: 'القاهرة',
      items: ['سجادة صلاة قطيفة مطبوعة - الأقصى (QTY 3)'],
      notes: 'Ac055ca4 الاتصال قبل الموعد',
      cod: '390 EGP'
    },
    {
      page: 2,
      awb: '24891022',
      customer: 'أحمد محمود',
      city: 'الجيزة',
      items: ['طقم الاميرات اطفالي - كشميري / الثالث (QTY 1)'],
      notes: 'ba014e2 برجاء عدم الرن على الجرس',
      cod: '250 EGP'
    },
    {
      page: 3,
      awb: '24891023',
      customer: 'نور الدين علي',
      city: 'الإسكندرية',
      items: [
        'طقم صلاة حريمي سادة - زيتي / M (QTY 1)',
        'اسدال رقة حريمي - اسود / L (QTY 1)'
      ],
      notes: 'eb033x0 طلب مجمع قطعتين مختلفين',
      cod: '680 EGP'
    },
    {
      page: 4,
      awb: '24891024',
      customer: 'سارة إبراهيم',
      city: 'القليوبية',
      items: ['طقم الاميرات اطفالي - كشميري / الثاني (QTY 1)'],
      notes: 'ba014e2 توصيل بعد الظهر',
      cod: '250 EGP'
    },
    {
      page: 5,
      awb: '24891025',
      customer: 'ياسمين حسن',
      city: 'المنصورة',
      items: ['اسدال رقة حريمي - كحلي / L (QTY 2)'],
      notes: 'fa099k1 تسليم أمانات عند البواب',
      cod: '520 EGP'
    },
    {
      page: 6,
      awb: '24891026',
      customer: 'محمود كمال',
      city: 'طنطا',
      items: ['طقم الاميرات اطفالي - اسود / الأول (QTY 1)'],
      notes: 'ba014e1 شقة 4 الدور الثاني',
      cod: '250 EGP'
    },
    {
      page: 7,
      awb: '24891027',
      customer: 'ريهام سمير',
      city: 'السويس',
      items: [
        'سجادة صلاة قطيفة مطبوعة - مكة (QTY 1)',
        'طقم صلاة حريمي سادة - كشمير / L (QTY 1)'
      ],
      notes: 'طلب متعدد هدايا لعيد الأم',
      cod: '580 EGP'
    },
    {
      page: 8,
      awb: '24891028',
      customer: 'خالد عبد الله',
      city: 'بني سويف',
      items: ['اسدال رقة حريمي - اسود / XL (QTY 1)'],
      notes: 'fa099k2 دفع كاش بالكامل',
      cod: '260 EGP'
    }
  ],

  sampleInventory: [
    { Handle: 'princess-set-kids', Title: 'طقم الاميرات اطفالي', 'Option1 Value': 'كشميري', 'Option2 Value': 'الأول', SKU: 'ba014e0' },
    { Handle: 'princess-set-kids', Title: 'طقم الاميرات اطفالي', 'Option1 Value': 'كشميري', 'Option2 Value': 'الثاني', SKU: 'ba014e1' },
    { Handle: 'princess-set-kids', Title: 'طقم الاميرات اطفالي', 'Option1 Value': 'كشميري', 'Option2 Value': 'الثالث', SKU: 'ba014e2' },
    { Handle: 'princess-set-kids', Title: 'طقم الاميرات اطفالي', 'Option1 Value': 'اسود', 'Option2 Value': 'الأول', SKU: 'ba014e3' },
    { Handle: 'prayer-rug-printed', Title: 'سجادة صلاة قطيفة مطبوعة', 'Option1 Value': 'الأقصى', 'Option2 Value': 'قياسي', SKU: 'Ac055ca4' },
    { Handle: 'prayer-rug-printed', Title: 'سجادة صلاة قطيفة مطبوعة', 'Option1 Value': 'مكة', 'Option2 Value': 'قياسي', SKU: 'Ac055ca5' },
    { Handle: 'women-isdal-raqqa', Title: 'اسدال رقة حريمي', 'Option1 Value': 'كحلي', 'Option2 Value': 'L', SKU: 'fa099k1' },
    { Handle: 'women-isdal-raqqa', Title: 'اسدال رقة حريمي', 'Option1 Value': 'اسود', 'Option2 Value': 'L', SKU: 'fa099k2' },
    { Handle: 'women-isdal-raqqa', Title: 'اسدال رقة حريمي', 'Option1 Value': 'اسود', 'Option2 Value': 'XL', SKU: 'fa099k3' },
    { Handle: 'women-prayer-set-plain', Title: 'طقم صلاة حريمي سادة', 'Option1 Value': 'زيتي', 'Option2 Value': 'M', SKU: 'eb033x0' },
    { Handle: 'women-prayer-set-plain', Title: 'طقم صلاة حريمي سادة', 'Option1 Value': 'كشمير', 'Option2 Value': 'L', SKU: 'eb033x1' }
  ],

  /**
   * Generates a realistic multi-page PDF using pdf-lib
   */
  async createSampleBostaPdfBytes() {
    if (typeof PDFLib === 'undefined') {
      throw new Error('مكتبة pdf-lib غير محملة');
    }

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await doc.embedFont(StandardFonts.Helvetica);

    // Standard A4 or thermal dimensions
    const width = 288; // ~101 mm (common AWB size)
    const height = 432; // ~152 mm

    for (const order of this.sampleOrders) {
      const page = doc.addPage([width, height]);

      // Outer border
      page.drawRectangle({
        x: 10,
        y: 10,
        width: width - 20,
        height: height - 20,
        borderWidth: 1.5,
        borderColor: rgb(0.15, 0.2, 0.3),
        color: rgb(1, 1, 1)
      });

      // Header Banner (BOSTA style)
      page.drawRectangle({
        x: 10,
        y: height - 60,
        width: width - 20,
        height: 50,
        color: rgb(0.88, 0.18, 0.22) // Bosta Red
      });

      page.drawText('BOSTA SHIPPING', {
        x: 24,
        y: height - 38,
        size: 16,
        font: font,
        color: rgb(1, 1, 1)
      });

      page.drawText(`AWB: ${order.awb}`, {
        x: 24,
        y: height - 52,
        size: 10,
        font: regularFont,
        color: rgb(1, 1, 1)
      });

      // Simulated Barcode graphic
      for (let b = 0; b < 32; b++) {
        const barW = (b % 3 === 0) ? 3 : ((b % 5 === 0) ? 4 : 1.5);
        page.drawRectangle({
          x: 24 + (b * 7),
          y: height - 110,
          width: barW,
          height: 35,
          color: rgb(0.1, 0.1, 0.1)
        });
      }

      page.drawText(`*${order.awb}*`, {
        x: 100,
        y: height - 122,
        size: 9,
        font: regularFont,
        color: rgb(0.2, 0.2, 0.2)
      });

      // Divider
      page.drawLine({
        start: { x: 15, y: height - 130 },
        end: { x: width - 15, y: height - 130 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8)
      });

      // Customer section
      const safeCustomer = (order.customer || '').replace(/[^\x00-\x7F]/g, '').trim() || `Customer #${order.page}`;
      const safeCity = (order.city || '').replace(/[^\x00-\x7F]/g, '').trim() || 'Cairo / Egypt';
      page.drawText(`Customer: ${safeCustomer}`, { x: 20, y: height - 148, size: 9, font: font, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(`City: ${safeCity}`, { x: 20, y: height - 162, size: 9, font: regularFont, color: rgb(0.1, 0.1, 0.1) });

      // Description section header
      page.drawRectangle({
        x: 15,
        y: height - 190,
        width: width - 30,
        height: 18,
        color: rgb(0.94, 0.96, 0.98)
      });
      page.drawText(`Shipping Description / Wasf El-Shehna:`, { x: 22, y: height - 178, size: 8, font: font, color: rgb(0.1, 0.1, 0.1) });

      // Product lines
      let itemY = height - 204;
      for (let idx = 0; idx < order.items.length; idx++) {
        const itemText = order.items[idx];
        const safeItemText = itemText.replace(/[^\x00-\x7F]/g, '').trim() || `SKU Item #${idx + 1} (QTY 1)`;
        page.drawText(safeItemText, {
          x: 22,
          y: itemY,
          size: 8,
          font: regularFont,
          color: rgb(0.15, 0.15, 0.15)
        });
        itemY -= 14;
      }

      // Notes section header
      const notesY = Math.min(itemY - 10, height - 265);
      page.drawRectangle({
        x: 15,
        y: notesY,
        width: width - 30,
        height: 18,
        color: rgb(0.94, 0.96, 0.98)
      });
      page.drawText(`Notes / Molahezat:`, { x: 22, y: notesY + 5, size: 8, font: font, color: rgb(0.1, 0.1, 0.1) });

      const safeNotes = order.notes.replace(/[^\x00-\x7F]/g, '').trim() || 'Standard Delivery';
      page.drawText(safeNotes, {
        x: 22,
        y: notesY - 14,
        size: 8,
        font: regularFont,
        color: rgb(0.2, 0.2, 0.2)
      });

      // COD Box
      page.drawRectangle({
        x: 15,
        y: 25,
        width: width - 30,
        height: 38,
        borderWidth: 1,
        borderColor: rgb(0.8, 0.8, 0.8),
        color: rgb(0.97, 0.98, 0.99)
      });

      page.drawText('C.O.D. Amount:', { x: 25, y: 46, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(order.cod, { x: 25, y: 32, size: 12, font: font, color: rgb(0.85, 0.15, 0.15) });
      page.drawText(`Page ${order.page} of ${this.sampleOrders.length}`, { x: width - 85, y: 32, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5) });
    }

    return await doc.save();
  },

  /**
   * Generates sample Excel sheet as ArrayBuffer using SheetJS
   */
  createSampleInventoryBytes() {
    if (typeof XLSX === 'undefined') {
      throw new Error('مكتبة SheetJS غير محملة');
    }

    const worksheet = XLSX.utils.json_to_sheet(this.sampleInventory);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    const excelBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return excelBytes;
  }
};

window.DemoGenerator = DemoGenerator;
