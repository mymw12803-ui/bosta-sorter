/**
 * Main Application Controller
 * Manages UI state, dropzones, sorting triggers, table rendering, filters, and PDF download.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    pdfFile: null,
    pdfArrayBuffer: null,
    inventoryFile: null,
    inventoryArrayBuffer: null,
    extractedPages: [],
    sortedPages: [],
    selectedStrategy: 'A',
    resizeEnabled: true,
    keepAspectRatio: true,
    widthMm: 75,
    heightMm: 125,
    activeFilter: 'all', // 'all', 'single', 'multi', 'unknown'
    searchQuery: '',
    currentPage: 1,
    pageSize: 50,
    currentFilteredPages: [],
    generatedPdfBlob: null,
    generatedPdfUrl: null,
    isProcessing: false
  };

  // DOM Elements
  const elements = {
    // Dropzones & Inputs
    pdfDropzone: document.getElementById('pdf-dropzone'),
    pdfInput: document.getElementById('pdf-input'),
    pdfFileInfo: document.getElementById('pdf-file-info'),
    pdfFileName: document.getElementById('pdf-file-name'),
    pdfFileSize: document.getElementById('pdf-file-size'),
    removePdfBtn: document.getElementById('remove-pdf-btn'),

    inventoryDropzone: document.getElementById('inventory-dropzone'),
    inventoryInput: document.getElementById('inventory-input'),
    inventoryFileInfo: document.getElementById('inventory-file-info'),
    inventoryFileName: document.getElementById('inventory-file-name'),
    inventoryFileSize: document.getElementById('inventory-file-size'),
    removeInventoryBtn: document.getElementById('remove-inventory-btn'),

    // Strategies
    strategyRadios: document.querySelectorAll('input[name="sorting-strategy"]'),
    reverseArabicCheckbox: document.getElementById('reverse-arabic-checkbox'),

    // Resize controls
    resizeCheckbox: document.getElementById('resize-checkbox'),
    resizeOptionsContainer: document.getElementById('resize-options-container'),
    aspectRatioToggle: document.getElementById('aspect-ratio-toggle'),
    widthInput: document.getElementById('width-input'),
    heightInput: document.getElementById('height-input'),

    // Action buttons
    processBtn: document.getElementById('process-btn'),
    demoBtn: document.getElementById('demo-btn'),
    resetBtn: document.getElementById('reset-btn'),

    // Progress
    progressSection: document.getElementById('progress-section'),
    progressBar: document.getElementById('progress-bar'),
    progressPercent: document.getElementById('progress-percent'),
    progressStatus: document.getElementById('progress-status'),

    // Results & Stats
    resultsSection: document.getElementById('results-section'),
    statTotalOrders: document.getElementById('stat-total-orders'),
    statSingleOrders: document.getElementById('stat-single-orders'),
    statMultiOrders: document.getElementById('stat-multi-orders'),
    statDetectedSkus: document.getElementById('stat-detected-skus'),
    statSinglePercent: document.getElementById('stat-single-percent'),
    statMultiPercent: document.getElementById('stat-multi-percent'),

    // Filter & Search
    searchInput: document.getElementById('table-search-input'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    resultsTableBody: document.getElementById('results-table-body'),
    showingCount: document.getElementById('showing-count'),
    totalCount: document.getElementById('total-count'),

    // Batch Export Buttons & Counts
    batchCountKids: document.getElementById('batch-count-kids'),
    batchCountWomen: document.getElementById('batch-count-women'),
    batchCountOther: document.getElementById('batch-count-other'),
    batchCountMulti: document.getElementById('batch-count-multi'),
    downloadKidsBtn: document.getElementById('download-kids-btn'),
    downloadWomenBtn: document.getElementById('download-women-btn'),
    downloadOtherBtn: document.getElementById('download-other-btn'),
    downloadMultiBtn: document.getElementById('download-multi-btn'),

    // Filter Export Button & Counts
    downloadFilteredBtn: document.getElementById('download-filtered-btn'),
    filteredDownloadCount: document.getElementById('filtered-download-count'),
    totalDownloadCount: document.getElementById('total-download-count'),

    // Download buttons
    downloadTopBtn: document.getElementById('download-top-btn'),
    downloadStickyBar: document.getElementById('download-sticky-bar'),
    downloadStickyBtn: document.getElementById('download-sticky-btn'),

    // Detail Modal
    detailModal: document.getElementById('detail-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalContent: document.getElementById('modal-content'),
    closeModalBtn: document.getElementById('close-modal-btn'),

    // Toast Notification
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
  };

  /**
   * Show Notification Toast
   */
  function showToast(message, type = 'info') {
    if (!elements.toast || !elements.toastMessage) return;
    elements.toastMessage.textContent = message;

    // Reset styles
    elements.toast.classList.remove('hidden', 'border-emerald-500', 'border-red-500', 'border-sky-500');
    if (type === 'success') {
      elements.toast.classList.add('border-emerald-500');
    } else if (type === 'error') {
      elements.toast.classList.add('border-red-500');
    } else {
      elements.toast.classList.add('border-sky-500');
    }

    elements.toast.classList.remove('translate-y-16', 'opacity-0');
    elements.toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
      elements.toast.classList.add('translate-y-16', 'opacity-0');
      elements.toast.classList.remove('translate-y-0', 'opacity-100');
      setTimeout(() => elements.toast.classList.add('hidden'), 300);
    }, 4000);
  }

  /**
   * Format file size in KB/MB
   */
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' بايت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ك.بايت';
    return (bytes / (1024 * 1024)).toFixed(2) + ' م.بايت';
  }

  /**
   * Setup Dropzone drag and drop handlers
   */
  function setupDropzone(dropzone, input, onFileSelect) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dropzone-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dropzone-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    });

    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#remove-pdf-btn') || e.target.closest('#remove-inventory-btn')) return;
      input.click();
    });

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        onFileSelect(e.target.files[0]);
      }
    });
  }

  /**
   * Handle PDF File Selection
   */
  async function handlePdfFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('يرجى اختيار ملف PDF لبوليصات شحن بوسطة صالح.', 'error');
      return;
    }

    state.pdfFile = file;
    state.pdfFileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    state.pdfArrayBuffer = arrayBuffer;

    elements.pdfFileName.textContent = file.name;
    elements.pdfFileSize.textContent = formatFileSize(file.size);
    elements.pdfFileInfo.classList.remove('hidden');
    elements.pdfDropzone.querySelector('.dropzone-prompt').classList.add('hidden');

    elements.processBtn.disabled = false;
    showToast(`تم تحميل ملف البوليصات: ${file.name}`, 'success');
  }

  /**
   * Handle Inventory File Selection
   */
  async function handleInventoryFile(file) {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      showToast('يرجى اختيار ملف إكسيل (.xlsx) أو ملف (.csv).', 'error');
      return;
    }

    state.inventoryFile = file;
    const arrayBuffer = await file.arrayBuffer();
    state.inventoryArrayBuffer = arrayBuffer;

    try {
      const res = await InventoryParser.parseFile(arrayBuffer);
      elements.inventoryFileName.textContent = file.name;
      elements.inventoryFileSize.textContent = `${formatFileSize(file.size)} (${res.totalItems} صنف، ${res.uniqueSkus} SKU)`;
      elements.inventoryFileInfo.classList.remove('hidden');
      elements.inventoryDropzone.querySelector('.dropzone-prompt').classList.add('hidden');

      showToast(`تم تحميل ملف المخزون بنجاح (${res.uniqueSkus} كود SKU).`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`خطأ في قراءة ملف المخزون: ${err.message}`, 'error');
    }
  }

  // Remove Handlers
  elements.removePdfBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.pdfFile = null;
    state.pdfArrayBuffer = null;
    elements.pdfInput.value = '';
    elements.pdfFileInfo.classList.add('hidden');
    elements.pdfDropzone.querySelector('.dropzone-prompt').classList.remove('hidden');
    elements.processBtn.disabled = true;
    hideResults();
  });

  elements.removeInventoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.inventoryFile = null;
    state.inventoryArrayBuffer = null;
    InventoryParser.reset();
    elements.inventoryInput.value = '';
    elements.inventoryFileInfo.classList.add('hidden');
    elements.inventoryDropzone.querySelector('.dropzone-prompt').classList.remove('hidden');
    showToast('تمت إزالة ملف المخزون.', 'info');
  });

  // Setup dropzones
  setupDropzone(elements.pdfDropzone, elements.pdfInput, handlePdfFile);
  setupDropzone(elements.inventoryDropzone, elements.inventoryInput, handleInventoryFile);

  // Strategy Selector change
  elements.strategyRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.selectedStrategy = e.target.value;
      if (state.extractedPages.length > 0) {
        reSortAndRender();
      }
    });
  });

  // Visual Arabic Reversal Toggle change
  if (elements.reverseArabicCheckbox) {
    elements.reverseArabicCheckbox.addEventListener('change', (e) => {
      state.autoFixVisualArabic = e.target.checked;
      showToast(
        e.target.checked
          ? 'تم تفعيل معالجة النصوص العربية المعكوسة تلقائياً.'
          : 'تم إيقاف معالجة النصوص المعكوسة.',
        'info'
      );
      if (state.extractedPages.length > 0) {
        reSortAndRender();
      }
    });
  }

  // Resize Checkbox change
  elements.resizeCheckbox.addEventListener('change', (e) => {
    state.resizeEnabled = e.target.checked;
    elements.resizeOptionsContainer.classList.toggle('opacity-40', !state.resizeEnabled);
    elements.resizeOptionsContainer.classList.toggle('pointer-events-none', !state.resizeEnabled);
  });

  // Aspect Ratio Toggle
  elements.aspectRatioToggle.addEventListener('change', (e) => {
    state.keepAspectRatio = e.target.checked;
  });

  // Width & Height inputs
  elements.widthInput.addEventListener('change', (e) => {
    state.widthMm = parseFloat(e.target.value) || 75;
  });
  elements.heightInput.addEventListener('change', (e) => {
    state.heightMm = parseFloat(e.target.value) || 125;
  });

  /**
   * Process & Extract PDF
   */
  async function processLabels() {
    if (!state.pdfArrayBuffer) {
      showToast('يرجى رفع ملف PDF أولاً.', 'error');
      return;
    }

    state.isProcessing = true;
    elements.processBtn.disabled = true;
    elements.progressSection.classList.remove('hidden');
    hideResults();

    try {
      // 1. Text Extraction
      const extracted = await PDFProcessor.extractPages(state.pdfArrayBuffer, (prog) => {
        elements.progressBar.style.width = `${prog.percent}%`;
        elements.progressPercent.textContent = `${prog.percent}%`;
        elements.progressStatus.textContent = `${prog.phase} (${prog.current} من ${prog.total})`;
      });

      state.extractedPages = extracted;

      // 2. Sorting
      reSortAndRender();

      elements.progressStatus.textContent = 'تم اكتمال الفرز والترتيب بنجاح!';
      elements.progressBar.style.width = '100%';
      elements.progressPercent.textContent = '100%';

      setTimeout(() => {
        elements.progressSection.classList.add('hidden');
      }, 600);

      showToast(`تم استخراج وفرز ${extracted.length} بوليصة شحن بنجاح!`, 'success');
      elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      elements.progressSection.classList.add('hidden');
      showToast(`حدث خطأ أثناء معالجة الملف: ${err.message}`, 'error');
    } finally {
      state.isProcessing = false;
      elements.processBtn.disabled = false;
    }
  }

  /**
   * Re-sorts pages based on current active strategy and re-renders table
   */
  function reSortAndRender() {
    if (!state.extractedPages || state.extractedPages.length === 0) return;

    state.sortedPages = PDFProcessor.sortPages(state.extractedPages, state.selectedStrategy);
    updateStatistics();
    renderTable();
    elements.resultsSection.classList.remove('hidden');
    elements.downloadStickyBar.classList.remove('hidden');
  }

  /**
   * Update Dashboard Statistics
   */
  function updateStatistics() {
    const total = state.sortedPages.length;
    const singleOrders = state.sortedPages.filter(p => !p.isMultiProduct && p.hasRecognizedDescription).length;
    const multiOrders = state.sortedPages.filter(p => p.isMultiProduct).length;
    const detectedSkus = state.sortedPages.filter(p => Boolean(p.sku)).length;

    elements.statTotalOrders.textContent = total;
    elements.statSingleOrders.textContent = singleOrders;
    elements.statMultiOrders.textContent = multiOrders;
    elements.statDetectedSkus.textContent = detectedSkus;

    const singlePercent = total > 0 ? Math.round((singleOrders / total) * 100) : 0;
    const multiPercent = total > 0 ? Math.round((multiOrders / total) * 100) : 0;

    elements.statSinglePercent.textContent = `${singlePercent}% من الشحنات`;
    elements.statMultiPercent.textContent = `${multiPercent}% من الشحنات`;

    // Batch Category Counters
    const countKids = state.sortedPages.filter(p => p.category === 'kids').length;
    const countWomen = state.sortedPages.filter(p => p.category === 'women').length;
    const countOther = state.sortedPages.filter(p => p.category === 'other').length;
    const countMulti = state.sortedPages.filter(p => p.category === 'multi').length;

    if (elements.batchCountKids) elements.batchCountKids.textContent = `${countKids} بوليصة`;
    if (elements.batchCountWomen) elements.batchCountWomen.textContent = `${countWomen} بوليصة`;
    if (elements.batchCountOther) elements.batchCountOther.textContent = `${countOther} بوليصة`;
    if (elements.batchCountMulti) elements.batchCountMulti.textContent = `${countMulti} بوليصة`;

    if (elements.downloadKidsBtn) elements.downloadKidsBtn.disabled = countKids === 0;
    if (elements.downloadWomenBtn) elements.downloadWomenBtn.disabled = countWomen === 0;
    if (elements.downloadOtherBtn) elements.downloadOtherBtn.disabled = countOther === 0;
    if (elements.downloadMultiBtn) elements.downloadMultiBtn.disabled = countMulti === 0;

    if (elements.totalDownloadCount) elements.totalDownloadCount.textContent = total;
  }

  /**
   * Render Preview Table with search and filter
   */
  function renderTable() {
    const query = ArabicUtils.normalizeText(state.searchQuery);
    
    const filtered = state.sortedPages.filter(item => {
      // Category & Tab Filter
      if (state.activeFilter === 'kids' && item.category !== 'kids') return false;
      if (state.activeFilter === 'women' && item.category !== 'women') return false;
      if (state.activeFilter === 'other' && item.category !== 'other') return false;
      if (state.activeFilter === 'multi' && item.category !== 'multi') return false;
      if (state.activeFilter === 'single' && (item.isMultiProduct || !item.hasRecognizedDescription)) return false;
      if (state.activeFilter === 'unknown' && item.hasRecognizedDescription) return false;

      // Quick Search Query (colors e.g. "اسود", "كشمير", keywords, SKU, tracking, city)
      if (query) {
        const matchesModel = item.normalizedModel.includes(query) || item.modelName.includes(query);
        const matchesColor = item.normalizedColor.includes(query) || item.color.includes(query);
        const matchesSize = item.normalizedSize.includes(query) || item.size.includes(query);
        const matchesSku = item.sku.toLowerCase().includes(query);
        const matchesTracking = item.trackingNumber.toLowerCase().includes(query);
        const matchesCity = item.city.includes(query);
        const matchesRaw = (item.rawDescription || '').toLowerCase().includes(query);

        return matchesModel || matchesColor || matchesSize || matchesSku || matchesTracking || matchesCity || matchesRaw;
      }

      return true;
    });

    state.currentFilteredPages = filtered;
    elements.showingCount.textContent = filtered.length;
    elements.totalCount.textContent = state.sortedPages.length;

    if (elements.filteredDownloadCount) {
      elements.filteredDownloadCount.textContent = filtered.length;
    }
    if (elements.downloadFilteredBtn) {
      elements.downloadFilteredBtn.disabled = filtered.length === 0;
    }

    elements.resultsTableBody.innerHTML = '';

    if (filtered.length === 0) {
      elements.resultsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="px-6 py-12 text-center text-slate-400">
            <svg class="w-12 h-12 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            لا توجد شحنات مطابقة للبحث أو الفلتر المختار
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors text-sm';

      // Category Badge
      const catMeta = ArabicUtils.getCategoryMeta(item.category);
      const categoryBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${catMeta.badgeClass}">${catMeta.label}</span>`;

      // Badge for Single vs Multi
      let orderTypeBadge = '';
      if (!item.hasRecognizedDescription) {
        orderTypeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">غير محدد</span>';
      } else if (item.isMultiProduct) {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">متعدد الأصناف (${item.products.length} موديلات)</span>`;
      } else {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">موديل مفرد (${item.totalItemsCount} ق)</span>`;
      }

      // SKU Badge
      const skuBadge = item.sku
        ? `<span class="font-mono text-xs px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-semibold">${item.sku}</span>`
        : `<span class="text-xs text-slate-500">-</span>`;

      // Color & Size display
      let variantDisplay = '';
      if (item.color || item.size) {
        variantDisplay = `
          <div class="flex items-center gap-1.5 flex-wrap">
            ${item.color ? `<span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-xs">${item.color}</span>` : ''}
            ${item.size ? `<span class="px-1.5 py-0.5 rounded bg-slate-700/80 text-amber-300 text-xs font-mono font-medium">${item.size}</span>` : ''}
          </div>
        `;
      } else {
        variantDisplay = `<span class="text-xs text-slate-500">-</span>`;
      }

      tr.innerHTML = `
        <td class="px-3 py-3 font-mono font-bold text-sky-400">
          #${item.newPageNumber}
        </td>
        <td class="px-3 py-3 font-mono text-slate-400">
          ${item.originalPageNumber}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          ${categoryBadge}
        </td>
        <td class="px-4 py-3">
          <div class="font-medium text-slate-100 flex items-center gap-2">
            <span>${item.modelName}</span>
          </div>
          <div class="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
            <span>${item.trackingNumber}</span>
            <span>•</span>
            <span class="text-slate-400">${item.city}</span>
          </div>
        </td>
        <td class="px-4 py-3">
          ${variantDisplay}
        </td>
        <td class="px-4 py-3">
          ${orderTypeBadge}
        </td>
        <td class="px-4 py-3">
          ${skuBadge}
        </td>
        <td class="px-3 py-3 text-center">
          <button class="view-detail-btn p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition" title="معاينة النص المستخرج من البوليصة" data-original-page="${item.originalPageNumber}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </td>
      `;

      fragment.appendChild(tr);
    });

    elements.resultsTableBody.appendChild(fragment);

    // Bind Detail Modal buttons
    elements.resultsTableBody.querySelectorAll('.view-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pageNum = parseInt(btn.dataset.originalPage, 10);
        const item = state.sortedPages.find(p => p.originalPageNumber === pageNum);
        if (item) showItemModal(item);
      });
    });
  }

  /**
   * Search Input Handler
   */
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTable();
  });

  /**
   * Filter Tabs Handler
   */
  elements.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.filterBtns.forEach(b => {
        b.classList.remove('bg-sky-500', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-400');
      });
      btn.classList.add('bg-sky-500', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-400');

      state.activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  /**
   * Detail Modal
   */
  function showItemModal(item) {
    elements.modalTitle.textContent = `تفاصيل البوليصة - صفحة ${item.originalPageNumber} (الترتيب الجديد: #${item.newPageNumber})`;
    
    let productsListHtml = '';
    if (item.products && item.products.length > 0) {
      productsListHtml = item.products.map((p, idx) => `
        <div class="p-3 bg-slate-800 rounded-lg border border-slate-700/60 mb-2">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-sky-400">صنف #${idx + 1}: ${p.modelName}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">الكمية: ${p.qty}</span>
          </div>
          <div class="text-xs text-slate-300 flex gap-4">
            <span>اللون: <b class="text-white">${p.color || 'غير محدد'}</b></span>
            <span>المقاس: <b class="text-white">${p.size || 'غير محدد'}</b></span>
            ${p.sku ? `<span>كود SKU: <b class="text-sky-300 font-mono">${p.sku}</b></span>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      productsListHtml = `<div class="p-3 bg-rose-500/10 text-rose-300 rounded border border-rose-500/20 text-xs">لم يتم التعرف على بنود المنتجات تلقائياً تحت بند "وصف الشحنة".</div>`;
    }

    elements.modalContent.innerHTML = `
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-400 mb-1">رقم التتبع (AWB)</div>
            <div class="font-mono font-bold text-white text-base">${item.trackingNumber}</div>
          </div>
          <div class="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-400 mb-1">المحافظة / المدينة</div>
            <div class="font-medium text-white">${item.city}</div>
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold text-slate-400 mb-2">الأصناف المستخرجة من وصف الشحنة:</div>
          ${productsListHtml}
        </div>

        <div>
          <div class="text-xs font-semibold text-slate-400 mb-1">محتوى ملاحظات الشحنة:</div>
          <div class="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-xs text-slate-300 font-mono">
            ${item.rawNotes || 'لا توجد ملاحظات مسجلة على هذه البوليصة.'}
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold text-slate-400 mb-1">النص الخام المستخرج من قسم الوصف:</div>
          <div class="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs text-slate-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
            ${item.rawDescription}
          </div>
        </div>
      </div>
    `;

    elements.detailModal.classList.remove('hidden');
  }

  elements.closeModalBtn.addEventListener('click', () => {
    elements.detailModal.classList.add('hidden');
  });

  elements.detailModal.addEventListener('click', (e) => {
    if (e.target === elements.detailModal) {
      elements.detailModal.classList.add('hidden');
    }
  });

  /**
   * Universal Batch & Filtered PDF Export Action
   * Resizes all pages to thermal dimensions (75x125mm) with zero data loss & intact vector barcodes
   */
  async function exportBatchPDF(pagesToExport, filenamePrefix) {
    if (!pagesToExport || pagesToExport.length === 0 || !state.pdfArrayBuffer) {
      showToast('لا توجد شحنات مطابقة لتصديرها كملف PDF.', 'error');
      return;
    }

    elements.downloadTopBtn.disabled = true;
    elements.downloadStickyBtn.disabled = true;
    if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = true;
    elements.progressSection.classList.remove('hidden');

    try {
      const generatedBytes = await PDFProcessor.generateSortedPDF(
        state.pdfArrayBuffer,
        pagesToExport,
        {
          resize: state.resizeEnabled,
          widthMm: state.widthMm,
          heightMm: state.heightMm,
          keepAspectRatio: state.keepAspectRatio
        },
        (prog) => {
          elements.progressBar.style.width = `${prog.percent}%`;
          elements.progressPercent.textContent = `${prog.percent}%`;
          elements.progressStatus.textContent = `${prog.phase} (${prog.current} من ${prog.total})`;
        }
      );

      // Create Blob and trigger download
      const blob = new Blob([generatedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const filename = `${filenamePrefix}_${pagesToExport.length}_Orders.pdf`;

      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setTimeout(() => URL.revokeObjectURL(url), 10000);

      // Confetti celebration if library is available
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.8 }
        });
      }

      showToast(`تم تنزيل ملف (${filenamePrefix}) بنجاح (${pagesToExport.length} بوليصة)!`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`فشل إنشاء ملف الـ PDF: ${err.message}`, 'error');
    } finally {
      elements.downloadTopBtn.disabled = false;
      elements.downloadStickyBtn.disabled = false;
      if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = false;
      setTimeout(() => elements.progressSection.classList.add('hidden'), 800);
    }
  }

  // Full Sorted PDF
  elements.downloadTopBtn.addEventListener('click', () => {
    exportBatchPDF(state.sortedPages, 'Bosta_All_Sorted_Thermal');
  });
  elements.downloadStickyBtn.addEventListener('click', () => {
    exportBatchPDF(state.sortedPages, 'Bosta_All_Sorted_Thermal');
  });

  // Category Batch Downloads
  if (elements.downloadKidsBtn) {
    elements.downloadKidsBtn.addEventListener('click', () => {
      const kids = state.sortedPages.filter(p => p.category === 'kids');
      exportBatchPDF(kids, 'Bosta_Kids_Orders_Only');
    });
  }

  if (elements.downloadWomenBtn) {
    elements.downloadWomenBtn.addEventListener('click', () => {
      const women = state.sortedPages.filter(p => p.category === 'women');
      exportBatchPDF(women, 'Bosta_Women_Orders_Only');
    });
  }

  if (elements.downloadOtherBtn) {
    elements.downloadOtherBtn.addEventListener('click', () => {
      const other = state.sortedPages.filter(p => p.category === 'other');
      exportBatchPDF(other, 'Bosta_Others_Orders_Only');
    });
  }

  if (elements.downloadMultiBtn) {
    elements.downloadMultiBtn.addEventListener('click', () => {
      const multi = state.sortedPages.filter(p => p.category === 'multi');
      exportBatchPDF(multi, 'Bosta_Multi_Orders_Only');
    });
  }

  // Filtered Search Results Download
  if (elements.downloadFilteredBtn) {
    elements.downloadFilteredBtn.addEventListener('click', () => {
      exportBatchPDF(state.currentFilteredPages, 'Bosta_Filtered_Search_Results');
    });
  }

  elements.processBtn.addEventListener('click', processLabels);

  /**
   * Demo Mode Trigger
   */
  elements.demoBtn.addEventListener('click', async () => {
    try {
      elements.demoBtn.disabled = true;
      showToast('جاري توليد ملف بوليصات تجريبي لـ بوسطة مع بيانات المخزون...', 'info');

      // 1. Generate Sample PDF
      const pdfBytes = await DemoGenerator.createSampleBostaPdfBytes();
      state.pdfArrayBuffer = pdfBytes.buffer;
      state.pdfFile = new File([pdfBytes], 'Sample_Bosta_Labels_Demo.pdf', { type: 'application/pdf' });

      elements.pdfFileName.textContent = 'Sample_Bosta_Labels_Demo.pdf';
      elements.pdfFileSize.textContent = formatFileSize(pdfBytes.length);
      elements.pdfFileInfo.classList.remove('hidden');
      elements.pdfDropzone.querySelector('.dropzone-prompt').classList.add('hidden');

      // 2. Generate Sample Inventory
      const excelBytes = DemoGenerator.createSampleInventoryBytes();
      state.inventoryArrayBuffer = excelBytes;
      state.inventoryFile = new File([excelBytes], 'warehouse_inventory_export.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const invRes = await InventoryParser.parseFile(excelBytes);
      elements.inventoryFileName.textContent = 'warehouse_inventory_export.xlsx';
      elements.inventoryFileSize.textContent = `${formatFileSize(excelBytes.byteLength)} (${invRes.totalItems} صنف، ${invRes.uniqueSkus} SKU)`;
      elements.inventoryFileInfo.classList.remove('hidden');
      elements.inventoryDropzone.querySelector('.dropzone-prompt').classList.add('hidden');

      elements.processBtn.disabled = false;
      showToast('تم تحميل البيانات التجريبية بنجاح! جاري المعالجة التلقائية...', 'success');

      // Auto trigger processing
      await processLabels();
    } catch (err) {
      console.error(err);
      showToast(`خطأ في تشغيل الوضع التجريبي: ${err.message}`, 'error');
    } finally {
      elements.demoBtn.disabled = false;
    }
  });

  /**
   * Reset All
   */
  elements.resetBtn.addEventListener('click', () => {
    state.pdfFile = null;
    state.pdfArrayBuffer = null;
    state.inventoryFile = null;
    state.inventoryArrayBuffer = null;
    state.extractedPages = [];
    state.sortedPages = [];
    InventoryParser.reset();

    elements.pdfInput.value = '';
    elements.inventoryInput.value = '';
    elements.pdfFileInfo.classList.add('hidden');
    elements.inventoryFileInfo.classList.add('hidden');
    elements.pdfDropzone.querySelector('.dropzone-prompt').classList.remove('hidden');
    elements.inventoryDropzone.querySelector('.dropzone-prompt').classList.remove('hidden');
    elements.processBtn.disabled = true;

    hideResults();
    showToast('تمت إعادة ضبط النموذج بنجاح.', 'info');
  });

  function hideResults() {
    elements.resultsSection.classList.add('hidden');
    elements.downloadStickyBar.classList.add('hidden');
  }
});
