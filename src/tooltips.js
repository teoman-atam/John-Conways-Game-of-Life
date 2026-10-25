/*
 * Légendes dynamiques des boutons, sans DOM :
 * - table des raccourcis (SHORTCUTS), seule source des touches affichées dans les légendes et de
 *   la touche de la mini-carte ; un test la confronte au contrôleur dans les deux sens ;
 * - getTooltip : libellé selon l'état courant, raccourci, raison quand le bouton est désactivé ;
 * - positionTooltip : sous le bouton par défaut, toujours entièrement dans la fenêtre ;
 * - createTooltipController : apparition après 400 ms de survol (minuteur injecté), immédiate au
 *   focus clavier, disparition au départ du survol, au clic, à Échap et au début d'un geste ;
 * - guardActivation : un bouton aria-disabled ne déclenche jamais son action.
 */
(function (root) {
  'use strict';

  const theme = (root.Life && root.Life.theme) || require('./theme.js');

  const SHOW_DELAY_MS = 400;

  /*
   * Table des raccourcis clavier. keys : valeurs de KeyboardEvent.key (lettres en minuscules,
   * comparées sans tenir compte de la casse) ; command : ⌘ sur Mac, Ctrl ailleurs ;
   * shift : true (Maj exigée), false (Maj exclue) ou absent (indifférent) ; when : état requis ;
   * handledBy : 'app' pour une touche traitée par l'interface (app.js), sinon par le contrôleur.
   */
  const SHORTCUTS = [
    { action: 'play', keys: [' '], description: 'Démarrer ou mettre en pause (appui bref)' },
    { action: 'pan-space', keys: [' '], hold: true, description: 'Maintenu + glisser : déplacer la vue, quel que soit l\'outil' },
    { action: 'step', keys: ['n'], description: 'Une génération (en pause)' },
    { action: 'back', keys: ['b'], description: 'Génération précédente (en pause)' },
    { action: 'jump', keys: ['j'], description: 'Avancer de N générations (en pause)' },
    { action: 'chart', keys: ['g'], description: 'Afficher ou masquer le graphique de population' },
    { action: 'recenter', keys: ['r'], when: 'notPlacing', description: 'Recentrer sur les cellules vivantes' },
    { action: 'zoom-in', keys: ['+', '='], description: 'Zoomer au centre de la vue' },
    { action: 'zoom-out', keys: ['-', '_'], description: 'Dézoomer au centre de la vue' },
    { action: 'tool-move', keys: ['h'], description: 'Outil Déplacer' },
    { action: 'tool-pencil', keys: ['p'], description: 'Outil Crayon' },
    { action: 'tool-select', keys: ['s'], description: 'Outil Sélection' },
    { action: 'copy', keys: ['c'], command: true, description: 'Copier la sélection (en pause)' },
    { action: 'cut', keys: ['x'], command: true, description: 'Couper la sélection (en pause)' },
    { action: 'paste', keys: ['v'], command: true, description: 'Coller : mode pose avec le presse-papiers interne' },
    { action: 'delete', keys: ['Backspace', 'Delete'], description: 'Supprimer les cellules de la sélection (en pause)' },
    { action: 'escape', keys: ['Escape'], description: 'Annuler un saut, sinon quitter la pose, sinon effacer la sélection' },
    { action: 'rotate-cw', keys: ['r'], shift: false, when: 'placing', description: 'En pose : rotation horaire' },
    { action: 'rotate-ccw', keys: ['r'], shift: true, when: 'placing', description: 'En pose : rotation antihoraire' },
    { action: 'mirror-h', keys: ['f'], shift: false, when: 'placing', description: 'En pose : miroir horizontal' },
    { action: 'mirror-v', keys: ['f'], shift: true, when: 'placing', description: 'En pose : miroir vertical' },
    { action: 'theme', keys: ['t'], description: 'Thème suivant : Auto, Clair, Sombre' },
    { action: 'fullscreen', keys: ['e'], description: 'Entrer dans le plein écran ou en sortir' },
    { action: 'panel', keys: ['l'], description: 'Replier ou déplier le panneau' },
    { action: 'minimap', keys: ['m'], handledBy: 'app', description: 'Afficher ou masquer la mini-carte' },
    { action: 'tool-eraser', keys: ['x'], handledBy: 'app', description: 'Outil Gomme (⌘X reste « couper »)' },
    { action: 'image-import', keys: ['i'], handledBy: 'app', description: 'Importer une image' },
  ];

  function findShortcut(action) {
    for (const s of SHORTCUTS) if (s.action === action) return s;
    return null;
  }

  // Libellé d'une touche dans une légende
  function keyLabel(key) {
    if (key === ' ') return 'Espace';
    if (key === 'Escape') return 'Échap';
    if (key === 'Backspace') return '⌫';
    if (key === 'Delete') return 'Suppr';
    return key.length === 1 ? key.toUpperCase() : key;
  }

  // Nom d'une touche pour aria-keyshortcuts
  function ariaKey(key) {
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toUpperCase() : key;
  }

  /*
   * Raccourci d'une action, lu dans la table : { keys: ['⌘', 'C'], aria: 'Meta+C' } ;
   * null si l'action n'a pas de raccourci. Seule la première touche est affichée.
   */
  function shortcutFor(action, isMac) {
    const s = findShortcut(action);
    if (!s) return null;
    const mac = isMac !== false;
    const keys = [];
    const aria = [];
    if (s.command) {
      keys.push(mac ? '⌘' : 'Ctrl');
      aria.push(mac ? 'Meta' : 'Control');
    }
    if (s.shift === true) {
      keys.push(mac ? '⇧' : 'Maj');
      aria.push('Shift');
    }
    keys.push(keyLabel(s.keys[0]));
    aria.push(ariaKey(s.keys[0]));
    return { keys: keys, aria: aria.join('+') };
  }

  /*
   * La touche (KeyboardEvent.key + modificateurs) correspond-elle au raccourci de l'action ?
   * Sert à l'interface pour ses propres touches (mini-carte). mods : { shift, meta, ctrl, alt, editable }.
   */
  function matchShortcut(action, key, mods, isMac) {
    const s = findShortcut(action);
    const m = mods || {};
    if (!s || m.editable || typeof key !== 'string') return false;
    const command = isMac !== false ? m.meta : m.ctrl;
    if (s.command) {
      if (!command || m.alt) return false;
    } else if (m.meta || m.ctrl || m.alt) {
      return false;
    }
    if (s.shift === true && !m.shift) return false;
    if (s.shift === false && m.shift) return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    return s.keys.indexOf(k) >= 0;
  }

  // --- Libellés des boutons selon l'état ---

  function formatInt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Raison commune : simulation ou saut en cours
  function busyReason(s) {
    if (s.jumping) return 'Indisponible pendant le saut';
    if (s.running) return 'Disponible en pause';
    return null;
  }

  function selectionReason(s) {
    return busyReason(s) || 'Sélectionnez d\'abord une zone';
  }

  // Outil : « Crayon, outil actif » quand il est choisi (aucun en mode pose)
  function toolLabel(name, tool) {
    return function (s) {
      return name + (!s.placing && s.tool === tool ? ', outil actif' : '');
    };
  }

  function constant(value) {
    return function () { return value; };
  }

  /*
   * Boutons concernés : identifiant d'action (attribut data-action) → raccourci, libellé,
   * condition de désactivation (identique à celle de l'interface) et raison.
   */
  const BUTTONS = {
    'tool-move': { shortcut: 'tool-move', label: toolLabel('Déplacer la vue', 'move') },
    'tool-pencil': { shortcut: 'tool-pencil', label: toolLabel('Crayon', 'pencil') },
    'tool-select': { shortcut: 'tool-select', label: toolLabel('Sélection rectangulaire', 'select') },
    copy: { shortcut: 'copy', label: constant('Copier la sélection'), disabled: function (s) { return !s.canCopy; }, reason: selectionReason },
    cut: { shortcut: 'cut', label: constant('Couper la sélection'), disabled: function (s) { return !s.canCut; }, reason: selectionReason },
    paste: { shortcut: 'paste', label: constant('Coller, puis cliquer sur la grille pour poser'),
      disabled: function (s) { return !s.canPaste; }, reason: constant('Presse-papiers vide') },
    delete: { shortcut: 'delete', label: constant('Supprimer les cellules de la sélection'),
      disabled: function (s) { return !s.canDelete; }, reason: selectionReason },
    // En pose, R fait pivoter l'aperçu : le bouton ne montre alors aucun raccourci
    recenter: { shortcut: function (s) { return s.placing ? null : 'recenter'; },
      label: function (s) { return s.liveCount === 0 ? 'Revenir à l\'origine' : 'Recentrer sur les cellules vivantes'; } },
    export: { label: constant('Enregistrer l\'image de la grille (PNG)') },
    chart: { shortcut: 'chart', label: function (s) { return s.chartVisible ? 'Masquer le graphique' : 'Afficher le graphique'; } },
    minimap: { shortcut: 'minimap', label: function (s) { return s.minimapVisible ? 'Masquer la mini-carte' : 'Afficher la mini-carte'; } },
    fullscreen: { shortcut: 'fullscreen', label: function (s) { return s.fullscreen ? 'Quitter le plein écran' : 'Plein écran'; } },
    panel: { shortcut: 'panel', label: function (s) { return s.panelCollapsed ? 'Déplier le panneau' : 'Replier le panneau'; } },
    'panel-handle': { shortcut: 'panel', label: constant('Déplier le panneau') },
    rules: { label: function (s) { return s.rulesOpen ? 'Fermer les règles du jeu' : 'Règles du jeu'; } },
    settings: { label: constant('Réglages'),
      detail: function (s) { return { label: 'Thème : ' + (theme.THEME_LABELS[s.theme] || s.theme), shortcut: 'theme' }; } },
    'rotate-cw': { shortcut: 'rotate-cw', label: constant('Rotation horaire') },
    'rotate-ccw': { shortcut: 'rotate-ccw', label: constant('Rotation antihoraire') },
    'mirror-h': { shortcut: 'mirror-h', label: constant('Miroir horizontal, gauche ↔ droite') },
    'mirror-v': { shortcut: 'mirror-v', label: constant('Miroir vertical, haut ↔ bas') },
    'place-done': { shortcut: 'escape', label: constant('Terminer la pose') },
    play: { shortcut: 'play', label: function (s) { return s.playLabel; },
      disabled: function (s) { return !s.canPlay; }, reason: constant('Indisponible pendant le saut') },
    step: { shortcut: 'step', label: constant('Une génération'), disabled: function (s) { return !s.canStep; }, reason: busyReason },
    back: { shortcut: 'back', label: constant('Génération précédente'), disabled: function (s) { return !s.canBack; },
      reason: function (s) { return busyReason(s) || 'Aucune génération précédente en mémoire'; } },
    jump: { shortcut: 'jump',
      label: function (s) { return 'Avancer de ' + formatInt(s.jumpCount) + (s.jumpCount === 1 ? ' génération' : ' générations'); },
      disabled: function (s) { return !s.canJump; }, reason: busyReason },
    'jump-cancel': { shortcut: 'escape', label: constant('Annuler le saut') },
  };

  const BUTTON_ACTIONS = Object.keys(BUTTONS);

  function sizeLabel(n) {
    return 'diamètre ' + formatInt(n) + (n === 1 ? ' cellule' : ' cellules');
  }

  /*
   * Boutons ajoutés avec l'import d'image et la gomme : même mécanisme de légende, liste à part
   * (BUTTON_ACTIONS reste la liste figée des boutons du lot des légendes, vérifiée par ses tests).
   */
  const ADDED_BUTTONS = {
    'tool-eraser': { shortcut: 'tool-eraser',
      label: function (s) {
        const active = !s.placing && s.tool === 'eraser';
        return 'Gomme' + (active ? ', outil actif' : '') + ', ' + sizeLabel(s.eraserSize || 3);
      } },
    'image-import': { shortcut: 'image-import', label: constant('Importer une image'),
      disabled: function (s) { return !!s.jumping; }, reason: constant('Indisponible pendant le saut') },
  };

  const ADDED_BUTTON_ACTIONS = Object.keys(ADDED_BUTTONS);

  /*
   * Légende d'un bouton dans l'état courant. state : état du contrôleur (getState) complété par
   * l'interface : { fullscreen, minimapVisible, isMac }. Renvoie { label, shortcut (touches, ou
   * null), ariaShortcut, disabled, disabledReason (ou null), detail ({ label, shortcut } ou null) }.
   */
  function getTooltip(actionId, state) {
    const b = BUTTONS[actionId] || ADDED_BUTTONS[actionId];
    if (!b) throw new Error('Bouton sans légende : "' + actionId + '"');
    const s = state || {};
    const name = typeof b.shortcut === 'function' ? b.shortcut(s) : b.shortcut;
    const sc = name ? shortcutFor(name, s.isMac) : null;
    const disabled = b.disabled ? b.disabled(s) : false;
    let detail = null;
    if (b.detail) {
      const d = b.detail(s);
      const dsc = d.shortcut ? shortcutFor(d.shortcut, s.isMac) : null;
      detail = { label: d.label, shortcut: dsc ? dsc.keys : null };
    }
    return {
      label: b.label(s),
      shortcut: sc ? sc.keys : null,
      ariaShortcut: sc ? sc.aria : null,
      disabled: disabled,
      disabledReason: disabled ? b.reason(s) : null,
      detail: detail,
    };
  }

  // Attributs d'accessibilité d'un bouton : aria-label = libellé courant, toujours
  function ariaFor(actionId, state) {
    const t = getTooltip(actionId, state);
    return { label: t.label, keyshortcuts: t.ariaShortcut, disabled: t.disabled };
  }

  // Empreinte du contenu, pour ne toucher au DOM que lorsqu'il change
  function contentKey(t) {
    return [t.label, (t.shortcut || []).join(' '), t.disabledReason || '',
      t.detail ? t.detail.label + ' ' + (t.detail.shortcut || []).join(' ') : ''].join('|');
  }

  /*
   * Position de la légende : centrée sous le bouton, au-dessus s'il n'y a pas la place dessous,
   * toujours entièrement visible (marge de 6 px). anchorRect : { left, top, right, bottom } ;
   * tooltipSize : { width, height } ; viewportSize : { width, height }. Renvoie { x, y, placement }.
   */
  const TOOLTIP_GAP = 6;
  const VIEWPORT_MARGIN = 6;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function positionTooltip(anchorRect, tooltipSize, viewportSize) {
    const a = anchorRect;
    const w = tooltipSize.width;
    const h = tooltipSize.height;
    const vw = viewportSize.width;
    const vh = viewportSize.height;
    let placement = 'below';
    let y = a.bottom + TOOLTIP_GAP;
    if (y + h > vh - VIEWPORT_MARGIN && a.top - TOOLTIP_GAP - h >= VIEWPORT_MARGIN) {
      placement = 'above';
      y = a.top - TOOLTIP_GAP - h;
    }
    const x = clamp((a.left + a.right) / 2 - w / 2, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - w));
    y = clamp(y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - h));
    return { x: Math.round(x), y: Math.round(y), placement: placement };
  }

  /*
   * Position d'un menu déroulant (règles du jeu) : aligné sur le bord gauche du bouton, juste
   * dessous, décalé pour tenir en largeur ; sa hauteur maximale va jusqu'au bas de la fenêtre.
   * Renvoie { x, y, maxHeight }.
   */
  function positionDropdown(anchorRect, menuWidth, viewportSize) {
    const x = clamp(anchorRect.left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportSize.width - VIEWPORT_MARGIN - menuWidth));
    const y = Math.max(VIEWPORT_MARGIN, anchorRect.bottom + TOOLTIP_GAP);
    return { x: Math.round(x), y: Math.round(y), maxHeight: Math.max(120, Math.floor(viewportSize.height - y - VIEWPORT_MARGIN)) };
  }

  /*
   * Quelle légende afficher, et quand. options : { setTimeout, clearTimeout, delay, onChange(id) }.
   * Une seule légende à la fois. Après un clic ou Échap, la légende du bouton ne revient qu'après
   * que le pointeur l'a quitté (ou au prochain focus clavier).
   */
  function createTooltipController(options) {
    const o = options || {};
    const setT = o.setTimeout;
    const clearT = o.clearTimeout;
    const delay = o.delay === undefined ? SHOW_DELAY_MS : o.delay;
    const onChange = typeof o.onChange === 'function' ? o.onChange : function () {};
    let current = null;
    let pending = null;
    let timer = null;
    let suppressed = null;

    function cancel() {
      if (timer !== null) clearT(timer);
      timer = null;
      pending = null;
    }

    function show(id) {
      cancel();
      if (current === id) return;
      current = id;
      onChange(id);
    }

    function hide() {
      cancel();
      if (current === null) return false;
      current = null;
      onChange(null);
      return true;
    }

    return {
      // Survol à la souris : apparition après le délai
      hover: function (id) {
        if (suppressed === id || current === id || pending === id) return;
        if (current !== null) hide();
        cancel();
        pending = id;
        timer = setT(function () {
          timer = null;
          pending = null;
          show(id);
        }, delay);
      },
      leave: function (id) {
        if (suppressed === id) suppressed = null;
        if (pending === id) cancel();
        if (current === id) hide();
      },
      // Focus au clavier : apparition immédiate
      focus: function (id) {
        suppressed = null;
        show(id);
      },
      blur: function (id) {
        if (current === id || pending === id) hide();
      },
      press: function (id) {
        suppressed = id;
        hide();
      },
      // Échap : masque la légende visible, sans consommer la touche
      escape: function () {
        if (current !== null) suppressed = current;
        return hide();
      },
      // Début d'un geste sur la grille, bouton masqué : disparition
      dismiss: hide,
      current: function () { return current; },
      // Contenu de la légende visible dans l'état donné (mise à jour en direct), ou null
      content: function (state) { return current === null ? null : getTooltip(current, state); },
    };
  }

  // --- Boutons désactivés (aria-disabled) : l'action ne doit jamais se déclencher ---

  function shouldBlockActivation(target) {
    return !!(target && typeof target.closest === 'function' && target.closest('[aria-disabled="true"]'));
  }

  // À brancher en phase de capture sur le document, pour les clics souris comme clavier (Entrée, Espace)
  function guardActivation(event) {
    if (!shouldBlockActivation(event.target)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  const api = {
    SHOW_DELAY_MS: SHOW_DELAY_MS,
    SHORTCUTS: SHORTCUTS,
    BUTTON_ACTIONS: BUTTON_ACTIONS,
    ADDED_BUTTON_ACTIONS: ADDED_BUTTON_ACTIONS,
    findShortcut: findShortcut,
    shortcutFor: shortcutFor,
    matchShortcut: matchShortcut,
    keyLabel: keyLabel,
    getTooltip: getTooltip,
    ariaFor: ariaFor,
    contentKey: contentKey,
    positionTooltip: positionTooltip,
    positionDropdown: positionDropdown,
    createTooltipController: createTooltipController,
    shouldBlockActivation: shouldBlockActivation,
    guardActivation: guardActivation,
  };

  root.Life = root.Life || {};
  root.Life.tooltips = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
