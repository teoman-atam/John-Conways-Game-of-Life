/*
 * Contrôleur : état et règles de l'interface, sans DOM ni minuteur réel.
 * Le temps arrive par tick(now) et le hasard par options.random : les tests
 * peuvent donc tout piloter de façon déterministe.
 * Il orchestre aussi l'édition : outil actif, sélection, presse-papiers interne et mode pose,
 * et l'analyse : âges, historique, retour arrière, saut de N générations, détection, graphique.
 * Le saut mesure son budget par image avec options.clock (horloge injectée).
 * Confort : thème, panneau replié, et sauvegarde automatique dans options.storage
 * (stockage injecté, écrit par le planificateur), restaurée par restore().
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('./engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('./patterns.js');
  const camera = (root.Life && root.Life.camera) || require('./camera.js');
  const transform = (root.Life && root.Life.transform) || require('./transform.js');
  const rle = (root.Life && root.Life.rle) || require('./rle.js');
  const tools = (root.Life && root.Life.tools) || require('./tools.js');
  const agesLib = (root.Life && root.Life.ages) || require('./ages.js');
  const historyLib = (root.Life && root.Life.history) || require('./history.js');
  const detection = (root.Life && root.Life.detection) || require('./detection.js');
  const sampling = (root.Life && root.Life.sampling) || require('./sampling.js');
  const themeLib = (root.Life && root.Life.theme) || require('./theme.js');
  const persistence = (root.Life && root.Life.persistence) || require('./persistence.js');
  const saveSchedulerLib = (root.Life && root.Life.saveScheduler) || require('./saveScheduler.js');
  const eraserLib = (root.Life && root.Life.eraser) || require('./eraser.js');
  const imageConvert = (root.Life && root.Life.imageConvert) || require('./imageConvert.js');

  /*
   * Plafond de sécurité : nombre maximal de cellules vivantes. Si une génération
   * le dépasse, elle n'est pas appliquée, la simulation se met en pause et un message
   * l'explique. Il protège la fluidité de la page et la mémoire du navigateur.
   * Il s'applique aussi aux éditions : dessin, pose, import RLE, remplissage aléatoire.
   */
  const MAX_LIVE_CELLS = 100000;
  const MIN_SPEED = 1;
  const MAX_SPEED = 30;
  const DEFAULT_SPEED = 10;
  // Au plus 5 générations par image : pas de rattrapage massif au retour d'un onglet masqué
  const MAX_STEPS_PER_FRAME = 5;
  // Densité du remplissage aléatoire, en pourcentage
  const MIN_DENSITY = 5;
  const MAX_DENSITY = 50;
  const DEFAULT_DENSITY = 30;
  const ZOOM_STEP = 1.25;
  // Fenêtre glissante de mesure des générations par seconde réelles
  const RATE_WINDOW_MS = 2000;
  // Tolérance d'arrondi pour l'accumulateur de temps (ms)
  const TIME_EPSILON = 1e-6;
  // Saut de N générations : bornes de N, valeur de départ, budget de calcul par image (ms)
  const JUMP_MIN = 1;
  const JUMP_MAX = 10000;
  const DEFAULT_JUMP = 100;
  const JUMP_BUDGET_MS = 12;

  const TOOLS = tools.TOOLS;

  function pad(n, width) {
    return String(n).padStart(width, '0');
  }

  // Nom du fichier exporté : jeu-de-la-vie_gen-<numéro>_<AAAAMMJJ-HHMMSS>.<ext> (heure locale)
  function exportFileName(generation, date, extension) {
    const d = date.getFullYear() + pad(date.getMonth() + 1, 2) + pad(date.getDate(), 2);
    const t = pad(date.getHours(), 2) + pad(date.getMinutes(), 2) + pad(date.getSeconds(), 2);
    return 'jeu-de-la-vie_gen-' + generation + '_' + d + '-' + t + '.' + (extension || 'png');
  }

  // Entier avec séparateur de milliers (espace insécable), indépendant de la locale
  function formatInt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function createController(options) {
    const opts = options || {};
    if (typeof opts.random !== 'function') {
      throw new TypeError('createController : options.random doit être une fonction renvoyant un nombre dans [0, 1[');
    }
    const random = opts.random;
    const maxLiveCells = opts.maxLiveCells === undefined ? MAX_LIVE_CELLS : opts.maxLiveCells;
    // Touche de commande : Cmd sur Mac, Ctrl ailleurs
    const isMac = opts.isMac !== false;
    // Horloge en ms pour le budget du saut ; sans horloge, une génération de saut par image
    const clock = typeof opts.clock === 'function' ? opts.clock : null;

    let cells = new Set();
    let generation = 0;
    let running = false;
    let speed = DEFAULT_SPEED;
    let density = DEFAULT_DENSITY;
    let cam = camera.createCamera(opts.width || 0, opts.height || 0);
    let message = null;
    let messageId = 0;

    // Édition
    let tool = TOOLS.PENCIL;
    let selection = null; // rectangle { minX, minY, maxX, maxY }
    let clipboard = null; // forme { cells, width, height }
    let placing = null; // { name, shape, anchor }
    let hoverPoint = null; // position du pointeur sur le canvas (px), null s'il est dehors
    let spaceDown = false;
    let spaceUsed = false; // un glisser a eu lieu pendant l'appui sur Espace
    let capWarned = false; // plafond déjà signalé pendant le geste en cours

    // Analyse
    let ages = new Map(); // âge de chaque cellule vivante, aligné sur cells
    const history = historyLib.createHistory({ maxGenerations: opts.historyMaxGenerations, maxCells: opts.historyMaxCells });
    const detector = detection.createDetector();
    const population = sampling.createSeries(opts.seriesLimit);
    population.reset(0);
    let reported = null; // signature de la dernière détection signalée (une seule fois par état)
    // Pause automatique désactivée par défaut ; l'interface l'active (case cochée au départ)
    let autoPause = opts.autoPause === true;
    let ageColors = false;
    let chartVisible = false;
    let jumpCount = DEFAULT_JUMP;
    let jump = null; // saut en cours : { total, done }

    // Gomme : diamètre en cellules
    let eraserSize = eraserLib.ERASER_DEFAULT_SIZE;

    // Import d'image : décodage injecté (options.decodeImage(file) → thenable de { width, height, … }) ;
    // conversion en attente de validation : { bitmap, mosaic, count, width, height }. Aucune image n'est gardée.
    const decodeImage = typeof opts.decodeImage === 'function' ? opts.decodeImage : null;
    let pendingImage = null;

    // Confort
    let themePreference = 'auto';
    let panelCollapsed = false;
    // Commandes propres à l'interface (plein écran), appelées pendant l'événement clavier
    const onCommand = typeof opts.onCommand === 'function' ? opts.onCommand : null;

    // Sauvegarde automatique : stockage et horloge murale injectés ; sans stockage, rien n'est écrit
    const storage = opts.storage || null;
    const saveKey = opts.saveKey || persistence.STORAGE_KEY;
    const dateNow = typeof opts.dateNow === 'function' ? opts.dateNow : null;
    let saveStatus = storage ? 'idle' : 'unavailable'; // 'idle' | 'saved' | 'unavailable' | 'error'
    let savedAt = null;
    let lastSignature = null;
    const scheduler = storage ? saveSchedulerLib.createSaveScheduler({
      clock: clock || function () { return 0; },
      write: writeSave,
    }) : null;

    // Horloge de simulation
    let lastTime = null;
    let accumulator = 0;
    // Images récentes ayant produit des générations : { t, n }
    let rateEvents = [];
    let measuredRate = 0;

    const gesture = tools.createGesture(camera.DRAG_THRESHOLD);

    function resetClock() {
      lastTime = null;
      accumulator = 0;
      rateEvents = [];
      measuredRate = 0;
    }

    function setMessage(text) {
      messageId += 1;
      message = { id: messageId, text: text };
    }

    // Toute édition remet le compteur de générations à 0 et vide historique, graphique et détection
    function setEditedCells(next) {
      cells = next;
      generation = 0;
      resetAnalysis();
    }

    // Nouveau départ au compteur 0 : âges à 1, historique, détection et série vidés
    function resetAnalysis() {
      ages = agesLib.initialAges(cells);
      history.clear();
      detector.reset();
      reported = null;
      population.reset(cells.size);
    }

    // Simulation ou saut en cours : aucune édition possible
    function busy() {
      return running || jump !== null;
    }

    // Remplace tout le contenu : pause et compteur à 0
    function replaceCells(next) {
      setEditedCells(next);
      pause();
    }

    function capText(count) {
      return 'la génération ' + formatInt(generation + 1) + ' compterait ' + formatInt(count) +
        ' cellules vivantes, au-delà du plafond de sécurité de ' + formatInt(maxLiveCells) + ' (MAX_LIVE_CELLS).';
    }

    /*
     * Calcule une génération : âges, historique, série et détection suivent.
     * Refuse celle qui dépasserait le plafond : { ok: false, count }. Sinon { ok: true, found }.
     */
    function advance() {
      if (detector.size() === 0) detector.push(cells); // état de départ de la détection
      const next = engine.nextGeneration(cells);
      if (next.size > maxLiveCells) return { ok: false, count: next.size };
      history.push({ cells: cells, ages: ages, generation: generation });
      ages = agesLib.nextAges(cells, ages, next);
      cells = next;
      generation += 1;
      population.push(cells.size);
      return { ok: true, found: detector.observe(cells) };
    }

    /*
     * Suite d'une détection. context : 'run' (lecture), 'jump' (saut) ou 'step' (une génération).
     * En lecture et en saut, chaque état n'est signalé qu'une fois ; si la pause automatique est
     * active, la lecture se met en pause et le saut s'arrête. Renvoie true si l'avance s'arrête.
     */
    function handleDetection(found, context) {
      if (!found) {
        reported = null;
        return false;
      }
      const signature = found.kind + ':' + found.period;
      const fresh = signature !== reported;
      reported = signature;
      const text = detection.describe(found, generation);
      if (context === 'step') {
        setMessage(text);
        return false;
      }
      if (!fresh) return false;
      if (!autoPause) {
        setMessage(text);
        return false;
      }
      if (context === 'jump') stopJump('Saut arrêté : ' + text.charAt(0).toLowerCase() + text.slice(1) + '.');
      else {
        pause();
        setMessage(text);
      }
      return true;
    }

    // Démarrer efface la sélection et annule le mode pose : on n'édite pas pendant la simulation
    function start() {
      if (running) return false; // déjà lancée : aucun effet, aucune seconde boucle
      if (jump) return false;
      running = true;
      resetClock();
      selection = null;
      placing = null;
      return true;
    }

    function pause() {
      if (!running) return false;
      running = false;
      resetClock();
      flushSave(); // la mise en pause, même automatique, force une écriture
      return true;
    }

    function toggleRunning() {
      if (running) pause();
      else start();
      return running;
    }

    // « Une génération » : uniquement en pause, hors saut
    function step() {
      if (busy()) return false;
      const r = advance();
      if (!r.ok) {
        setMessage('Simulation mise en pause : ' + capText(r.count));
        return false;
      }
      handleDetection(r.found, 'step');
      return true;
    }

    // Vide la grille, met en pause, compteur à 0 ; la vue n'est pas modifiée
    function reset() {
      if (jump) return false;
      replaceCells(new Set());
      return true;
    }

    // --- Retour en arrière : uniquement les générations, jamais une édition ---

    function stepBack() {
      if (busy() || history.size() === 0) return false;
      const previous = history.pop();
      cells = previous.cells;
      ages = previous.ages;
      generation = previous.generation;
      if (population.length() > generation + 1) population.pop();
      // Détection reconstruite sur les états précédents encore connus
      detector.reset();
      reported = null;
      for (const s of history.recent(detection.PERIOD_MAX - 1)) detector.push(s.cells);
      detector.push(cells);
      return true;
    }

    // --- Saut de N générations, fractionné sur plusieurs images ---

    // Accepte un entier de 1 à 10 000 ; sinon message et valeur inchangée
    function setJumpCount(value) {
      const text = String(value).trim();
      const n = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!(n >= JUMP_MIN && n <= JUMP_MAX)) {
        setMessage('Nombre de générations refusé : « ' + value + ' ». Entrez un entier de ' + JUMP_MIN + ' à ' +
          formatInt(JUMP_MAX) + '.');
        return false;
      }
      jumpCount = n;
      return true;
    }

    // Uniquement en pause ; comme la lecture, le saut efface la sélection et annule le mode pose
    function startJump() {
      if (busy()) return false;
      selection = null;
      placing = null;
      jump = { total: jumpCount, done: 0 };
      return true;
    }

    function stopJump(text) {
      jump = null;
      setMessage(text);
      flushSave();
    }

    function cancelJump() {
      if (!jump) return false;
      stopJump('Saut annulé à la génération ' + formatInt(generation) + ' (' + formatInt(jump.done) + ' sur ' +
        formatInt(jump.total) + ' calculées).');
      return true;
    }

    // Une tranche de saut : au plus JUMP_BUDGET_MS de calcul, au moins une génération
    function jumpSlice() {
      const start = clock ? clock() : 0;
      let steps = 0;
      let lastCost = 0;
      while (jump && jump.done < jump.total) {
        const t0 = clock ? clock() : 0;
        if (steps > 0 && (!clock || t0 - start + lastCost > JUMP_BUDGET_MS)) break;
        const r = advance();
        if (!r.ok) {
          stopJump('Saut arrêté à la génération ' + formatInt(generation) + ' : ' + capText(r.count));
          break;
        }
        jump.done++;
        steps++;
        if (clock) lastCost = clock() - t0;
        if (handleDetection(r.found, 'jump')) break;
      }
      if (jump && jump.done >= jump.total) {
        jump = null;
        flushSave();
      }
      return steps;
    }

    // refused : début du message, par exemple « Pose refusée »
    function capMessage(refused, count) {
      setMessage(refused + ' : la grille compterait ' + formatInt(count) +
        ' cellules vivantes, au-delà du plafond de sécurité de ' + formatInt(maxLiveCells) + ' (MAX_LIVE_CELLS).');
    }

    // Inverse une cellule, uniquement en pause ; une modification manuelle remet le compteur à 0
    function toggleCell(x, y) {
      if (busy()) return false;
      const k = engine.key(x, y);
      engine.parseKey(k);
      const next = new Set(cells);
      if (next.has(k)) {
        next.delete(k);
      } else {
        if (next.size + 1 > maxLiveCells) {
          capMessage('Dessin refusé', next.size + 1);
          return false;
        }
        next.add(k);
      }
      setEditedCells(next);
      return true;
    }

    // Crayon : dessine ou efface une suite de cellules
    function paint(mode, points) {
      if (busy()) return false;
      let next = null;
      for (const p of points) {
        const k = engine.key(p.x, p.y);
        const alive = (next || cells).has(k);
        if (mode === 'draw' && !alive) {
          if ((next || cells).size + 1 > maxLiveCells) {
            if (!capWarned) capMessage('Dessin refusé', (next || cells).size + 1);
            capWarned = true;
            break;
          }
          if (!next) next = new Set(cells);
          next.add(k);
        } else if (mode === 'erase' && alive) {
          if (!next) next = new Set(cells);
          next.delete(k);
        }
      }
      if (next) setEditedCells(next);
      return next !== null;
    }

    /*
     * Gomme : efface le long du trait de la cellule from à la cellule to (from = to : un tampon),
     * uniquement en pause. Comme le Crayon, chaque effacement est une édition : compteur à 0,
     * historique, graphique et détection vidés ; un geste complet n'en laisse donc qu'une.
     */
    function eraseAlong(from, to) {
      if (busy()) return false;
      const keys = eraserLib.erasedKeys(cells, from, to, eraserSize);
      if (keys.length === 0) return false;
      const next = new Set(cells);
      for (const k of keys) next.delete(k);
      setEditedCells(next);
      return true;
    }

    function setEraserSize(value) {
      eraserSize = eraserLib.clampSize(value);
      return eraserSize;
    }

    // --- Import d'image ---

    /*
     * Ouverture d'un fichier image, en pause seulement : la lecture est d'abord mise en pause, un saut
     * refuse l'import. Le fichier est vérifié (format, 20 Mo, HEIC), puis décodé par options.decodeImage.
     * done({ ok: true, image }) ou done({ ok: false, error }) ; l'erreur s'affiche aussi en message.
     * La grille n'est jamais modifiée ici.
     */
    function openImageFile(file, done) {
      const finish = typeof done === 'function' ? done : function () {};
      const refuse = function (text) {
        setMessage(text);
        finish({ ok: false, error: text });
      };
      if (jump) return refuse('Import d\'image impossible pendant un saut : annulez-le ou attendez sa fin.');
      pause();
      const check = imageConvert.checkImageFile(file);
      if (!check.ok) return refuse(check.error);
      if (!decodeImage) return refuse('Ce navigateur ne permet pas de lire les images.');
      const unreadable = function () {
        refuse('L\'image « ' + ((file && file.name) || '') + ' » n\'a pas pu être lue : le fichier est peut-être endommagé, ' +
          'ou ce n\'est pas une vraie image. Formats acceptés : PNG, JPEG, WebP et GIF.');
      };
      let pending;
      try {
        pending = decodeImage(file);
      } catch (err) {
        return unreadable();
      }
      if (!pending || typeof pending.then !== 'function') return unreadable();
      pending.then(function (image) {
        if (!image || !(image.width > 0) || !(image.height > 0)) return unreadable();
        finish({ ok: true, image: image });
      }, unreadable);
    }

    /*
     * Aperçu : conversion de l'image réduite (objet de forme ImageData) selon les réglages
     * { mode, threshold, brightness, invert, mosaic }. Le résultat attend la validation.
     * Renvoie { count, overCap, width, height, threshold, ms, bitmap }.
     */
    function previewImage(pixels, options) {
      const o = options || {};
      const t0 = clock ? clock() : 0;
      const res = imageConvert.convert(pixels, o);
      const mosaic = !!o.mosaic;
      const count = imageConvert.estimate(res.bitmap, mosaic);
      const size = imageConvert.gridSize(res.bitmap, mosaic);
      const ms = clock ? clock() - t0 : null;
      pendingImage = { bitmap: res.bitmap, mosaic: mosaic, count: count, width: size.width, height: size.height };
      return { count: count, overCap: count > maxLiveCells, width: size.width, height: size.height,
        threshold: res.threshold, ms: ms, bitmap: res.bitmap };
    }

    /*
     * Validation. replace : le résultat remplace toute la grille, centré sur le centre de la vue, en pause,
     * avec toutes les règles d'édition (compteur à 0, âges à 1, historique, graphique et détection vidés),
     * puis la vue est recadrée comme avec Recentrer. Sinon : mode pose, comme un motif.
     * Refusée au-delà du plafond, sans cellule vivante, ou pendant un saut. Aucun démarrage automatique.
     */
    function confirmImageImport(replace) {
      if (!pendingImage) return { ok: false, error: 'Aucune image à importer.' };
      if (jump) return { ok: false, error: 'Import d\'image impossible pendant un saut.' };
      const p = pendingImage;
      if (p.count > maxLiveCells) {
        return { ok: false, error: 'Trop de cellules : ' + formatInt(p.count) + ', au-delà du plafond de ' + formatInt(maxLiveCells) +
          ' (MAX_LIVE_CELLS). Réduisez la largeur ou changez de mode.' };
      }
      if (p.count === 0) return { ok: false, error: 'L\'image ne donne aucune cellule vivante : changez le seuil, le mode ou Inverser.' };
      const shape = { cells: imageConvert.toCells(p.bitmap, p.mosaic), width: p.width, height: p.height };
      pendingImage = null;
      if (replace) {
        const center = camera.centerCell(cam);
        selection = null;
        placing = null;
        replaceCells(transform.placeShape(shape, center.x - Math.floor(shape.width / 2), center.y - Math.floor(shape.height / 2)));
        recenter();
      } else {
        enterPlacing(shape, 'Image');
      }
      return { ok: true, count: p.count, width: shape.width, height: shape.height };
    }

    function cancelImageImport() {
      const had = pendingImage !== null;
      pendingImage = null;
      return had;
    }

    // --- Outils ---

    // Choisir un outil quitte le mode pose
    function setTool(name) {
      if (!tools.isTool(name)) throw new Error('Outil inconnu : "' + name + '"');
      tool = name;
      placing = null;
      return tool;
    }

    function effectiveTool() {
      return tools.effectiveTool({ tool: tool, placing: placing, running: busy(), spaceHeld: spaceDown });
    }

    // --- Sélection et presse-papiers (en pause, avec une sélection active) ---

    function canEditSelection() {
      return !busy() && selection !== null;
    }

    function clearSelection() {
      const had = selection !== null;
      selection = null;
      return had;
    }

    // Copie les cellules de la sélection, normalisées à l'origine ; la boîte garde ses dimensions
    function copySelection() {
      if (!canEditSelection()) return false;
      clipboard = transform.extractRect(cells, selection);
      return true;
    }

    function deleteSelection() {
      if (!canEditSelection()) return false;
      setEditedCells(transform.removeRect(cells, selection));
      return true;
    }

    function cutSelection() {
      if (!copySelection()) return false;
      return deleteSelection();
    }

    // --- Mode pose ---

    function cellAt(point) {
      return camera.screenToCell(cam, point.x, point.y);
    }

    // Pause, puis aperçu du contenu centré sous le curseur (ou au centre de la vue)
    function enterPlacing(shape, name) {
      if (jump) return false;
      pause();
      placing = {
        name: name,
        shape: shape,
        anchor: hoverPoint ? cellAt(hoverPoint) : camera.centerCell(cam),
      };
      return true;
    }

    // Choisir un motif prédéfini : il s'ajoutera au contenu existant
    function loadPattern(id) {
      const m = patterns.matrix(id);
      const name = patterns.list().filter(function (p) { return p.id === id; })[0].name;
      return enterPlacing({ cells: engine.fromMatrix(m), width: m[0].length, height: m.length }, name);
    }

    // Cmd+V : pose du presse-papiers ; sans presse-papiers, rien ne se passe
    function paste() {
      if (!clipboard) return false;
      return enterPlacing(clipboard, 'Collage');
    }

    function cancelPlacing() {
      const had = placing !== null;
      placing = null;
      return had;
    }

    // Coin haut gauche de la pose : centre de la boîte (arrondi à la cellule) sur la cellule d'ancrage
    function placementOrigin(anchor) {
      return {
        x: anchor.x - Math.floor(placing.shape.width / 2),
        y: anchor.y - Math.floor(placing.shape.height / 2),
      };
    }

    // Pose par union ; le mode pose reste actif pour poser encore
    function placeAt(x, y) {
      if (busy() || !placing) return false;
      const origin = placementOrigin({ x: x, y: y });
      const next = transform.union(cells, transform.placeShape(placing.shape, origin.x, origin.y));
      if (next.size > maxLiveCells) {
        capMessage('Pose refusée', next.size);
        return false;
      }
      setEditedCells(next);
      placing.anchor = { x: x, y: y };
      return true;
    }

    function transformPlacing(fn) {
      if (!placing) return false;
      placing.shape = fn(placing.shape);
      return true;
    }

    // --- RLE ---

    // Import : en cas de succès, le contenu passe en mode pose
    function importRle(text) {
      if (jump) return { ok: false, error: 'Import impossible pendant un saut.' };
      let parsed;
      try {
        parsed = rle.parse(text, { maxCells: maxLiveCells });
      } catch (err) {
        return { ok: false, error: err.message };
      }
      if (parsed.cells.size === 0) return { ok: false, error: 'Le motif RLE ne contient aucune cellule vivante.' };
      enterPlacing({ cells: parsed.cells, width: parsed.width, height: parsed.height }, 'Motif RLE');
      return { ok: true, count: parsed.cells.size, width: parsed.width, height: parsed.height };
    }

    // Export de la sélection, ou de toutes les cellules vivantes sans sélection
    function exportRle() {
      const shape = selection ? transform.extractRect(cells, selection) : transform.shapeFromCells(cells);
      return {
        text: rle.write(shape),
        scope: selection ? 'selection' : 'all',
        width: shape.width,
        height: shape.height,
        count: shape.cells.size,
      };
    }

    // --- Remplissage aléatoire ---

    function setDensity(value) {
      const v = Math.round(Number(value));
      if (!Number.isFinite(v)) return density;
      density = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, v));
      return density;
    }

    // Zone du remplissage aléatoire : toute la zone visible
    function randomFillArea() {
      return camera.visibleCells(cam);
    }

    // Refusé sans rien modifier si le nombre attendu dépasse le plafond
    function randomFill() {
      if (jump) return false;
      const area = randomFillArea();
      const w = area.maxX - area.minX + 1;
      const h = area.maxY - area.minY + 1;
      const expected = Math.round(w * h * density / 100);
      const refuse = function (count) {
        setMessage('Remplissage refusé : la zone visible de ' + formatInt(w) + ' × ' + formatInt(h) +
          ' cellules à ' + density + ' % donnerait ' + formatInt(count) + ' cellules vivantes, au-delà du plafond de ' +
          formatInt(maxLiveCells) + '. Zoomez ou baissez la densité.');
        return false;
      };
      if (expected > maxLiveCells) return refuse(expected);
      const threshold = density / 100;
      const next = new Set();
      for (let y = area.minY; y <= area.maxY; y++) {
        for (let x = area.minX; x <= area.maxX; x++) {
          if (random() < threshold) next.add(engine.key(x, y));
        }
      }
      if (next.size > maxLiveCells) return refuse(next.size);
      replaceCells(next);
      return true;
    }

    // Change la vitesse sans rien réinitialiser
    function setSpeed(value) {
      const v = Math.round(Number(value));
      if (!Number.isFinite(v)) return speed;
      speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
      return speed;
    }

    // Générations par seconde mesurées entre la première et la dernière image de la fenêtre
    function updateRate(now, steps) {
      if (steps > 0) rateEvents.push({ t: now, n: steps });
      while (rateEvents.length > 0 && rateEvents[0].t < now - RATE_WINDOW_MS) rateEvents.shift();
      if (rateEvents.length < 2) {
        measuredRate = 0;
        return;
      }
      let total = 0;
      for (let i = 1; i < rateEvents.length; i++) total += rateEvents[i].n;
      measuredRate = total * 1000 / (rateEvents[rateEvents.length - 1].t - rateEvents[0].t);
    }

    /*
     * Appelé à chaque image par l'unique boucle d'animation, avec l'horodatage en ms.
     * Avance la simulation selon la vitesse grâce à un accumulateur de temps.
     * Renvoie le nombre de générations calculées pendant cette image.
     */
    function tick(now) {
      const steps = simulate(now);
      if (scheduler && saveStatus !== 'unavailable') {
        trackChanges();
        scheduler.tick(busy());
      }
      return steps;
    }

    function simulate(now) {
      if (jump) return jumpSlice();
      if (!running) return 0;
      if (lastTime === null) {
        lastTime = now;
        return 0;
      }
      accumulator += Math.max(0, now - lastTime);
      lastTime = now;
      const interval = 1000 / speed;
      let steps = 0;
      while (running && steps < MAX_STEPS_PER_FRAME && accumulator + TIME_EPSILON >= interval) {
        const r = advance();
        if (!r.ok) {
          pause();
          setMessage('Simulation mise en pause : ' + capText(r.count));
          break;
        }
        accumulator -= interval;
        steps++;
        if (handleDetection(r.found, 'run')) break;
      }
      // Retard trop important : on l'abandonne au lieu de le rattraper
      if (accumulator + TIME_EPSILON >= interval) accumulator = 0;
      if (running) updateRate(now, steps);
      return steps;
    }

    // --- Vue : zoom et déplacement restent disponibles pendant la simulation ---

    function setViewport(width, height) {
      cam = camera.setViewport(cam, width, height);
    }

    function zoomAt(factor, sx, sy) {
      cam = camera.zoomAt(cam, factor, sx, sy);
    }

    function zoomIn() {
      zoomAt(ZOOM_STEP, cam.width / 2, cam.height / 2);
    }

    function zoomOut() {
      zoomAt(1 / ZOOM_STEP, cam.width / 2, cam.height / 2);
    }

    function panBy(dx, dy) {
      cam = camera.pan(cam, dx, dy);
    }

    // Ajuste la vue sur les cellules vivantes ; grille vide → origine au zoom initial
    function recenter() {
      cam = camera.fitToBox(cam, engine.boundingBox(cells));
    }

    // --- Pointeur : le geste dépend de l'outil effectif au moment de l'appui ---

    function applyAction(action) {
      if (!action) return;
      if (action.type === 'pan') panBy(action.dx, action.dy);
      else if (action.type === 'paint') paint(action.mode, action.cells);
      else if (action.type === 'select' && !running) selection = action.rect;
      else if (action.type === 'erase') eraseAlong(action.from, action.to);
    }

    function pointerDown(sx, sy) {
      if (spaceDown) spaceUsed = true;
      hoverPoint = { x: sx, y: sy };
      capWarned = false;
      const cell = cellAt(hoverPoint);
      gesture.begin(effectiveTool(), sx, sy, cell, cells.has(engine.key(cell.x, cell.y)));
    }

    // Survol et glisser : met aussi à jour la cellule survolée
    function pointerMove(sx, sy) {
      hoverPoint = { x: sx, y: sy };
      if (!gesture.isActive()) return;
      applyAction(gesture.move(sx, sy, cellAt(hoverPoint)));
    }

    // Renvoie 'click' ou 'drag' (null sans appui en cours)
    function pointerUp(sx, sy) {
      if (!gesture.isActive()) return null;
      hoverPoint = { x: sx, y: sy };
      const result = gesture.end(sx, sy, cellAt(hoverPoint));
      applyAction(result.action);
      if (result.kind === 'click') {
        if (result.tool === TOOLS.PENCIL) toggleCell(result.cell.x, result.cell.y);
        else if (result.tool === tools.PLACE) placeAt(result.cell.x, result.cell.y);
        else if (result.tool === TOOLS.SELECT) clearSelection();
        else if (result.tool === TOOLS.ERASER) eraseAlong(result.cell, result.cell);
      }
      return result.kind;
    }

    function pointerCancel() {
      gesture.cancel();
    }

    // Le pointeur quitte le canvas : l'aperçu de pose reste à sa dernière position
    function pointerLeave() {
      if (placing && hoverPoint) placing.anchor = cellAt(hoverPoint);
      hoverPoint = null;
    }

    // --- Clavier ---

    function escape() {
      if (cancelJump()) return true;
      if (cancelPlacing()) return true;
      return clearSelection();
    }

    /*
     * Touche enfoncée. mods : { shift, meta, ctrl, alt, repeat, editable } ; editable vaut
     * true quand le focus est dans un champ, une zone de texte ou une fenêtre de dialogue.
     * Renvoie true si la touche est prise en charge.
     */
    function handleShortcut(key, mods) {
      const m = mods || {};
      if (m.editable) return false;
      const command = isMac ? m.meta : m.ctrl;
      if (command && !m.alt) {
        const k = key.toLowerCase();
        if (k === 'c') return copySelection();
        if (k === 'x') return cutSelection();
        if (k === 'v') return paste();
        return false;
      }
      if (m.meta || m.ctrl || m.alt) return false; // laisse ⌘R, ⌘+… au navigateur
      if (key === ' ' || key === 'Spacebar') {
        // La bascule a lieu au relâchement, si aucun glisser n'a eu lieu entre-temps
        if (!m.repeat && !spaceDown) {
          spaceDown = true;
          spaceUsed = gesture.isActive();
        }
        return true;
      }
      switch (key) {
        case 'Escape':
          return escape();
        case 'Backspace':
        case 'Delete':
          return deleteSelection();
        case '+':
        case '=':
          zoomIn();
          return true;
        case '-':
        case '_':
          zoomOut();
          return true;
        default:
          break;
      }
      switch (key.toLowerCase()) {
        case 'n':
          step();
          return true;
        case 'b':
          stepBack();
          return true;
        case 'j':
          startJump();
          return true;
        case 'g':
          chartVisible = !chartVisible;
          return true;
        case 't':
          cycleTheme();
          return true;
        case 'e':
          if (!onCommand) return false;
          onCommand('fullscreen');
          return true;
        case 'l':
          panelCollapsed = !panelCollapsed;
          return true;
        case 'r':
          // En pose : rotation ; sinon : Recentrer (rôle V1)
          if (placing) transformPlacing(m.shift ? transform.rotateCounterclockwise : transform.rotateClockwise);
          else recenter();
          return true;
        case 'f':
          if (!placing) return false;
          transformPlacing(m.shift ? transform.mirrorVertical : transform.mirrorHorizontal);
          return true;
        case 'h':
          setTool(TOOLS.MOVE);
          return true;
        case 'p':
          setTool(TOOLS.PENCIL);
          return true;
        case 's':
          setTool(TOOLS.SELECT);
          return true;
        default:
          return false;
      }
    }

    // Touche relâchée : un appui bref sur Espace, sans glisser, démarre ou met en pause
    function handleKeyUp(key) {
      if ((key === ' ' || key === 'Spacebar') && spaceDown) {
        spaceDown = false;
        if (!spaceUsed) toggleRunning();
        spaceUsed = false;
        return true;
      }
      return false;
    }

    // Perte du focus de la fenêtre : Espace est considéré relâché, sans bascule
    function releaseKeys() {
      spaceDown = false;
      spaceUsed = false;
    }

    // --- Confort : thème et panneau ---

    function setTheme(value) {
      if (themeLib.isThemePreference(value)) themePreference = value;
      return themePreference;
    }

    // T : Auto → Clair → Sombre → Auto
    function cycleTheme() {
      themePreference = themeLib.nextTheme(themePreference);
      return themePreference;
    }

    function setPanelCollapsed(value) {
      panelCollapsed = !!value;
      return panelCollapsed;
    }

    // --- Sauvegarde automatique ---

    function settingsSnapshot() {
      return {
        speed: speed,
        density: density,
        jumpCount: jumpCount,
        theme: themePreference,
        ageColors: ageColors,
        autoPause: autoPause,
        chartVisible: chartVisible,
        panelCollapsed: panelCollapsed,
      };
    }

    // Tout ce qui est sauvegardé ; les Sets n'étant jamais modifiés en place, leur référence suffit
    function signature() {
      return [cells, cam.centerX, cam.centerY, cam.cellSize, speed, density, jumpCount, themePreference,
        ageColors, autoPause, chartVisible, panelCollapsed];
    }

    function trackChanges() {
      const next = signature();
      if (lastSignature !== null && next.every(function (v, i) { return v === lastSignature[i]; })) return;
      lastSignature = next;
      scheduler.markDirty();
    }

    function isQuotaError(err) {
      return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 || err.code === 1014);
    }

    // Écriture effective ; une erreur n'est signalée qu'à son apparition, pas à chaque essai
    function writeSave() {
      const stamp = dateNow ? dateNow() : null;
      let text;
      try {
        text = persistence.serialize({ cells: cells, camera: cam, settings: settingsSnapshot(), savedAt: stamp });
        storage.setItem(saveKey, text);
      } catch (err) {
        if (saveStatus !== 'error') {
          setMessage(isQuotaError(err)
            ? 'Échec de la sauvegarde : l\'espace de stockage local est plein. La sauvegarde précédente est conservée.'
            : 'Échec de la sauvegarde : ' + (err && err.message ? err.message : 'erreur inconnue') + '.');
        }
        saveStatus = 'error';
        return;
      }
      saveStatus = 'saved';
      savedAt = stamp;
    }

    // Écriture immédiate s'il reste une modification (pause, pagehide, page cachée)
    function flushSave() {
      if (!scheduler || saveStatus === 'unavailable') return false;
      trackChanges();
      return scheduler.flush();
    }

    /*
     * Restauration au chargement : en pause, compteur à 0, âges à 1, historique, graphique et
     * détection vides. Renvoie { status: 'restored' | 'none' | 'invalid' | 'unavailable' }.
     */
    function restore() {
      if (!storage) return { status: 'unavailable' };
      let text;
      try {
        text = storage.getItem(saveKey);
      } catch (err) {
        saveStatus = 'unavailable';
        return { status: 'unavailable' };
      }
      if (text === null || text === undefined) {
        lastSignature = signature();
        return { status: 'none' };
      }
      const r = persistence.deserialize(text, {
        maxCells: maxLiveCells,
        minSpeed: MIN_SPEED,
        maxSpeed: MAX_SPEED,
        minDensity: MIN_DENSITY,
        maxDensity: MAX_DENSITY,
        minJump: JUMP_MIN,
        maxJump: JUMP_MAX,
      });
      if (!r.ok) {
        setMessage('Sauvegarde ignorée car illisible (' + r.error + '). L\'application démarre vide.');
        lastSignature = signature();
        return { status: 'invalid', error: r.error };
      }
      const v = r.value;
      pause();
      jump = null;
      selection = null;
      clipboard = null;
      placing = null;
      setEditedCells(v.cells);
      cam = Object.assign({}, cam, { centerX: v.camera.centerX, centerY: v.camera.centerY, cellSize: v.camera.cellSize });
      speed = v.settings.speed;
      density = v.settings.density;
      jumpCount = v.settings.jumpCount;
      themePreference = v.settings.theme;
      ageColors = v.settings.ageColors;
      autoPause = v.settings.autoPause; // appliquée explicitement : le contrôleur la désactive par défaut
      chartVisible = v.settings.chartVisible;
      panelCollapsed = v.settings.panelCollapsed;
      saveStatus = 'saved';
      savedAt = v.savedAt;
      lastSignature = signature();
      scheduler.clear();
      return { status: 'restored' };
    }

    // « Oublier la sauvegarde » : supprime la clé sans toucher à la grille ni aux réglages
    function forgetSave() {
      if (!storage) return false;
      try {
        storage.removeItem(saveKey);
      } catch (err) {
        return false;
      }
      if (saveStatus !== 'unavailable') saveStatus = 'idle';
      savedAt = null;
      lastSignature = signature();
      scheduler.clear();
      return true;
    }

    function dismissMessage() {
      message = null;
    }

    function playLabel() {
      if (running) return 'Pause';
      return generation === 0 ? 'Démarrer' : 'Reprendre';
    }

    function placingState() {
      if (!placing) return null;
      const anchor = hoverPoint ? cellAt(hoverPoint) : placing.anchor;
      return { name: placing.name, shape: placing.shape, origin: placementOrigin(anchor) };
    }

    // Instantané de l'état ; cells est partagé en lecture seule (jamais modifié en place)
    function getState() {
      return {
        cells: cells,
        generation: generation,
        running: running,
        speed: speed,
        density: density,
        camera: cam,
        liveCount: cells.size,
        measuredRate: measuredRate,
        message: message,
        playLabel: playLabel(),
        canStep: !busy(),
        dragging: gesture.isDragging(),
        gestureTool: gesture.tool(),
        tool: tool,
        effectiveTool: effectiveTool(),
        spaceHeld: spaceDown,
        selection: selection,
        clipboard: clipboard,
        placing: placingState(),
        hoverCell: hoverPoint ? cellAt(hoverPoint) : null,
        canCopy: canEditSelection(),
        canCut: canEditSelection(),
        canDelete: canEditSelection(),
        canPaste: clipboard !== null,
        ages: ages,
        ageColors: ageColors,
        autoPause: autoPause,
        chartVisible: chartVisible,
        canPlay: jump === null,
        canBack: !busy() && history.size() > 0,
        canJump: !busy(),
        canEdit: !busy(),
        jumpCount: jumpCount,
        jumping: jump ? { done: jump.done, total: jump.total } : null,
        theme: themePreference,
        panelCollapsed: panelCollapsed,
        eraserSize: eraserSize,
        imageImport: pendingImage ? { count: pendingImage.count, overCap: pendingImage.count > maxLiveCells,
          width: pendingImage.width, height: pendingImage.height, mosaic: pendingImage.mosaic } : null,
        save: { status: saveStatus, savedAt: savedAt },
        population: {
          length: population.length(),
          max: population.max(),
          truncated: population.truncated(),
          values: population.values,
        },
      };
    }

    return {
      getState: getState,
      start: start,
      pause: pause,
      toggleRunning: toggleRunning,
      step: step,
      reset: reset,
      toggleCell: toggleCell,
      setTool: setTool,
      clearSelection: clearSelection,
      copySelection: copySelection,
      cutSelection: cutSelection,
      deleteSelection: deleteSelection,
      paste: paste,
      loadPattern: loadPattern,
      placeAt: placeAt,
      cancelPlacing: cancelPlacing,
      rotatePlacing: function (clockwise) {
        return transformPlacing(clockwise === false ? transform.rotateCounterclockwise : transform.rotateClockwise);
      },
      mirrorPlacing: function (vertical) {
        return transformPlacing(vertical ? transform.mirrorVertical : transform.mirrorHorizontal);
      },
      importRle: importRle,
      exportRle: exportRle,
      setDensity: setDensity,
      randomFill: randomFill,
      randomFillArea: randomFillArea,
      setSpeed: setSpeed,
      tick: tick,
      setViewport: setViewport,
      zoomAt: zoomAt,
      zoomIn: zoomIn,
      zoomOut: zoomOut,
      panBy: panBy,
      recenter: recenter,
      pointerDown: pointerDown,
      pointerMove: pointerMove,
      pointerUp: pointerUp,
      pointerCancel: pointerCancel,
      pointerLeave: pointerLeave,
      handleShortcut: handleShortcut,
      handleKeyUp: handleKeyUp,
      releaseKeys: releaseKeys,
      dismissMessage: dismissMessage,
      exportFileName: function (date, extension) { return exportFileName(generation, date, extension); },
      stepBack: stepBack,
      setJumpCount: setJumpCount,
      startJump: startJump,
      cancelJump: cancelJump,
      setAutoPause: function (value) { autoPause = !!value; return autoPause; },
      setAgeColors: function (value) { ageColors = !!value; return ageColors; },
      setChartVisible: function (value) { chartVisible = !!value; return chartVisible; },
      setTheme: setTheme,
      cycleTheme: cycleTheme,
      setPanelCollapsed: setPanelCollapsed,
      restore: restore,
      flushSave: flushSave,
      forgetSave: forgetSave,
      setEraserSize: setEraserSize,
      openImageFile: openImageFile,
      previewImage: previewImage,
      confirmImageImport: confirmImageImport,
      cancelImageImport: cancelImageImport,
    };
  }

  /*
   * Boucle d'animation unique. requestFrame / cancelFrame sont injectés
   * (requestAnimationFrame dans le navigateur, un faux ordonnanceur dans les tests).
   * start() est idempotent : il ne peut jamais exister deux boucles.
   */
  function createFrameLoop(requestFrame, cancelFrame, onFrame) {
    let active = false;
    let handle = null;

    function frame(now) {
      handle = null;
      if (!active) return;
      onFrame(now);
      if (active && handle === null) handle = requestFrame(frame);
    }

    return {
      start: function () {
        if (active) return false;
        active = true;
        handle = requestFrame(frame);
        return true;
      },
      stop: function () {
        if (!active) return false;
        active = false;
        if (handle !== null) cancelFrame(handle);
        handle = null;
        return true;
      },
      isRunning: function () { return active; },
    };
  }

  const api = {
    MAX_LIVE_CELLS: MAX_LIVE_CELLS,
    MIN_SPEED: MIN_SPEED,
    MAX_SPEED: MAX_SPEED,
    DEFAULT_SPEED: DEFAULT_SPEED,
    MAX_STEPS_PER_FRAME: MAX_STEPS_PER_FRAME,
    MIN_DENSITY: MIN_DENSITY,
    MAX_DENSITY: MAX_DENSITY,
    DEFAULT_DENSITY: DEFAULT_DENSITY,
    ZOOM_STEP: ZOOM_STEP,
    JUMP_MIN: JUMP_MIN,
    JUMP_MAX: JUMP_MAX,
    DEFAULT_JUMP: DEFAULT_JUMP,
    JUMP_BUDGET_MS: JUMP_BUDGET_MS,
    createController: createController,
    createFrameLoop: createFrameLoop,
    exportFileName: exportFileName,
    formatInt: formatInt,
  };

  root.Life = root.Life || {};
  root.Life.controller = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
