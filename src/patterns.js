/*
 * Motifs prédéfinis, en coordonnées canoniques (LifeWiki, format texte « plaintext »).
 * "O" = cellule vivante, "." = cellule morte. Origine (0,0) en haut à gauche.
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('./engine.js');

  const DEFINITIONS = [
    {
      id: 'block',
      name: 'Bloc',
      rows: [
        'OO',
        'OO',
      ],
    },
    {
      id: 'blinker',
      name: 'Clignotant',
      rows: [
        'OOO',
      ],
    },
    {
      id: 'glider',
      name: 'Planeur',
      rows: [
        '.O.',
        '..O',
        'OOO',
      ],
    },
    {
      // Se déplace vers la gauche, de 2 cases toutes les 4 générations
      id: 'lwss',
      name: 'Vaisseau léger (LWSS)',
      rows: [
        '.O..O',
        'O....',
        'O...O',
        'OOOO.',
      ],
    },
    {
      id: 'pulsar',
      name: 'Pulsar',
      rows: [
        '..OOO...OOO..',
        '.............',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '..OOO...OOO..',
        '.............',
        '..OOO...OOO..',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '.............',
        '..OOO...OOO..',
      ],
    },
    {
      id: 'r-pentomino',
      name: 'R-pentomino',
      rows: [
        '.OO',
        'OO.',
        '.O.',
      ],
    },
    {
      id: 'gosper-gun',
      name: 'Canon à planeurs de Gosper',
      rows: [
        '........................O...........',
        '......................O.O...........',
        '............OO......OO............OO',
        '...........O...O....OO............OO',
        'OO........O.....O...OO..............',
        'OO........O...O.OO....O.O...........',
        '..........O.....O.......O...........',
        '...........O...O....................',
        '............OO......................',
      ],
    },
  ];

  function rowsToMatrix(rows) {
    return rows.map(function (row) {
      return Array.from(row, function (ch) { return ch === 'O' ? 1 : 0; });
    });
  }

  // Liste affichable : identifiant et nom français
  function list() {
    return DEFINITIONS.map(function (d) { return { id: d.id, name: d.name }; });
  }

  function find(id) {
    for (let i = 0; i < DEFINITIONS.length; i++) {
      if (DEFINITIONS[i].id === id) return DEFINITIONS[i];
    }
    throw new Error('Motif inconnu : "' + id + '"');
  }

  function matrix(id) {
    return rowsToMatrix(find(id).rows);
  }

  // Motif sous forme de Set, coin haut gauche en (originX, originY)
  function cells(id, originX, originY) {
    return engine.fromMatrix(matrix(id), originX || 0, originY || 0);
  }

  const api = {
    list: list,
    matrix: matrix,
    cells: cells,
  };

  root.Life = root.Life || {};
  root.Life.patterns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
