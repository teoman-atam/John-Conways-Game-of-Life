# Jeu de la vie

Le jeu de la vie de John Conway sur une grille sans limite, avec zoom et déplacement à la manière d'une carte en ligne, des outils de composition (crayon, gomme, sélection, copier-coller, pose de motifs, import et export RLE, import d'une image), d'analyse (retour en arrière, saut de N générations, détection des états stables, graphique de population, couleur selon l'âge) de confort (thème, plein écran, panneau repliable, sauvegarde automatique) et de repérage (mini-carte, légendes des boutons). HTML, CSS et JavaScript natifs, sans dépendance, sans serveur, utilisable hors ligne.

## Lancer l'application

Double-cliquer sur `index.html`. La page s'ouvre dans le navigateur par défaut (Chrome ou Safari récents).

**Sur un téléphone ou une tablette**, le double-clic n'existe pas : il faut servir le dossier depuis le Mac, sur le même réseau Wi-Fi. Dans le Terminal, depuis ce dossier, lancer `python3 -m http.server 8000`, puis noter l'adresse du Mac avec `ipconfig getifaddr en0` (par exemple 192.168.1.20). Sur le téléphone, ouvrir `http://192.168.1.20:8000` dans Safari ou Chrome. `Ctrl+C` dans le Terminal arrête le serveur. La sauvegarde automatique du téléphone est propre à cette adresse : elle ne partage rien avec celle du Mac.

## Sur téléphone et tablette

L'application s'adapte quand le doigt est le pointeur principal :
- **Un doigt** suit l'outil choisi : toucher une case la dessine ou l'efface (Crayon), glisser trace un trait, sélectionne ou déplace la vue (Déplacer). Pendant la simulation, glisser déplace la vue.
- **Deux doigts** zooment (pincer ou écarter) et déplacent la vue, sans jamais modifier une case. Le premier doigt attend un court instant (90 ms) avant d'agir : poser deux doigts presque en même temps ne dessine rien. Si un second doigt arrive après le début d'un trait, le trait s'arrête là. Après un pincement, le doigt resté sur l'écran ne dessine pas.
- **Appui long sur un bouton** (une demi-seconde) : sa légende s'affiche quelques secondes, sans déclencher l'action. Un toucher bref agit comme un clic.
- **Mise en page** : en portrait, le panneau est au-dessus de la grille et défile ; boutons d'au moins 40 px ; champs en 16 px, pour que Safari sur iPhone ne zoome pas la page quand on les touche ; la liste des raccourcis clavier est masquée ; sur petit écran (portrait ou paysage), mini-carte réduite à 140 × 98 px, graphique plus bas et libellés des outils masqués. Le bouton « Replier le panneau » donne toute la place à la grille.
- **Plein écran** : le bouton n'apparaît que si le navigateur le permet (pas sur Safari pour iPhone ; possible sur iPad et sur Android).
- Les actions des raccourcis clavier ont toutes un bouton : Démarrer, Une génération, Précédente, Avancer de N, outils, Copier, Couper, Coller, Supprimer, Terminer et Annuler (au lieu d'`Échap`), Recentrer, Graphique, Mini-carte, thème dans Réglages. Le zoom se fait au pincement.

## Lancer les tests

- **Dans le navigateur** : double-cliquer sur `tests/tests.html`. Le résumé s'affiche en haut de la page, en vert si tout passe.
- **Avec Node** (s'il est installé) : depuis ce dossier, lancer `node tests/run-node.js`. Il exécute exactement les fichiers listés dans `tests/tests.html`.

## Outils

La barre en haut de la grille porte les outils. Un seul est actif à la fois, mis en évidence ; le curseur de la souris change avec lui.

| Outil | Raccourci | Effet |
|---|---|---|
| Déplacer | `H` | Glisser déplace la vue ; un clic ne fait rien |
| Crayon (par défaut) | `P` | Un clic inverse une case. Un glisser dessine si la première case touchée est morte, efface si elle est vivante. Le tracé est continu même avec un geste rapide |
| Sélection | `S` | Glisser trace un rectangle, affiché en pointillés avec ses dimensions. Un nouveau tracé remplace le précédent, un clic ou `Échap` l'efface |
| Gomme | `X` | Un clic efface un disque de cellules (tampon) ; un glisser efface le long du trait, sans trou même avec un geste rapide. Diamètre de 1 à 512 cellules (voir « Gomme ») |
| Pose | — | Activée par le choix d'un motif, `⌘V`, un import RLE ou une image importée sans « Remplacer ». L'aperçu suit le curseur ; chaque clic pose le contenu sans effacer l'existant. `Échap`, « Terminer » ou le choix d'un outil la quitte |

Pendant la simulation, tous les outils se comportent comme Déplacer : on n'édite qu'en pause. Le démarrage efface la sélection et quitte la pose. Toute édition (crayon, gomme, pose, couper, supprimer, remplissage, import d'image) remet le compteur de générations à 0.

Les boutons Copier, Couper, Coller et Supprimer de la barre font la même chose que les raccourcis ; ils ne sont actifs que lorsque l'action est possible.

## Raccourcis

| Touche | Action |
|---|---|
| `Espace` (appui bref) | Démarrer ou mettre en pause, au relâchement |
| `Espace` maintenu + glisser | Déplacer la vue, quel que soit l'outil, sans démarrer ni mettre en pause |
| `N` | Une génération (en pause) |
| `B` | Génération précédente (en pause) |
| `J` | Avancer de N générations (en pause) |
| `G` | Afficher ou masquer le graphique de population |
| `R` | Recentrer sur les cellules vivantes ; grille vide : retour à l'origine |
| `+` et `-` | Zoomer et dézoomer au centre de la vue |
| `H`, `P`, `S` | Outils Déplacer, Crayon, Sélection |
| `X` | Outil Gomme |
| `⌥` + molette (gomme choisie) | Agrandir ou réduire la gomme, sous le curseur, sans zoomer |
| `I` | Importer une image (ouvre le choix du fichier ; met d'abord en pause) |
| `⌘C`, `⌘X` | Copier, couper la sélection (en pause) |
| `⌘V` | Coller : passe en mode pose avec le presse-papiers interne |
| `⌫` ou `Suppr` | Supprimer les cellules de la sélection (en pause) |
| `Échap` | Annuler un saut en cours, sinon quitter la pose, sinon effacer la sélection |
| `R`, `Maj+R` (en pose) | Rotation de l'aperçu d'un quart de tour, sens horaire ou antihoraire |
| `F`, `Maj+F` (en pose) | Miroir horizontal (gauche ↔ droite) ou vertical (haut ↔ bas) |
| `T` | Thème suivant : Auto, Clair, Sombre |
| `E` | Entrer dans le plein écran ou en sortir |
| `L` | Replier ou déplier le panneau |
| `M` | Afficher ou masquer la mini-carte |

Sur écran tactile, cette liste est masquée dans le panneau. Hors Mac, `Ctrl` remplace `⌘`. `M` est la seule touche ajoutée : elle était libre (le contrôleur l'ignorait) ; `⌘M` reste au navigateur (réduire la fenêtre). La liste « Raccourcis » du panneau n'a pas changé, pour qu'il tienne toujours dans 760 px : `M` est indiqué par la légende du bouton Mini-carte. `X` et `I` ont été ajoutés de la même façon : ces deux touches étaient libres (le contrôleur les ignorait) ; `⌘X` coupe toujours la sélection et `⌘I` reste au navigateur. `X` est affiché sur le bouton Gomme, `I` dans la légende du bouton d'import ; la liste du panneau n'a pas de ligne de plus (il reste 2 px de marge à 760 px de haut). Les raccourcis sont inactifs quand le focus est dans un champ (dont le champ N), la liste des motifs ou une fenêtre de dialogue (RLE, Réglages). Le presse-papiers est interne à la page : il persiste pendant la session mais ne passe pas par celui du système.

## Contrôles du panneau

| Élément | Effet |
|---|---|
| Démarrer / Pause / Reprendre | Bouton unique à bascule |
| Remettre à zéro | Vide la grille, met en pause, compteur à 0, sans toucher à la vue |
| ◀ Précédente | Génération précédente (voir « Analyse ») |
| Une génération | Avance d'une génération (en pause) |
| Champ N et « Avancer de N » | Saut de N générations, N entier de 1 à 10 000 (100 au départ). `Entrée` dans le champ lance le saut |
| Vitesse | 1 à 30 générations par seconde |
| Pause si état stable | Cochée au départ : pause automatique sur extinction, état stable ou oscillateur |
| Poser un motif | Choisir un motif passe en mode pose ; il s'ajoute au contenu existant |
| Densité et Remplissage aléatoire | Remplit toute la zone visible avec la densité choisie (5 à 50 %, 30 % au départ), remplace le contenu, met en pause. Refusé si le nombre de cellules attendu dépasse le plafond : zoomer ou baisser la densité |
| Importer RLE, Exporter RLE | Ouvrent la fenêtre RLE (voir plus bas) |
| Mesures | Générations, cellules vivantes, générations par seconde réellement atteintes |
| Couleur selon l'âge | Décochée au départ : colore chaque cellule selon son âge, avec une légende |

La barre en haut de la grille porte aussi, en icônes (leur légende s'affiche au survol, voir « Légendes des boutons ») :
- **Recentrer** : cadre les cellules vivantes (`R`) ;
- **Importer une image** (`I`) : voir « Import d'image » ;
- **Enregistrer l'image** : PNG de la grille, nommé `jeu-de-la-vie_gen-<n>_<AAAAMMJJ-HHMMSS>.png`, avec le thème et les couleurs affichés mais sans la sélection, l'aperçu de pose ni la mini-carte ;
- **Graphique** (`G`) et **Mini-carte** (`M`), boutons à bascule en surbrillance quand ils sont actifs ;
- **Plein écran** (`E`), **Replier le panneau** (`L`) et **Réglages** (⚙).

Un indicateur de sauvegarde, en très petit à côté du titre, affiche « Sauvegardé à HH:MM:SS », « Aucune sauvegarde », « Sauvegarde indisponible » ou « Échec de la sauvegarde ».

Zoom : pincer sur le trackpad, ou molette et défilement à deux doigts, sous le curseur (avec la gomme, `⌥` + molette change sa taille au lieu de zoomer). Les coordonnées « x, y » de la case survolée s'affichent en bas à gauche de la grille.

## Gomme

Outil de la barre (`X`), entre Sélection et le groupe Copier, Couper, Coller, Supprimer, qui passe en icônes pour que la barre tienne sur une ligne à 1 280 px.

- **Effet** : une cellule est effacée si la distance entre son centre et le centre de la gomme est au plus la moitié du diamètre. Un clic est un tampon ; un glisser efface tout ce qui est à moins d'un demi-diamètre du trait suivi par le pointeur (segment entre deux positions successives), donc sans trou même avec un geste très rapide. Un geste complet (appui, glisser, relâchement) compte pour une seule édition : compteur à 0, historique, graphique et détection vidés, comme pour le Crayon. Un geste qui n'efface rien ne change rien.
- **Taille** : diamètre en cellules, de 1 à 512 (3 au départ). Quand la gomme est choisie, une petite barre apparaît sous la barre d'outils : un curseur logarithmique (la précision est la même pour les petites et les grandes tailles) et un champ numérique, synchronisés. `⌥` + molette (ou défilement à deux doigts) agrandit ou réduit la gomme sous le curseur ; la molette seule et le pincement zooment comme d'habitude.
- **Contour** : un cercle suit le pointeur, à l'échelle (diamètre × taille d'une cellule). Quand il ferait moins de 4 px, il est remplacé par un repère fixe de 10 px. Il est dessiné sur un calque à part, au-dessus de la grille : il n'apparaît jamais dans l'image enregistrée.
- **Pendant la simulation ou un saut**, la gomme se comporte comme Déplacer (glisser déplace la vue, rien n'est effacé, le contour est masqué), comme les autres outils.
- **Coût** : chaque déplacement examine soit la zone couverte, soit les cellules vivantes, selon ce qui est le plus petit. À 512 de diamètre sur environ 100 000 cellules, un déplacement prend environ 7 ms au plus (voir « Performances mesurées »).
- La taille est sauvegardée (champ facultatif `settings.eraserSize`, voir « Sauvegarde automatique ») ; la légende du bouton donne « Gomme (X) » avec la taille courante.

## Import d'image

Transforme une image en grille de départ. Trois moyens : le bouton « Importer une image » de la barre (icône d'image), la touche `I`, ou un fichier glissé-déposé sur la grille. L'import se fait en pause : pendant la lecture, la simulation est d'abord mise en pause ; pendant un saut, il est refusé avec un message.

- **Formats** : PNG, JPEG, WebP et GIF (première image seulement pour un GIF animé), 20 Mo au plus. Une photo HEIC (iPhone) n'est pas lue par le navigateur : un message propose de la convertir en JPEG. Un fichier qui n'est pas une image, ou qu'on ne peut pas décoder (par exemple un texte renommé en `.png`), donne un message ; la grille ne change pas. L'orientation EXIF d'une photo est respectée (une photo prise en portrait n'apparaît pas couchée).
- **Fenêtre d'aperçu** : miniature de l'image et aperçu du résultat en cellules (un pixel par cellule), nombre de cellules vivantes en direct et taille de la grille obtenue, temps de conversion mesuré. Chaque réglage relance le calcul 150 ms après la dernière modification.
  - **Seuil** (par défaut) : une cellule est vivante si le pixel est plus sombre que le seuil. Le seuil est calculé automatiquement par la méthode d'Otsu (« auto ») ; le curseur de 0 à 255 le règle à la main.
  - **Tramage** : diffusion d'erreur de Floyd-Steinberg (7/16, 3/16, 5/16, 1/16), qui rend les dégradés par une densité de points ; curseur de luminosité de -100 à +100.
  - **Inverser** : les pixels clairs deviennent vivants (dans les deux modes).
  - **Largeur** : de 20 à 1 000 cellules (200 au départ) ; la hauteur suit les proportions de l'image.
  - **Remplacer la grille actuelle** : cochée au départ.
- **Luminance** : Rec. 709 (0,2126 R + 0,7152 V + 0,0722 B). Un pixel d'opacité inférieure à 50 % donne toujours une cellule morte, même avec Inverser.
- **Mosaïque stable** : chaque pixel vivant devient un bloc de 2 × 2 cellules, un bloc toutes les 4 cellules (la grille est 4 fois plus grande). Le bloc est une nature morte et deux blocs ne se touchent jamais : l'image reste figée à la lecture. La fenêtre l'annonce : « Image figée : elle ne bougera pas tant que vous ne la perturbez pas (gomme, crayon). » Effacer une partie à la gomme relance l'évolution autour de la zone effacée ; une case ajoutée au crayon contre un bloc fait de même (elle donne 4 voisines à une cellule du bloc).
- **Plafond** : si le résultat dépasse `MAX_LIVE_CELLS` (100 000 cellules), « Valider » est désactivé et un message propose de réduire la largeur ou de changer de mode. Même chose si l'image ne donne aucune cellule vivante.
- **Valider, avec Remplacer** : la grille est remplacée par le résultat, centré sur le centre de la vue ; en pause, compteur à 0, âges à 1, historique, graphique et détection vidés, sauvegarde déclenchée ; la vue est recadrée comme avec Recentrer. La simulation ne démarre pas d'elle-même.
- **Valider, sans Remplacer** : le résultat passe en mode pose, comme un motif (aperçu sous le curseur, rotations et miroirs, plusieurs poses, `Échap` pour terminer).
- **Annuler**, × ou `Échap` : rien ne change.
- **Confidentialité** : l'image est lue dans le navigateur, depuis une adresse locale (`blob:`), et n'est jamais envoyée sur le réseau. Elle n'est stockée nulle part, ni dans le stockage local, ni dans la sauvegarde, ni dans l'historique : seules les cellules obtenues entrent dans la grille et donc dans la sauvegarde. À la fermeture de la fenêtre, l'adresse locale est libérée et les canvas de travail sont vidés.
- **Réduction** : une grande photo est d'abord réduite par le navigateur à 2 000 px de large au plus (lissage de haute qualité), puis à la largeur choisie : une photo de 4 000 × 3 000 s'ouvre en moins de 0,2 s et chaque recalcul prend quelques dizaines de millisecondes au plus.

## Analyse

**Retour en arrière** (`B`, « ◀ Précédente ») : revient d'une génération, en pause seulement. Les cellules, leurs âges et le compteur sont restaurés exactement, et le dernier point du graphique est retiré. Chaque génération calculée (lecture, « Une génération », saut) est mémorisée. L'historique garde au plus 100 générations (`HISTORY_MAX_GENERATIONS`) et 2 000 000 de cellules au total (`HISTORY_MAX_CELLS`) ; au-delà, les plus anciennes sont oubliées. Toute édition (crayon, pose, couper, supprimer, remplissage, remise à zéro) vide l'historique : le retour concerne les générations, jamais les éditions.

**Saut de N générations** (`J`, « Avancer de N ») : calcule N générations d'un coup, en pause seulement. Le calcul est découpé en tranches de 12 ms au plus par image, si bien que l'écran reste réactif : zoom et déplacement fonctionnent pendant le saut. Une progression « génération x / N » s'affiche avec un bouton Annuler (`Échap`). Pendant le saut, édition, lecture, pas à pas, retour arrière et choix d'un motif sont désactivés. Le saut s'arrête avant son terme, avec un message qui donne la génération atteinte, si le plafond MAX_LIVE_CELLS serait dépassé, si un état stable ou oscillant est détecté (pause automatique active) ou s'il est annulé. Le compteur donne toujours le nombre de générations réellement calculées.

**Détection et pause automatique** : à chaque génération, l'état est comparé aux 30 précédents (`PERIOD_MAX`). Sont reconnus : « Population éteinte », « État stable » (période 1) et « Oscillateur de période p » (2 à 30), suivis de « à la génération g ». La comparaison passe par une empreinte, toujours confirmée par une comparaison exacte des cellules : aucune fausse détection possible. Case cochée : la lecture se met en pause (un saut s'arrête). Case décochée : le message s'affiche une seule fois et la simulation continue. Un même état n'est signalé qu'une fois : après une pause automatique, « Reprendre » continue sans nouvelle pause. « Une génération » affiche aussi le message.

*Limite connue* : un motif qui émet des vaisseaux (canon de Gosper, R-pentomino qui lâche des planeurs) ne revient jamais à un état identique, puisque ses planeurs s'éloignent. Il n'est donc jamais détecté comme stable, même quand le reste est figé. Un oscillateur de période supérieure à 30 n'est pas détecté non plus.

**Graphique de population** (`G`, bouton « Graphique ») : masqué au départ. Il trace la population depuis la génération 0, réduite à sa largeur en gardant le minimum et le maximum de chaque tranche (les pics restent visibles), avec la population actuelle et le maximum atteint. Il enregistre au plus 1 000 000 de générations ; au-delà, l'enregistrement s'arrête et une note le signale. Une édition le vide ; un retour arrière retire le dernier point.

**Couleur selon l'âge** : l'âge d'une cellule est le nombre de générations depuis sa naissance (1 pour une cellule qui naît, qui est posée ou dessinée ; toutes les cellules ont l'âge 1 au compteur 0). Cinq tranches : 1, 2 à 3, 4 à 10, 11 à 50, plus de 50. La plus ancienne reprend la couleur habituelle des cellules : ce qui est stable garde son aspect, l'activité ressort en couleurs chaudes. Une légende s'affiche en bas à gauche. Option décochée, le rendu est exactement celui d'avant.

## Confort

**Thème** (fenêtre Réglages, ou `T`) : Auto, Clair ou Sombre ; Auto est réglé au départ. Auto suit le réglage clair ou sombre du Mac, y compris s'il change pendant que la page est ouverte. Le thème s'applique tout de suite à toute l'interface : panneau, barre, fenêtres, graphique, légende et couleurs d'âge, aperçu de pose, grille et cellules. Il ne réinitialise rien, et l'image exportée reflète le thème affiché.

**Plein écran** (bouton ou `E`) : met toute l'application en plein écran ; une seconde activation en fait sortir. Le bouton suit l'état réel, même quand on sort par `Échap` ou par le navigateur. Si le navigateur refuse, un message l'indique. *En plein écran, le premier `Échap` est pris par le navigateur pour sortir du plein écran* : la page ne le reçoit pas. Pour annuler un saut ou quitter une pose en plein écran, utiliser les boutons « Annuler » et « Terminer », ou appuyer une seconde fois sur `Échap` une fois sorti.

**Panneau repliable** (bouton ou `L`) : replié, la grille occupe toute la largeur ; une poignée discrète au bord gauche le rouvre. Le point de la grille au centre de l'écran reste au centre à chaque changement de taille (plein écran, panneau, fenêtre).

**Fenêtre Réglages** (⚙) : choix du thème, indicateur de sauvegarde et bouton « Oublier la sauvegarde ».

## Règles du jeu

Le bouton « ? », juste après le titre du panneau (libellé « Règles du jeu » sur téléphone), ouvre un menu déroulant qui rappelle les règles officielles du jeu de la vie de John Conway : la grille et les huit voisines, la naissance avec 3 voisines, la survie avec 2 ou 3, la mort sinon, la notation B3/S23 et les structures que l'on observe (bloc, clignotant, pulsar, planeur, canon de Gosper). Deux liens mènent à l'article Wikipédia, en français et en anglais ; ils s'ouvrent dans un nouvel onglet.

- Il s'ouvre à tout moment, sans interrompre la simulation, qui continue derrière.
- Il se ferme par le bouton ×, par `Échap`, par le bouton « ? » ou en touchant ailleurs. Toucher la grille pour le fermer ne dessine rien.
- Plus haut que l'écran, il défile, et son bouton × reste visible. Sur téléphone, le titre du panneau et ce bouton restent en haut quand le panneau défile.
- Au clavier, `Entrée` sur le bouton l'ouvre et y place le focus ; `Échap` le referme et rend le focus au bouton.

## Mini-carte

Vue d'ensemble de la grille, en haut à droite (200 × 140 px), visible au départ. Elle montre les cellules vivantes, le rectangle de la vue courante (contour orange en thème clair, jaune en thème sombre) et son échelle en texte discret (« 1 px = 64 cellules », ou « 1 cellule = 4 px » de près).

- **Étendue** : toutes les cellules vivantes et la vue courante, avec 10 % de marge. L'échelle avance par paliers en puissances de 2 et ne change que si le contenu sort de la carte, ou s'il n'en occupe plus qu'un quart (dans sa plus grande dimension) : la carte ne tremble pas à chaque génération. Un planeur parti à 10⁹ cases reste représenté ; la vue devient alors un petit repère carré, de taille fixe, quand son rectangle ferait moins de 4 px.
- **Navigation** : un clic centre la vue sur le point visé, sans changer le zoom ; un glisser déplace la vue en continu (saisir le rectangle garde la prise). Cela marche en pause, pendant la lecture et pendant un saut, sans jamais les interrompre. Un clic ou un glisser sur la mini-carte ne modifie jamais une cellule, quel que soit l'outil, et ne déclenche aucun geste de la grille. La molette et le pincement au-dessus de la mini-carte n'ont aucun effet.
- **Affichage** : bouton Mini-carte de la barre, ou `M`. Elle est placée sous les barres flottantes qui occupent sa bande (tout en haut quand le panneau est replié) et ne chevauche ni la barre, ni le graphique, ni la légende des âges, ni les messages, ni la fenêtre Réglages (vérifié à 1 280 × 760, 1 280 × 800 et 1 440 × 900, panneau ouvert ou replié).
- **Rafraîchissement** : au plus 10 fois par seconde pendant la simulation ou un saut (jamais à chaque génération) ; tout de suite après une édition, un zoom ou un déplacement. Elle est dessinée sur son propre canvas : la grille et l'image exportée sont identiques, mini-carte affichée ou masquée.

## Légendes des boutons

Au survol d'un bouton de la barre sur la grille (outils, Vue, Fenêtre, barre de pose, poignée du panneau) ou d'un bouton du panneau qui a un raccourci (Démarrer, ◀ Précédente, Une génération, Avancer de N, Annuler), une légende apparaît après 0,4 seconde ; au focus clavier (`Tab`), tout de suite. Elle donne :
- le nom de l'action dans l'état courant : « Afficher le graphique » ou « Masquer le graphique », « Plein écran » ou « Quitter le plein écran », « Démarrer », « Pause » ou « Reprendre », « Crayon, outil actif »… ;
- son raccourci, dans une petite touche ; il est lu dans la table des raccourcis de `src/tooltips.js`, jamais écrit à la main. En mode pose, Recentrer n'affiche pas `R`, qui fait alors pivoter l'aperçu ;
- pour un bouton grisé, la raison : « Sélectionnez d'abord une zone », « Presse-papiers vide », « Disponible en pause », « Indisponible pendant le saut », « Aucune génération précédente en mémoire ». La légende de Réglages rappelle le thème courant et `T`.

Une seule légende à la fois. Elle disparaît quand le pointeur quitte le bouton, au clic, à `Échap` (qui garde aussi son effet habituel) et dès qu'un geste commence sur la grille. Son texte suit l'état en direct (`G` pressé pendant l'affichage, par exemple). Elle reste toujours entière dans la fenêtre, sous le bouton ou au-dessus s'il n'y a pas la place.

Accessibilité : les infobulles natives (`title`) de ces boutons ont été retirées ; l'`aria-label` de chaque bouton reprend toujours le libellé courant, `aria-keyshortcuts` donne son raccourci. Les boutons grisés le sont par `aria-disabled` (et non `disabled`) : ils restent survolables et atteignables au clavier, et leur action est bloquée, au clic comme par `Entrée` ou `Espace`.

## Sauvegarde automatique

L'application s'enregistre seule dans le stockage local du navigateur, sous la clé `jeu-de-la-vie:sauvegarde`, et retrouve à l'ouverture la grille et la vue telles qu'on les a laissées.

- **Sauvegardé** : les cellules vivantes (en RLE, avec leurs coordonnées exactes), la caméra (position et zoom), la vitesse, la densité, la valeur N, le thème, la couleur selon l'âge, la pause automatique, la visibilité du graphique, l'état replié du panneau, la visibilité de la mini-carte et la taille de la gomme.
- **Visibilité de la mini-carte** : champ facultatif `settings.minimapVisible`, ajouté sans changer `schemaVersion` (toujours 1) ni aucune autre règle de validation. Une sauvegarde plus ancienne, sans ce champ, se charge à l'identique avec la mini-carte visible. Le champ accompagne chaque écriture ; `M` le met aussi à jour tout de suite dans la sauvegarde existante (sans en créer une s'il n'y en a pas, et sans changer l'heure affichée par l'indicateur).
- **Taille de la gomme** : second champ facultatif, `settings.eraserSize` (entier de 1 à 512), ajouté de la même façon sans changer `schemaVersion` ni aucune règle existante. Absent (sauvegarde plus ancienne) : 3. Présent mais invalide : la sauvegarde est refusée comme toute valeur hors bornes. Le réglage rejoint la sauvegarde existante une demi-seconde après le dernier changement.
- **Non sauvegardé** : l'image importée elle-même (seules les cellules obtenues le sont), le compteur de générations, les âges, l'historique, le graphique, la détection, la sélection, le presse-papiers, l'outil actif et le plein écran. Au chargement, l'application repart en pause, au compteur 0, avec des âges à 1 et un historique, un graphique et une détection vides.
- **Quand** : en pause, 1 seconde après la dernière modification ; pendant la simulation ou un saut, au plus une fois toutes les 5 secondes, jamais à chaque génération. Une écriture immédiate a lieu à chaque mise en pause (y compris automatique), à la fin d'un saut, quand la page est quittée ou cachée.
- **Sans sauvegarde**, l'application démarre comme avant (grille vide, pause automatique cochée). **Sauvegarde illisible** (corrompue, version inconnue, valeurs hors bornes, plus de 100 000 cellules) : elle est ignorée, un message l'indique et l'application démarre vide ; elle sera remplacée à la modification suivante.
- **Stockage inaccessible** : l'application fonctionne normalement, l'indicateur affiche « Sauvegarde indisponible ». **Stockage plein** : la sauvegarde précédente est conservée, un message l'indique une fois et l'indicateur affiche « Échec de la sauvegarde ».
- **« Oublier la sauvegarde »** (fenêtre Réglages) demande une confirmation, puis supprime la clé. La grille et les réglages en cours ne changent pas ; la sauvegarde reprend à la modification suivante.
- **Limite connue** : deux onglets ouverts sur l'application écrivent la même clé ; ils écrasent mutuellement leur sauvegarde et la dernière écriture l'emporte. Il n'y a pas de synchronisation entre onglets.
- En `file://`, Chrome partage un même stockage local entre toutes les pages ouvertes depuis le disque, d'où la clé préfixée. Le comportement de Safari en `file://` n'a pas été vérifié.

## Format RLE

Format texte des motifs, utilisé par LifeWiki et Golly. Exemple, le planeur :

```
#N Planeur
x = 3, y = 3, rule = B3/S23
bo$2bo$3o!
```

- Les lignes qui commencent par `#` sont des commentaires, ignorés.
- L'en-tête `x = largeur, y = hauteur` est obligatoire ; le champ `rule` est facultatif.
- `b` = case morte, `o` = case vivante, `$` = fin de ligne, `!` = fin du motif. Chaque symbole peut être précédé d'un nombre de répétitions (`3o` = trois cases vivantes, `2$` = descendre de deux lignes). Espaces et retours à la ligne sont ignorés.
- Seule la règle de Conway est acceptée : `B3/S23`, `23/3` ou règle absente. Toute autre règle est refusée.
- Un texte mal formé (en-tête absent, symbole inconnu, `!` manquant, cellule hors des dimensions déclarées) est refusé avec un message qui dit pourquoi. Un motif de plus de 100 000 cellules vivantes est refusé.

**Importer** : coller le texte dans la fenêtre, puis « Importer ». Le motif passe en mode pose : cliquer sur la grille pour le poser.

**Exporter** : porte sur la sélection si elle existe, sinon sur toutes les cellules vivantes. Le texte produit est en `B3/S23`, avec des lignes de 70 caractères au plus. « Copier » tente le presse-papiers du système et, s'il est indisponible (fréquent en `file://`), sélectionne le texte pour un `⌘C` manuel. « Télécharger .rle » enregistre un fichier.

## Constantes

| Constante | Fichier | Valeur | Rôle |
|---|---|---|---|
| `MAX_LIVE_CELLS` | `src/controller.js` | 100 000 | Plafond de sécurité. Une génération qui le dépasserait n'est pas appliquée : la simulation se met en pause, un saut s'arrête, un message l'explique. Il s'applique aussi aux éditions (dessin, pose, import RLE, remplissage aléatoire), refusées sans rien modifier. Il protège la fluidité et la mémoire du navigateur |
| `HISTORY_MAX_GENERATIONS` | `src/history.js` | 100 | Nombre de retours en arrière possibles |
| `HISTORY_MAX_CELLS` | `src/history.js` | 2 000 000 | Somme maximale des cellules gardées dans l'historique ; borne la mémoire quand la population est grande |
| `PERIOD_MAX` | `src/detection.js` | 30 | Période maximale détectée (états comparés aux 30 générations précédentes) |
| `SAVE_DEBOUNCE_MS` | `src/saveScheduler.js` | 1 000 | En pause, délai entre la dernière modification et l'écriture de la sauvegarde |
| `SAVE_INTERVAL_MS` | `src/saveScheduler.js` | 5 000 | Pendant la simulation ou un saut, intervalle minimal entre deux écritures |
| `SCHEMA_VERSION` | `src/persistence.js` | 1 | Version du format de sauvegarde ; une autre version est refusée |
| `JUMP_BUDGET_MS` | `src/controller.js` | 12 | Temps de calcul maximal du saut par image, en millisecondes |
| `SERIES_MAX` | `src/sampling.js` | 1 000 000 | Générations enregistrées au plus pour le graphique |
| `REFRESH_INTERVAL_MS` | `src/minimap.js` | 100 | Pendant la simulation ou un saut, intervalle minimal entre deux rastérisations de la mini-carte (10 par seconde au plus) |
| `MARGIN_RATIO` | `src/minimap.js` | 0,1 | Marge de la mini-carte autour des cellules et de la vue |
| `SHRINK_FILL` | `src/minimap.js` | 0,25 | En dessous de cette part occupée, l'échelle de la mini-carte se resserre |
| `MIN_RECT_SIZE` | `src/minimap.js` | 4 | Rectangle de vue plus petit (en px) : remplacé par un repère de taille fixe |
| `SHOW_DELAY_MS` | `src/tooltips.js` | 400 | Délai d'apparition d'une légende au survol |
| `ERASER_MIN_SIZE`, `ERASER_MAX_SIZE` | `src/eraser.js` | 1, 512 | Diamètre de la gomme, en cellules |
| `ERASER_DEFAULT_SIZE` | `src/eraser.js` | 3 | Diamètre au départ et pour une sauvegarde qui n'en a pas |
| `MAX_FILE_BYTES` | `src/imageConvert.js` | 20 Mo | Poids maximal d'une image importée |
| `WIDTH_MIN`, `WIDTH_MAX`, `WIDTH_DEFAULT` | `src/imageConvert.js` | 20, 1 000, 200 | Largeur de l'image importée, en cellules |
| `MAX_SIDE` | `src/imageConvert.js` | 4 096 | Hauteur maximale en cellules ; une image très haute est ramenée à cette hauteur, la largeur suivant |
| `ALPHA_MIN` | `src/imageConvert.js` | 128 | Opacité minimale (sur 255) d'un pixel pour qu'il puisse donner une cellule vivante |
| `MOSAIC_STEP`, `MOSAIC_BLOCK` | `src/imageConvert.js` | 4, 2 | Mosaïque stable : un bloc de 2 × 2 toutes les 4 cellules |
| `IMAGE_WORK_MAX` | `src/app.js` | 2 000 | Largeur maximale (px) de la copie de travail d'une image, avant la réduction à la largeur choisie |
| `IMAGE_PREVIEW_DELAY_MS` | `src/app.js` | 150 | Délai entre le dernier réglage et le recalcul de l'aperçu |
| `ARM_MS` | `src/touch.js` | 90 | Attente du premier doigt avant d'agir, le temps qu'un second doigt le rejoigne |
| `LONG_PRESS_MS` | `src/touch.js` | 500 | Appui long sur un bouton pour voir sa légende |

On peut modifier ces valeurs dans les fichiers indiqués.

## Organisation du code

- `src/engine.js` : moteur pur (Set de clés `"x,y"`, règles de Conway, validation).
- `src/patterns.js` : motifs prédéfinis (coordonnées LifeWiki).
- `src/camera.js` : conversions écran ↔ grille, zoom, déplacement, seuil clic / glisser.
- `src/transform.js` : extraction, translation, rotations, miroirs, union et retrait, sans modifier les entrées.
- `src/rle.js` : lecture et écriture du format RLE.
- `src/tools.js` : outils, tracé de Bresenham et machine d'état des gestes.
- `src/eraser.js` : gomme sans DOM (cellules à effacer pour un tampon ou un trait, bornes de taille, curseur logarithmique, `⌥` + molette).
- `src/imageConvert.js` : conversion d'une image en cellules sans DOM (luminance, Otsu, seuil, Floyd-Steinberg, mosaïque, estimation, vérification du fichier).
- `src/ages.js` : âges des cellules et tranches de couleur.
- `src/history.js` : tampon circulaire de l'historique des générations.
- `src/detection.js` : empreinte des états, détection d'extinction, de stabilité et d'oscillation.
- `src/sampling.js` : série des populations et réduction pour le graphique.
- `src/theme.js` : résolution du thème et suivi du réglage du système (matchMedia injecté).
- `src/persistence.js` : format de sauvegarde JSON versionné et relecture validée.
- `src/saveScheduler.js` : planificateur des écritures de la sauvegarde.
- `src/fullscreen.js` : plein écran avec repli webkit, document injecté.
- `src/minimap.js` : mini-carte (étendue et paliers d'échelle, conversions, rastérisation, rectangle de la vue, état sans DOM avec horloge injectée, rendu sur son propre canvas).
- `src/tooltips.js` : table des raccourcis, légendes des boutons selon l'état, position dans la fenêtre, minuteur injecté, blocage des boutons `aria-disabled`.
- `src/touch.js` : écran tactile (un doigt pour l'outil, deux doigts pour zoomer et déplacer la vue, appui long sur un bouton), sans DOM, temps injecté.
- `src/controller.js` : état et règles de l'interface (outil, gomme, sélection, presse-papiers, pose, import d'image, retour arrière, saut, détection, thème, panneau, sauvegarde), sans DOM ni minuteur réel ; horloge, stockage et décodage d'image injectés.
- `src/renderer.js` : dessin Canvas de la grille (avec ou sans couleur selon l'âge), du calque d'édition et du graphique.
- `src/app.js` : branchement des événements et boucle d'animation unique ; décodage des images (élément `<img>` sur une adresse `blob:`), fenêtre d'aperçu et contour de la gomme.
- `tests/` : mini-exécuteur de tests et tests de chaque module, avec stockage, horloge, matchMedia et document factices ; `tests/fixtures/render-lot-a.js` fige le rendu d'avant la couleur selon l'âge, pour vérifier qu'il reste identique option décochée ; `tests/fixtures/avant-minimap-legendes.js` fige, sur le code d'avant la mini-carte, l'effet de chaque raccourci, une sauvegarde et les messages de refus (scénarios de `tests/regression-scenarios.js`) ; `tests/fixtures/avant-image-gomme.js` fige de même, sur le code d'avant l'import d'image et la gomme, les raccourcis (dont `⌘X`), les gestes des outils et une sauvegarde (scénarios de `tests/image-eraser-scenarios.js`).

## Performances mesurées

Mesures en temps réel dans Chrome 155 sans interface, ouvert en `file://`, fenêtre de 1 280 × 673 px, écran Retina simulé :

| Mesure | Résultat |
|---|---|
| 30 gén./s, 9 300 à 14 400 cellules (200 pulsars), couleurs selon l'âge et sauvegarde actives | 30,02 gén./s ; image médiane 17,5 ms, 95e centile 29,5 ms ; une écriture toutes les 5 s, image la plus longue 39 ms au moment d'une écriture |
| Même scénario sans sauvegarde (lot B) | 30,06 gén./s ; image médiane 16,9 ms, 95e centile 29,1 ms, maximum 30,5 ms |
| Sauvegarde de 12 000 cellules | sérialisation 12 ms, relecture 7 ms, 26 Kio |
| Sauvegarde de 100 000 cellules | sérialisation 103 ms, relecture 63 ms, 215 Kio |
| Historique plein (`performance.memory`) | 37,5 Mio pour 100 états d'environ 11 700 cellules ; 63,9 Mio au plafond de 2 000 000 de cellules (85 états) ; environ 33 octets par cellule |
| Même scénario à 30 gén./s, avant / après la mini-carte (trois passages alternés, mini-carte visible) | avant : 29,99 à 30,06 gén./s, 95e centile 29,2 à 29,4 ms ; après : 29,99 à 30,03 gén./s, 95e centile 29,2 à 29,6 ms ; mini-carte rastérisée 9,2 fois par seconde |
| Rastérisation de la mini-carte (décodage, tampon, image Retina) | 1,1 ms à 12 000 cellules ; 6,1 ms à 100 000 cellules |
| Même scénario à 30 gén./s, avant / après l'import d'image et la gomme (cinq passages alternés) | avant : 29,99 à 30,06 gén./s, image médiane 16,6 à 17,3 ms, 95e centile 29,6 à 30,5 ms ; après : 29,98 à 30,06 gén./s, image médiane 16,7 à 17,6 ms (un passage à 20,8 ms), 95e centile 29,7 à 30,3 ms |
| Ouverture d'une photo JPEG de 4 000 × 3 000 (décodage et copie de travail à 2 000 px) | 0,08 s ; premier aperçu en 55 ms |
| Recalcul de l'aperçu de cette photo (réduction et conversion, six recalculs) | Seuil : 4 ms en médiane à 200 de large, 19 ms (53 ms au plus) à 1 000 ; Tramage : 3 ms à 200, 23 ms (33 ms au plus) à 1 000 |
| Glisser de la gomme, diamètre 512, 97 078 cellules, 81 déplacements | le long du motif : 4,9 ms en médiane, 7,0 ms au 95e centile par déplacement ; à travers le motif : 0,3 ms en médiane, 3,1 ms au 95e centile ; images à 16,8 ms au 95e centile pendant le glisser |

## Checklist manuelle (30 minutes)

Ce que les tests automatiques ne peuvent pas prouver. Cocher chaque point. Les mesures de fluidité ont été faites dans Chrome sans interface, pas sur un Mac à l'écran. Tous les points jamais vérifiés sur une machine réelle sont regroupés dans la dernière section.

**Socle**

- [ ] 1. **Ouverture** : double-clic sur `index.html` dans Chrome. Grille vide et nette (pas de flou sur écran Retina), bouton « Démarrer », compteurs à 0, outil Crayon en évidence. Avec une fenêtre de 760 px de haut, le panneau tient sans barre de défilement ; à 1 280 px de large, la barre sur la grille tient sur une ligne.
- [ ] 2. **Dessin** : cliquer trois cases alignées. Elles s'allument, le compteur de cellules vivantes passe à 3. Recliquer une case l'éteint.
- [ ] 3. **Simulation** : « Démarrer ». Le clignotant s'arrête à la génération 2 avec le message « Oscillateur de période 2 à la génération 2 » (pause automatique). Décocher « Pause si état stable », « Reprendre » : il oscille, le bouton affiche « Pause », le compteur augmente. Un clic sur une case ne change rien.
- [ ] 4. **Glisser pendant la simulation** : cliquer-glisser. La vue suit le pointeur, aucune case ne change, quel que soit l'outil.
- [ ] 5. **Limites de zoom** : zoomer au maximum (grandes cases), puis dézoomer au maximum. Les lignes de grille disparaissent quand les cases deviennent petites ; les cellules restent visibles.
- [ ] 6. **Fluidité à 30 gén./s** : choisir « Canon à planeurs de Gosper », cliquer sur la grille pour le poser, `Échap`, vitesse 30, « Démarrer ». Le mouvement est fluide et « Gén./s réelles » affiche environ 30.
- [ ] 7. **Onglet masqué** : simulation lancée, passer 10 secondes sur un autre onglet puis revenir. La simulation reprend normalement, sans accélération brutale.
- [ ] 8. **Recentrer et remise à zéro** : `R` cadre toutes les cellules. « Remettre à zéro » vide la grille et remet le compteur à 0 sans bouger la vue ; `R` sur grille vide revient à l'origine.

**Composition**

- [ ] 9. **Crayon au glisser** : en pause, tracer vite une courbe au trackpad. Le trait est continu, sans trou. Repartir d'une case vivante et repasser sur le trait : il s'efface.
- [ ] 10. **Outils et curseur** : `H`, `P`, `S` changent l'outil en évidence et le curseur (main, crayon, croix).
- [ ] 11. **Sélection** : avec `S`, tracer un rectangle. Il s'affiche en pointillés avec ses dimensions en cases. Un nouveau tracé le remplace, `Échap` l'efface.
- [ ] 12. **Copier-coller** : sélectionner un motif, `⌘C`, `⌘V`. L'aperçu semi-transparent suit le curseur ; un clic le pose, un autre clic en pose une deuxième copie ; l'existant n'est pas effacé. Refaire avec les boutons Copier et Coller, puis Couper et Supprimer.
- [ ] 13. **Pose avec rotation** : choisir « Planeur », appuyer sur `R` et `Maj+R`, `F` et `Maj+F` : l'aperçu tourne et se retourne. Poser trois planeurs, `Échap`, « Démarrer » : chacun file en diagonale.
- [ ] 14. **Import RLE depuis LifeWiki** : sur une page de motif de LifeWiki (par exemple « Pulsar »), copier le texte RLE, « Importer RLE », coller, « Importer », puis poser. Le motif est identique à celui du site. Essayer ensuite un RLE dont la règle est `B36/S23` : il est refusé avec un message clair.
- [ ] 15. **Export RLE** : sélectionner un motif, « Exporter RLE ». « Copier » copie le texte (ou le sélectionne, avec un message) ; le coller dans une note pour vérifier. « Télécharger .rle » enregistre un fichier `jeu-de-la-vie_gen-…rle`.
- [ ] 16. **Espace** : un appui bref démarre puis met en pause. Espace maintenu tout en glissant au trackpad déplace la vue, même avec le Crayon, sans démarrer ni mettre en pause. Taper un espace dans la fenêtre RLE ne démarre rien.
- [ ] 17. **Remplissage aléatoire** : régler la densité, « Remplissage aléatoire » : toute la zone visible est remplie. Dézoomer au maximum et recommencer : refus avec un message qui propose de zoomer ou de baisser la densité ; baisser la densité vers 5 % et réessayer.
- [ ] 18. **Coordonnées** : survoler la grille : « x, y » s'affiche en bas à gauche et suit la case survolée ; l'affichage disparaît quand le pointeur quitte la grille.
- [ ] 19. **Clavier AZERTY** : les touches `+` et `-` du clavier du Mac zooment et dézooment ; `⌘C`, `⌘V`, `R`, `F`, `H`, `P`, `S`, `T`, `E`, `L` fonctionnent.

**Analyse**

- [ ] 20. **Retour en arrière** : poser un R-pentomino, appuyer 5 fois sur `N` puis 5 fois sur `B` : on retrouve exactement le motif de départ, compteur à 0, et « ◀ Précédente » se grise. Refaire 3 `N`, dessiner une case : « ◀ Précédente » se grise (l'historique est vidé).
- [ ] 21. **Saut de 10 000** : poser le canon de Gosper, taper 10000 dans le champ N, « Avancer de 10 000 ». La progression « génération x / 10 000 » avance ; pendant le saut, zoomer au trackpad et faire glisser la vue : tout reste fluide. « Annuler » (ou `Échap`) : un message donne la génération atteinte, le compteur l'affiche. Relancer jusqu'au bout : environ 10 secondes.
- [ ] 22. **Champ N** : taper 0, 10001, 2,5 ou du texte, puis `Entrée` : message de refus, le champ reprend sa valeur. Taper une lettre dans le champ ne déclenche aucun raccourci.
- [ ] 23. **Pause automatique** : poser un pulsar, « Démarrer » : pause à la génération 3 avec « Oscillateur de période 3 à la génération 3 ». Décocher la case, recommencer : le message s'affiche une fois et la simulation continue. Un bloc donne « État stable », une cellule isolée « Population éteinte ».
- [ ] 24. **Graphique** : `G` ou le bouton « Graphique » l'affiche. Pendant la lecture d'un R-pentomino, la courbe et la population actuelle se mettent à jour ; le maximum suit. `B` retire le dernier point, une édition le remet à zéro. Il ne gêne pas le dessin ni la sélection.
- [ ] 25. **Couleur selon l'âge à 30 gén./s** : cocher « Couleur selon l'âge » : légende en bas à gauche, couleurs chaudes pour les cellules jeunes. Poser une grande quantité de pulsars (ou un remplissage aléatoire en dézoomant) pour environ 12 000 cellules, vitesse 30, « Démarrer » : « Gén./s réelles » proche de 30, mouvement fluide, sans à-coup visible toutes les 5 secondes (sauvegarde). Décocher : rendu habituel.

**Confort**

- [ ] 26. **Thème** : dans Réglages (⚙), choisir Clair, puis Sombre : panneau, barre, fenêtres, graphique, légende, aperçu de pose, grille et cellules changent tout de suite, sans rien réinitialiser. Choisir Auto, puis changer l'apparence du Mac (Réglages Système > Apparence) : l'application suit sans rechargement. `T` fait défiler Auto, Clair, Sombre. En thème clair, « Enregistrer l'image » produit une image claire.
- [ ] 27. **Panneau repliable** : `L` ou le bouton de la barre : le panneau disparaît, la grille prend toute la largeur, le centre de la vue ne bouge pas. La poignée au bord gauche le rouvre. La barre, le graphique et la légende restent visibles et ne se chevauchent pas.
- [ ] 28. **Sauvegarde et restauration (Chrome)** : dessiner un motif, changer la vitesse, le thème et la densité, déplacer et zoomer la vue. Attendre que l'indicateur affiche « Sauvegardé à … », fermer l'onglet, rouvrir `index.html` : grille, vue et réglages sont retrouvés, compteur à 0, en pause.
- [ ] 29. **Oublier la sauvegarde** : Réglages (⚙) > « Oublier la sauvegarde » > confirmer. La grille ne change pas. Fermer et rouvrir sans rien modifier : l'application démarre vide.
- [ ] 30. **Deux onglets** : ouvrir l'application dans deux onglets, modifier l'un puis l'autre, fermer, rouvrir : c'est le dernier modifié qui est restauré (limite connue).

**Mini-carte et légendes**

- [ ] 31. **Mini-carte au départ** : en haut à droite, sous la barre, nette sur écran Retina, fond semi-transparent ; on y voit les cellules, le rectangle de la vue et l'échelle (« 1 px = … »). Elle ne chevauche ni la barre, ni le graphique (`G`), ni la légende des âges, ni un message.
- [ ] 32. **Suivi sans tremblement** : poser le canon de Gosper, vitesse 30, « Démarrer ». La mini-carte suit les planeurs qui s'éloignent ; l'échelle ne change que de temps en temps (par paliers), la carte ne tremble pas. « Gén./s réelles » reste proche de 30.
- [ ] 33. **Clic et glisser** : pendant la lecture, Crayon actif, cliquer sur un coin de la mini-carte : la vue y saute, le zoom ne change pas, la lecture continue. Glisser sur la mini-carte : la vue suit. Recommencer en pause avec chaque outil (`H`, `P`, `S`, puis un motif en pose) : aucune cellule ne change, la sélection et le compteur restent.
- [ ] 34. **Molette et pincement au-dessus de la mini-carte** : défiler à deux doigts et pincer au trackpad au-dessus d'elle : rien ne zoome, rien ne défile. Au-dessus de la grille, le zoom fonctionne toujours.
- [ ] 35. **`M` et bouton Mini-carte** : `M` la masque puis la réaffiche ; le bouton est en surbrillance quand elle est visible. La masquer, fermer l'onglet, rouvrir : elle reste masquée. L'image exportée est la même, mini-carte affichée ou masquée.
- [ ] 36. **Légendes au survol** : survoler chaque bouton de la barre : après un court instant, nom de l'action et touche (« Afficher le graphique G »). Laisser la légende du graphique affichée et appuyer sur `G` : elle devient « Masquer le graphique ». Elle disparaît en quittant le bouton, au clic et à `Échap`.
- [ ] 37. **Boutons grisés** : sans sélection, survoler Copier : « Sélectionnez d'abord une zone » ; pendant la lecture, survoler « Une génération » : « Disponible en pause ». Cliquer sur un bouton grisé ne fait rien.
- [ ] 38. **Légendes au clavier, thèmes et plein écran** : `Tab` d'un bouton à l'autre : la légende s'affiche tout de suite ; `Entrée` sur un bouton grisé ne fait rien. En thème clair puis sombre, légendes et mini-carte restent lisibles. En plein écran (`E`), panneau ouvert puis replié : rien ne se chevauche et les légendes des boutons du bord droit restent entières à l'écran.

**Gomme et import d'image**

- [ ] 58. **Gomme** : `X` choisit la Gomme ; le curseur devient une croix entourée d'un cercle à l'échelle. Dessiner un grand motif, effacer d'un clic (tampon) puis d'un glisser rapide au trackpad : la trace est continue. Régler 1, 10, puis 512 au curseur et au champ ; zoomer et dézoomer : le cercle suit l'échelle, puis devient un petit repère fixe quand il est minuscule. `⌥` + défilement à deux doigts change la taille sans zoomer ; le défilement seul zoome.
- [ ] 59. **Gomme et `⌘X`** : sélectionner une zone, `⌘X` : elle est coupée (l'outil ne change pas). « Démarrer », puis glisser avec la Gomme : la vue se déplace, rien n'est effacé. Enregistrer l'image avec le cercle visible : il n'est pas dans le PNG.
- [ ] 60. **Taille sauvegardée** : régler la gomme à 40, fermer l'onglet, rouvrir : la taille est toujours 40.
- [ ] 61. **Import d'une photo** : « Importer une image » (ou `I`), choisir une photo JPEG. L'aperçu apparaît vite ; essayer Seuil (curseur), Tramage (luminosité), Inverser, la largeur ; le nombre de cellules suit. Valider : la grille est remplacée, centrée, en pause, compteur à 0 ; « Démarrer » la lance.
- [ ] 62. **Plafond et options** : mettre la largeur à 1 000 sur une photo : « Valider » se grise avec un message. Décocher « Remplacer » et valider : l'image suit le curseur comme un motif ; la poser deux fois, `Échap`. Rouvrir une image et appuyer sur `Échap` : rien ne change.
- [ ] 63. **Mosaïque stable** : cocher « Mosaïque stable » : la note « Image figée… » s'affiche. Valider, « Démarrer » : rien ne bouge. Pause, effacer un morceau à la gomme, « Démarrer » : l'image se met à évoluer autour de la zone effacée.
- [ ] 64. **Fichiers refusés** : glisser sur la grille un fichier texte renommé en `.png`, une image de plus de 20 Mo, une photo HEIC : un message chacun, la grille ne change pas. Glisser une vraie image : la fenêtre s'ouvre.
- [ ] 65. **Confidentialité** : après un import, ouvrir les outils de développement de Chrome, onglet Réseau, puis refaire un import : aucune requête n'apparaît. Onglet Application > Stockage local : seule la clé `jeu-de-la-vie:sauvegarde` est présente, sans image.

**Safari et machine réelle** (jamais vérifiés pendant le développement)

- [ ] 39. **Ouverture en `file://` dans Safari** : clic droit sur `index.html` > Ouvrir avec > Safari. Tout s'affiche, sans message d'erreur.
- [ ] 40. **Pincement au trackpad**, dans Chrome puis dans Safari : le zoom se fait sous les doigts ; la page elle-même (panneau compris) ne grossit pas. Le défilement à deux doigts zoome aussi.
- [ ] 41. **Téléchargement PNG**, dans Chrome puis dans Safari : pendant la simulation, « Enregistrer l'image » ; un fichier `jeu-de-la-vie_gen-…png` arrive dans Téléchargements, avec la grille comme à l'écran, sans sélection, aperçu ni mini-carte ; la simulation n'est pas interrompue.
- [ ] 42. **Plein écran**, dans Chrome puis dans Safari : `E` ou le bouton met toute l'application en plein écran ; le bouton se met en évidence. Sortir par le bouton, puis rentrer et sortir par `Échap` : le bouton suit l'état réel à chaque fois. En plein écran, le premier `Échap` fait sortir du plein écran sans annuler une pose en cours.
- [ ] 43. **Sauvegarde et restauration en `file://` dans Safari** : refaire les points 28 et 29 dans Safari. Noter si la sauvegarde est retrouvée d'une ouverture à l'autre.
- [ ] 44. **Safari, lots A et B** : refaire rapidement les points 9, 12, 13, 16, 21, 23 et 25 dans Safari.
- [ ] 45. **Mini-carte dans Safari** : refaire les points 31 à 35 dans Safari (netteté, clic, glisser, pincement et molette sans effet au-dessus, `M`).
- [ ] 46. **Légendes dans Safari** : refaire les points 36 et 38 dans Safari. Par défaut, `Tab` n'y passe pas sur les boutons : cocher Réglages de Safari > Avancés > « Appuyer sur Tab pour mettre en évidence chaque élément », ou utiliser `⌥Tab`.
- [ ] 47. **Survol des boutons désactivés dans Safari** : refaire le point 37 dans Safari ; la légende des boutons grisés apparaît bien, avec sa raison, et le clic reste sans effet.
- [ ] 48. **Téléphone, ouverture** : servir le dossier depuis le Mac (voir « Lancer l'application ») et l'ouvrir sur un iPhone (Safari) puis un téléphone Android (Chrome). En portrait : panneau en haut, grille dessous, boutons faciles à toucher, pas de liste de raccourcis ; aucun message d'erreur.
- [ ] 49. **Téléphone, un doigt** : avec le Crayon, toucher une case la dessine ; glisser trace un trait continu. Outil Déplacer (bouton à quatre flèches) : glisser déplace la vue. « Démarrer » : pendant la simulation, glisser déplace la vue sans rien dessiner.
- [ ] 50. **Téléphone, deux doigts** : avec le Crayon actif, pincer et écarter zoome sous les doigts, glisser à deux doigts déplace la vue ; aucune case n'est dessinée ni effacée ; la page elle-même (panneau compris) ne grossit pas.
- [ ] 51. **Téléphone, appui long** : appuyer longtemps sur un bouton de la barre : sa légende apparaît ; relâcher ne déclenche pas l'action. Un toucher bref la déclenche.
- [ ] 52. **iPhone, champs** : toucher le champ N, la liste « Poser un motif… » puis le texte de la fenêtre RLE : la page ne zoome pas.
- [ ] 53. **Téléphone en paysage et mini-carte** : tourner le téléphone : rien ne se chevauche (barre, mini-carte, graphique, messages). Toucher et glisser sur la mini-carte déplace la vue ; pincer au-dessus d'elle ne fait rien.
- [ ] 54. **Plein écran sur mobile** : sur iPhone, le bouton Plein écran n'apparaît pas ; sur iPad et sur Android, il apparaît et fonctionne.
- [ ] 55. **Fluidité sur téléphone** : canon de Gosper, vitesse 30, « Démarrer » : noter « Gén./s réelles » et la fluidité du déplacement à deux doigts pendant la lecture.
- [ ] 56. **Règles du jeu, sur l'ordinateur** : pendant la lecture, cliquer sur le « ? » à côté du titre : le menu des règles s'ouvre sous le bouton, la simulation continue. Cliquer sur « Jeu de la vie, sur Wikipédia » : l'article s'ouvre dans un nouvel onglet. `Échap` ferme le menu, puis `Espace` met bien en pause. Rouvrir le menu et cliquer sur la grille en pause : le menu se ferme sans dessiner de case.
- [ ] 57. **Règles du jeu, sur le téléphone** : toucher « Règles du jeu » en haut du panneau : le menu occupe l'écran, défile au doigt, le × reste visible et le ferme ; le lien Wikipédia s'ouvre.
- [ ] 66. **Safari, glisser-déposer** : en `file://` dans Safari, glisser une image depuis le Finder sur la grille : la grille se met en évidence, la fenêtre d'aperçu s'ouvre ; lâcher une image ailleurs dans la page ne l'ouvre pas à la place de l'application.
- [ ] 67. **Safari, sélecteur de fichier** : bouton « Importer une image » puis `I` : le sélecteur s'ouvre et ne propose que des images ; refaire les points 61 à 63 dans Safari.
- [ ] 68. **Photo d'iPhone** : importer une photo d'iPhone en HEIC dans Safari sur le Mac (message attendu, ou conversion automatique par Safari : noter ce qui se passe), puis la même photo exportée en JPEG (Aperçu > Exporter) : orientation correcte. Sur l'iPhone, « Importer une image » ouvre la photothèque : noter si la photo est acceptée.
- [ ] 69. **Safari, `⌥` + molette** : avec la Gomme, `⌥` + défilement à deux doigts change la taille sans zoomer ; le pincement zoome. Refaire le point 58 dans Safari.
- [ ] 70. **Téléphone, gomme** : toucher le bouton Gomme, régler la taille au curseur, effacer au doigt ; deux doigts zooment sans rien effacer.

## Synthèse des fonctions

- **V1, socle** : grille sans limite (moteur pur sur un ensemble creux de cellules), zoom à la molette et au pincement sous le curseur, déplacement au glisser, Démarrer / Pause / Reprendre, une génération, remise à zéro, vitesse de 1 à 30 gén./s, sept motifs prédéfinis, remplissage aléatoire, recentrage, export PNG, mesures (générations, cellules vivantes, gén./s réelles), plafond de sécurité MAX_LIVE_CELLS, rendu net sur écran Retina, thème clair ou sombre.
- **Lot A, composition** : outils Déplacer, Crayon (tracé continu, dessin ou effacement) et Sélection ; copier, couper, coller et supprimer ; mode pose avec rotations et miroirs ; import et export RLE compatibles LifeWiki ; densité du remplissage ; Espace bref ou maintenu ; coordonnées de la case survolée.
- **Lot B, analyse** : retour d'une génération en arrière ; saut de N générations fractionné, annulable, sans figer l'écran ; détection d'extinction, d'état stable et d'oscillateur avec pause automatique ; graphique de population ; couleur selon l'âge.
- **Lot C, confort** : thème Auto, Clair ou Sombre ; plein écran ; panneau repliable ; sauvegarde automatique locale avec restauration au chargement, indicateur et « Oublier la sauvegarde » ; fenêtre Réglages ; barre sur la grille compacte en icônes.
- **Mini-carte et légendes** : mini-carte de la grille sans limite (échelle par paliers stable, navigation au clic et au glisser, `M`, visibilité sauvegardée) ; légendes des boutons selon l'état, avec raccourci et raison de désactivation, au survol et au clavier.
- **Téléphone et tablette** : zoom et déplacement à deux doigts sans modifier les cases, appui long pour les légendes, cibles tactiles de 40 px, champs sans zoom de la page sur iPhone, mise en page compacte sur petit écran, bouton Plein écran seulement s'il est utilisable.
- **Règles du jeu** : menu déroulant avec les règles officielles de Conway, accessible à tout moment depuis le panneau, et liens vers Wikipédia en français et en anglais.
- **Import d'image et gomme** : gomme de 1 à 512 cellules (tampon, trait continu, contour à l'échelle, `⌥` + molette, taille sauvegardée) ; import d'une photo en grille de départ (Seuil avec Otsu, Tramage de Floyd-Steinberg, Inverser, Mosaïque stable, plafond, remplacement ou pose), par bouton, `I` ou glisser-déposer, sans jamais envoyer ni stocker l'image.
