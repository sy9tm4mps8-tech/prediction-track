/* ══════════════════════════════════════════════════════════════════════════
   Registre de signaux — rendu de la page publique.

   Tout est lu depuis les fichiers JSON du dépôt (data/…). Aucune API, aucun
   état serveur : la page est un simple lecteur du registre, ce qui permet à
   n'importe qui de recalculer l'affichage à partir des mêmes fichiers.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MARKETS = ['us', 'eu'];
  var ROWS_STEP = 25;

  var state = {
    manifest: null,
    track: {},          // marché → payload
    scan: {},           // marché → payload affiché
    shown: { us: ROWS_STEP, eu: ROWS_STEP },
    charts: {}
  };

  // ── Utilitaires ─────────────────────────────────────────────────────────

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  /** Nombre formaté à la française, ou tiret cadratin si la donnée manque. */
  function num(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString('fr-FR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }

  function pct(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var d = dec === undefined ? 2 : dec;
    return (v > 0 ? '+' : '') + num(v, d) + ' %';
  }

  /** « 2026-08-17 » → « 17/08/2026 ». Découpage de chaîne : pas de fuseau en jeu. */
  function frDate(iso) {
    if (!iso || iso.length < 10) return '—';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  /** Horodatage ISO → « 17/08/2026 à 13:05 ». */
  function frStamp(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /** Cellule : le texte passe TOUJOURS par textContent (aucune injection possible). */
  function cell(text, className) {
    return el('td', className, text);
  }

  /** Couleur sémantique — réservée aux valeurs dont le SIGNE porte une information. */
  function signClass(v) {
    if (v === null || v === undefined || isNaN(v)) return 'num dim';
    return v > 0 ? 'num gain' : (v < 0 ? 'num loss' : 'num dim');
  }

  function pane(market) {
    return {
      cand:  document.querySelector('#candidats .market[data-market="' + market + '"]'),
      track: document.querySelector('#resultats .market[data-market="' + market + '"]')
    };
  }

  function getJson(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' : HTTP ' + r.status);
      return r.json();
    });
  }

  // ── Lien vers l'historique des commits ──────────────────────────────────
  // Déduit de l'URL de la page (owner.github.io/repo/) : rien n'est codé en dur,
  // le dépôt peut être renommé ou déplacé sans toucher au code.
  function repoUrl() {
    var host = location.hostname || '';
    var owner = host.split('.')[0];
    if (!owner || host.indexOf('.github.io') === -1) return null;
    var seg = location.pathname.split('/').filter(Boolean)[0];
    var repo = seg || host;                       // dépôt <owner>.github.io = site racine
    return 'https://github.com/' + owner + '/' + repo;
  }

  // ── Candidats ───────────────────────────────────────────────────────────
  // Quatre colonnes : ce qu'on suit, et rien d'autre. Le classement de la liste
  // se lit dans son ORDRE — il n'a pas besoin d'être chiffré.

  var CAND_COLS = ['Titre', 'Cours', 'Cible', 'Stop'];

  function renderScan(market, data) {
    var root = pane(market).cand;
    if (!root) return;
    state.scan[market] = data;

    var badge = root.querySelector('[data-role="regime"]');
    var meta  = root.querySelector('[data-role="meta"]');
    var table = root.querySelector('[data-role="cand-table"]');
    var empty = root.querySelector('[data-role="empty"]');

    var reg = (data && data.regime) || {};
    badge.textContent = reg.env_label || 'inconnu';
    if (reg.env) badge.setAttribute('data-env', reg.env); else badge.removeAttribute('data-env');

    var bits = [];
    if (data.close_date) bits.push('clôture du ' + frDate(data.close_date));
    // « calculé le » et non « publié le » : l'heure de publication opposable est celle
    // du commit, pas une valeur que ce fichier pourrait s'attribuer lui-même.
    if (data.computed_at) bits.push('calculé le ' + frStamp(data.computed_at));
    meta.textContent = bits.join(' · ');

    var cands = (data && data.candidates) || [];

    // État défavorable : la liste n'est pas affichée. Elle reste dans le fichier
    // publié (le registre ne cache rien), mais la page n'a pas à mettre en avant
    // des lignes sur lesquelles rien n'est ouvert.
    if (reg.env === 'defav') {
      table.hidden = true;
      empty.hidden = false;
      empty.className = 'empty state-defav';
      empty.textContent = 'État de marché défavorable — aucune position ce jour.';
      return;
    }

    table.innerHTML = '';
    if (!cands.length) {
      table.hidden = true;
      empty.hidden = false;
      empty.className = 'empty';
      empty.textContent = 'Aucun candidat ce jour. La séance est publiée quand même : le registre ne saute pas les jours creux.';
      return;
    }
    table.hidden = false;
    empty.hidden = true;

    var thead = el('thead');
    var trh = el('tr');
    CAND_COLS.forEach(function (c, i) {
      var th = el('th', i > 0 ? 'ta-r' : null, c);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el('tbody');
    cands.forEach(function (c) {
      var tr = el('tr');
      tr.appendChild(cell(c.ticker));
      tr.appendChild(cell(num(c.last, 2), 'num'));
      // Cible et Stop ne portent PAS de couleur : l'une est toujours positive,
      // l'autre toujours négative. Les colorer n'informerait de rien et affaiblirait
      // le seul endroit où la couleur dit quelque chose — la colonne Net.
      tr.appendChild(cell(pct(c.target_pct), 'num'));
      tr.appendChild(cell(pct(c.stop_pct), 'num'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // ── Résultats ───────────────────────────────────────────────────────────

  var TRACK_COLS = [
    'Titre', 'Signal', 'Bande', 'Entrée', 'Sortie', 'Sortie le', 'Motif', 'Net'
  ];

  var REASON_LABEL = {
    'cible': 'cible atteinte', 'stop': 'stop touché', 'temps': 'délai',
    'en cours': 'en cours', 'en attente': 'en attente'
  };

  function renderTiles(root, s) {
    var box = root.querySelector('[data-role="tiles"]');
    box.innerHTML = '';
    var tiles = [
      ['Signaux', num(s.n_total, 0)],
      ['Clôturés', num(s.n_closed, 0)],
      ['En cours', num(s.n_open, 0)],
      ['Réussite', s.hit_pct === null ? '—' : num(s.hit_pct, 1) + ' %'],
      ['Net moyen', pct(s.avg_net_pct)],
      ['Net cumulé', pct(s.cum_net_pct)]
    ];
    tiles.forEach(function (t) {
      var d = el('div', 'tile');
      d.appendChild(el('span', 'tile-label', t[0]));
      var v = el('span', 'tile-value', t[1]);
      if (t[0] === 'Net moyen' || t[0] === 'Net cumulé') {
        var raw = t[0] === 'Net moyen' ? s.avg_net_pct : s.cum_net_pct;
        if (raw !== null && raw !== undefined) v.className = 'tile-value ' + (raw > 0 ? 'gain' : (raw < 0 ? 'loss' : ''));
      }
      d.appendChild(v);
      box.appendChild(d);
    });
  }

  function renderChart(market, root, curve) {
    var canvas = root.querySelector('[data-role="chart"]');
    var note   = root.querySelector('[data-role="chart-note"]');
    if (!canvas || typeof Chart === 'undefined') return;

    var labels = (curve && curve.labels) || [];
    var series = (curve && curve.series) || {};
    if (!labels.length) {
      canvas.parentNode.hidden = true;
      note.textContent = 'Courbe disponible dès la première position clôturée.';
      return;
    }
    canvas.parentNode.hidden = false;
    note.textContent = 'Net moyen par signal, cumulé — pas une courbe de capital.';

    // Les trois bandes sont ORDONNÉES : elles portent donc une rampe d'une seule
    // teinte, du plus contrasté (élevée) au plus discret (faible), pour que l'ordre
    // se voie dans la couleur elle-même. La série globale, qui n'appartient pas à
    // cette échelle, garde l'accent de la page — et un trait plus épais, pour ne pas
    // reposer sur la seule couleur.
    var defs = [
      ['global',  'Toutes bandes',     css('--c-global',  '#c89c69'), 2.25],
      ['elevee',  'Confiance élevée',  css('--c-elevee',  '#9ec5f4'), 1.5],
      ['moyenne', 'Confiance moyenne', css('--c-moyenne', '#3987e5'), 1.5],
      ['faible',  'Confiance faible',  css('--c-faible',  '#184f95'), 1.5]
    ];
    var datasets = [];
    defs.forEach(function (d) {
      if (!series[d[0]]) return;
      datasets.push({
        label: d[1], data: series[d[0]], borderColor: d[2], backgroundColor: d[2],
        borderWidth: d[3], pointRadius: 0, pointHoverRadius: 4, tension: .2, spanGaps: true
      });
    });

    var ink  = css('--muted', '#9a9aa2');
    var grid = css('--grid', '#232327');

    if (state.charts[market]) state.charts[market].destroy();
    state.charts[market] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels.map(frDate), datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: ink, maxTicksLimit: 8 }, grid: { color: grid } },
          y: {
            // Le zéro doit rester visible : sans lui, une courbe entièrement positive
            // se lit comme si la ligne d'équilibre était hors du cadre.
            beginAtZero: true,
            ticks: { color: ink, callback: function (v) { return v + ' %'; } },
            grid: { color: grid }
          }
        },
        plugins: {
          legend: {
            align: 'end',
            labels: { color: ink, usePointStyle: true, pointStyle: 'line', boxWidth: 18, font: { size: 11 } }
          },
          tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ' : ' + pct(ctx.parsed.y); } } }
        }
      }
    });
  }

  function renderTrackRows(market) {
    var root = pane(market).track;
    var data = state.track[market];
    if (!root || !data) return;
    var table = root.querySelector('[data-role="track-table"]');
    var more  = root.querySelector('[data-role="more"]');
    var rows  = data.rows || [];
    var limit = Math.min(state.shown[market], rows.length);

    table.innerHTML = '';
    if (!rows.length) {
      table.appendChild(el('caption', 'empty', 'Aucun signal enregistré pour le moment.'));
      more.hidden = true;
      return;
    }

    var thead = el('thead');
    var trh = el('tr');
    TRACK_COLS.forEach(function (c) {
      var right = (c === 'Entrée' || c === 'Sortie' || c === 'Net');
      trh.appendChild(el('th', right ? 'ta-r' : null, c));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el('tbody');
    rows.slice(0, limit).forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(cell(r.ticker));
      tr.appendChild(cell(frDate(r.signal_date)));
      var tdBand = el('td');
      tdBand.appendChild(el('span', 'band', r.band_label || '—'));
      tr.appendChild(tdBand);
      tr.appendChild(cell(num(r.entry, 2), r.entry === null ? 'num dim' : 'num'));
      tr.appendChild(cell(num(r.exit, 2), r.exit === null ? 'num dim' : 'num'));
      tr.appendChild(cell(r.exit_date ? frDate(r.exit_date) : '—', r.exit_date ? null : 'dim'));
      tr.appendChild(cell(REASON_LABEL[r.reason] || r.reason || '—', r.closed ? null : 'dim'));
      var tdNet = cell(pct(r.net_pct), signClass(r.net_pct));
      if (!r.closed && r.net_pct !== null) {
        // Une ligne non clôturée est valorisée au dernier cours : c'est provisoire,
        // et le dire évite de lire un résultat latent comme un résultat acquis.
        tdNet.textContent = pct(r.net_pct) + ' *';
        tdNet.title = 'Position encore ouverte : performance provisoire, au dernier cours connu.';
      }
      tr.appendChild(tdNet);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    more.hidden = limit >= rows.length;
    more.textContent = 'Afficher plus de lignes (' + limit + ' sur ' + rows.length + ')';
  }

  function renderTrack(market, data) {
    var root = pane(market).track;
    if (!root) return;
    state.track[market] = data;
    var meta = document.querySelector('[data-role="footer-meta"]');
    // Le manifest n'a délibérément aucun horodatage (il doit rester identique tant
    // que la liste des jours ne bouge pas) : la fraîcheur affichée vient du calcul
    // de résultats le plus récent des deux marchés.
    if (meta && data.computed_at && (!meta.dataset.stamp || data.computed_at > meta.dataset.stamp)) {
      meta.dataset.stamp = data.computed_at;
      meta.textContent = 'Dernier calcul des résultats : ' + frStamp(data.computed_at) + '.';
    }
    renderTiles(root, data.summary || {});
    renderChart(market, root, data.curve);
    renderTrackRows(market);

    var more = root.querySelector('[data-role="more"]');
    more.onclick = function () {
      state.shown[market] += ROWS_STEP;
      renderTrackRows(market);
    };
  }

  // ── Archive ─────────────────────────────────────────────────────────────

  function setArchiveDay(day) {
    var out = document.querySelector('[data-role="archive-day"]');
    if (out) out.textContent = day ? frDate(day) : 'la plus récente';
  }

  function fillArchive(manifest) {
    var sel = document.getElementById('day-pick');
    var note = document.querySelector('[data-role="archive-note"]');
    if (!sel) return;

    // Union des jours des deux marchés : une séance peut n'exister que d'un côté
    // (jour férié d'un seul marché).
    var days = {};
    MARKETS.forEach(function (m) {
      ((manifest.markets && manifest.markets[m] && manifest.markets[m].days) || [])
        .forEach(function (d) { days[d] = true; });
    });
    var list = Object.keys(days).sort().reverse();
    list.forEach(function (d) {
      var o = el('option', null, frDate(d));
      o.value = d;
      sel.appendChild(o);
    });
    if (note) note.textContent = list.length + ' séance(s) archivée(s).';

    sel.onchange = function () {
      var day = sel.value;
      setArchiveDay(day);
      MARKETS.forEach(function (m) {
        var mk = (manifest.markets && manifest.markets[m]) || {};
        var target = day || mk.latest;
        if (!target) return;
        var has = (mk.days || []).indexOf(target) !== -1;
        if (!has) {
          var root = pane(m).cand;
          root.querySelector('[data-role="cand-table"]').hidden = true;
          root.querySelector('[data-role="meta"]').textContent = '';
          var empty = root.querySelector('[data-role="empty"]');
          empty.hidden = false;
          empty.className = 'empty';
          empty.textContent = 'Pas de séance publiée pour ce marché le ' + frDate(target) + '.';
          return;
        }
        getJson('data/scans/' + m + '/' + target + '.json')
          .then(function (d) { renderScan(m, d); })
          .catch(function (e) { showError(pane(m).cand, e); });
      });
    };
  }

  function showError(root, err) {
    if (!root) return;
    var empty = root.querySelector('[data-role="empty"]');
    if (!empty) return;
    empty.hidden = false;
    empty.className = 'empty';
    empty.textContent = 'Données indisponibles (' + err.message + ').';
  }

  // ── Démarrage ───────────────────────────────────────────────────────────

  function boot() {
    var link = document.querySelector('[data-role="commits-link"]');
    var url = repoUrl();
    if (link) {
      if (url) { link.href = url + '/commits'; }
      else { link.parentNode.textContent = 'Historique des commits : voir le dépôt qui héberge cette page.'; }
    }

    getJson('data/manifest.json').then(function (manifest) {
      state.manifest = manifest;
      fillArchive(manifest);

      MARKETS.forEach(function (m) {
        var mk = (manifest.markets && manifest.markets[m]) || {};
        if (mk.latest) {
          getJson('data/scans/' + m + '/' + mk.latest + '.json')
            .then(function (d) { renderScan(m, d); })
            .catch(function (e) { showError(pane(m).cand, e); });
        } else {
          showError(pane(m).cand, new Error('aucune séance publiée'));
        }
        getJson('data/track/' + m + '.json')
          .then(function (d) { renderTrack(m, d); })
          .catch(function () {
            var root = pane(m).track;
            if (root) root.querySelector('[data-role="chart-note"]').textContent = 'Résultats indisponibles pour ce marché.';
          });
      });
    }).catch(function (e) {
      MARKETS.forEach(function (m) { showError(pane(m).cand, e); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
