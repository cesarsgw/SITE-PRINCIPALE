# Compteur « Menaces actives · FR » (header)

## Ce que mesure le compteur

**Nombre d'URL de distribution de malware actives (statut `online`), hébergées sur des serveurs situés en France.**

- Source : [abuse.ch URLhaus](https://urlhaus.abuse.ch/), flux pays FR.
- Ce n'est **pas** un nombre d'attaques. Le libellé et l'infobulle le disent clairement.
- L'infobulle indique aussi l'heure de mise à jour et le nombre d'URL ajoutées en 24 h.

## Pourquoi pas « cyberattaques détectées en France en direct »

Aucune source gratuite ne remplit les 3 conditions à la fois (vérifié en septembre 2026) : mesurer les attaques contre la France, fournir un vrai nombre en temps réel et autoriser l'usage sur un site d'entreprise.

| Source | Mesure | Blocage |
|---|---|---|
| Cloudflare Radar | Attaques visant la France | Licence CC BY-NC (non commerciale) et valeurs en %, pas en nombre |
| SANS ISC / DShield | Attaques signalées | Chiffre mondial, pas France |
| Shadowserver | Stats par pays | Réservé recherche / presse, extraction interdite |
| **abuse.ch URLhaus** | **Menaces hébergées en France** | **Retenu** (voir licence ci-dessous) |

## Licence et conditions d'usage

- Données URLhaus : **CC0**, domaine public.
- API et flux : gratuits en **« fair use »**.
- abuse.ch précise qu'un usage **commercial / à but lucratif peut nécessiter un abonnement payant** (via Spamhaus).
- **À faire** : écrire à abuse.ch pour confirmer que l'affichage d'un compteur sur le site de MGC est accepté gratuitement.
  - Contact : via le site https://abuse.ch/
  - Offre payante : https://www.spamhaus.com/data-access/abusech-api/

## « En direct »

- **Non affiché.** Le flux URLhaus est régénéré toutes les 5 à 10 min et relu toutes les 15 min : ce n'est pas du temps réel.
- Le code n'affiche « en direct » que si la donnée publiée porte `realtime: true` **et** a moins de 15 min. Ce n'est jamais le cas avec URLhaus.

## Fonctionnement

```
URLhaus (flux FR, clé API)
   │  toutes les 15 min — GitHub Actions (.github/workflows/compteur-menaces.yml)
   ▼
cyber-counter.json  → branche « data » du dépôt (1 seul commit, réécrit à chaque passage)
   │  lu toutes les 45 s par le navigateur (site/threat-counter.js)
   ▼
Header du site : « MENACES ACTIVES · FR  1 234 »
```

- **La clé API n'est jamais envoyée au navigateur.** Elle reste dans les secrets GitHub.
- Le site affiche « Données indisponibles » si :
  - la branche `data` n'existe pas encore,
  - le réseau est en erreur,
  - le JSON est invalide,
  - la source a échoué (`ok: false`),
  - la donnée a plus de 2 h.
- Quand le nombre change, il défile de l'ancienne à la nouvelle valeur, avec un bref éclat bleu. L'animation est coupée si le visiteur a demandé à réduire les animations.
- Aucune requête n'est faite quand l'onglet est en arrière-plan.

## Mise en service (5 min)

1. **Clé API** : créer un compte gratuit sur https://auth.abuse.ch/, puis copier l'**Auth-Key** affichée.
2. **Secret GitHub** : dépôt → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*.
   - Nom : `URLHAUS_AUTH_KEY`
   - Valeur : la clé
3. **Fusionner dans `main`** : GitHub n'exécute les tâches planifiées que sur la branche par défaut.
4. **Premier lancement** : onglet *Actions* → « Compteur menaces (URLhaus FR) » → *Run workflow*.
5. **Vérifier** : https://raw.githubusercontent.com/cesarsgw/SITE-PRINCIPALE/data/cyber-counter.json doit contenir `"ok": true`.

## Dépannage

Si le JSON contient `"ok": false`, le champ `error` indique la cause :

| `error` | Cause | Solution |
|---|---|---|
| `cle_absente` | Secret manquant | Étape 2 |
| `http_401` / `http_403` | Clé refusée | Regénérer la clé sur auth.abuse.ch |
| `http_429` | Trop de requêtes | Espacer le cron (ex. `*/30`) |
| `format_inattendu` / `flux_vide` | Format du flux modifié par abuse.ch | Adapter `.github/scripts/urlhaus_fr_counter.py` |
| `reseau` | URLhaus injoignable | Temporaire, rien à faire |

## Limites à connaître

- Le réseau de mon environnement de travail bloque abuse.ch : le script n'a **pas pu être testé contre le vrai flux**.
  - Il a été testé sur des CSV fictifs au format URLhaus, avec et sans colonne *Tags*, et sur les cas d'erreur.
  - Au premier lancement, lire le journal de l'Action.
- Les tâches planifiées GitHub peuvent partir avec quelques minutes de retard.
- Sur un dépôt public, GitHub **désactive les tâches planifiées après 60 jours sans activité** : il faut alors les réactiver dans l'onglet *Actions*.
- raw.githubusercontent.com garde le fichier en cache jusqu'à 5 min.
- RGPD : l'adresse IP des visiteurs est transmise à GitHub (lecture du JSON), comme c'est déjà le cas pour Google Fonts et Formspree. À ajouter aux mentions légales si besoin.

## Fichiers

- `site/threat-counter.js` : affichage, relecture toutes les 45 s, animation, états d'erreur.
- `site/styles.css` : bloc « Compteur Menaces actives · FR ».
- `site/MGC_page_principale.html`, `site/en/home.html` : compteur dans le header, entre Confidentialité et Nous contacter.
- `.github/workflows/compteur-menaces.yml` : tâche planifiée toutes les 15 min.
- `.github/scripts/urlhaus_fr_counter.py` : téléchargement et comptage.
