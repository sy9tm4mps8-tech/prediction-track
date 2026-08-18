# Registre de signaux

Journal public et horodaté : une liste est publiée **avant l'ouverture** du marché
concerné, son résultat est mesuré ensuite.

L'objet de ce dépôt n'est pas de convaincre, mais d'être **vérifiable**. Rien ici ne
demande de faire confiance à son auteur.

> Aucun conseil en investissement. Registre personnel.
> Les performances passées ne préjugent pas des performances futures.

## Comment vérifier qu'aucune date n'a été antidatée

1. **Historique des commits.** Chaque fichier de données est écrit par l'API GitHub,
   qui date le commit elle-même et le signe (mention « Verified »). La date ne vient
   donc pas de l'auteur. Une réécriture laisse une trace : l'ancienne version reste
   dans l'historique.
2. **Ancrage Bitcoin.** Pour ne pas avoir à croire GitHub non plus, l'empreinte de
   chaque fichier est ancrée dans la blockchain Bitcoin via
   [OpenTimestamps](https://opentimestamps.org). Les preuves sont dans `proofs/`.

   ```
   pip install opentimestamps-client
   ots verify proofs/scans/us/2026-08-17.<empreinte>.ots -f data/scans/us/2026-08-17.json
   ```

   ou en déposant les deux fichiers sur <https://opentimestamps.org>. Une preuve
   fraîche est « incomplète » le temps que la transaction Bitcoin soit confirmée ;
   un passage hebdomadaire la consolide.
3. **Séquence horaire.** Listes européennes publiées vers 7 h (Paris) pour une
   ouverture à 9 h ; listes américaines vers 13 h pour une ouverture à 15 h 30.
   L'écart est lisible dans l'historique des commits.

## Organisation

```
index.html, app.js, style.css     page de consultation (GitHub Pages)
data/manifest.json                index des séances disponibles
data/scans/<marché>/<date>.json   liste d'une séance
data/track/<marché>.json          résultats (photo recalculée à chaque publication)
proofs/**.ots                     preuves OpenTimestamps
```

`<marché>` vaut `us` ou `eu`. Les dates sont au format `AAAA-MM-JJ`, les horodatages
en ISO 8601 avec décalage explicite (Europe/Paris).

## Schéma des données (version 2)

Le champ `schema` vaut `2` dans chaque fichier. Il ne changera qu'en cas de rupture de
compatibilité ; les ajouts de champs se font sans l'incrémenter.

Ce registre publie les valeurs suivies, pas la manière dont elles sont obtenues : on y
trouve ce qui est visé et ce que ça a donné, jamais les indicateurs ni les seuils qui
ont conduit à retenir une ligne.

### `data/scans/<marché>/<date>.json`

| Champ | Sens |
|---|---|
| `scan_date` | jour où la liste a été établie |
| `close_date` | clôture exploitée (celle de la veille en semaine) |
| `computed_at` | instant du calcul, **déclaratif** (la datation opposable est le commit) |
| `regime.env` | `fav` / `neutre` / `defav` — état du marché |
| `n` | nombre de lignes |
| `candidates[]` | les lignes de la séance, dans l'ordre de la liste |

Par ligne : `ticker`, `last` (cours de référence), `target_pct` (objectif) et
`stop_pct` (seuil de sortie), tous deux en pourcentage du cours.

### `data/track/<marché>.json`

`summary` (`n_total`, `n_closed`, `n_open`, `hit_pct`, `avg_net_pct`, `cum_net_pct`),
`curve` (performance nette **moyenne** par signal, cumulée dans le temps, par bande de
confiance — ce n'est pas une courbe de capital), et `rows[]`.

Par ligne : `ticker`, `signal_date`, `band_label`, `entry`, `exit`, `exit_date`,
`reason`, `net_pct`, `closed`. Les champs non applicables valent `null` — jamais `0`.

`reason` ∈ `cible` · `stop` · `temps` · `en cours` · `en attente`.

## Ce qui est publié, y compris quand ça n'arrange pas

- Les séances **sans aucune ligne** le sont aussi : un registre qui n'existerait que
  les bons jours ne prouverait rien.
- Les signaux perdants figurent au même titre que les autres. Aucune ligne n'est retirée.
- Une liste peut être recalculée dans la journée si les cours arrivent en retard. Le
  fichier est alors réécrit — mais la version précédente reste dans l'historique, et la
  révision est elle-même horodatée, toujours avant la clôture de la séance concernée.

## Limites, dites franchement

- Le rejeu hérite des limites usuelles de ce genre de mesure : exécution modélisée,
  frais estimés plutôt que relevés sur un compte réel.
- Une performance moyenne par signal n'est pas une performance de portefeuille : ni
  taille de position, ni capital immobilisé, ni composition des gains.
- `computed_at` et `close_date` proviennent de l'horloge de la machine qui calcule :
  ils sont indicatifs. Seuls le commit et la preuve `.ots` font foi.

## Réutilisation

Les fichiers JSON sont libres d'utilisation. Le schéma est stable ; en cas d'évolution
incompatible, `schema` sera incrémenté et les anciens fichiers resteront tels quels.
