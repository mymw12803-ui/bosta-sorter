/**
 * Main Application Controller
 * Manages UI state, dropzones, sorting triggers, table rendering, filters, and PDF download.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    pdfFile: null,
    pdfArrayBuffer: null,
    uploadedPdfFiles: [], // Array of { file, name, size, buffer }
    mergeEnabled: true,
    thermalResizeEnabled: true,
    smartSortEnabled: true,
    blankSeparatorsEnabled: true,
    manifestSheetEnabled: true,
    inventoryFile: null,
    inventoryArrayBuffer: null,
    extractedPages: [],
    sortedPages: [],
    useWalkSequence: true,
    enableBatchPickLists: true,
    insertBlankSeparators: true,
    resizeEnabled: true,
    keepAspectRatio: true,
    labelFitMode: 'safe_fit', // 'safe_fit' (Option A - Safe Fit with Margins) or 'fill_width' (Option B - Fill Width 100%)
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
    // Pipeline Options Bar Toggles
    pipelineMergeToggle: document.getElementById('pipeline-merge-toggle'),
    pipelineResizeToggle: document.getElementById('pipeline-resize-toggle'),
    pipelineSortToggle: document.getElementById('pipeline-sort-toggle'),
    pipelineSeparatorsToggle: document.getElementById('pipeline-separators-toggle'),
    pipelineManifestToggle: document.getElementById('pipeline-manifest-toggle'),

    // Dropzones & Inputs
    pdfDropzone: document.getElementById('pdf-dropzone'),
    pdfInput: document.getElementById('pdf-input'),
    pdfFileInfo: document.getElementById('pdf-file-info'),
    pdfFileName: document.getElementById('pdf-file-name'),
    pdfFileSize: document.getElementById('pdf-file-size'),
    removePdfBtn: document.getElementById('remove-pdf-btn'),
    addMorePdfBtn: document.getElementById('add-more-pdf-btn'),
    pdfFilesChips: document.getElementById('pdf-files-chips'),

    // Custom Filename Input (Feature 3)
    customFilenameInput: document.getElementById('custom-filename-input'),

    // Multi-PDF Merge & Resize Tool (Feature 4)
    multiPdfContainer: document.getElementById('multi-pdf-container'),
    toggleMultiPdfBtn: document.getElementById('toggle-multi-pdf-btn'),
    multiPdfContent: document.getElementById('multi-pdf-content'),
    multiPdfChevron: document.getElementById('multi-pdf-chevron'),
    multiPdfCountBadge: document.getElementById('multi-pdf-count-badge'),
    multiPdfDropzone: document.getElementById('multi-pdf-dropzone'),
    multiPdfInput: document.getElementById('multi-pdf-input'),
    multiPdfListContainer: document.getElementById('multi-pdf-list-container'),
    multiPdfFileList: document.getElementById('multi-pdf-file-list'),
    clearMultiPdfBtn: document.getElementById('clear-multi-pdf-btn'),
    mergeAndProcessBtn: document.getElementById('merge-and-process-btn'),

    // Dynamic Warehouse Catalog & Route Manager Elements
    toggleCatalogManagerBtn: document.getElementById('toggle-catalog-manager-btn'),
    catalogManagerContent: document.getElementById('catalog-manager-content'),
    catalogManagerChevron: document.getElementById('catalog-manager-chevron'),
    catalogStatusBadge: document.getElementById('catalog-status-badge'),
    catalogInfoText: document.getElementById('catalog-info-text'),
    catalogResetBtn: document.getElementById('catalog-reset-btn'),
    catalogExportBtn: document.getElementById('catalog-export-btn'),
    catalogToggleViewBtn: document.getElementById('catalog-toggle-view-btn'),
    catalogExcelDropzone: document.getElementById('catalog-excel-dropzone'),
    catalogExcelInput: document.getElementById('catalog-excel-input'),
    catalogExcelResult: document.getElementById('catalog-excel-result'),
    catalogPdfDropzone: document.getElementById('catalog-pdf-dropzone'),
    catalogPdfInput: document.getElementById('catalog-pdf-input'),
    catalogPdfStatus: document.getElementById('catalog-pdf-status'),
    catalogDiscoveredSection: document.getElementById('catalog-discovered-section'),
    catalogDiscoveredChips: document.getElementById('catalog-discovered-chips'),
    catalogAddAllDiscoveredBtn: document.getElementById('catalog-add-all-discovered-btn'),
    catalogInspectorSection: document.getElementById('catalog-inspector-section'),
    catalogInspectorCount: document.getElementById('catalog-inspector-count'),
    catalogInspectorSearch: document.getElementById('catalog-inspector-search'),
    catalogInspectorItems: document.getElementById('catalog-inspector-items'),

    inventoryDropzone: document.getElementById('inventory-dropzone'),
    inventoryInput: document.getElementById('inventory-input'),
    inventoryFileInfo: document.getElementById('inventory-file-info'),
    inventoryFileName: document.getElementById('inventory-file-name'),
    inventoryFileSize: document.getElementById('inventory-file-size'),
    inventoryStatusPill: document.getElementById('inventory-status-pill'),
    inventoryConnectedBadge: document.getElementById('inventory-connected-badge'),
    removeInventoryBtn: document.getElementById('remove-inventory-btn'),

    // Unified Pipeline Toggles
    walkSequenceToggle: document.getElementById('walk-sequence-toggle'),
    batchPicklistsToggle: document.getElementById('batch-picklists-toggle'),
    panelWalkSequenceToggle: document.getElementById('panel-walk-sequence-toggle'),
    panelBatchPicklistsToggle: document.getElementById('panel-batch-picklists-toggle'),
    reverseArabicCheckbox: document.getElementById('reverse-arabic-checkbox'),

    // Expandable sorting panel elements
    toggleSortingPanelBtn: document.getElementById('toggle-sorting-panel-btn'),
    sortingPanelContent: document.getElementById('sorting-panel-content'),
    sortingPanelChevron: document.getElementById('sorting-panel-chevron'),
    panelActiveStrategyBadge: document.getElementById('panel-active-strategy-badge'),
    panelSeparatorBadge: document.getElementById('panel-separator-badge'),

    // Walk sequence upload
    walkSequenceInput: document.getElementById('walk-sequence-input'),
    uploadWalkSequenceBtn: document.getElementById('upload-walk-sequence-btn'),
    clearWalkSequenceBtn: document.getElementById('clear-walk-sequence-btn'),
    walkSequenceStatusBadge: document.getElementById('walk-sequence-status-badge'),

    // Resize controls
    resizeCheckbox: document.getElementById('resize-checkbox'),
    resizeOptionsContainer: document.getElementById('resize-options-container'),
    fitModeSafeRadio: document.getElementById('fit-mode-safe'),
    fitModeFillRadio: document.getElementById('fit-mode-fill'),
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
  function setupDropzone(dropzone, input, onFilesSelect) {
    if (!dropzone || !input) return;

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
        if (input.multiple) {
          onFilesSelect(Array.from(files));
        } else {
          onFilesSelect(files[0]);
        }
      }
    });

    dropzone.addEventListener('click', (e) => {
      if (e.target && e.target.closest && (
        e.target.closest('#remove-pdf-btn') || 
        e.target.closest('#remove-inventory-btn') ||
        e.target.closest('#add-more-pdf-btn') ||
        e.target.closest('[data-remove-chip]')
      )) return;
      input.click();
    });

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        if (input.multiple) {
          onFilesSelect(Array.from(e.target.files));
        } else {
          onFilesSelect(e.target.files[0]);
        }
      }
    });
  }

  /**
   * Render Multi-PDF chips under dropzone
   */
  function renderPdfFilesChips() {
    if (!elements.pdfFilesChips) return;
    if (state.uploadedPdfFiles.length === 0) {
      elements.pdfFilesChips.innerHTML = '';
      elements.pdfFilesChips.classList.add('hidden');
      if (elements.pdfFileInfo) elements.pdfFileInfo.classList.add('hidden');
      const prompt = elements.pdfDropzone ? elements.pdfDropzone.querySelector('.dropzone-prompt') : null;
      if (prompt) prompt.classList.remove('hidden');
      if (elements.processBtn) elements.processBtn.disabled = true;
      return;
    }

    if (elements.pdfDropzone) {
      const prompt = elements.pdfDropzone.querySelector('.dropzone-prompt');
      if (prompt) prompt.classList.add('hidden');
    }
    if (elements.pdfFileInfo) elements.pdfFileInfo.classList.remove('hidden');
    elements.pdfFilesChips.classList.remove('hidden');

    const totalBytes = state.uploadedPdfFiles.reduce((acc, f) => acc + f.size, 0);
    if (elements.pdfFileName) {
      elements.pdfFileName.textContent = state.uploadedPdfFiles.length === 1
        ? state.uploadedPdfFiles[0].name
        : `${state.uploadedPdfFiles.length} ملفات PDF محددة`;
    }
    if (elements.pdfFileSize) {
      elements.pdfFileSize.textContent = formatFileSize(totalBytes);
    }

    elements.pdfFilesChips.innerHTML = state.uploadedPdfFiles.map((f, idx) => `
      <div class="file-chip flex items-center justify-between gap-2 p-2 bg-slate-900/80 rounded-lg border border-slate-700/60 text-xs">
        <div class="flex items-center gap-2 truncate">
          <span class="text-rose-400 font-bold">📄</span>
          <span class="text-slate-200 truncate font-medium max-w-[200px]" title="${f.name}">${f.name}</span>
          <span class="text-[10px] text-slate-400">(${formatFileSize(f.size)})</span>
        </div>
        <button type="button" data-remove-chip="${idx}" class="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition" title="حذف هذا الملف">
          <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    // Attach remove chip listeners
    elements.pdfFilesChips.querySelectorAll('[data-remove-chip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.removeChip, 10);
        state.uploadedPdfFiles.splice(idx, 1);
        if (state.uploadedPdfFiles.length === 0) {
          state.pdfFile = null;
          state.pdfArrayBuffer = null;
          state.masterPdfBytes = null;
          window.rawUntouchedPdfBytes = null;
        } else if (state.uploadedPdfFiles.length === 1) {
          state.pdfFile = state.uploadedPdfFiles[0].file;
          state.pdfFileName = state.uploadedPdfFiles[0].name;
          state.pdfArrayBuffer = state.uploadedPdfFiles[0].buffer.slice(0);
          state.masterPdfBytes = new Uint8Array(state.uploadedPdfFiles[0].buffer);
          window.rawUntouchedPdfBytes = state.masterPdfBytes;
        }
        renderPdfFilesChips();
      });
    });
  }

  /**
   * Handle Multiple PDF Files Selection
   */
  async function handlePdfFiles(files, append = false) {
    const list = Array.isArray(files) ? files : [files];
    const validFiles = list.filter(f => f && f.name && f.name.toLowerCase().endsWith('.pdf'));

    if (validFiles.length === 0) {
      showToast('يرجى اختيار ملف PDF لبوليصات شحن بوسطة صالح.', 'error');
      return;
    }

    if (!append) {
      state.uploadedPdfFiles = [];
    }

    for (const file of validFiles) {
      const exists = state.uploadedPdfFiles.some(item => item.name === file.name && item.size === file.size);
      if (!exists) {
        const arrayBuffer = await file.arrayBuffer();
        state.uploadedPdfFiles.push({
          file,
          name: file.name,
          size: file.size,
          buffer: arrayBuffer
        });
      }
    }

    if (state.uploadedPdfFiles.length === 1) {
      state.pdfFile = state.uploadedPdfFiles[0].file;
      state.pdfFileName = state.uploadedPdfFiles[0].name;
      window.rawUntouchedPdfBytes = new Uint8Array(state.uploadedPdfFiles[0].buffer);
      state.masterPdfBytes = window.rawUntouchedPdfBytes;
      state.pdfArrayBuffer = window.rawUntouchedPdfBytes.slice(0).buffer;
    } else if (state.uploadedPdfFiles.length > 1) {
      state.pdfFile = state.uploadedPdfFiles[0].file;
      state.pdfFileName = `بوالص_مدمجة_${state.uploadedPdfFiles.length}_ملفات.pdf`;
      state.pdfArrayBuffer = state.uploadedPdfFiles[0].buffer.slice(0);
      state.masterPdfBytes = new Uint8Array(state.uploadedPdfFiles[0].buffer);
      window.rawUntouchedPdfBytes = state.masterPdfBytes;
    }

    renderPdfFilesChips();
    elements.processBtn.disabled = false;
    showToast(`تم تجهيز ${state.uploadedPdfFiles.length} ملف PDF لبوليصات الشحن.`, 'success');
  }

  /**
   * Handle Single PDF File Selection (Compatibility)
   */
  async function handlePdfFile(file) {
    await handlePdfFiles([file], false);
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
      if (elements.inventoryStatusPill) {
        elements.inventoryStatusPill.textContent = `تم ربط شيت المخزن: ${res.totalItems} صنف`;
        elements.inventoryStatusPill.className = 'text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-500/30 font-bold';
      }
      if (elements.inventoryConnectedBadge) {
        elements.inventoryConnectedBadge.textContent = `تم ربط شيت المخزن: ${res.totalItems} صنف (${res.uniqueSkus} SKU)`;
      }
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
  if (elements.removePdfBtn) {
    elements.removePdfBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.pdfFile = null;
      state.pdfArrayBuffer = null;
      state.masterPdfBytes = null;
      window.rawUntouchedPdfBytes = null;
      state.uploadedPdfFiles = [];
      renderPdfFilesChips();
      if (elements.pdfInput) elements.pdfInput.value = '';
      if (elements.processBtn) elements.processBtn.disabled = true;
      hideResults();
      showToast('تمت إزالة كافة ملفات الـ PDF المحددة.', 'info');
    });
  }

  if (elements.addMorePdfBtn) {
    elements.addMorePdfBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (elements.pdfInput) {
        elements.pdfInput.value = '';
        elements.pdfInput.click();
      }
    });
  }

  if (elements.removeInventoryBtn) {
    elements.removeInventoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.inventoryFile = null;
      state.inventoryArrayBuffer = null;
      InventoryParser.reset();
      if (elements.inventoryInput) elements.inventoryInput.value = '';
      if (elements.inventoryFileInfo) elements.inventoryFileInfo.classList.add('hidden');
      if (elements.inventoryDropzone) {
        const prompt = elements.inventoryDropzone.querySelector('.dropzone-prompt');
        if (prompt) prompt.classList.remove('hidden');
      }
      if (elements.inventoryStatusPill) {
        elements.inventoryStatusPill.textContent = 'اختياري';
        elements.inventoryStatusPill.className = 'text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-medium transition';
      }
      showToast('تمت إزالة ملف المخزون.', 'info');
    });
  }

  // Setup dropzones
  setupDropzone(elements.pdfDropzone, elements.pdfInput, (files) => handlePdfFiles(files, state.uploadedPdfFiles.length > 0));
  setupDropzone(elements.inventoryDropzone, elements.inventoryInput, handleInventoryFile);

  // ==========================================
  // Feature 4: Multi-PDF Merge & Resize Engine
  // ==========================================
  let multiPdfFiles = [];

  // Toggle Multi-PDF Accordion Card
  if (elements.toggleMultiPdfBtn && elements.multiPdfContent) {
    elements.toggleMultiPdfBtn.addEventListener('click', () => {
      const isHidden = elements.multiPdfContent.classList.contains('hidden');
      elements.multiPdfContent.classList.toggle('hidden', !isHidden);
      if (elements.multiPdfChevron) {
        elements.multiPdfChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Setup Multi-PDF Dropzone & Input
  if (elements.multiPdfDropzone && elements.multiPdfInput) {
    ['dragenter', 'dragover'].forEach(eventName => {
      elements.multiPdfDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.multiPdfDropzone.classList.add('border-indigo-400', 'bg-indigo-950/20');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      elements.multiPdfDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.multiPdfDropzone.classList.remove('border-indigo-400', 'bg-indigo-950/20');
      });
    });

    elements.multiPdfDropzone.addEventListener('drop', async (e) => {
      const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        await addMultiPdfFiles(files);
      }
    });

    elements.multiPdfDropzone.addEventListener('click', (e) => {
      if (e.target.closest('#clear-multi-pdf-btn') || e.target.closest('.file-action-btn')) return;
      elements.multiPdfInput.click();
    });

    elements.multiPdfInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        await addMultiPdfFiles(files);
      }
      elements.multiPdfInput.value = '';
    });
  }

  async function addMultiPdfFiles(newFiles) {
    for (const f of newFiles) {
      try {
        const buf = await f.arrayBuffer();
        let pagesCount = 1;
        if (typeof PDFLib !== 'undefined') {
          try {
            const doc = await PDFLib.PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
            pagesCount = doc.getPageCount();
          } catch (_) {}
        }
        multiPdfFiles.push({
          id: 'pdf_' + Math.random().toString(36).substring(2, 9),
          file: f,
          name: f.name,
          size: f.size,
          buffer: buf,
          pageCount: pagesCount
        });
      } catch (err) {
        console.warn('Error reading multi pdf file:', f.name, err);
      }
    }
    renderMultiPdfList();
    showToast(`تمت إضافة ${newFiles.length} ملفات إلى قائمة الدمج.`, 'info');
  }

  function renderMultiPdfList() {
    if (!elements.multiPdfFileList || !elements.multiPdfListContainer) return;

    if (multiPdfFiles.length === 0) {
      elements.multiPdfListContainer.classList.add('hidden');
      if (elements.multiPdfCountBadge) elements.multiPdfCountBadge.classList.add('hidden');
      if (elements.mergeAndProcessBtn) elements.mergeAndProcessBtn.disabled = true;
      elements.multiPdfFileList.innerHTML = '';
      return;
    }

    elements.multiPdfListContainer.classList.remove('hidden');
    if (elements.multiPdfCountBadge) {
      elements.multiPdfCountBadge.textContent = `${multiPdfFiles.length} ملفات`;
      elements.multiPdfCountBadge.classList.remove('hidden');
    }
    if (elements.mergeAndProcessBtn) elements.mergeAndProcessBtn.disabled = false;

    elements.multiPdfFileList.innerHTML = multiPdfFiles.map((item, idx) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs hover:border-slate-700 transition" data-id="${item.id}">
        <div class="flex items-center gap-3 overflow-hidden">
          <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[11px] border border-indigo-500/30 flex-shrink-0">
            ${idx + 1}
          </span>
          <div class="truncate">
            <span class="font-semibold text-slate-200 block truncate" title="${item.name}">${item.name}</span>
            <span class="text-[10px] text-slate-400 font-mono">${formatFileSize(item.size)} • ${item.pageCount} صفحة</span>
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0 mr-2">
          <button class="file-action-btn p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition disabled:opacity-20" title="تحريك لأعلى" onclick="moveMultiPdfItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>
            ▲
          </button>
          <button class="file-action-btn p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition disabled:opacity-20" title="تحريك لأسفل" onclick="moveMultiPdfItem(${idx}, 1)" ${idx === multiPdfFiles.length - 1 ? 'disabled' : ''}>
            ▼
          </button>
          <button class="file-action-btn p-1.5 rounded hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition" title="حذف" onclick="removeMultiPdfItem(${idx})">
            ✕
          </button>
        </div>
      </div>
    `).join('');
  }

  window.moveMultiPdfItem = function(index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= multiPdfFiles.length) return;
    const temp = multiPdfFiles[index];
    multiPdfFiles[index] = multiPdfFiles[targetIdx];
    multiPdfFiles[targetIdx] = temp;
    renderMultiPdfList();
  };

  window.removeMultiPdfItem = function(index) {
    multiPdfFiles.splice(index, 1);
    renderMultiPdfList();
  };

  if (elements.clearMultiPdfBtn) {
    elements.clearMultiPdfBtn.addEventListener('click', () => {
      multiPdfFiles = [];
      renderMultiPdfList();
      showToast('تم إفراغ قائمة ملفات الدمج.', 'info');
    });
  }

  // One-Click Merge & Resize Engine to exactly 75x125 mm (212.60 x 354.33 pt)
  if (elements.mergeAndProcessBtn) {
    elements.mergeAndProcessBtn.addEventListener('click', async () => {
      if (multiPdfFiles.length === 0) {
        showToast('يرجى إضافة ملفات PDF أولاً للدمج والتصغير.', 'error');
        return;
      }
      if (typeof PDFLib === 'undefined') {
        showToast('مكتبة PDFLib غير متوفرة في الصفحة.', 'error');
        return;
      }

      elements.mergeAndProcessBtn.disabled = true;
      const originalBtnText = elements.mergeAndProcessBtn.innerHTML;
      elements.mergeAndProcessBtn.innerHTML = `
        <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        <span>جاري الدمج والتصغير لمقاس 75×125 ملم...</span>
      `;

      elements.progressSection.classList.remove('hidden');
      elements.progressBar.style.width = '20%';
      elements.progressPercent.textContent = '20%';
      elements.progressStatus.textContent = 'جاري دمج الملفات وتنسيق أبعاد الصفحات...';

      try {
        const targetW = 212.60;
        const targetH = 354.33;
        const mergedDoc = await PDFLib.PDFDocument.create();

        let totalMergedPages = 0;
        for (let fIdx = 0; fIdx < multiPdfFiles.length; fIdx++) {
          const item = multiPdfFiles[fIdx];
          const srcDoc = await PDFLib.PDFDocument.load(item.buffer.slice(0), { ignoreEncryption: true });
          const count = srcDoc.getPageCount();

          for (let pIdx = 0; pIdx < count; pIdx++) {
            const srcPage = srcDoc.getPage(pIdx);
            const { width: srcW, height: srcH } = srcPage.getSize();
            const newPage = mergedDoc.addPage([targetW, targetH]);

            try {
              const embedded = await mergedDoc.embedPage(srcPage);
              const scale = Math.min(targetW / srcW, targetH / srcH);
              const scaledW = srcW * scale;
              const scaledH = srcH * scale;
              const xOffset = (targetW - scaledW) / 2;
              const yOffset = (targetH - scaledH) / 2;

              newPage.drawPage(embedded, {
                x: xOffset,
                y: yOffset,
                width: scaledW,
                height: scaledH
              });
            } catch (embedErr) {
              console.warn(`Could not embed page ${pIdx + 1} of ${item.name}:`, embedErr);
            }
            totalMergedPages++;
          }
        }

        const mergedPdfBytes = await mergedDoc.save();
        window.rawUntouchedPdfBytes = new Uint8Array(mergedPdfBytes);
        state.masterPdfBytes = window.rawUntouchedPdfBytes;
        state.pdfArrayBuffer = window.rawUntouchedPdfBytes.slice(0).buffer;
        state.pdfFileName = `بوالص_مدمجة_ومصغرة_${multiPdfFiles.length}_ملفات.pdf`;

        // Update Dropzone UI
        elements.pdfFileName.textContent = state.pdfFileName;
        elements.pdfFileSize.textContent = `${formatFileSize(mergedPdfBytes.byteLength)} (${totalMergedPages} صفحة)`;
        elements.pdfFileInfo.classList.remove('hidden');
        elements.pdfDropzone.querySelector('.dropzone-prompt').classList.add('hidden');
        elements.processBtn.disabled = false;

        showToast(`تم دمج وتصغير ${multiPdfFiles.length} ملفات (${totalMergedPages} صفحة) بنجاح! جاري الفرز التلقائي...`, 'success');

        // Automatically feed merged buffer into parsing & sorting pipeline
        await processLabels();
      } catch (err) {
        console.error('Merge error:', err);
        showErrorModal(`خطأ تقني أثناء دمج وتصغير الملفات:\n\n${err.message || err}`);
      } finally {
        elements.mergeAndProcessBtn.disabled = false;
        elements.mergeAndProcessBtn.innerHTML = originalBtnText;
      }
    });
  }

  // ==========================================
  // Feature 3: Custom Output Filename
  // ==========================================
  function getCustomExportFilename(defaultName = 'Bosta_Sorted.pdf') {
    let name = elements.customFilenameInput ? elements.customFilenameInput.value.trim() : '';
    if (!name) {
      name = defaultName;
    }
    // Clean invalid characters: / \ : * ? " < > |
    name = name.replace(/[/\\?%*:|"<>]/g, '_');
    if (!name.toLowerCase().endsWith('.pdf')) {
      name += '.pdf';
    }
    return name;
  }

  function updateDefaultFilename() {
    if (!elements.customFilenameInput) return;
    const today = new Date().toISOString().slice(0, 10);
    let filterPart = '';
    if (state.activeFilter === 'kids') filterPart = '_أطفالي';
    else if (state.activeFilter === 'women') filterPart = '_حريمي';
    else if (state.activeFilter === 'other') filterPart = '_منتجات_أخرى';
    else if (state.activeFilter === 'multi') filterPart = '_متعدد_القطع';
    else if (state.activeFilter === 'single') filterPart = '_قطعة_واحدة';

    const defaultFilename = `بوالص_بوسطة_مرتبة${filterPart}_${today}.pdf`;
    elements.customFilenameInput.placeholder = defaultFilename;
    if (!elements.customFilenameInput.dataset || !elements.customFilenameInput.dataset.userEdited) {
      elements.customFilenameInput.value = defaultFilename;
    }
  }

  if (elements.customFilenameInput) {
    updateDefaultFilename();
    elements.customFilenameInput.addEventListener('input', () => {
      if (elements.customFilenameInput.dataset) {
        elements.customFilenameInput.dataset.userEdited = 'true';
      }
      try {
        localStorage.setItem('bosta_custom_filename', elements.customFilenameInput.value);
      } catch (e) {}
    });
  }

  // ==========================================
  // Dynamic Warehouse Catalog & Route Manager
  // ==========================================
  let discoveredPdfProducts = [];

  function updateCatalogUI() {
    const count = (typeof InventoryParser !== 'undefined' && InventoryParser.inventoryItems)
      ? InventoryParser.inventoryItems.length
      : 546;

    if (elements.catalogStatusBadge) {
      elements.catalogStatusBadge.textContent = `📊 الكتالوج المعتمد: ${count} صنفاً ورمز SKU`;
    }
    if (elements.catalogInfoText) {
      elements.catalogInfoText.textContent = `الكتالوج المعتمد حالياً يضم ${count} صنفاً ورمز SKU من شيت بعد الترتيب.`;
    }
    if (elements.catalogInspectorCount) {
      elements.catalogInspectorCount.textContent = `${count} موديلاً وSKU`;
    }
    const stratText = document.getElementById('active-strategy-text');
    if (stratText) {
      stratText.textContent = `الترتيب النشط: عدد القطع تنازلياً ➔ تسلسل شيت الـ SKU ومسار المخزن (${count} صنفاً معتمداً)`;
    }
    renderCatalogInspectorItems();
  }

  function renderCatalogInspectorItems(query = '') {
    if (!elements.catalogInspectorItems) return;
    const items = (typeof InventoryParser !== 'undefined' && InventoryParser.inventoryItems)
      ? InventoryParser.inventoryItems
      : [];

    const normQuery = (query || '').trim().toLowerCase();

    const filtered = items.filter(item => {
      if (!normQuery) return true;
      const title = (item.title || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      return title.includes(normQuery) || sku.includes(normQuery);
    });

    if (filtered.length === 0) {
      elements.catalogInspectorItems.innerHTML = `
        <div class="col-span-full py-4 text-center text-xs text-slate-500">
          لا توجد أصناف مطابقة لكلمة البحث "${query}".
        </div>
      `;
      return;
    }

    elements.catalogInspectorItems.innerHTML = filtered.slice(0, 100).map(item => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs hover:border-teal-500/40 transition">
        <div class="flex items-center gap-2 overflow-hidden">
          <span class="w-6 h-6 rounded bg-teal-500/20 text-teal-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
            ${(item.index || 0) + 1}
          </span>
          <div class="truncate">
            <span class="text-slate-200 truncate font-medium block" title="${item.title}">
              ${item.title}
            </span>
            ${item.sku ? `<span class="text-[10px] font-mono text-teal-400 block">${item.sku}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('') + (filtered.length > 100 ? `<div class="col-span-full text-center text-[10px] text-slate-500 py-1">عرض أول 100 صنف من أصل ${filtered.length} صنف</div>` : '');
  }

  // Toggle Accordion for Catalog Manager
  if (elements.toggleCatalogManagerBtn && elements.catalogManagerContent) {
    elements.toggleCatalogManagerBtn.addEventListener('click', () => {
      const isHidden = elements.catalogManagerContent.classList.contains('hidden');
      if (isHidden) {
        elements.catalogManagerContent.classList.remove('hidden');
        if (elements.catalogManagerChevron) elements.catalogManagerChevron.classList.add('rotate-180');
        renderCatalogInspectorItems();
      } else {
        elements.catalogManagerContent.classList.add('hidden');
        if (elements.catalogManagerChevron) elements.catalogManagerChevron.classList.remove('rotate-180');
      }
    });
  }

  // Toggle View of Active Catalog Items
  if (elements.catalogToggleViewBtn) {
    elements.catalogToggleViewBtn.addEventListener('click', () => {
      if (!elements.catalogInspectorSection) return;
      const isHidden = elements.catalogInspectorSection.classList.contains('hidden');
      if (isHidden) {
        elements.catalogInspectorSection.classList.remove('hidden');
        elements.catalogToggleViewBtn.innerHTML = '<span>👁️ إخفاء أصناف المسار</span>';
        renderCatalogInspectorItems();
      } else {
        elements.catalogInspectorSection.classList.add('hidden');
        elements.catalogToggleViewBtn.innerHTML = '<span>👁️ عرض أصناف المسار</span>';
      }
    });
  }

  // Search in catalog items
  if (elements.catalogInspectorSearch) {
    elements.catalogInspectorSearch.addEventListener('input', (e) => {
      renderCatalogInspectorItems(e.target.value);
    });
  }

  // Reset catalog to default 546 items from sheet بعد الترتيب
  if (elements.catalogResetBtn) {
    elements.catalogResetBtn.addEventListener('click', () => {
      if (confirm('هل أنت متأكد من رغبتك في استعادة الكتالوج الافتراضي المعتمد (546 صنفاً من شيت بعد الترتيب)؟')) {
        const res = InventoryParser.resetToDefaultCatalog();
        updateCatalogUI();
        if (elements.catalogExcelResult) elements.catalogExcelResult.classList.add('hidden');
        if (state.extractedPages.length > 0) reSortAndRender();
        showToast(`تمت استعادة الكتالوج الافتراضي المعتمد (${res.totalItems} صنفاً).`, 'success');
      }
    });
  }

  // Export current catalog as CSV
  if (elements.catalogExportBtn) {
    elements.catalogExportBtn.addEventListener('click', () => {
      const items = (typeof InventoryParser !== 'undefined' && InventoryParser.inventoryItems)
        ? InventoryParser.inventoryItems
        : [];
      const lines = ['Row_Index,Title,SKU,Color,Size'];
      items.forEach((item, idx) => {
        const title = (item.title || '').replace(/"/g, '""');
        const sku = (item.sku || '').replace(/"/g, '""');
        const color = (item.color || '').replace(/"/g, '""');
        const size = (item.size || '').replace(/"/g, '""');
        lines.push(`${idx + 1},"${title}","${sku}","${color}","${size}"`);
      });
      const csvContent = '\uFEFF' + lines.join('\n'); // BOM for Arabic Excel
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `Warehouse_SKU_Inventory_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('تم تصدير كتالوج ممرات المخزن والـ SKU كملف CSV بنجاح!', 'success');
    });
  }

  // 1. Dynamic Catalog Uploader (CSV / Excel)
  if (elements.catalogExcelDropzone && elements.catalogExcelInput) {
    elements.catalogExcelDropzone.addEventListener('click', () => elements.catalogExcelInput.click());

    elements.catalogExcelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.catalogExcelDropzone.classList.add('border-teal-400', 'bg-teal-950/30');
    });

    elements.catalogExcelDropzone.addEventListener('dragleave', () => {
      elements.catalogExcelDropzone.classList.remove('border-teal-400', 'bg-teal-950/30');
    });

    elements.catalogExcelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.catalogExcelDropzone.classList.remove('border-teal-400', 'bg-teal-950/30');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCatalogExcelFile(e.dataTransfer.files[0]);
      }
    });

    elements.catalogExcelInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCatalogExcelFile(e.target.files[0]);
      }
    });
  }

  async function handleCatalogExcelFile(file) {
    if (!file) return;
    try {
      if (typeof XLSX === 'undefined') {
        showToast('مكتبة SheetJS غير متوفرة لمعالجة الملف.', 'error');
        return;
      }
      const buffer = await file.arrayBuffer();
      const res = await InventoryParser.parseFile(buffer);
      updateCatalogUI();
      if (state.extractedPages.length > 0) reSortAndRender();

      if (elements.catalogExcelResult) {
        elements.catalogExcelResult.classList.remove('hidden');
        elements.catalogExcelResult.innerHTML = `
          <div class="font-bold mb-0.5">✅ تم تحديث مسار المخزن بنجاح (${file.name}):</div>
          <div>تمت قراءة ورقة [${res.sheetName || 'بعد الترتيب'}] وتحديث ${res.totalItems} صنفاً و ${res.uniqueSkus} رمز SKU!</div>
          <div class="text-[10px] text-emerald-400 mt-0.5">تم حفظ المسار الجديد في ذاكرة المتصفح (localStorage) ليعتمد تلقائياً في كل عملية فرز.</div>
        `;
      }

      showToast(`تم تحديث مسار المخزن (${res.totalItems} صنفاً و ${res.uniqueSkus} SKU) وحفظه في المتصفح!`, 'success');
    } catch (err) {
      console.error('Catalog Excel error:', err);
      showToast(`فشل قراءة ملف الإكسيل/CSV: ${err.message || err}`, 'error');
    }
  }

  // 2. Dynamic PDF Catalog Extractor
  if (elements.catalogPdfDropzone && elements.catalogPdfInput) {
    elements.catalogPdfDropzone.addEventListener('click', () => elements.catalogPdfInput.click());

    elements.catalogPdfDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.catalogPdfDropzone.classList.add('border-purple-400', 'bg-purple-950/30');
    });

    elements.catalogPdfDropzone.addEventListener('dragleave', () => {
      elements.catalogPdfDropzone.classList.remove('border-purple-400', 'bg-purple-950/30');
    });

    elements.catalogPdfDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.catalogPdfDropzone.classList.remove('border-purple-400', 'bg-purple-950/30');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCatalogPdfFile(e.dataTransfer.files[0]);
      }
    });

    elements.catalogPdfInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCatalogPdfFile(e.target.files[0]);
      }
    });
  }

  async function handleCatalogPdfFile(file) {
    if (!file) return;
    try {
      if (elements.catalogPdfStatus) {
        elements.catalogPdfStatus.classList.remove('hidden');
        elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-slate-900 text-slate-300 border border-slate-700 flex items-center gap-2';
        elements.catalogPdfStatus.innerHTML = `
          <div class="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
          <span>جاري فحص نصوص ملف الـ PDF واستخراج الموديلات غير المسجلة...</span>
        `;
      }

      const buffer = await file.arrayBuffer();
      const extractedPages = await PDFProcessor.extractPages(buffer);
      const discovered = ArabicUtils.extractDiscoveredProductsFromPages(extractedPages);
      discoveredPdfProducts = discovered;

      if (discovered.length === 0) {
        if (elements.catalogPdfStatus) {
          elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
          elements.catalogPdfStatus.innerHTML = `✅ جميع الموديلات المستخرجة من هذا الملف مسجلة بالفعل في مسار ممرات المخزن.`;
        }
        if (elements.catalogDiscoveredSection) elements.catalogDiscoveredSection.classList.add('hidden');
        showToast('لم يتم العثور على أي موديلات جديدة غير مسجلة في هذا الملف.', 'info');
      } else {
        if (elements.catalogPdfStatus) {
          elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-purple-500/15 text-purple-200 border border-purple-500/30';
          elements.catalogPdfStatus.innerHTML = `⚠️ تم اكتشاف <b>${discovered.length}</b> موديل جديد غير مسجل في ممرات المخزن!`;
        }
        renderDiscoveredChips(discovered);
        if (elements.catalogDiscoveredSection) elements.catalogDiscoveredSection.classList.remove('hidden');
        showToast(`تم اكتشاف ${discovered.length} موديل جديد! يمكنك إضافتهم لمسار المخزن الآن.`, 'success');
      }
    } catch (err) {
      console.error('Catalog PDF extract error:', err);
      if (elements.catalogPdfStatus) {
        elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-rose-500/10 text-rose-300 border border-rose-500/20';
        elements.catalogPdfStatus.innerHTML = `خطأ في فحص الـ PDF: ${err.message || err}`;
      }
      showToast(`فشل فحص ملف الـ PDF: ${err.message || err}`, 'error');
    }
  }

  function renderDiscoveredChips(items) {
    if (!elements.catalogDiscoveredChips) return;
    elements.catalogDiscoveredChips.innerHTML = items.map((item, idx) => `
      <div class="flex items-center gap-2 bg-slate-900 border border-purple-500/40 px-3 py-1.5 rounded-xl text-xs text-white">
        <span class="font-semibold">${item.modelName}</span>
        <button class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-2 py-0.5 rounded text-[11px] transition shadow" onclick="addSingleDiscoveredProduct(${idx})">
          ➕ إضافة للمسار
        </button>
      </div>
    `).join('');
  }

  window.addSingleDiscoveredProduct = function(index) {
    const item = discoveredPdfProducts[index];
    if (!item) return;
    const res = ArabicUtils.addProductsToCatalog([item.modelName], true);
    showToast(`تمت إضافة "${item.modelName}" إلى مسار ممرات المخزن بنجاح!`, 'success');
    discoveredPdfProducts.splice(index, 1);
    if (discoveredPdfProducts.length === 0) {
      if (elements.catalogDiscoveredSection) elements.catalogDiscoveredSection.classList.add('hidden');
      if (elements.catalogPdfStatus) {
        elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
        elements.catalogPdfStatus.innerHTML = `✅ تم اعتماد وإضافة كافة الموديلات المكتشفة لمسار المخزن!`;
      }
    } else {
      renderDiscoveredChips(discoveredPdfProducts);
    }
    updateCatalogUI();
    if (state.extractedPages.length > 0) reSortAndRender();
  };

  if (elements.catalogAddAllDiscoveredBtn) {
    elements.catalogAddAllDiscoveredBtn.addEventListener('click', () => {
      if (discoveredPdfProducts.length === 0) return;
      const names = discoveredPdfProducts.map(p => p.modelName);
      const res = ArabicUtils.addProductsToCatalog(names, true);
      showToast(`تمت إضافة ${res.addedCount} موديل جديد إلى مسار ممرات المخزن وحفظها في المتصفح!`, 'success');
      discoveredPdfProducts = [];
      if (elements.catalogDiscoveredSection) elements.catalogDiscoveredSection.classList.add('hidden');
      if (elements.catalogPdfStatus) {
        elements.catalogPdfStatus.className = 'p-2.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
        elements.catalogPdfStatus.innerHTML = `✅ تم اعتماد وإضافة كافة الموديلات المكتشفة (${res.addedCount}) لمسار المخزن!`;
      }
      updateCatalogUI();
      if (state.extractedPages.length > 0) reSortAndRender();
    });
  }

  // Load Persisted User Preferences (localStorage)
  function loadPersistedPreferences() {
    try {
      // Pipeline Options Bar Toggles
      const savedMerge = localStorage.getItem('bosta_pipeline_merge');
      if (savedMerge !== null) {
        state.mergeEnabled = savedMerge === 'true';
        if (elements.pipelineMergeToggle) elements.pipelineMergeToggle.checked = state.mergeEnabled;
      }

      const savedResizePipe = localStorage.getItem('bosta_pipeline_resize');
      if (savedResizePipe !== null) {
        state.thermalResizeEnabled = savedResizePipe === 'true';
        if (elements.pipelineResizeToggle) elements.pipelineResizeToggle.checked = state.thermalResizeEnabled;
      }

      const savedSortPipe = localStorage.getItem('bosta_pipeline_sort');
      if (savedSortPipe !== null) {
        state.smartSortEnabled = savedSortPipe === 'true';
        if (elements.pipelineSortToggle) elements.pipelineSortToggle.checked = state.smartSortEnabled;
      }

      const savedSepPipe = localStorage.getItem('bosta_pipeline_separators');
      if (savedSepPipe !== null) {
        state.blankSeparatorsEnabled = savedSepPipe === 'true';
        if (elements.pipelineSeparatorsToggle) elements.pipelineSeparatorsToggle.checked = state.blankSeparatorsEnabled;
      }

      const savedManPipe = localStorage.getItem('bosta_pipeline_manifest');
      if (savedManPipe !== null) {
        state.manifestSheetEnabled = savedManPipe === 'true';
        if (elements.pipelineManifestToggle) elements.pipelineManifestToggle.checked = state.manifestSheetEnabled;
      }

      const savedWalk = localStorage.getItem('bosta_walk_sequence');
      if (savedWalk !== null) {
        state.useWalkSequence = savedWalk === 'true';
        if (elements.walkSequenceToggle) elements.walkSequenceToggle.checked = state.useWalkSequence;
        if (elements.panelWalkSequenceToggle) elements.panelWalkSequenceToggle.checked = state.useWalkSequence;
      }

      const savedPicklists = localStorage.getItem('bosta_enable_picklists');
      if (savedPicklists !== null) {
        state.enableBatchPickLists = savedPicklists === 'true';
        state.insertBlankSeparators = state.enableBatchPickLists;
        if (elements.batchPicklistsToggle) elements.batchPicklistsToggle.checked = state.enableBatchPickLists;
        if (elements.panelBatchPicklistsToggle) elements.panelBatchPicklistsToggle.checked = state.enableBatchPickLists;
      }

      const savedReverseArabic = localStorage.getItem('bosta_reverse_arabic');
      if (savedReverseArabic !== null && elements.reverseArabicCheckbox) {
        elements.reverseArabicCheckbox.checked = savedReverseArabic === 'true';
      }

      const savedResize = localStorage.getItem('bosta_resize_enabled');
      if (savedResize !== null) {
        state.resizeEnabled = savedResize === 'true';
        if (elements.resizeCheckbox) elements.resizeCheckbox.checked = state.resizeEnabled;
      }

      const savedFitMode = localStorage.getItem('bosta_label_fit_mode');
      if (savedFitMode !== null) {
        state.labelFitMode = savedFitMode;
        if (savedFitMode === 'fill_width' && elements.fitModeFillRadio) {
          elements.fitModeFillRadio.checked = true;
        } else if (elements.fitModeSafeRadio) {
          elements.fitModeSafeRadio.checked = true;
        }
      }

      const savedAspect = localStorage.getItem('bosta_keep_aspect_ratio');
      if (savedAspect !== null) {
        state.keepAspectRatio = savedAspect === 'true';
        if (elements.aspectRatioToggle) elements.aspectRatioToggle.checked = state.keepAspectRatio;
      }

      const savedWidth = localStorage.getItem('bosta_width_mm');
      if (savedWidth && elements.widthInput) elements.widthInput.value = savedWidth;

      const savedHeight = localStorage.getItem('bosta_height_mm');
      if (savedHeight && elements.heightInput) elements.heightInput.value = savedHeight;

      const savedFilename = localStorage.getItem('bosta_custom_filename');
      if (savedFilename && elements.customFilenameInput) {
        elements.customFilenameInput.value = savedFilename;
        elements.customFilenameInput.dataset.userEdited = 'true';
      }
    } catch (e) {
      console.warn('Error loading preferences from localStorage:', e);
    }
  }

  // Label Fit Mode Radio Listeners
  if (elements.fitModeSafeRadio) {
    elements.fitModeSafeRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.labelFitMode = 'safe_fit';
        try { localStorage.setItem('bosta_label_fit_mode', 'safe_fit'); } catch (_) {}
      }
    });
  }
  if (elements.fitModeFillRadio) {
    elements.fitModeFillRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.labelFitMode = 'fill_width';
        try { localStorage.setItem('bosta_label_fit_mode', 'fill_width'); } catch (_) {}
      }
    });
  }

  // Pipeline Toolbar Event Listeners
  if (elements.pipelineMergeToggle) {
    elements.pipelineMergeToggle.addEventListener('change', (e) => {
      state.mergeEnabled = e.target.checked;
      try { localStorage.setItem('bosta_pipeline_merge', state.mergeEnabled); } catch (_) {}
    });
  }
  if (elements.pipelineResizeToggle) {
    elements.pipelineResizeToggle.addEventListener('change', (e) => {
      state.thermalResizeEnabled = e.target.checked;
      try { localStorage.setItem('bosta_pipeline_resize', state.thermalResizeEnabled); } catch (_) {}
    });
  }
  if (elements.pipelineSortToggle) {
    elements.pipelineSortToggle.addEventListener('change', (e) => {
      state.smartSortEnabled = e.target.checked;
      try { localStorage.setItem('bosta_pipeline_sort', state.smartSortEnabled); } catch (_) {}
      if (state.extractedPages.length > 0) reSortAndRender();
    });
  }
  if (elements.pipelineSeparatorsToggle) {
    elements.pipelineSeparatorsToggle.addEventListener('change', (e) => {
      state.blankSeparatorsEnabled = e.target.checked;
      try { localStorage.setItem('bosta_pipeline_separators', state.blankSeparatorsEnabled); } catch (_) {}
    });
  }
  if (elements.pipelineManifestToggle) {
    elements.pipelineManifestToggle.addEventListener('change', (e) => {
      state.manifestSheetEnabled = e.target.checked;
      try { localStorage.setItem('bosta_pipeline_manifest', state.manifestSheetEnabled); } catch (_) {}
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
      try {
        localStorage.setItem('bosta_reverse_arabic', String(e.target.checked));
      } catch (err) {}
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
  if (elements.resizeCheckbox) {
    elements.resizeCheckbox.addEventListener('change', (e) => {
      state.resizeEnabled = e.target.checked;
      try {
        localStorage.setItem('bosta_resize_enabled', String(e.target.checked));
      } catch (err) {}
      if (elements.resizeOptionsContainer) {
        elements.resizeOptionsContainer.classList.toggle('opacity-40', !state.resizeEnabled);
        elements.resizeOptionsContainer.classList.toggle('pointer-events-none', !state.resizeEnabled);
      }
    });
  }

  // Aspect Ratio Toggle
  if (elements.aspectRatioToggle) {
    elements.aspectRatioToggle.addEventListener('change', (e) => {
      state.keepAspectRatio = e.target.checked;
      try {
        localStorage.setItem('bosta_keep_aspect_ratio', String(e.target.checked));
      } catch (err) {}
    });
  }

  // Width & Height inputs
  if (elements.widthInput) {
    elements.widthInput.addEventListener('change', (e) => {
      state.widthMm = parseFloat(e.target.value) || 75;
      try {
        localStorage.setItem('bosta_width_mm', String(state.widthMm));
      } catch (err) {}
    });
  }
  if (elements.heightInput) {
    elements.heightInput.addEventListener('change', (e) => {
      state.heightMm = parseFloat(e.target.value) || 125;
      try {
        localStorage.setItem('bosta_height_mm', String(state.heightMm));
      } catch (err) {}
    });
  }

  /**
   * Process & Extract PDF
   */
  async function processLabels() {
    if (state.uploadedPdfFiles.length === 0 && !state.pdfArrayBuffer) {
      showToast('يرجى رفع ملف PDF أولاً.', 'error');
      return;
    }

    state.isProcessing = true;
    elements.processBtn.disabled = true;
    elements.progressSection.classList.remove('hidden');
    hideResults();

    try {
      // 0. Merge Multi-PDFs if multiple files and merge toggle is enabled
      if (state.uploadedPdfFiles.length > 1 && state.mergeEnabled) {
        elements.progressBar.style.width = '10%';
        elements.progressPercent.textContent = '10%';
        elements.progressStatus.textContent = `جاري دمج ${state.uploadedPdfFiles.length} ملفات PDF معاً...`;

        const buffers = state.uploadedPdfFiles.map(f => f.buffer);
        const mergedBytes = await PDFProcessor.mergePdfBuffers(buffers, (prog) => {
          const p = Math.round(prog.percent * 0.3);
          elements.progressBar.style.width = `${p}%`;
          elements.progressPercent.textContent = `${p}%`;
          elements.progressStatus.textContent = `${prog.phase} (${prog.current} من ${prog.total})`;
        });

        window.rawUntouchedPdfBytes = new Uint8Array(mergedBytes);
        state.masterPdfBytes = window.rawUntouchedPdfBytes;
        state.pdfArrayBuffer = window.rawUntouchedPdfBytes.slice(0).buffer;
      } else if (state.uploadedPdfFiles.length >= 1 && (!state.pdfArrayBuffer || !state.masterPdfBytes)) {
        window.rawUntouchedPdfBytes = new Uint8Array(state.uploadedPdfFiles[0].buffer);
        state.masterPdfBytes = window.rawUntouchedPdfBytes;
        state.pdfArrayBuffer = window.rawUntouchedPdfBytes.slice(0).buffer;
      }

      // 1. Text Extraction using safely cloned buffer with non-blocking async loops
      const safeBuffer = state.pdfArrayBuffer.slice(0);
      const isMerged = state.uploadedPdfFiles.length > 1 && state.mergeEnabled;
      const basePct = isMerged ? 30 : 0;
      const scale = isMerged ? 0.7 : 1.0;

      const extracted = await PDFProcessor.extractPages(safeBuffer, (prog) => {
        const overall = Math.min(100, Math.round(basePct + (prog.percent * scale)));
        elements.progressBar.style.width = `${overall}%`;
        elements.progressPercent.textContent = `${overall}%`;
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
   * Re-sorts pages based on unified pipeline and re-renders table
   */
  function reSortAndRender() {
    if (!state.extractedPages || state.extractedPages.length === 0) return;

    if (state.smartSortEnabled) {
      state.sortedPages = PDFProcessor.sortPages(state.extractedPages, { useWalkSequence: state.useWalkSequence });
    } else {
      state.sortedPages = [...state.extractedPages];
    }
    updateStatistics();
    updateDefaultFilename();
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
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderTable();
    });
  }

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
      updateDefaultFilename();
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

      // Feature 1: Stamp sequential label number [ #X ] on modal canvas strictly inside bottom margin safe zone
      if (activeModalItem && (activeModalItem.newPageNumber || activeModalItem.orderIndex)) {
        const seqNum = activeModalItem.newPageNumber || activeModalItem.orderIndex;
        const seqText = `[ #${seqNum} ]`;
        const midX = viewport.viewBox ? (viewport.viewBox[2] / 2) : 106;
        const pt = viewport.convertToViewportPoint(midX, 9.5);

        canvasContext.save();
        canvasContext.fillStyle = '#000000';
        canvasContext.font = `bold ${13 * viewport.scale}px sans-serif`;
        canvasContext.textAlign = 'center';
        canvasContext.textBaseline = 'middle';
        canvasContext.fillText(seqText, pt[0], pt[1]);
        canvasContext.restore();
      }

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

  if (elements.closeModalBtn) {
    elements.closeModalBtn.addEventListener('click', () => {
      if (elements.detailModal) elements.detailModal.classList.add('hidden');
    });
  }

  if (elements.detailModal) {
    elements.detailModal.addEventListener('click', (e) => {
      if (e.target === elements.detailModal) {
        elements.detailModal.classList.add('hidden');
      }
    });
  }

  /**
   * Exact bulletproof download function
   * Pure 1:1 binary copy - DO NOT call setSize, embedPage, scaleContent or setMediaBox!
   * Automatically generates batch pick-list sheets and blank separators via PDFProcessor.generateSortedPDF
   */
  async function downloadPdfBatch(pageIndices, filename = 'Bosta_Sorted.pdf', options = {}) {
    const bytes = window.rawUntouchedPdfBytes || state.masterPdfBytes;
    if (!bytes || !pageIndices || pageIndices.length === 0) {
      alert('لا توجد بوليصات محددة للتحميل');
      return;
    }
    try {
      const mergedOptions = {
        enableBatchPickLists: options.enableBatchPickLists !== undefined ? options.enableBatchPickLists : state.blankSeparatorsEnabled,
        insertBlankSeparators: options.insertBlankSeparators !== undefined ? options.insertBlankSeparators : state.blankSeparatorsEnabled,
        insertMasterManifest: options.insertMasterManifest !== undefined ? options.insertMasterManifest : state.manifestSheetEnabled,
        thermalResize: options.thermalResize !== undefined ? options.thermalResize : state.thermalResizeEnabled,
        fitMode: options.fitMode || state.labelFitMode || 'safe_fit',
        widthMm: state.widthMm,
        heightMm: state.heightMm,
        useWalkSequence: state.useWalkSequence,
        ...options
      };

      const pdfBytes = await PDFProcessor.generateSortedPDF(bytes, pageIndices, mergedOptions);
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
  // Red Button: "تحميل كافة البوليصات مرتبة" -> Calls downloadPdfBatch with active pipeline options
  if (elements.downloadTopBtn) {
    elements.downloadTopBtn.addEventListener('click', async () => {
      const filename = getCustomExportFilename('Bosta_All_Sorted.pdf');
      await downloadPdfBatch(state.sortedPages, filename);
    });
  }
  if (elements.downloadStickyBtn) {
    elements.downloadStickyBtn.addEventListener('click', async () => {
      const filename = getCustomExportFilename('Bosta_All_Sorted.pdf');
      await downloadPdfBatch(state.sortedPages, filename);
    });
  }

  // Dynamic Filter Download Button: "تحميل نتائج الفلتر الحالي (X بوليصة)" -> Downloads only currently filtered rows
  if (elements.downloadFilteredBtn) {
    elements.downloadFilteredBtn.addEventListener('click', async () => {
      if (!state.currentFilteredPages || state.currentFilteredPages.length === 0) {
        showToast('لا توجد شحنات مطابقة للفلتر الحالي لتصديرها.', 'error');
        return;
      }
      let defaultName = 'Bosta_Filtered_Results.pdf';
      if (state.activeFilter === 'kids') defaultName = 'قسم_الأطفالي.pdf';
      else if (state.activeFilter === 'women') defaultName = 'قسم_الحريمي.pdf';
      else if (state.activeFilter === 'other') defaultName = 'قسم_منتجات_أخرى.pdf';
      else if (state.activeFilter === 'all') defaultName = 'Bosta_All_Sorted.pdf';
      else if (state.activeFilter === 'multi') defaultName = 'أوردرات_متعددة_القطع.pdf';
      else if (state.activeFilter === 'single') defaultName = 'أوردرات_قطعة_واحدة.pdf';

      const filename = getCustomExportFilename(defaultName);
      await downloadPdfBatch(state.currentFilteredPages, filename);
    });
  }

  // Category Batch Downloads (Batch Splitting Cards)
  if (elements.downloadKidsBtn) {
    elements.downloadKidsBtn.addEventListener('click', async () => {
      const kids = state.sortedPages.filter(p => p.isKids);
      const filename = getCustomExportFilename('قسم_الأطفالي.pdf');
      await downloadPdfBatch(kids, filename, { enableBatchPickLists: false });
    });
  }

  if (elements.downloadWomenBtn) {
    elements.downloadWomenBtn.addEventListener('click', async () => {
      const women = state.sortedPages.filter(p => p.isWomen);
      const filename = getCustomExportFilename('قسم_الحريمي.pdf');
      await downloadPdfBatch(women, filename, { enableBatchPickLists: false });
    });
  }

  if (elements.downloadOtherBtn) {
    elements.downloadOtherBtn.addEventListener('click', async () => {
      const other = state.sortedPages.filter(p => p.isOther);
      const filename = getCustomExportFilename('قسم_منتجات_أخرى.pdf');
      await downloadPdfBatch(other, filename, { enableBatchPickLists: false });
    });
  }

  if (elements.downloadMultiBtn) {
    elements.downloadMultiBtn.addEventListener('click', async () => {
      const multi = state.sortedPages.filter(p => (p.piecesCount || p.totalItemsCount || 1) >= 2);
      const filename = getCustomExportFilename('أوردرات_متعددة_القطع.pdf');
      await downloadPdfBatch(multi, filename, { enableBatchPickLists: false });
    });
  }

  if (elements.processBtn) {
    elements.processBtn.addEventListener('click', processLabels);
  }

  /**
   * Reset All
   */
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', () => {
      state.pdfFile = null;
      state.pdfArrayBuffer = null;
      state.masterPdfBytes = null;
      window.rawUntouchedPdfBytes = null;
      state.uploadedPdfFiles = [];
      renderPdfFilesChips();

      state.inventoryFile = null;
      state.inventoryArrayBuffer = null;
      state.extractedPages = [];
      state.sortedPages = [];
      InventoryParser.init();
      updateCatalogUI();

      if (elements.pdfInput) elements.pdfInput.value = '';
      if (elements.inventoryInput) elements.inventoryInput.value = '';
      if (elements.pdfFileInfo) elements.pdfFileInfo.classList.add('hidden');
      if (elements.inventoryFileInfo) elements.inventoryFileInfo.classList.add('hidden');
      if (elements.inventoryStatusPill) {
        elements.inventoryStatusPill.textContent = `معتمد (${InventoryParser.inventoryItems.length} صنفاً)`;
        elements.inventoryStatusPill.className = 'text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-medium transition';
      }
      if (elements.pdfDropzone) {
        const p1 = elements.pdfDropzone.querySelector('.dropzone-prompt');
        if (p1) p1.classList.remove('hidden');
      }
      if (elements.inventoryDropzone) {
        const p2 = elements.inventoryDropzone.querySelector('.dropzone-prompt');
        if (p2) p2.classList.remove('hidden');
      }
      if (elements.processBtn) elements.processBtn.disabled = true;

      hideResults();
      showToast('تمت إعادة ضبط النموذج بنجاح.', 'info');
    });
  }

  function hideResults() {
    elements.resultsSection.classList.add('hidden');
    elements.downloadStickyBar.classList.add('hidden');
  }

  // Initialize dynamic catalog UI and load saved user preferences
  loadPersistedPreferences();
  updateCatalogUI();
});
