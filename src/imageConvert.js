/*
 * Conversion d'une image en cellules, sans DOM : toutes les fonctions prennent un objet de forme
 * ImageData ({ width, height, data }, data en RGBA de 0 à 255) et ne le modifient jamais.
 * - luminance Rec. 709 ; un pixel d'opacité inférieure à 50 % donne une cellule morte ;
 * - mode Seuil : plus sombre que le seuil → vivante (seuil automatique par la méthode d'Otsu) ;
 * - mode Tramage : Floyd-Steinberg (7/16, 3/16, 5/16, 1/16), déterministe, avec réglage de luminosité ;
 * - option Inverser dans les deux modes ; option Mosaïque stable : un bloc 2 × 2 par pixel vivant,
 *   tous les 4 cellules, ce qui forme une nature morte ;
 * - vérification du fichier choisi (format, poids, HEIC) avant tout décodage.
 * Le résultat intermédiaire est un « bitmap » { width, height, alive (Uint8Array), count } : il sert à
 * l'aperçu et à l'estimation ; le Set de cellules n'est construit qu'à la validation (toCells).
 */
(function (root) {
  'use strict';

  // Luminance Rec. 709
  const LUMA_R = 0.2126;
  const LUMA_G = 0.7152;
  const LUMA_B = 0.0722;
  // Opacité minimale d'un pixel pris en compte (50 %) ; en dessous, cellule morte
  const ALPHA_MIN = 128;
  // Largeur de l'image réduite, en pixels (une cellule par pixel, quatre en mosaïque)
  const WIDTH_MIN = 20;
  const WIDTH_MAX = 1000;
  const WIDTH_DEFAULT = 200;
  // Côté maximal de l'image réduite : protège la mémoire et les limites du canvas (images très étirées)
  const MAX_SIDE = 4096;
  // Poids maximal du fichier choisi
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  // Réglages
  const THRESHOLD_MIN = 0;
  const THRESHOLD_MAX = 255;
  const BRIGHTNESS_MIN = -100;
  const BRIGHTNESS_MAX = 100;
  // Mosaïque stable : bloc de 2 × 2 cellules tous les 4 cellules
  const MOSAIC_STEP = 4;
  const MOSAIC_BLOCK = 2;

  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;
  const HEIC_TYPES = /^image\/hei[cf](-sequence)?$/i;
  const HEIC_EXTENSIONS = /\.hei[cf]$/i;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function luminance(r, g, b) {
    return LUMA_R * r + LUMA_G * g + LUMA_B * b;
  }

  // Luminance (0 à 255) et opacité de chaque pixel, dans de nouveaux tableaux
  function lumaPlane(image) {
    const n = image.width * image.height;
    const d = image.data;
    const lum = new Float32Array(n);
    const opaque = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      opaque[i] = d[j + 3] >= ALPHA_MIN ? 1 : 0;
      lum[i] = LUMA_R * d[j] + LUMA_G * d[j + 1] + LUMA_B * d[j + 2];
    }
    return { width: image.width, height: image.height, lum: lum, opaque: opaque };
  }

  /*
   * Seuil automatique par la méthode d'Otsu, sur les pixels opaques : la séparation sombre / clair qui
   * maximise la variance entre les deux classes. Renvoie un seuil s de 1 à 255 : un pixel de luminance
   * inférieure à s est « sombre ». Si plusieurs séparations sont équivalentes, la médiane est prise.
   * Image d'une seule teinte, ou sans pixel opaque : 128.
   */
  function otsuThreshold(imageOrPlane) {
    const p = imageOrPlane.lum ? imageOrPlane : lumaPlane(imageOrPlane);
    const hist = new Float64Array(256);
    let total = 0;
    for (let i = 0; i < p.lum.length; i++) {
      if (!p.opaque[i]) continue;
      hist[Math.min(255, Math.round(p.lum[i]))]++;
      total++;
    }
    if (total === 0) return 128;
    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let wB = 0;
    let sumB = 0;
    let best = -1;
    let first = -1;
    let last = -1;
    for (let t = 0; t < 255; t++) {
      wB += hist[t];
      sumB += t * hist[t];
      const wF = total - wB;
      if (wB === 0) continue;
      if (wF === 0) break;
      const diff = sumB / wB - (sumAll - sumB) / wF;
      const between = wB * wF * diff * diff;
      if (between > best * (1 + 1e-12)) {
        best = between;
        first = t;
        last = t;
      } else if (between >= best * (1 - 1e-12)) {
        last = t;
      }
    }
    if (first < 0) return 128;
    // Classe sombre : luminance arrondie ≤ k ; le seuil est k + 1
    return Math.round((first + last) / 2) + 1;
  }

  function emptyBitmap(width, height) {
    return { width: width, height: height, alive: new Uint8Array(width * height), count: 0 };
  }

  // Mode Seuil : vivante si plus sombre que le seuil (plus claire ou égale avec Inverser) ; transparente : morte
  function thresholdBitmap(image, threshold, invert) {
    const p = image.lum ? image : lumaPlane(image);
    const out = emptyBitmap(p.width, p.height);
    const t = clamp(Number(threshold), THRESHOLD_MIN, THRESHOLD_MAX);
    let count = 0;
    for (let i = 0; i < p.lum.length; i++) {
      if (!p.opaque[i]) continue;
      if ((p.lum[i] < t) !== !!invert) {
        out.alive[i] = 1;
        count++;
      }
    }
    out.count = count;
    return out;
  }

  /*
   * Mode Tramage : Floyd-Steinberg classique, ligne par ligne de gauche à droite. Chaque pixel devient
   * noir (vivant) ou blanc (mort), et l'erreur est reportée à 7/16 à droite, 3/16 en bas à gauche,
   * 5/16 en bas et 1/16 en bas à droite. brightness (-100 à +100) éclaircit ou assombrit avant le
   * tramage. Un pixel transparent reste mort et ne reporte aucune erreur.
   */
  function ditherBitmap(image, brightness, invert) {
    const p = image.lum ? image : lumaPlane(image);
    const w = p.width;
    const h = p.height;
    const out = emptyBitmap(w, h);
    const shift = clamp(Number(brightness) || 0, BRIGHTNESS_MIN, BRIGHTNESS_MAX) * 2.55;
    const buf = new Float32Array(p.lum.length);
    for (let i = 0; i < buf.length; i++) buf[i] = clamp(p.lum[i] + shift, 0, 255);
    let count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!p.opaque[i]) continue;
        const old = buf[i];
        const dark = old < 128;
        const err = old - (dark ? 0 : 255);
        if (dark !== !!invert) {
          out.alive[i] = 1;
          count++;
        }
        if (x + 1 < w) buf[i + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) buf[i + w - 1] += err * 3 / 16;
          buf[i + w] += err * 5 / 16;
          if (x + 1 < w) buf[i + w + 1] += err * 1 / 16;
        }
      }
    }
    out.count = count;
    return out;
  }

  /*
   * Conversion selon les réglages : { mode: 'threshold' | 'dither', threshold (absent : Otsu),
   * brightness, invert }. Renvoie { bitmap, threshold } (le seuil réellement employé en mode Seuil).
   */
  function convert(image, options) {
    const o = options || {};
    const plane = lumaPlane(image);
    if (o.mode === 'dither') return { bitmap: ditherBitmap(plane, o.brightness, o.invert), threshold: null };
    const t = typeof o.threshold === 'number' && Number.isFinite(o.threshold) ? o.threshold : otsuThreshold(plane);
    return { bitmap: thresholdBitmap(plane, t, o.invert), threshold: t };
  }

  // Dimensions de la grille obtenue : celles du bitmap, quatre fois plus grandes en mosaïque
  function gridSize(bitmap, mosaic) {
    const k = mosaic ? MOSAIC_STEP : 1;
    return { width: bitmap.width * k, height: bitmap.height * k };
  }

  // Nombre de cellules vivantes, connu avant de construire le Set
  function estimate(bitmap, mosaic) {
    return bitmap.count * (mosaic ? MOSAIC_BLOCK * MOSAIC_BLOCK : 1);
  }

  // Cellules vivantes : Set de clés "x,y", la cellule du pixel en haut à gauche en (0, 0)
  function toCells(bitmap, mosaic) {
    const out = new Set();
    const w = bitmap.width;
    for (let i = 0; i < bitmap.alive.length; i++) {
      if (!bitmap.alive[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (!mosaic) {
        out.add(x + ',' + y);
        continue;
      }
      const ox = x * MOSAIC_STEP;
      const oy = y * MOSAIC_STEP;
      for (let dy = 0; dy < MOSAIC_BLOCK; dy++) {
        for (let dx = 0; dx < MOSAIC_BLOCK; dx++) out.add((ox + dx) + ',' + (oy + dy));
      }
    }
    return out;
  }

  /*
   * Taille de l'image réduite pour une largeur demandée (20 à 1 000) : hauteur arrondie selon les
   * proportions, au moins 1. Une image très haute est ramenée à MAX_SIDE de haut, la largeur suivant
   * les proportions. Renvoie { width, height }.
   */
  function targetSize(srcWidth, srcHeight, requestedWidth) {
    let w = Math.round(clamp(Number(requestedWidth) || WIDTH_DEFAULT, WIDTH_MIN, WIDTH_MAX));
    let h = Math.max(1, Math.round(w * srcHeight / srcWidth));
    if (h > MAX_SIDE) {
      h = MAX_SIDE;
      w = Math.max(1, Math.round(h * srcWidth / srcHeight));
    }
    return { width: w, height: h };
  }

  function formatMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  }

  /*
   * Vérification d'un fichier avant décodage : { name, type, size }. Renvoie { ok: true } ou
   * { ok: false, kind: 'heic' | 'type' | 'size' | 'empty', error }.
   */
  function checkImageFile(file) {
    const name = String((file && file.name) || '');
    const type = String((file && file.type) || '').toLowerCase();
    const size = Number(file && file.size) || 0;
    if (HEIC_TYPES.test(type) || HEIC_EXTENSIONS.test(name)) {
      return { ok: false, kind: 'heic', error: 'Le format HEIC (photo d\'iPhone) n\'est pas lu par le navigateur. Convertissez ' +
        'l\'image en JPEG (sur Mac : ouvrir avec Aperçu, puis Fichier > Exporter… > JPEG), puis importez-la à nouveau.' };
    }
    const knownType = ACCEPTED_TYPES.indexOf(type) >= 0;
    if (!knownType && !(type === '' && ACCEPTED_EXTENSIONS.test(name))) {
      return { ok: false, kind: 'type', error: '« ' + (name || 'Ce fichier') + ' » n\'est pas une image prise en charge. ' +
        'Formats acceptés : PNG, JPEG, WebP et GIF.' };
    }
    if (size > MAX_FILE_BYTES) {
      return { ok: false, kind: 'size', error: 'Image trop lourde : ' + formatMb(size) + ', au-delà de ' + formatMb(MAX_FILE_BYTES) +
        '. Réduisez-la ou exportez-la en JPEG, puis importez-la à nouveau.' };
    }
    if (size === 0) return { ok: false, kind: 'empty', error: 'Le fichier « ' + name + ' » est vide.' };
    return { ok: true };
  }

  const api = {
    LUMA_R: LUMA_R,
    LUMA_G: LUMA_G,
    LUMA_B: LUMA_B,
    ALPHA_MIN: ALPHA_MIN,
    WIDTH_MIN: WIDTH_MIN,
    WIDTH_MAX: WIDTH_MAX,
    WIDTH_DEFAULT: WIDTH_DEFAULT,
    MAX_SIDE: MAX_SIDE,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    THRESHOLD_MIN: THRESHOLD_MIN,
    THRESHOLD_MAX: THRESHOLD_MAX,
    BRIGHTNESS_MIN: BRIGHTNESS_MIN,
    BRIGHTNESS_MAX: BRIGHTNESS_MAX,
    MOSAIC_STEP: MOSAIC_STEP,
    MOSAIC_BLOCK: MOSAIC_BLOCK,
    luminance: luminance,
    lumaPlane: lumaPlane,
    otsuThreshold: otsuThreshold,
    thresholdBitmap: thresholdBitmap,
    ditherBitmap: ditherBitmap,
    convert: convert,
    gridSize: gridSize,
    estimate: estimate,
    toCells: toCells,
    targetSize: targetSize,
    checkImageFile: checkImageFile,
  };

  root.Life = root.Life || {};
  root.Life.imageConvert = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
