/*
 * Tests du menu « Règles du jeu » : légende du bouton selon l'état et position du menu déroulant.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  suite('Règles du jeu', function () {
    test('le bouton annonce « Règles du jeu », puis « Fermer les règles du jeu » quand le menu est ouvert', function () {
      const closed = tooltips.getTooltip('rules', { rulesOpen: false, isMac: true });
      assert.deepEqual([closed.label, closed.shortcut, closed.disabledReason, closed.disabled], ['Règles du jeu', null, null, false]);
      assert.equal(tooltips.getTooltip('rules', { rulesOpen: true }).label, 'Fermer les règles du jeu');
      assert.equal(tooltips.ariaFor('rules', { rulesOpen: true }).label, 'Fermer les règles du jeu');
      assert.ok(tooltips.BUTTON_ACTIONS.indexOf('rules') >= 0);
    });

    test('menu sous le bouton, aligné à gauche, toujours dans la fenêtre, hauteur limitée au bas de l\'écran', function () {
      const view = { width: 1280, height: 760 };
      // Bouton du panneau sur ordinateur
      const desk = tooltips.positionDropdown({ left: 120, top: 14, right: 144, bottom: 38 }, 380, view);
      assert.deepEqual(desk, { x: 120, y: 44, maxHeight: 710 });
      // Bouton près du bord droit : le menu est décalé pour tenir en largeur
      const right = tooltips.positionDropdown({ left: 1200, top: 14, right: 1224, bottom: 38 }, 380, view);
      assert.equal(right.x + 380, 1280 - 6);
      // Téléphone : menu presque pleine largeur, collé à la marge gauche
      const phone = tooltips.positionDropdown({ left: 140, top: 12, right: 290, bottom: 48 }, 363, { width: 375, height: 812 });
      assert.deepEqual([phone.x, phone.y, phone.maxHeight], [6, 54, 752]);
      assert.equal(phone.x + 363, 375 - 6, 'marges égales de 6 px');
      // Fenêtre très basse : une hauteur minimale reste lisible (le menu défile)
      assert.equal(tooltips.positionDropdown({ left: 10, top: 300, right: 30, bottom: 320 }, 300, { width: 800, height: 360 }).maxHeight, 120);
    });
  });
})(globalThis);
