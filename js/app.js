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

    // Theme toggle
    themeToggleBtn: document.getElementById('theme-toggle-btn'),

    // Single-Page PDF Quick Preview & Detail Modal
    detailModal: document.getElementById('detail-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalContent: document.getElementById('modal-content'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalPdfCanvas: document.getElementById('modal-pdf-canvas'),
    modalCanvasLoading: document.getElementById('modal-canvas-loading'),
    modalPrintSingleBtn: document.getElementById('modal-print-single-btn'),

    // Technical Error Modal
    errorModal: document.getElementById('error-modal'),
    errorModalMessage: document.getElementById('error-modal-message'),
    closeErrorModalBtn: document.getElementById('close-error-modal-btn'),

    // Toast Notification
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
  };

  /**
   * Initialize Theme (Light / Dark mode)
   */
  const savedTheme = localStorage.getItem('bosta_sorter_theme') || 'dark';
  applyTheme(savedTheme);

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('bosta_sorter_theme', theme);
  }

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      const newTheme = isDark ? 'light' : 'dark';
      applyTheme(newTheme);
      showToast(newTheme === 'light' ? 'تم تفعيل الوضع الفاتح عالي التباين للمستودع.' : 'تم تفعيل الوضع الداكن.', 'info');
    });
  }

  /**
   * Technical Error Modal Display
   */
  function showErrorModal(message) {
    if (elements.errorModal && elements.errorModalMessage) {
      elements.errorModalMessage.textContent = message;
      elements.errorModal.classList.remove('hidden');
    } else {
      showToast(message, 'error');
    }
  }

  if (elements.closeErrorModalBtn) {
    elements.closeErrorModalBtn.addEventListener('click', () => {
      elements.errorModal.classList.add('hidden');
    });
  }
  if (elements.errorModal) {
    elements.errorModal.addEventListener('click', (e) => {
      if (e.target === elements.errorModal) {
        elements.errorModal.classList.add('hidden');
      }
    });
  }

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
    // Keep a safe clone of ArrayBuffer so worker operations never detach or neuter it
    state.pdfArrayBuffer = arrayBuffer.slice(0);

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
      // 1. Text Extraction using safely cloned buffer
      const safeBuffer = state.pdfArrayBuffer.slice(0);
      const extracted = await PDFProcessor.extractPages(safeBuffer, (prog) => {
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
      console.error('Extraction error:', err);
      elements.progressSection.classList.add('hidden');
      showErrorModal(`خطأ تقني أثناء قراءة وتحليل ملف الـ PDF:\n\n${err.message || err}\n\nيرجى التأكد من أن الملف سليم ومن صيغة بوسطة المدعومة.`);
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

  // Sortable instance reference
  let sortableInstance = null;

  /**
   * Initialize Drag-and-Drop manual reordering via SortableJS
   */
  function initSortable() {
    if (typeof Sortable === 'undefined' || !elements.resultsTableBody) return;

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    sortableInstance = new Sortable(elements.resultsTableBody, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: function () {
        // Read new order from DOM tr[data-orig-page]
        const rows = elements.resultsTableBody.querySelectorAll('tr[data-orig-page]');
        const reorderedOrigPages = Array.from(rows).map(r => parseInt(r.dataset.origPage, 10));

        const pageMap = new Map(state.sortedPages.map(p => [p.originalPageNumber, p]));

        if (state.activeFilter === 'all' && !state.searchQuery) {
          // In full view: direct 1-to-1 reorder
          state.sortedPages = reorderedOrigPages.map(orig => pageMap.get(orig)).filter(Boolean);
        } else {
          // In filtered or search view: reorder dragged items in place
          const movedItems = reorderedOrigPages.map(orig => pageMap.get(orig)).filter(Boolean);
          let firstPos = state.sortedPages.findIndex(p => reorderedOrigPages.includes(p.originalPageNumber));
          if (firstPos === -1) firstPos = 0;

          const remaining = state.sortedPages.filter(p => !reorderedOrigPages.includes(p.originalPageNumber));
          remaining.splice(firstPos, 0, ...movedItems);
          state.sortedPages = remaining;
        }

        // Re-assign newPageNumber sequentially across state.sortedPages
        state.sortedPages.forEach((p, idx) => {
          p.newPageNumber = idx + 1;
        });

        // Update the visible # الجديد labels in the table
        rows.forEach(r => {
          const orig = parseInt(r.dataset.origPage, 10);
          const p = pageMap.get(orig);
          if (p) {
            const numEl = r.querySelector('.new-page-num');
            if (numEl) numEl.textContent = `#${p.newPageNumber}`;
          }
        });

        showToast('تم تحديث الترتيب اليدوي بنجاح! جاهز للتصدير والتنزيل.', 'info');
      }
    });
  }

  /**
   * Render Preview Table with 9 Enhanced Columns, Search & Category Filters
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
        const matchesRef = (item.orderReference || '').toLowerCase().includes(query);
        const matchesCity = item.city.includes(query);
        const matchesRaw = (item.rawDescription || '').toLowerCase().includes(query);

        return matchesModel || matchesColor || matchesSize || matchesSku || matchesTracking || matchesRef || matchesCity || matchesRaw;
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
          <td colspan="9" class="px-6 py-12 text-center text-slate-400">
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
      tr.setAttribute('data-orig-page', item.originalPageNumber);
      tr.className = 'border-b border-slate-200 dark:border-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors text-xs sm:text-sm';

      // Category Badge
      const catMeta = ArabicUtils.getCategoryMeta(item.category);
      const categoryBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${catMeta.badgeClass}">${catMeta.label}</span>`;

      // Badge for Single vs Multi
      let orderTypeBadge = '';
      if (!item.hasRecognizedDescription) {
        orderTypeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">غير محدد</span>';
      } else if (item.isMultiProduct) {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">متعدد (${item.products.length} أصناف)</span>`;
      } else {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">قطعة واحدة</span>`;
      }

      // Color & Size display
      let variantDisplay = '';
      if (item.color || item.size) {
        variantDisplay = `
          <div class="flex items-center gap-1.5 flex-wrap">
            ${item.color ? `<span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs">${item.color}</span>` : ''}
            ${item.size ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-mono font-medium">${item.size}</span>` : ''}
          </div>
        `;
      } else {
        variantDisplay = `<span class="text-xs text-slate-400">-</span>`;
      }

      // Total Pieces Count
      const totalPiecesDisplay = item.totalPieces || (item.totalItemsCount ? `${item.totalItemsCount} قطع` : '-');

      // Reference / AWB display
      const refCode = item.orderReference || item.trackingNumber;

      tr.innerHTML = `
        <td class="px-2 py-3 text-center">
          <span class="drag-handle cursor-grab active:cursor-grabbing text-slate-400 hover:text-teal-500 text-base font-bold select-none p-1 inline-block" title="اسحب لإعادة الترتيب يدويًا">
            ⋮⋮
          </span>
        </td>
        <td class="px-3 py-3 font-mono font-bold text-teal-600 dark:text-teal-400 new-page-num whitespace-nowrap">
          #${item.newPageNumber}
        </td>
        <td class="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
          ${item.originalPageNumber}
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            ${totalPiecesDisplay}
          </span>
        </td>
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>${item.modelName}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
            ${categoryBadge}
            ${item.sku ? `<span class="font-mono bg-sky-500/10 text-sky-600 dark:text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/20 font-semibold">${item.sku}</span>` : ''}
          </div>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          ${variantDisplay}
        </td>
        <td class="px-4 py-3">
          <div class="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">${refCode}</div>
          <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
            ${item.trackingNumber && item.orderReference && item.orderReference !== item.trackingNumber ? `<span>${item.trackingNumber}</span><span>•</span>` : ''}
            <span>${item.city || '-'}</span>
          </div>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          ${orderTypeBadge}
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <button class="view-detail-btn p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-white transition" title="معاينة الورقة الأصلية" data-original-page="${item.originalPageNumber}">
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

    // Initialize SortableJS for drag-and-drop
    initSortable();

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
        b.classList.remove('bg-teal-500', 'text-white');
        b.classList.add('bg-slate-200', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
      });
      btn.classList.add('bg-teal-500', 'text-white');
      btn.classList.remove('bg-slate-200', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');

      state.activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  let currentCanvasRenderTask = null;
  let activeModalItem = null;

  /**
   * Render single original PDF page on canvas in modal
   */
  async function renderSinglePageToCanvas(pageNumber) {
    if (!state.pdfArrayBuffer || typeof pdfjsLib === 'undefined' || !elements.modalPdfCanvas) return;

    if (elements.modalCanvasLoading) {
      elements.modalCanvasLoading.classList.remove('hidden');
      elements.modalCanvasLoading.innerHTML = `
        <div class="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <span class="text-xs">جاري تصيير البوليصة الأصلية بدقة عالية...</span>
      `;
    }
    elements.modalPdfCanvas.classList.add('hidden');

    try {
      if (currentCanvasRenderTask) {
        try { currentCanvasRenderTask.cancel(); } catch (_) {}
      }

      const safeBuffer = state.pdfArrayBuffer.slice(0);
      const loadingTask = pdfjsLib.getDocument({
        data: safeBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      });

      const pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(pageNumber);

      const viewport = page.getViewport({ scale: 1.2 });
      elements.modalPdfCanvas.height = viewport.height;
      elements.modalPdfCanvas.width = viewport.width;

      const canvasContext = elements.modalPdfCanvas.getContext('2d');
      canvasContext.clearRect(0, 0, elements.modalPdfCanvas.width, elements.modalPdfCanvas.height);

      currentCanvasRenderTask = page.render({
        canvasContext,
        viewport
      });

      await currentCanvasRenderTask.promise;
      currentCanvasRenderTask = null;

      if (elements.modalCanvasLoading) elements.modalCanvasLoading.classList.add('hidden');
      elements.modalPdfCanvas.classList.remove('hidden');
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      console.error('Error rendering page to canvas:', err);
      if (elements.modalCanvasLoading) {
        elements.modalCanvasLoading.innerHTML = `<span class="text-xs text-rose-500 font-medium">تعذر عرض الورقة: ${err.message}</span>`;
      }
    }
  }

  /**
   * Single-Page PDF Quick Preview Modal
   */
  function showItemModal(item) {
    activeModalItem = item;
    elements.modalTitle.textContent = `معاينة بوليصة #${item.newPageNumber} (صفحة أصلية ${item.originalPageNumber})`;

    let productsListHtml = '';
    if (item.products && item.products.length > 0) {
      productsListHtml = item.products.map((p, idx) => `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 mb-2">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-slate-800 dark:text-sky-300 text-xs">صنف #${idx + 1}: ${p.modelName}</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/20">الكمية: ${p.qty}</span>
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-3">
            <span>اللون: <b class="text-slate-800 dark:text-white">${p.color || 'غير محدد'}</b></span>
            <span>المقاس: <b class="text-slate-800 dark:text-white">${p.size || 'غير محدد'}</b></span>
            ${p.sku ? `<span>كود SKU: <b class="text-teal-600 dark:text-teal-300 font-mono font-bold">${p.sku}</b></span>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      productsListHtml = `<div class="p-3 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-500/20 text-xs">لم يتم استخراج بنود محددة في هذا الوصف.</div>`;
    }

    elements.modalContent.innerHTML = `
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-400 mb-0.5">رقم البوليصة / AWB</div>
            <div class="font-mono font-bold text-slate-800 dark:text-white text-sm">${item.trackingNumber || '-'}</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-400 mb-0.5">كود الشحنة (Reference)</div>
            <div class="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">${item.orderReference || '-'}</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-400 mb-0.5">إجمالي عدد القطع</div>
            <div class="font-bold text-amber-600 dark:text-amber-300">${item.totalPieces || (item.totalItemsCount + ' قطع')}</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-400 mb-0.5">المحافظة / المدينة</div>
            <div class="font-medium text-slate-800 dark:text-slate-200">${item.city || '-'}</div>
          </div>
        </div>

        <div>
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">الأصناف المستخرجة بالتفصيل:</div>
          ${productsListHtml}
        </div>

        <div>
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">ملاحظات البوليصة:</div>
          <div class="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
            ${item.rawNotes || 'لا توجد ملاحظات مسجلة على هذه البوليصة.'}
          </div>
        </div>

        <div>
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">النص المستخرج الأصلي:</div>
          <div class="p-2.5 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
            ${item.rawDescription || '-'}
          </div>
        </div>
      </div>
    `;

    // Render original page onto canvas
    renderSinglePageToCanvas(item.originalPageNumber);

    elements.detailModal.classList.remove('hidden');
  }

  // Print single page button in modal
  if (elements.modalPrintSingleBtn) {
    elements.modalPrintSingleBtn.addEventListener('click', async () => {
      if (!activeModalItem) return;
      await exportBatchPDF(
        [activeModalItem],
        `Bosta_Single_${activeModalItem.trackingNumber || activeModalItem.originalPageNumber}`
      );
    });
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
    if (!pagesToExport || pagesToExport.length === 0) {
      showToast('لا توجد شحنات محددة لتصديرها كملف PDF.', 'error');
      return;
    }

    if (!state.pdfArrayBuffer || state.pdfArrayBuffer.byteLength === 0) {
      showErrorModal('بيانات ملف الـ PDF الأصلي غير متوفرة أو تم فقدها في الذاكرة. يرجى إعادة رفع الملف.');
      return;
    }

    elements.downloadTopBtn.disabled = true;
    elements.downloadStickyBtn.disabled = true;
    if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = true;
    if (elements.modalPrintSingleBtn) elements.modalPrintSingleBtn.disabled = true;
    elements.progressSection.classList.remove('hidden');

    try {
      // Safe clone of ArrayBuffer so it is never detached or corrupted
      const safeBuffer = state.pdfArrayBuffer.slice(0);

      const generatedBytes = await PDFProcessor.generateSortedPDF(
        safeBuffer,
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

      // Create Blob and trigger download safely via an anchor element
      const blob = new Blob([generatedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const filename = `${filenamePrefix}_${pagesToExport.length}_Orders.pdf`;

      const downloadLink = document.createElement('a');
      downloadLink.style.display = 'none';
      downloadLink.href = url;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();

      setTimeout(() => {
        if (downloadLink.parentNode) {
          downloadLink.parentNode.removeChild(downloadLink);
        }
        URL.revokeObjectURL(url);
      }, 5000);

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
      console.error('Critical PDF generation error:', err);
      showErrorModal(`خطأ تقني أثناء إنشاء وتحميل ملف الـ PDF:\n\n${err.message || err}\n\nيرجى التأكد من سلامة ملف الـ PDF الأصلي وعدم وجود حماية بكلمة سر.`);
    } finally {
      elements.downloadTopBtn.disabled = false;
      elements.downloadStickyBtn.disabled = false;
      if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = false;
      if (elements.modalPrintSingleBtn) elements.modalPrintSingleBtn.disabled = false;
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
      state.pdfArrayBuffer = pdfBytes.buffer.slice(0);
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
