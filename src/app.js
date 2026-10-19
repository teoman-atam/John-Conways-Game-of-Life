/*
 * Branchement de l'interface : événements DOM → contrôleur, boucle d'animation unique → rendu.
 * Aucune règle métier ici : elles sont toutes dans controller.js.
 */
(function () {
  'use strict';

  const Life = window.Life;
  const $ = function (id) { return document.getElementById(id); };

  const stage = $('stage');
  const canvas = $('board');
  const ui = {
    play: $('play'),
    step: $('step'),
    reset: $('reset'),
    random: $('random'),
    recenter: $('recenter'),
    exportBtn: $('export'),
    speed: $('speed'),
    speedValue: $('speed-value'),
    density: $('density'),
    densityValue: $('density-value'),
    pattern: $('pattern'),
    generation: $('stat-generation'),
    live: $('stat-live'),
    rate: $('stat-rate'),
    toast: $('toast'),
    coords: $('coords'),
    toolButtons: Array.prototype.slice.call(document.querySelectorAll('[data-tool]')),
    copy: $('copy'),
    cut: $('cut'),
    paste: $('paste'),
    del: $('delete'),
    placebar: $('placebar'),
    placeName: $('place-name'),
    rotateCw: $('rotate-cw'),
    rotateCcw: $('rotate-ccw'),
    mirrorH: $('mirror-h'),
    mirrorV: $('mirror-v'),
    placeDone: $('place-done'),
    rleImport: $('rle-import'),
    rleExport: $('rle-export'),
    dialog: $('rle-dialog'),
    dialogTitle: $('rle-title'),
    importPane: $('rle-import-pane'),
    exportPane: $('rle-export-pane'),
    rleInput: $('rle-input'),
    rleError: $('rle-error'),
    rleImportBtn: $('rle-import-btn'),
    rleOutput: $('rle-output'),
    rleInfo: $('rle-export-info'),
    rleCopy: $('rle-copy'),
    rleCopyStatus: $('rle-copy-status'),
    rleDownload: $('rle-download'),
    back: $('back'),
    jumpForm: $('jump-form'),
    jumpN: $('jump-n'),
    jump: $('jump'),
    jumpProgress: $('jump-progress'),
    jumpText: $('jump-text'),
    jumpBar: $('jump-bar'),
    jumpCancel: $('jump-cancel'),
    autoPause: $('auto-pause'),
    ageColors: $('age-colors'),
    legend: $('age-legend'),
    chartToggle: $('chart-toggle'),
    chart: $('chart'),
    chartCanvas: $('chart-canvas'),
    chartCurrent: $('chart-current'),
    chartMax: $('chart-max'),
    chartRange: $('chart-range'),
    chartNote: $('chart-note'),
    app: document.querySelector('.app'),
    fullscreenToggle: $('fullscreen-toggle'),
    panelToggle: $('panel-toggle'),
    panelHandle: $('panel-handle'),
    settingsOpen: $('settings-open'),
    settingsDialog: $('settings-dialog'),
    themeRadios: Array.prototype.slice.call(document.querySelectorAll('input[name="theme"]')),
    saveIndicator: $('save-indicator'),
    settingsSaveStatus: $('settings-save-status'),
    forgetRow: $('forget-row'),
    forgetSave: $('forget-save'),
    forgetConfirm: $('forget-confirm'),
    forgetYes: $('forget-yes'),
    forgetNo: $('forget-no'),
    minimap: $('minimap'),
    minimapCanvas: $('minimap-canvas'),
    minimapScale: $('minimap-scale'),
    minimapToggle: $('minimap-toggle'),
    tooltip: $('tooltip'),
    rulesToggle: $('rules-toggle'),
    rulesMenu: $('rules-menu'),
    rulesClose: $('rules-close'),
    actionButtons: Array.prototype.slice.call(document.querySelectorAll('[data-action]')),
  };

  // Cmd sur Mac, Ctrl ailleurs, pour copier, couper et coller
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  // Stockage local ; inaccessible (exception à l'accès) : l'application fonctionne sans sauvegarde
  function localStore() {
    try {
      const store = window.localStorage;
      store.getItem(Life.persistence.STORAGE_KEY);
      return store;
    } catch (err) {
      return null;
    }
  }

  const rawStore = localStore();
  const SAVE_KEY = Life.persistence.STORAGE_KEY;

  // Mini-carte, visible au départ ; un clic ou un glisser centre la vue principale (sans toucher aux cellules)
  const minimap = Life.minimap.createMinimap({
    clock: function () { return performance.now(); },
    panTo: function (x, y) { Life.minimap.centerViewOn(controller, x, y); },
  });

  // Le hasard est injecté ici : le contrôleur n'appelle jamais Math.random lui-même.
  // L'horloge réelle mesure le budget du saut et planifie la sauvegarde.
  // La case « Pause si état stable » est cochée au départ ; une sauvegarde peut la décocher.
  const controller = Life.controller.createController({
    random: Math.random,
    isMac: isMac,
    clock: function () { return performance.now(); },
    dateNow: function () { return Date.now(); },
    autoPause: ui.autoPause.checked,
    // Chaque sauvegarde emporte aussi la visibilité de la mini-carte (champ facultatif)
    storage: rawStore ? Life.persistence.withOptionalSettings(rawStore, function () {
      return { minimapVisible: minimap.isVisible() };
    }) : null,
    onCommand: function (name) {
      if (name === 'fullscreen') fullscreen.toggle();
    },
  });

  // Plein écran de toute l'application ; le bouton suit l'état réel, quelle que soit la sortie
  const fullscreen = Life.fullscreen.createFullscreen(document, {
    onChange: function (active) {
      ui.fullscreenToggle.setAttribute('aria-pressed', String(active));
      sizeDirty = true;
    },
    onMessage: function (text) { showToast(text, 5000); },
  });

  // Plein écran indisponible (Safari sur iPhone) : le bouton est retiré de la barre
  ui.fullscreenToggle.hidden = !fullscreen.isSupported();

  // Sauvegarde restaurée : la visibilité de la mini-carte aussi (absente d'une ancienne sauvegarde : visible)
  if (controller.restore().status === 'restored') {
    try {
      minimap.setVisible(Life.persistence.readOptional(rawStore.getItem(SAVE_KEY)).minimapVisible);
    } catch (err) {
      // Lecture impossible : mini-carte visible
    }
  }
  const renderer = Life.renderer.createRenderer(canvas, $('overlay'));
  const minimapRenderer = Life.minimap.createMinimapRenderer(ui.minimapCanvas);
  const chartRenderer = Life.renderer.createChartRenderer(ui.chartCanvas);
  const formatInt = Life.controller.formatInt;

  // Libellés des raccourcis hors Mac : Ctrl+C au lieu de ⌘C
  if (!isMac) {
    document.querySelectorAll('kbd.cmd').forEach(function (k) { k.textContent = k.textContent.replace('⌘', 'Ctrl+'); });
    document.querySelectorAll('[title*="⌘"]').forEach(function (el) { el.title = el.title.replace('⌘', 'Ctrl+'); });
  }

  // Clé du dernier graphique dessiné ; null force le redessin
  let chartKey = null;

  // --- Couleurs du canvas, lues dans les variables CSS (clair / sombre) ---

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = function (name) { return css.getPropertyValue(name).trim(); };
    renderer.setColors({
      dead: v('--cell-dead'),
      live: v('--cell-live'),
      grid: v('--grid-line'),
      select: v('--select'),
      selectText: v('--select-text'),
      preview: v('--preview'),
      ages: [v('--age-1'), v('--age-2'), v('--age-3'), v('--age-4'), v('--age-5')],
    });
    chartRenderer.setColors({ line: v('--chart-line'), fill: v('--chart-fill'), axis: v('--chart-axis') });
    chartKey = null; // force le redessin du graphique
    minimapRenderer.setColors({ cell: v('--minimap-cell'), view: v('--minimap-view') });
    minimap.invalidate();
  }
  // Thème appliqué à toute l'interface : attribut data-theme, puis couleurs du canvas et du graphique
  const themeManager = Life.theme.createThemeManager({
    matchMedia: window.matchMedia ? window.matchMedia.bind(window) : null,
    onChange: function (applied) {
      document.documentElement.dataset.theme = applied;
      readColors();
    },
  });
  themeManager.setPreference(controller.getState().theme);

  // --- Taille du canvas et netteté Retina ---

  let viewWidth = 0;
  let viewHeight = 0;
  let pixelRatio = 0;
  let sizeDirty = true;

  function syncSize() {
    const ratio = window.devicePixelRatio || 1;
    if (!sizeDirty && ratio === pixelRatio) return;
    const rect = stage.getBoundingClientRect();
    viewWidth = rect.width;
    viewHeight = rect.height;
    pixelRatio = ratio;
    sizeDirty = false;
    renderer.resize(viewWidth, viewHeight, pixelRatio);
    controller.setViewport(viewWidth, viewHeight);
    // Taille de la mini-carte donnée par le CSS (plus petite sur un petit écran) ; masquée, elle garde la sienne
    const mw = ui.minimapCanvas.clientWidth;
    const mh = ui.minimapCanvas.clientHeight;
    if (mw > 0 && mh > 0) minimap.setSize(mw, mh);
    const msize = minimap.size();
    minimapRenderer.resize(msize.width, msize.height, pixelRatio);
    minimap.invalidate();
    layoutDirty = true;
  }

  if (window.ResizeObserver) new ResizeObserver(function () { sizeDirty = true; }).observe(stage);
  window.addEventListener('resize', function () { sizeDirty = true; });

  // Position du pointeur relative au canvas, en pixels CSS
  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- Téléchargement d'un fichier (PNG ou RLE) ---

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // --- Boutons et réglages ---

  // Un clic souris ne donne pas le focus aux boutons : Espace reste un raccourci global
  document.querySelectorAll('.panel, .hud, .panel-handle').forEach(function (el) {
    el.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });
  });

  ui.play.addEventListener('click', function () { controller.toggleRunning(); });
  ui.step.addEventListener('click', function () { controller.step(); });
  ui.reset.addEventListener('click', function () { controller.reset(); });
  ui.random.addEventListener('click', function () { controller.randomFill(); });
  ui.recenter.addEventListener('click', function () { controller.recenter(); });
  ui.exportBtn.addEventListener('click', exportImage);

  // --- Retour arrière, saut de N générations, options d'analyse ---

  ui.back.addEventListener('click', function () { controller.stepBack(); });

  // Valeur refusée : message du contrôleur, et le champ reprend la dernière valeur valide
  function commitJumpCount() {
    const ok = controller.setJumpCount(ui.jumpN.value);
    if (!ok) ui.jumpN.value = String(controller.getState().jumpCount);
    return ok;
  }
  ui.jump.addEventListener('click', function () {
    if (commitJumpCount()) controller.startJump();
  });
  ui.jumpN.addEventListener('change', commitJumpCount);
  ui.jumpN.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commitJumpCount()) {
        ui.jumpN.blur();
        controller.startJump();
      }
    } else if (e.key === 'Escape') {
      ui.jumpN.value = String(controller.getState().jumpCount);
      ui.jumpN.blur();
    }
  });
  ui.jumpCancel.addEventListener('click', function () { controller.cancelJump(); });
  ui.autoPause.addEventListener('change', function () { controller.setAutoPause(ui.autoPause.checked); });
  ui.ageColors.addEventListener('change', function () { controller.setAgeColors(ui.ageColors.checked); });
  ui.chartToggle.addEventListener('click', function () {
    controller.setChartVisible(!controller.getState().chartVisible);
  });

  // --- Plein écran, panneau repliable, fenêtre Réglages ---

  ui.fullscreenToggle.addEventListener('click', function () { fullscreen.toggle(); });
  ui.panelToggle.addEventListener('click', function () {
    controller.setPanelCollapsed(!controller.getState().panelCollapsed);
  });
  ui.panelHandle.addEventListener('click', function () { controller.setPanelCollapsed(false); });

  function showForgetConfirm(visible) {
    ui.forgetConfirm.hidden = !visible;
    ui.forgetRow.hidden = visible;
  }
  ui.settingsOpen.addEventListener('click', function () {
    showForgetConfirm(false);
    ui.settingsDialog.showModal();
  });
  ui.themeRadios.forEach(function (radio) {
    radio.addEventListener('change', function () { if (radio.checked) controller.setTheme(radio.value); });
  });
  // « Oublier la sauvegarde » demande une confirmation dans la fenêtre
  ui.forgetSave.addEventListener('click', function () {
    showForgetConfirm(true);
    ui.forgetNo.focus();
  });
  ui.forgetNo.addEventListener('click', function () { showForgetConfirm(false); });
  ui.forgetYes.addEventListener('click', function () {
    showForgetConfirm(false);
    if (controller.forgetSave()) showToast('Sauvegarde oubliée. Elle reprendra à la prochaine modification.', 4000);
  });

  ui.speed.addEventListener('input', function () { controller.setSpeed(ui.speed.value); });
  ui.density.addEventListener('input', function () { controller.setDensity(ui.density.value); });
  // Après un réglage à la souris, on rend le focus à la page pour garder les raccourcis
  [ui.speed, ui.density, ui.autoPause, ui.ageColors].forEach(function (input) {
    input.addEventListener('pointerup', function () { input.blur(); });
  });

  Life.patterns.list().forEach(function (p) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    ui.pattern.appendChild(option);
  });
  // Choisir un motif passe en mode pose ; la liste revient à son invite pour pouvoir le rechoisir
  ui.pattern.addEventListener('change', function () {
    if (ui.pattern.value) controller.loadPattern(ui.pattern.value);
    ui.pattern.value = '';
    ui.pattern.blur();
  });

  ui.toast.addEventListener('click', function () {
    ui.toast.hidden = true;
    controller.dismissMessage();
  });

  // --- Barre d'outils et barre de pose ---

  ui.toolButtons.forEach(function (button) {
    button.addEventListener('click', function () { controller.setTool(button.dataset.tool); });
  });
  ui.copy.addEventListener('click', function () {
    if (controller.copySelection()) {
      const c = controller.getState().clipboard;
      showToast('Sélection copiée : ' + c.width + ' × ' + c.height + ' cellules. Coller pour la poser ailleurs.', 3000);
    }
  });
  ui.cut.addEventListener('click', function () { controller.cutSelection(); });
  ui.paste.addEventListener('click', function () { controller.paste(); });
  ui.del.addEventListener('click', function () { controller.deleteSelection(); });
  ui.rotateCw.addEventListener('click', function () { controller.rotatePlacing(true); });
  ui.rotateCcw.addEventListener('click', function () { controller.rotatePlacing(false); });
  ui.mirrorH.addEventListener('click', function () { controller.mirrorPlacing(false); });
  ui.mirrorV.addEventListener('click', function () { controller.mirrorPlacing(true); });
  ui.placeDone.addEventListener('click', function () { controller.cancelPlacing(); });

  // --- Fenêtre RLE : import et export ---

  function openDialog(mode) {
    const importing = mode === 'import';
    ui.dialogTitle.textContent = importing ? 'Importer un motif RLE' : 'Exporter en RLE';
    ui.importPane.hidden = !importing;
    ui.exportPane.hidden = importing;
    ui.rleError.textContent = '';
    ui.rleCopyStatus.textContent = '';
    if (!importing) {
      const result = controller.exportRle();
      ui.rleOutput.value = result.text;
      if (result.count === 0) {
        ui.rleInfo.textContent = result.scope === 'selection' ? 'La sélection ne contient aucune cellule vivante.' : 'La grille est vide.';
      } else if (result.scope === 'selection') {
        ui.rleInfo.textContent = 'Sélection de ' + result.width + ' × ' + result.height + ' cellules, ' +
          formatInt(result.count) + ' vivantes.';
      } else {
        ui.rleInfo.textContent = 'Toutes les cellules vivantes (aucune sélection) : boîte de ' + result.width + ' × ' +
          result.height + ', ' + formatInt(result.count) + ' cellules.';
      }
    }
    ui.dialog.showModal();
    if (importing) ui.rleInput.focus();
    else ui.rleOutput.focus();
  }

  ui.rleImport.addEventListener('click', function () { openDialog('import'); });
  ui.rleExport.addEventListener('click', function () { openDialog('export'); });

  ui.rleImportBtn.addEventListener('click', function () {
    const result = controller.importRle(ui.rleInput.value);
    if (!result.ok) {
      ui.rleError.textContent = result.error;
      return;
    }
    ui.dialog.close();
    showToast('Motif importé : ' + result.width + ' × ' + result.height + ', ' + formatInt(result.count) +
      ' cellules vivantes. Cliquez sur la grille pour le poser, Échap pour quitter.', 5000);
  });

  // navigator.clipboard peut être indisponible en file:// : repli sur la sélection du texte
  function copyExportText() {
    const done = function () { ui.rleCopyStatus.textContent = 'Copié dans le presse-papiers.'; };
    const fallback = function () {
      ui.rleOutput.focus();
      ui.rleOutput.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (err) {
        copied = false;
      }
      if (copied) done();
      else ui.rleCopyStatus.textContent = 'Texte sélectionné : appuyez sur ' + (isMac ? '⌘C' : 'Ctrl+C') + ' pour le copier.';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ui.rleOutput.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  ui.rleCopy.addEventListener('click', copyExportText);
  ui.rleDownload.addEventListener('click', function () {
    const blob = new Blob([ui.rleOutput.value], { type: 'text/plain' });
    downloadBlob(blob, controller.exportFileName(new Date(), 'rle'));
  });

  // --- Pointeur : le geste dépend de l'outil effectif au moment de l'appui ---

  let activePointer = null;
  let hoverPoint = null;

  // Écran tactile : un doigt suit l'outil, deux doigts zooment et déplacent la vue sans rien modifier
  const touchRouter = Life.touch.createTouchRouter({
    down: function (x, y) { controller.pointerDown(x, y); },
    move: function (x, y) { controller.pointerMove(x, y); },
    up: function (x, y) { controller.pointerUp(x, y); },
    cancel: function () { controller.pointerCancel(); },
    pinch: function (step) {
      controller.zoomAt(step.factor, step.x, step.y);
      controller.panBy(step.dx, step.dy);
    },
  });

  function isTouch(e) {
    return e.pointerType === 'touch';
  }

  canvas.addEventListener('pointerdown', function (e) {
    tooltipUi.dismiss();
    if (isTouch(e)) {
      if (activePointer !== null) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        // Capture indisponible : le geste continue tant que le doigt reste sur le canvas
      }
      const t = localPoint(e);
      touchRouter.down(e.pointerId, t.x, t.y, performance.now());
      return;
    }
    if (e.button !== 0 || activePointer !== null) return;
    activePointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId); // le glisser continue même hors du canvas
    } catch (err) {
      // Capture indisponible : le glisser fonctionne tant que le pointeur reste sur le canvas
    }
    const p = localPoint(e);
    controller.pointerDown(p.x, p.y);
  });

  // Survol comme glisser : le contrôleur suit la cellule sous le pointeur
  canvas.addEventListener('pointermove', function (e) {
    if (isTouch(e)) {
      const t = localPoint(e);
      touchRouter.move(e.pointerId, t.x, t.y, performance.now());
      return;
    }
    if (activePointer !== null && e.pointerId !== activePointer) return;
    hoverPoint = localPoint(e);
    controller.pointerMove(hoverPoint.x, hoverPoint.y);
  });

  function endPointer(e) {
    if (isTouch(e)) {
      const t = localPoint(e);
      if (e.type === 'pointerup') touchRouter.up(e.pointerId, t.x, t.y);
      else touchRouter.cancel(e.pointerId);
      return;
    }
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (e.type === 'pointerup') {
      const p = localPoint(e);
      controller.pointerUp(p.x, p.y);
    } else {
      controller.pointerCancel();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', function () {
    if (activePointer !== null) return;
    hoverPoint = null;
    controller.pointerLeave();
  });

  // --- Zoom : molette, pincement Chrome (wheel + ctrlKey), pincement Safari (gesture*) ---

  let gestureActive = false;
  let gestureScale = 1;

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    tooltipUi.dismiss();
    if (gestureActive) return; // Safari : le pincement est déjà traité par gesturechange
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16; // lignes
    else if (e.deltaMode === 2) delta *= viewHeight; // pages
    // Le pincement envoie de petits deltas : il faut une sensibilité plus forte
    const sensitivity = e.ctrlKey ? 0.01 : 0.002;
    delta = Math.max(-200, Math.min(200, delta));
    const p = localPoint(e);
    controller.zoomAt(Math.exp(-delta * sensitivity), p.x, p.y);
  }, { passive: false });

  function gesturePoint(e) {
    if (typeof e.clientX === 'number') return localPoint(e);
    return hoverPoint || { x: viewWidth / 2, y: viewHeight / 2 };
  }

  canvas.addEventListener('gesturestart', function (e) {
    e.preventDefault();
    tooltipUi.dismiss();
    gestureActive = true;
    gestureScale = 1;
  });
  canvas.addEventListener('gesturechange', function (e) {
    e.preventDefault();
    // Doigts sur l'écran (iPhone, iPad) : le pincement passe déjà par les événements de pointeur
    if (!e.scale || touchRouter.active()) return;
    const p = gesturePoint(e);
    controller.zoomAt(e.scale / gestureScale, p.x, p.y);
    gestureScale = e.scale;
  });
  canvas.addEventListener('gestureend', function (e) {
    e.preventDefault();
    gestureActive = false;
  });

  // Empêche le zoom de toute la page par pincement (Safari et Chrome)
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  // --- Clavier ---

  // Focus dans un champ, une zone de texte ou une fenêtre de dialogue : raccourcis inactifs
  function isTypingTarget(el) {
    if (!el || el === document.body || !el.tagName) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable || !!el.closest('dialog');
  }

  function keyMods(e) {
    return {
      shift: e.shiftKey,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      repeat: e.repeat,
      editable: isTypingTarget(e.target),
    };
  }

  document.addEventListener('keydown', function (e) {
    // Échap ferme d'abord le menu des règles, s'il est ouvert, et seulement lui
    if (e.key === 'Escape' && rulesOpen) {
      tooltipUi.escape();
      setRulesOpen(false, true);
      e.preventDefault();
      refreshLegends();
      return;
    }
    // Échap masque la légende visible, sans rien changer à l'action habituelle de la touche
    if (e.key === 'Escape') tooltipUi.escape();
    // Un bouton qui a le focus (navigation au clavier) gère lui-même Espace et Entrée
    if (e.target && e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    const mods = keyMods(e);
    // M : touche propre à l'interface, lue dans la table des raccourcis ; le contrôleur ne l'utilise pas
    if (Life.tooltips.matchShortcut('minimap', e.key, mods, isMac)) {
      toggleMinimap();
      e.preventDefault();
    } else if (controller.handleShortcut(e.key, mods)) {
      e.preventDefault();
    }
    refreshLegends();
  });
  document.addEventListener('keyup', function (e) {
    if (controller.handleKeyUp(e.key)) e.preventDefault();
    refreshLegends();
  });
  // Fenêtre quittée pendant un appui : Espace est considéré relâché, sans bascule
  window.addEventListener('blur', function () { controller.releaseKeys(); });

  // Sauvegarde immédiate quand la page est quittée ou cachée
  window.addEventListener('pagehide', function () { controller.flushSave(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') controller.flushSave();
  });

  // --- Enregistrer l'image : copie exacte du canvas de la grille, sans interrompre la simulation ---

  function exportImage() {
    const name = controller.exportFileName(new Date());
    // toBlob copie l'image du canvas immédiatement ; l'encodage PNG se fait ensuite
    canvas.toBlob(function (blob) {
      if (!blob) {
        showToast('L\'image n\'a pas pu être créée par le navigateur.');
        return;
      }
      downloadBlob(blob, name);
    }, 'image/png');
  }

  // --- Message non bloquant ---

  let shownMessageId = null;
  let toastTimer = null;

  function showToast(text, duration) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      ui.toast.hidden = true;
      controller.dismissMessage();
    }, duration || 8000);
  }

  // --- Mise à jour de l'interface (seulement quand une valeur change) ---

  const shown = {};
  function changed(key, value) {
    if (shown[key] === value) return false;
    shown[key] = value;
    return true;
  }
  function setText(el, key, value) {
    if (changed(key, value)) el.textContent = value;
  }

  let lastRateUpdate = 0;

  function updatePanel(state, now) {
    setText(ui.play, 'play', state.playLabel);
    if (changed('running', state.running)) ui.play.setAttribute('aria-pressed', String(state.running));
    // Démarrer, Précédente, Une génération et Avancer de N : aria-disabled, voir syncActionButtons
    // Pendant un saut : remise à zéro, motifs, remplissage et import désactivés
    if (changed('jumpingNow', !!state.jumping)) {
      [ui.reset, ui.random, ui.pattern, ui.rleImport].forEach(function (el) { el.disabled = !!state.jumping; });
      ui.jumpForm.hidden = !!state.jumping;
      ui.jumpProgress.hidden = !state.jumping;
    }
    if (state.jumping) {
      const j = state.jumping;
      setText(ui.jumpText, 'jumpText', 'génération ' + formatInt(j.done) + ' / ' + formatInt(j.total));
      const pct = Math.round(j.done * 100 / j.total);
      if (changed('jumpPct', pct)) {
        ui.jumpBar.style.width = pct + '%';
        ui.jumpBar.parentNode.parentNode.setAttribute('aria-valuenow', String(pct));
      }
    }
    setText(ui.jump, 'jumpLabel', 'Avancer de ' + formatInt(state.jumpCount));
    if (document.activeElement !== ui.jumpN && changed('jumpN', state.jumpCount)) ui.jumpN.value = String(state.jumpCount);
    if (changed('autoPause', state.autoPause)) ui.autoPause.checked = state.autoPause;
    if (changed('ageColors', state.ageColors)) {
      ui.ageColors.checked = state.ageColors;
      ui.legend.hidden = !state.ageColors;
      stage.classList.toggle('has-legend', state.ageColors);
    }
    if (changed('theme', state.theme)) {
      themeManager.setPreference(state.theme);
      ui.themeRadios.forEach(function (r) { r.checked = r.value === state.theme; });
    }
    if (changed('panelCollapsed', state.panelCollapsed)) {
      ui.app.classList.toggle('panel-collapsed', state.panelCollapsed);
      ui.panelHandle.hidden = !state.panelCollapsed;
      ui.panelToggle.setAttribute('aria-pressed', String(state.panelCollapsed));
      if (state.panelCollapsed && rulesOpen) setRulesOpen(false, false); // son bouton disparaît avec le panneau
      sizeDirty = true;
    }
    const saveText = saveStatusText(state.save);
    if (changed('saveText', saveText)) {
      const problem = state.save.status === 'unavailable' || state.save.status === 'error';
      [ui.saveIndicator, ui.settingsSaveStatus].forEach(function (el) {
        el.textContent = saveText;
        el.classList.toggle('is-problem', problem);
      });
      ui.forgetSave.disabled = state.save.status === 'unavailable';
    }
    if (changed('chartVisible', state.chartVisible)) {
      ui.chart.hidden = !state.chartVisible;
      ui.chartToggle.setAttribute('aria-pressed', String(state.chartVisible));
      stage.classList.toggle('has-chart', state.chartVisible);
      chartKey = null;
    }
    setText(ui.generation, 'generation', formatInt(state.generation));
    setText(ui.live, 'live', formatInt(state.liveCount));
    setText(ui.speedValue, 'speed', state.speed + ' gén./s');
    if (String(state.speed) !== ui.speed.value) ui.speed.value = String(state.speed);
    setText(ui.densityValue, 'density', state.density + ' %');
    if (String(state.density) !== ui.density.value) ui.density.value = String(state.density);
    // Mesure rafraîchie 4 fois par seconde pour rester lisible
    if (now - lastRateUpdate >= 250 || !state.running) {
      lastRateUpdate = now;
      let rate = '—';
      if (state.running) rate = state.measuredRate > 0 ? state.measuredRate.toFixed(1).replace('.', ',') : '…';
      setText(ui.rate, 'rate', rate);
    }

    // Outil actif : aucun bouton enfoncé en mode pose, c'est la barre de pose qui s'affiche
    const activeTool = state.placing ? '' : state.tool;
    if (changed('tool', activeTool)) {
      ui.toolButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === activeTool)); });
    }
    // Copier, Couper, Coller et Supprimer : aria-disabled, voir syncActionButtons
    if (changed('placing', state.placing ? state.placing.name : null)) {
      ui.placebar.hidden = !state.placing;
      ui.placeName.textContent = state.placing ? state.placing.name : '';
      layoutDirty = true; // la barre de pose peut repousser la mini-carte
    }
    setText(ui.coords, 'coords', state.hoverCell ? state.hoverCell.x + ', ' + state.hoverCell.y : '');

    // Le curseur reflète l'outil effectif ; main fermée pendant un déplacement de la vue
    const panning = state.dragging && (state.gestureTool === 'move' || state.gestureTool === 'place');
    const cursor = panning ? 'grabbing' : state.effectiveTool;
    if (changed('cursor', cursor)) canvas.dataset.cursor = cursor;

    if (state.message && state.message.id !== shownMessageId) {
      shownMessageId = state.message.id;
      showToast(state.message.text);
    } else if (!state.message && !ui.toast.hidden && shownMessageId !== null) {
      ui.toast.hidden = true;
      shownMessageId = null;
    }
  }

  // --- Boucle d'animation unique : avance la simulation puis dessine, à chaque image ---

  // Texte de l'indicateur de sauvegarde
  function saveStatusText(save) {
    if (save.status === 'unavailable') return 'Sauvegarde indisponible';
    if (save.status === 'error') return 'Échec de la sauvegarde';
    if (save.status === 'saved' && save.savedAt !== null) {
      const d = new Date(save.savedAt);
      const two = function (n) { return String(n).padStart(2, '0'); };
      return 'Sauvegardé à ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
    }
    return 'Aucune sauvegarde';
  }

  // --- Graphique : redessiné seulement s'il a changé, au plus 10 fois par seconde ---

  let chartDrawnAt = -Infinity;
  let chartSize = '';

  function drawChart(state, now) {
    if (!state.chartVisible) return;
    const w = ui.chartCanvas.clientWidth;
    const h = ui.chartCanvas.clientHeight;
    const size = w + 'x' + h + '@' + pixelRatio;
    if (size !== chartSize) {
      chartSize = size;
      chartRenderer.resize(w, h, pixelRatio);
      chartKey = null;
    }
    const p = state.population;
    const key = p.length + ':' + p.max + ':' + state.generation;
    if (key === chartKey || (chartKey !== null && now - chartDrawnAt < 100)) return;
    chartKey = key;
    chartDrawnAt = now;
    chartRenderer.draw(p.values(), p.max);
    ui.chartCurrent.textContent = formatInt(state.liveCount);
    ui.chartMax.textContent = formatInt(p.max);
    ui.chartRange.textContent = state.generation === 0 ? 'génération 0' : 'générations 0 à ' + formatInt(state.generation);
    ui.chartNote.textContent = p.truncated ? 'enregistrement arrêté à ' + formatInt(p.length) + ' points' : '';
  }

  // --- Mini-carte : canvas séparé ; clic et glisser déplacent la vue, sans jamais toucher aux cellules ---

  let layoutDirty = true;
  let minimapPointer = null;

  function applyMinimapVisibility() {
    const visible = minimap.isVisible();
    ui.minimap.hidden = !visible;
    ui.minimapToggle.setAttribute('aria-pressed', String(visible));
    layoutDirty = true;
    sizeDirty = true; // relit sa taille dans le CSS
  }

  // La visibilité rejoint aussitôt une sauvegarde existante ; sans sauvegarde, elle part avec la prochaine écriture
  function saveMinimapVisibility() {
    if (!rawStore) return;
    try {
      const text = rawStore.getItem(SAVE_KEY);
      const next = text === null ? null : Life.persistence.writeOptional(text, { minimapVisible: minimap.isVisible() });
      if (next !== null) rawStore.setItem(SAVE_KEY, next);
    } catch (err) {
      // Stockage plein ou inaccessible : la prochaine écriture du contrôleur réessaiera
    }
  }

  function toggleMinimap() {
    minimap.toggle();
    applyMinimapVisibility();
    saveMinimapVisibility();
  }

  ui.minimapToggle.addEventListener('click', toggleMinimap);
  applyMinimapVisibility();

  function minimapPoint(e) {
    const rect = ui.minimapCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  ui.minimapCanvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || minimapPointer !== null) return;
    e.preventDefault();
    tooltipUi.dismiss();
    // Espace maintenu : considéré relâché, pour que son relâchement ne démarre ni n'arrête rien
    if (controller.getState().spaceHeld) controller.releaseKeys();
    const p = minimapPoint(e);
    if (!minimap.pointerDown(p.x, p.y, controller.getState().camera)) return;
    minimapPointer = e.pointerId;
    try {
      ui.minimapCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Capture indisponible : le glisser fonctionne tant que le pointeur reste sur la mini-carte
    }
    ui.minimap.classList.add('is-dragging');
  });
  ui.minimapCanvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== minimapPointer) return;
    const p = minimapPoint(e);
    minimap.pointerMove(p.x, p.y);
  });
  function endMinimapPointer(e) {
    if (e.pointerId !== minimapPointer) return;
    minimapPointer = null;
    ui.minimap.classList.remove('is-dragging');
    if (e.type === 'pointerup') {
      const p = minimapPoint(e);
      minimap.pointerUp(p.x, p.y);
    } else {
      minimap.pointerCancel();
    }
  }
  ui.minimapCanvas.addEventListener('pointerup', endMinimapPointer);
  ui.minimapCanvas.addEventListener('pointercancel', endMinimapPointer);
  // Molette et pincement au-dessus de la mini-carte : sans effet (ni zoom de la grille, ni défilement)
  ui.minimap.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    ui.minimap.addEventListener(type, function (e) { e.preventDefault(); });
  });

  // Mini-carte en haut à droite, sous les barres flottantes qui occupent sa bande horizontale
  function placeMinimap() {
    layoutDirty = false;
    if (!minimap.isVisible()) return;
    const stageRect = stage.getBoundingClientRect();
    const rects = [];
    document.querySelectorAll('.hud .tool-group, .hud .placebar').forEach(function (el) {
      if (el.getClientRects().length === 0) return;
      const r = el.getBoundingClientRect();
      rects.push({ left: r.left - stageRect.left, top: r.top - stageRect.top, right: r.right - stageRect.left, bottom: r.bottom - stageRect.top });
    });
    ui.minimap.style.top = Life.minimap.minimapTop(stageRect.width, rects, ui.minimap.offsetWidth, ui.minimap.offsetHeight) + 'px';
  }

  // Rastérisée au plus 10 fois par seconde pendant la simulation, aussitôt après une édition, un zoom ou un déplacement
  function drawMinimap(state) {
    if (!minimap.isVisible()) return;
    const f = minimap.update({ cells: state.cells, camera: state.camera, busy: state.running || state.jumping !== null });
    if (!f) return;
    minimapRenderer.draw(f);
    setText(ui.minimapScale, 'minimapScale', f.label);
  }

  // --- Légendes des boutons : libellé selon l'état, raccourci de la table, raison si désactivé ---

  const buttonsByAction = {};
  let tooltipKey = null;
  let tooltipAnchor = null;
  let tooltipPlace = '';

  const tooltipUi = Life.tooltips.createTooltipController({
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    onChange: function (id) {
      if (id === null) hideTooltip();
      else renderTooltip(tooltipState(controller.getState()));
    },
  });

  // État vu par les légendes : celui du contrôleur, plus le plein écran, la mini-carte et les règles
  function tooltipState(state) {
    return Object.assign({}, state, { fullscreen: fullscreen.isActive(), minimapVisible: minimap.isVisible(),
      rulesOpen: rulesOpen, isMac: isMac });
  }

  // --- Règles du jeu : menu déroulant, ouvert à tout moment, sans interrompre la simulation ---

  let rulesOpen = false;
  let rulesByKeyboard = false; // ouvert depuis le bouton qui avait le focus clavier

  function placeRules() {
    if (!rulesOpen) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const p = Life.tooltips.positionDropdown(ui.rulesToggle.getBoundingClientRect(), ui.rulesMenu.offsetWidth, { width: vw, height: vh });
    ui.rulesMenu.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px)';
    ui.rulesMenu.style.maxHeight = p.maxHeight + 'px';
  }

  /*
   * returnFocus : à la fermeture (Échap, bouton ×), le focus revient au bouton si le menu a été
   * ouvert au clavier ; ouvert à la souris ou au doigt, il est rendu à la page, pour qu'Espace
   * et les autres raccourcis gardent leur effet habituel.
   */
  function setRulesOpen(open, returnFocus) {
    if (open && !rulesOpen) rulesByKeyboard = document.activeElement === ui.rulesToggle;
    rulesOpen = !!open;
    ui.rulesMenu.hidden = !rulesOpen;
    ui.rulesToggle.setAttribute('aria-expanded', String(rulesOpen));
    if (rulesOpen) {
      ui.rulesMenu.scrollTop = 0;
      placeRules();
      ui.rulesMenu.focus({ preventScroll: true });
    } else if (returnFocus && rulesByKeyboard) {
      ui.rulesToggle.focus({ preventScroll: true });
    } else if (ui.rulesMenu.contains(document.activeElement) || document.activeElement === ui.rulesToggle) {
      document.activeElement.blur();
    }
  }

  ui.rulesToggle.addEventListener('click', function () { setRulesOpen(!rulesOpen, rulesOpen); });
  ui.rulesClose.addEventListener('click', function () { setRulesOpen(false, true); });
  window.addEventListener('resize', placeRules);
  // Toucher ou cliquer ailleurs ferme le menu ; sur la grille et la mini-carte, ce premier appui ne fait rien d'autre
  document.addEventListener('pointerdown', function (e) {
    if (!rulesOpen || ui.rulesMenu.contains(e.target) || ui.rulesToggle.contains(e.target)) return;
    setRulesOpen(false, false);
    if (e.target === canvas || ui.minimap.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Focus venu du clavier (Tab) : les clics souris ne donnent pas le focus aux boutons
  function keyboardFocus(el) {
    try {
      return el.matches(':focus-visible');
    } catch (err) {
      return true;
    }
  }

  // Écran tactile : un appui long sur un bouton montre sa légende quelques secondes, sans déclencher l'action
  let longPressButton = null;
  let longPressHide = null;
  let suppressClick = null;
  const longPress = Life.touch.createLongPress({
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    onLongPress: function (id) {
      tooltipUi.focus(id);
      clearTimeout(longPressHide);
      longPressHide = setTimeout(function () { tooltipUi.dismiss(); }, 2500);
    },
  });
  document.addEventListener('click', function (e) {
    if (!suppressClick) return;
    const target = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (target === suppressClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    suppressClick = null;
  }, true);

  ui.actionButtons.forEach(function (button) {
    const id = button.dataset.action;
    buttonsByAction[id] = button;
    button.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') tooltipUi.hover(id); });
    button.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch') {
        longPress.cancel();
        return;
      }
      tooltipUi.leave(id);
    });
    button.addEventListener('pointerdown', function (e) {
      tooltipUi.press(id);
      if (e.pointerType !== 'touch') return;
      longPressButton = button;
      longPress.down(id);
    });
    button.addEventListener('pointerup', function (e) {
      if (e.pointerType !== 'touch' || longPressButton !== button) return;
      if (longPress.up()) {
        suppressClick = button;
        setTimeout(function () { if (suppressClick === button) suppressClick = null; }, 800);
      }
      longPressButton = null;
    });
    button.addEventListener('pointercancel', function () { longPress.cancel(); longPressButton = null; });
    // Android : l'appui long au doigt ouvrirait un menu contextuel (le clic droit à la souris reste libre)
    button.addEventListener('contextmenu', function (e) { if (longPressButton === button) e.preventDefault(); });
    button.addEventListener('focus', function () { if (keyboardFocus(button)) tooltipUi.focus(id); });
    button.addEventListener('blur', function () { tooltipUi.blur(id); });
  });

  // Bouton aria-disabled : son action ne se déclenche jamais, ni au clic, ni par Entrée ou Espace au clavier
  document.addEventListener('click', function (e) { Life.tooltips.guardActivation(e); }, true);
  // Après un clic ou une touche, libellés et légende suivent tout de suite, sans attendre l'image suivante
  document.addEventListener('click', function () { refreshLegends(); });

  function refreshLegends() {
    const tipState = tooltipState(controller.getState());
    syncActionButtons(tipState);
    if (tooltipUi.current() !== null) renderTooltip(tipState);
  }

  // aria-label, aria-keyshortcuts et aria-disabled de chaque bouton, d'après sa légende courante
  function syncActionButtons(tipState) {
    for (const button of ui.actionButtons) {
      const id = button.dataset.action;
      const a = Life.tooltips.ariaFor(id, tipState);
      if (changed('aria-label:' + id, a.label)) button.setAttribute('aria-label', a.label);
      if (changed('aria-keys:' + id, a.keyshortcuts)) {
        if (a.keyshortcuts) button.setAttribute('aria-keyshortcuts', a.keyshortcuts);
        else button.removeAttribute('aria-keyshortcuts');
      }
      if (changed('aria-disabled:' + id, a.disabled)) {
        if (a.disabled) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
    }
  }

  function keysElement(keys) {
    const span = document.createElement('span');
    span.className = 'tooltip-keys';
    keys.forEach(function (k) {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      span.appendChild(kbd);
    });
    return span;
  }

  function tooltipRow(className, text, keys) {
    const div = document.createElement('div');
    div.className = className;
    const label = document.createElement('span');
    label.textContent = text;
    div.appendChild(label);
    if (keys) div.appendChild(keysElement(keys));
    return div;
  }

  // Contenu mis à jour dès que l'état change (G pressé pendant l'affichage…), position dans la fenêtre
  function renderTooltip(tipState) {
    const id = tooltipUi.current();
    if (id === null) return;
    const el = buttonsByAction[id];
    if (!el || el.getClientRects().length === 0) {
      tooltipUi.dismiss(); // bouton masqué (fin de pose, fin de saut)
      return;
    }
    const t = Life.tooltips.getTooltip(id, tipState);
    const key = Life.tooltips.contentKey(t);
    if (key !== tooltipKey || el !== tooltipAnchor) {
      ui.tooltip.textContent = '';
      ui.tooltip.appendChild(tooltipRow('tooltip-row', t.label, t.shortcut));
      if (t.detail) ui.tooltip.appendChild(tooltipRow('tooltip-row tooltip-detail', t.detail.label, t.detail.shortcut));
      if (t.disabledReason) ui.tooltip.appendChild(tooltipRow('tooltip-reason', t.disabledReason, null));
      ui.tooltip.hidden = false;
      if (tooltipAnchor && tooltipAnchor !== el) tooltipAnchor.removeAttribute('aria-describedby');
      el.setAttribute('aria-describedby', 'tooltip');
      tooltipAnchor = el;
      tooltipKey = key;
      tooltipPlace = '';
    }
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const place = [r.left, r.top, r.right, r.bottom, vw, vh].join(',');
    if (place !== tooltipPlace) {
      tooltipPlace = place;
      const size = { width: ui.tooltip.offsetWidth, height: ui.tooltip.offsetHeight };
      const p = Life.tooltips.positionTooltip(r, size, { width: vw, height: vh });
      ui.tooltip.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px)';
    }
  }

  function hideTooltip() {
    ui.tooltip.hidden = true;
    if (tooltipAnchor) tooltipAnchor.removeAttribute('aria-describedby');
    tooltipAnchor = null;
    tooltipKey = null;
    tooltipPlace = '';
  }

  function frame(now) {
    syncSize();
    controller.tick(now);
    const state = controller.getState();
    renderer.draw(state);
    updatePanel(state, now);
    drawChart(state, now);
    if (layoutDirty) placeMinimap();
    drawMinimap(state);
    const tipState = tooltipState(state);
    syncActionButtons(tipState);
    if (tooltipUi.current() !== null) renderTooltip(tipState);
  }

  const loop = Life.controller.createFrameLoop(
    window.requestAnimationFrame.bind(window),
    window.cancelAnimationFrame.bind(window),
    frame
  );
  loop.start();

  // Accès pour le débogage depuis la console du navigateur
  window.lifeApp = { controller: controller, loop: loop, minimap: minimap };
})();
