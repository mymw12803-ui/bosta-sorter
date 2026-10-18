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
    selectedStrategy: '1',
    insertBlankSeparators: true,
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

    // Expandable sorting panel elements
    toggleSortingPanelBtn: document.getElementById('toggle-sorting-panel-btn'),
    sortingPanelContent: document.getElementById('sorting-panel-content'),
    sortingPanelChevron: document.getElementById('sorting-panel-chevron'),
    panelActiveStrategyBadge: document.getElementById('panel-active-strategy-badge'),
    panelSeparatorBadge: document.getElementById('panel-separator-badge'),
    panelStrategyRadios: document.querySelectorAll('input[name="panel-sorting-strategy"]'),

    // Blank separator checkboxes
    blankSeparatorsCheckbox: document.getElementById('blank-separators-checkbox'),
    blankSeparatorsPanelCheckbox: document.getElementById('blank-separators-panel-checkbox'),

    // Walk sequence upload
    walkSequenceInput: document.getElementById('walk-sequence-input'),
    uploadWalkSequenceBtn: document.getElementById('upload-walk-sequence-btn'),
    clearWalkSequenceBtn: document.getElementById('clear-walk-sequence-btn'),
    walkSequenceStatusBadge: document.getElementById('walk-sequence-status-badge'),

    // Resize controls
    resizeCheckbox: document.getElementById('resize-checkbox'),
    resizeOptionsContainer: document.getElementById('resize-options-container'),
    aspectRatioToggle: document.getElementById('aspect-ratio-toggle'),
    widthInput: document.getElementById('width-input'),
    heightInput: document.getElementById('height-input'),

    // Action buttons
    processBtn: document.getElementById('process-btn'),
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
    modalDownloadSingleBtn: document.getElementById('modal-download-single-btn'),

    // Technical Error Modal
    errorModal: document.getElementById('error-modal'),
    errorModalMessage: document.getElementById('error-modal-message'),
    closeErrorModalBtn: document.getElementById('close-error-modal-btn'),

    // Toast Notification
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
  };

  /**
   * Initialize Theme (Light / Dark mode) - Default to crisp high-contrast Light mode for warehouse
   */
  const savedTheme = localStorage.getItem('bosta_sorter_theme') || 'light';
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
    // Keep clean untouched Uint8Array copy as specified
    window.rawUntouchedPdfBytes = new Uint8Array(arrayBuffer);
    state.masterPdfBytes = window.rawUntouchedPdfBytes;
    state.pdfArrayBuffer = window.rawUntouchedPdfBytes.slice(0).buffer;

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

      // Update walk sequence badge in settings panel if present
      if (elements.walkSequenceStatusBadge) {
        elements.walkSequenceStatusBadge.textContent = `تم تحميل ${res.totalItems} صنف (${res.uniqueSkus} SKU)`;
        elements.walkSequenceStatusBadge.className = 'text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-medium';
        if (elements.clearWalkSequenceBtn) elements.clearWalkSequenceBtn.classList.remove('hidden');
      }

      // If pages are already extracted, update their SKU matching & warehouse walkIndex immediately
      if (state.extractedPages.length > 0) {
        state.extractedPages.forEach(p => {
          if (!p.sku && p.modelName) {
            const match = InventoryParser.matchProduct(p);
            if (match && match.sku) {
              p.sku = match.sku;
              p.matchedInventory = match;
            }
          }
          p.walkIndex = InventoryParser.getWalkIndex(p);
        });
        reSortAndRender();
      }

      showToast(`تم تحميل ملف المخزون بنجاح (${res.uniqueSkus} كود SKU) وتطبيق خط سير الممرات!`, 'success');
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

  // Strategy updater function
  function updateStrategy(newStrategy) {
    state.selectedStrategy = String(newStrategy);

    // Sync Step 3 radios
    elements.strategyRadios.forEach(radio => {
      radio.checked = (radio.value === state.selectedStrategy);
    });

    // Sync panel radios
    if (elements.panelStrategyRadios) {
      elements.panelStrategyRadios.forEach(radio => {
        radio.checked = (radio.value === state.selectedStrategy);
      });
    }

    // Update active badge text
    if (elements.panelActiveStrategyBadge) {
      const labels = {
        '1': 'الترتيب العملي لمسار المخزن',
        '2': 'حسب شيت ممرات المخزن فقط',
        '3': 'حسب إجمالي عدد القطع فقط',
        '4': 'حسب الأقسام حريمي وأطفالي'
      };
      elements.panelActiveStrategyBadge.textContent = labels[state.selectedStrategy] || 'الترتيب العملي لمسار المخزن';
    }

    if (state.extractedPages.length > 0) {
      reSortAndRender();
      showToast('تم تحديث استراتيجية الفرز وترتيب البوليصات!', 'info');
    }
  }

  // Bind Step 3 strategy radios
  elements.strategyRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateStrategy(e.target.value);
    });
  });

  // Bind panel strategy radios
  if (elements.panelStrategyRadios) {
    elements.panelStrategyRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        updateStrategy(e.target.value);
      });
    });
  }

  // Blank Separators toggle updater
  function updateBlankSeparators(enabled) {
    state.insertBlankSeparators = Boolean(enabled);
    if (elements.blankSeparatorsCheckbox) {
      elements.blankSeparatorsCheckbox.checked = state.insertBlankSeparators;
    }
    if (elements.blankSeparatorsPanelCheckbox) {
      elements.blankSeparatorsPanelCheckbox.checked = state.insertBlankSeparators;
    }
    if (elements.panelSeparatorBadge) {
      elements.panelSeparatorBadge.textContent = state.insertBlankSeparators
        ? 'صفحات فاصلة بيضاء مفعلة'
        : 'صفحات فاصلة معطلة';
      elements.panelSeparatorBadge.className = state.insertBlankSeparators
        ? 'hidden sm:inline text-[11px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-medium border border-sky-500/30'
        : 'hidden sm:inline text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium border border-slate-700';
    }
    showToast(state.insertBlankSeparators ? 'تم تفعيل الفواصل البيضاء بين المجموعات.' : 'تم تعطيل الفواصل البيضاء.', 'info');
  }

  if (elements.blankSeparatorsCheckbox) {
    elements.blankSeparatorsCheckbox.addEventListener('change', (e) => {
      updateBlankSeparators(e.target.checked);
    });
  }
  if (elements.blankSeparatorsPanelCheckbox) {
    elements.blankSeparatorsPanelCheckbox.addEventListener('change', (e) => {
      updateBlankSeparators(e.target.checked);
    });
  }

  // Expandable panel accordion toggle
  if (elements.toggleSortingPanelBtn && elements.sortingPanelContent) {
    elements.toggleSortingPanelBtn.addEventListener('click', () => {
      const isHidden = elements.sortingPanelContent.classList.contains('hidden');
      elements.sortingPanelContent.classList.toggle('hidden', !isHidden);
      if (elements.sortingPanelChevron) {
        elements.sortingPanelChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Walk sequence upload handlers
  if (elements.uploadWalkSequenceBtn && elements.walkSequenceInput) {
    elements.uploadWalkSequenceBtn.addEventListener('click', () => {
      elements.walkSequenceInput.click();
    });

    elements.walkSequenceInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await handleInventoryFile(file);
      // Update walk sequence badge
      if (elements.walkSequenceStatusBadge && InventoryParser.inventoryItems.length > 0) {
        elements.walkSequenceStatusBadge.textContent = `تم تحميل ${InventoryParser.inventoryItems.length} صنف`;
        elements.walkSequenceStatusBadge.className = 'text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-medium';
        if (elements.clearWalkSequenceBtn) elements.clearWalkSequenceBtn.classList.remove('hidden');
      }
      // Update walkIndex for all extracted pages
      if (state.extractedPages.length > 0) {
        state.extractedPages.forEach(p => {
          p.walkIndex = InventoryParser.getWalkIndex(p);
        });
        reSortAndRender();
      }
    });
  }

  if (elements.clearWalkSequenceBtn) {
    elements.clearWalkSequenceBtn.addEventListener('click', () => {
      InventoryParser.reset();
      if (elements.walkSequenceInput) elements.walkSequenceInput.value = '';
      if (elements.walkSequenceStatusBadge) {
        elements.walkSequenceStatusBadge.textContent = 'غير محمل';
        elements.walkSequenceStatusBadge.className = 'text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700';
      }
      elements.clearWalkSequenceBtn.classList.add('hidden');
      if (state.extractedPages.length > 0) {
        state.extractedPages.forEach(p => {
          p.walkIndex = 999999;
        });
        reSortAndRender();
      }
      showToast('تمت إزالة شيت مسار ممرات المخزن.', 'info');
    });
  }

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

    // Batch Category & Piece Counters
    const countKids = state.sortedPages.filter(p => p.isKids).length;
    const countWomen = state.sortedPages.filter(p => p.isWomen).length;
    const countOther = state.sortedPages.filter(p => p.isOther).length;
    const countMultiPieces = state.sortedPages.filter(p => (p.piecesCount || p.totalItemsCount || 1) >= 2).length;
    const countSinglePieces = state.sortedPages.filter(p => (p.piecesCount || p.totalItemsCount || 1) === 1).length;

    if (elements.batchCountKids) elements.batchCountKids.textContent = `${countKids} بوليصة`;
    if (elements.batchCountWomen) elements.batchCountWomen.textContent = `${countWomen} بوليصة`;
    if (elements.batchCountOther) elements.batchCountOther.textContent = `${countOther} بوليصة`;
    if (elements.batchCountMulti) elements.batchCountMulti.textContent = `${countMultiPieces} بوليصة`;

    if (elements.downloadKidsBtn) elements.downloadKidsBtn.disabled = countKids === 0;
    if (elements.downloadWomenBtn) elements.downloadWomenBtn.disabled = countWomen === 0;
    if (elements.downloadOtherBtn) elements.downloadOtherBtn.disabled = countOther === 0;
    if (elements.downloadMultiBtn) elements.downloadMultiBtn.disabled = countMultiPieces === 0;

    if (elements.totalDownloadCount) elements.totalDownloadCount.textContent = total;

    // Update filter tab button labels with live counts
    elements.filterBtns.forEach(btn => {
      const f = btn.dataset.filter;
      if (f === 'all') btn.textContent = `الكل (${total})`;
      else if (f === 'kids') btn.textContent = `🧸 قسم الأطفالي فقط (${countKids})`;
      else if (f === 'women') btn.textContent = `👗 قسم الحريمي فقط (${countWomen})`;
      else if (f === 'other') btn.textContent = `📦 قسم منتجات أخرى (${countOther})`;
      else if (f === 'multi') btn.textContent = `⚡ أوردرات متعددة القطع (${countMultiPieces})`;
      else if (f === 'single') btn.textContent = `🏷️ أوردرات قطعة واحدة (${countSinglePieces})`;
    });
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
   * Render Preview Table with 8 Enhanced Columns, Search & Space-Immune Category Filters
   */
  function renderTable() {
    // 100% Space-Immune query normalizer
    const query = ArabicUtils.normalizeArabic(state.searchQuery);

    const filtered = state.sortedPages.filter(item => {
      // Category & Piece-Count Tab Filter (Space-Immune flags)
      const count = item.piecesCount || item.totalItemsCount || 1;
      if (state.activeFilter === 'kids' && !item.isKids) return false;
      if (state.activeFilter === 'women' && !item.isWomen) return false;
      if (state.activeFilter === 'other' && !item.isOther) return false;
      if (state.activeFilter === 'multi' && count < 2) return false;
      if (state.activeFilter === 'single' && count !== 1) return false;
      if (state.activeFilter === 'unknown' && item.hasRecognizedDescription) return false;

      // Quick Search Query: 100% Space-Immune comparison across all order data
      if (query) {
        const fullSearchable = ArabicUtils.normalizeArabic(
          (item.modelName || '') + ' ' +
          (item.products ? item.products.map(p => `${p.modelName} ${p.color || ''} ${p.colorCode || ''} ${p.size || ''} ${p.sku || ''}`).join(' ') : '') + ' ' +
          (item.color || '') + ' ' +
          (item.size || '') + ' ' +
          (item.sku || '') + ' ' +
          (item.orderReference || '') + ' ' +
          (item.trackingNumber || '') + ' ' +
          (item.city || '') + ' ' +
          (item.rawDescription || '') + ' ' +
          (item.rawNotes || '')
        );

        return fullSearchable.includes(query);
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
      tr.setAttribute('data-orig-page', item.originalPageNumber);
      tr.className = 'border-b border-slate-200 dark:border-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors text-xs sm:text-sm';

      // Category Badge
      const catMeta = ArabicUtils.getCategoryMeta(item.category);
      const categoryBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${catMeta.badgeClass}">${catMeta.label}</span>`;

      // Badge for Single vs Multi
      let orderTypeBadge = '';
      if (!item.hasRecognizedDescription) {
        orderTypeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">غير محدد</span>';
      } else if (item.isMultiProduct || (item.piecesCount || item.totalItemsCount || 1) >= 2) {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">متعدد القطع</span>`;
      } else {
        orderTypeBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">قطعة واحدة</span>`;
      }

      // Prominent Color-coded Total Pieces Count Display:
      // 4+ قطع: Purple/Rose (🔥 X قطع)
      // 3 قطع: Amber/Orange
      // 2 قطع: Blue
      // 1 قطعة: Emerald/Slate
      const count = item.piecesCount || item.totalItemsCount || 1;
      let pieceBadgeHtml = '';
      if (count >= 4) {
        pieceBadgeHtml = `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-sm whitespace-nowrap">🔥 ${count} قطع</span>`;
      } else if (count === 3) {
        pieceBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-sm whitespace-nowrap">3 قطع</span>`;
      } else if (count === 2) {
        pieceBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shadow-sm whitespace-nowrap">2 قطع</span>`;
      } else {
        pieceBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-sm whitespace-nowrap">1 قطعة</span>`;
      }

      // Reference / AWB display
      const refCode = item.orderReference || item.trackingNumber || '-';

      // Clean list of all products in the order showing reconstructed clean Arabic names with proper spaces
      let productsListHtml = '';
      if (item.products && item.products.length > 0) {
        productsListHtml = item.products.map(p => {
          const lineStr = p.formattedLineText || `${p.modelName}${p.color ? ' - ' + p.color + (p.colorCode ? ' (' + p.colorCode + ')' : '') : ''}${p.size ? ' / ' + p.size : ''} (${p.qty || 1} QTY)`;
          return `
            <div class="flex items-center justify-between gap-2 py-0.5 border-b border-slate-100 dark:border-slate-800/40 last:border-0 flex-wrap">
              <span class="font-bold text-slate-900 dark:text-white text-xs">${lineStr}</span>
              ${p.sku ? `<span class="font-mono text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/20 font-semibold whitespace-nowrap">${p.sku}</span>` : ''}
            </div>
          `;
        }).join('');
      } else {
        productsListHtml = `<div class="text-xs text-slate-700 dark:text-slate-300 font-medium">${item.modelName || item.rawDescription || '-'}</div>`;
      }

      tr.innerHTML = `
        <td class="px-2 py-3 text-center">
          <span class="drag-handle cursor-grab active:cursor-grabbing text-slate-400 hover:text-teal-500 text-base font-bold select-none p-1 inline-block" title="اسحب لإعادة الترتيب يدويًا">
            ☰
          </span>
        </td>
        <td class="px-3 py-3 font-mono font-bold text-teal-600 dark:text-teal-400 new-page-num whitespace-nowrap">
          #${item.newPageNumber}
        </td>
        <td class="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
          ${item.originalPageNumber}
        </td>
        <td class="px-4 py-3">
          <div class="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">${refCode}</div>
          <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
            ${item.trackingNumber && item.orderReference && item.orderReference !== item.trackingNumber ? `<span class="font-mono">${item.trackingNumber}</span><span>•</span>` : ''}
            <span>${item.city || '-'}</span>
          </div>
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <div class="mb-1">
            ${pieceBadgeHtml}
          </div>
          <div>
            ${orderTypeBadge}
          </div>
        </td>
        <td class="px-4 py-3">
          ${productsListHtml}
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap">
          ${categoryBadge}
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <button class="view-detail-btn px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 hover:text-teal-600 dark:text-slate-300 dark:hover:text-white transition flex items-center justify-center gap-1 mx-auto text-xs font-medium" title="معاينة الورقة الأصلية" data-original-page="${item.originalPageNumber}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>معاينة</span>
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
      productsListHtml = item.products.map((p, idx) => {
        const lineStr = p.formattedLineText || `${p.modelName}${p.color ? ' - ' + p.color + (p.colorCode ? ' (' + p.colorCode + ')' : '') : ''}${p.size ? ' / ' + p.size : ''} (${p.qty || 1} QTY)`;
        return `
          <div class="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 mb-2">
            <div class="flex items-center justify-between mb-1.5">
              <span class="font-bold text-slate-800 dark:text-sky-300 text-xs">صنف #${idx + 1}: ${lineStr}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/20">الكمية: ${p.qty || 1}</span>
            </div>
            <div class="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-3">
              <span>الموديل: <b class="text-slate-800 dark:text-white">${p.modelName}</b></span>
              ${p.color ? `<span>اللون: <b class="text-slate-800 dark:text-white">${p.color}${p.colorCode ? ' (' + p.colorCode + ')' : ''}</b></span>` : ''}
              ${p.size ? `<span>المقاس: <b class="text-slate-800 dark:text-white">${p.size}</b></span>` : ''}
              ${p.sku ? `<span>كود SKU: <b class="text-teal-600 dark:text-teal-300 font-mono font-bold">${p.sku}</b></span>` : ''}
            </div>
          </div>
        `;
      }).join('');
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

  // Download single page button in modal
  // Purple Button: Download single page button in modal
  if (elements.modalDownloadSingleBtn) {
    elements.modalDownloadSingleBtn.addEventListener('click', async () => {
      if (!activeModalItem) return;
      const currentOriginalPageIndex = activeModalItem.originalPageNumber - 1;
      const orderRef = activeModalItem.orderReference || activeModalItem.trackingNumber || activeModalItem.originalPageNumber;
      await downloadPdfBatch([currentOriginalPageIndex], `بوليصة_${orderRef}.pdf`);
    });
  }

  // Red Button: Print single page button in modal (Triggers clean iframe/canvas window.print())
  if (elements.modalPrintSingleBtn) {
    elements.modalPrintSingleBtn.addEventListener('click', () => {
      if (!activeModalItem) return;
      try {
        const canvas = elements.modalPdfCanvas;
        if (!canvas || canvas.classList.contains('hidden')) {
          showToast('يرجى الانتظار حتى يكتمل عرض البوليصة.', 'error');
          return;
        }
        const imgDataUrl = canvas.toDataURL('image/png');
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
          <!DOCTYPE html>
          <html dir="rtl">
            <head>
              <meta charset="utf-8">
              <title>طباعة بوليصة ${activeModalItem.orderReference || activeModalItem.originalPageNumber}</title>
              <style>
                @page { size: auto; margin: 0; }
                body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; }
                img { max-width: 100%; height: auto; display: block; }
              </style>
            </head>
            <body>
              <img src="${imgDataUrl}" onload="setTimeout(() => { window.focus(); window.print(); }, 200);" />
            </body>
          </html>
        `);
        frameDoc.close();

        setTimeout(() => {
          if (printFrame && printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
        }, 30000);
      } catch (err) {
        console.error('Print error:', err);
        showErrorModal(`خطأ في طباعة الصفحة: ${err.message || err}`);
      }
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
   * Exact bulletproof download function
   * Pure 1:1 binary copy - DO NOT call setSize, embedPage, scaleContent or setMediaBox!
   * Supports blank separator pages insertion [212.60, 354.33] when options.insertBlankSeparators is true.
   */
  async function downloadPdfBatch(pageIndices, filename = 'Bosta_Sorted.pdf', options = {}) {
    const bytes = window.rawUntouchedPdfBytes || state.masterPdfBytes;
    if (!bytes || !pageIndices || pageIndices.length === 0) {
      alert('لا توجد بوليصات محددة للتحميل');
      return;
    }
    try {
      const srcDoc = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      const outDoc = await PDFLib.PDFDocument.create();

      // Pure 1:1 binary copy - DO NOT call setSize, embedPage, scaleContent or setMediaBox!
      const indices = pageIndices.map(p => (typeof p === 'number' ? p : p.originalPageNumber - 1));
      const copiedPages = await outDoc.copyPages(srcDoc, indices);

      const total = copiedPages.length;
      for (let i = 0; i < total; i++) {
        outDoc.addPage(copiedPages[i]);

        // Blank Separator Logic (صفحة بيضاء فاصلة بين المجموعات)
        if (options.insertBlankSeparators && i < total - 1) {
          const curPage = pageIndices[i];
          const nextPage = pageIndices[i + 1];
          if (curPage && nextPage && typeof PDFProcessor !== 'undefined') {
            const rankCur = PDFProcessor.getStrategy1GroupRank(curPage);
            const rankNext = PDFProcessor.getStrategy1GroupRank(nextPage);

            // Boundary transitions: 1->2, 2->3, 3->4, 4->5
            if (rankCur >= 1 && rankCur <= 4 && rankNext > rankCur && rankNext <= 5) {
              outDoc.addPage([212.60, 354.33]);
            }
          }
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return pdfBytes;
    } catch (err) {
      console.error('Export error:', err);
      alert('حدث خطأ أثناء تحميل الملف: ' + err.message);
      throw err;
    }
  }
  window.downloadPdfBatch = downloadPdfBatch;

  /**
   * Universal Batch & Filtered PDF Export Action
   * Pure 1:1 binary copy with zero data loss & intact vector barcodes
   */
  async function exportBatchPDF(pagesToExport, filenamePrefix, options = {}) {
    if (!pagesToExport || pagesToExport.length === 0) {
      showToast('لا توجد شحنات محددة لتصديرها كملف PDF.', 'error');
      return;
    }

    const bytes = window.rawUntouchedPdfBytes || state.masterPdfBytes;
    if (!bytes || bytes.byteLength === 0) {
      showErrorModal('بيانات ملف الـ PDF الأصلي غير متوفرة أو تم فقدها في الذاكرة. يرجى إعادة رفع الملف.');
      return;
    }

    elements.downloadTopBtn.disabled = true;
    elements.downloadStickyBtn.disabled = true;
    if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = true;
    if (elements.modalPrintSingleBtn) elements.modalPrintSingleBtn.disabled = true;
    if (elements.modalDownloadSingleBtn) elements.modalDownloadSingleBtn.disabled = true;
    elements.progressSection.classList.remove('hidden');

    try {
      const filename = `${filenamePrefix}_${pagesToExport.length}_Orders.pdf`;
      await downloadPdfBatch(pagesToExport, filename, options);

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
      showErrorModal(`خطأ تقني أثناء إنشاء وتحميل ملف الـ PDF:\n\n${err.message || err}`);
    } finally {
      elements.downloadTopBtn.disabled = false;
      elements.downloadStickyBtn.disabled = false;
      if (elements.downloadFilteredBtn) elements.downloadFilteredBtn.disabled = false;
      if (elements.modalPrintSingleBtn) elements.modalPrintSingleBtn.disabled = false;
      if (elements.modalDownloadSingleBtn) elements.modalDownloadSingleBtn.disabled = false;
      setTimeout(() => elements.progressSection.classList.add('hidden'), 800);
    }
  }

  // Top Download Bar:
  // Red Button: "تحميل كافة البوليصات مرتبة (101 بوليصة)" -> Calls downloadPdfBatch with separator options
  elements.downloadTopBtn.addEventListener('click', async () => {
    await downloadPdfBatch(state.sortedPages, 'Bosta_All_Sorted.pdf', { insertBlankSeparators: state.insertBlankSeparators });
  });
  elements.downloadStickyBtn.addEventListener('click', async () => {
    await downloadPdfBatch(state.sortedPages, 'Bosta_All_Sorted.pdf', { insertBlankSeparators: state.insertBlankSeparators });
  });

  // Dynamic Filter Download Button: "تحميل نتائج الفلتر الحالي (X بوليصة)" -> Downloads only currently filtered rows
  if (elements.downloadFilteredBtn) {
    elements.downloadFilteredBtn.addEventListener('click', async () => {
      if (!state.currentFilteredPages || state.currentFilteredPages.length === 0) {
        showToast('لا توجد شحنات مطابقة للفلتر الحالي لتصديرها.', 'error');
        return;
      }
      let filename = 'Bosta_Filtered_Results.pdf';
      if (state.activeFilter === 'kids') filename = 'قسم_الأطفالي.pdf';
      else if (state.activeFilter === 'women') filename = 'قسم_الحريمي.pdf';
      else if (state.activeFilter === 'other') filename = 'قسم_منتجات_أخرى.pdf';
      else if (state.activeFilter === 'all') filename = 'Bosta_All_Sorted.pdf';
      else if (state.activeFilter === 'multi') filename = 'أوردرات_متعددة_القطع.pdf';
      else if (state.activeFilter === 'single') filename = 'أوردرات_قطعة_واحدة.pdf';

      await downloadPdfBatch(state.currentFilteredPages, filename);
    });
  }

  // Category Batch Downloads (Batch Splitting Cards)
  if (elements.downloadKidsBtn) {
    elements.downloadKidsBtn.addEventListener('click', async () => {
      const kids = state.sortedPages.filter(p => p.isKids);
      await downloadPdfBatch(kids, 'قسم_الأطفالي.pdf');
    });
  }

  if (elements.downloadWomenBtn) {
    elements.downloadWomenBtn.addEventListener('click', async () => {
      const women = state.sortedPages.filter(p => p.isWomen);
      await downloadPdfBatch(women, 'قسم_الحريمي.pdf');
    });
  }

  if (elements.downloadOtherBtn) {
    elements.downloadOtherBtn.addEventListener('click', async () => {
      const other = state.sortedPages.filter(p => p.isOther);
      await downloadPdfBatch(other, 'قسم_منتجات_أخرى.pdf');
    });
  }

  if (elements.downloadMultiBtn) {
    elements.downloadMultiBtn.addEventListener('click', async () => {
      const multi = state.sortedPages.filter(p => (p.piecesCount || p.totalItemsCount || 1) >= 2);
      await downloadPdfBatch(multi, 'أوردرات_متعددة_القطع.pdf');
    });
  }

  elements.processBtn.addEventListener('click', processLabels);

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
