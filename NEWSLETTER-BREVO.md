# Newsletter MGC — Brevo

## 1. Analyse de l'architecture

- **Site statique** : HTML, CSS et JS, sans serveur ni base de données.
- **Déjà externalisé** : le formulaire de contact passe par Formspree, le compteur de menaces par GitHub Actions.
- **Aucun backend** dans le dépôt, et l'hébergeur n'est pas identifié.
- **Conséquence** : l'API Brevo exige une clé secrète qui donne accès à tout le compte. Cette clé ne peut pas être mise dans le site, il faut donc un **petit backend**.

## 2. Méthode choisie

Une **mini-API sur Cloudflare Workers** (gratuit, indépendant de l'hébergeur) appelle l'**API officielle Brevo** en **double opt-in**.

```
Navigateur ── email + consentement ──▶ Worker Cloudflare (clé Brevo en secret)
                                          │ GET  /v3/contacts/{email}               → déjà inscrit ?
                                          │ POST /v3/contacts/doubleOptinConfirmation → email de confirmation
                                          ▼
                                        Brevo ── clic sur le lien ──▶ ajout à « Newsletter MGC »
                                                                      + retour sur le site « inscription confirmée »
```

Pourquoi pas le formulaire intégré de Brevo : il ne distingue pas le cas « déjà inscrit » et impose le code et le style de Brevo.

**Sécurité**
- Clé stockée en secret Cloudflare, jamais dans le code du site.
- Seul le domaine du site peut appeler l'API.
- Pièges à robots : champ caché et temps de saisie minimum.
- Consentement vérifié côté serveur, taille des requêtes limitée.

## 3. Brevo — étapes nécessaires

1. **Compte** : créer un compte Brevo gratuit.
2. **Domaine d'envoi** : *Expéditeurs, domaines et IP dédiées* → *Domaines*.
   - Ajouter `mgc-paris.fr` et poser les enregistrements DNS demandés (DKIM, DMARC).
   - Créer l'expéditeur, par ex. `newsletter@mgc-paris.fr`.
3. **Liste** : *Contacts* → *Listes* → *Créer une liste* → `Newsletter MGC`. **Noter son ID.**
4. **Modèle de confirmation (double opt-in)** : *Modèles d'email* → *Nouveau modèle*.
   - Ajouter un bouton « Confirmer mon inscription » dont le lien est exactement `{{ doubleoptin }}`.
   - Ajouter le **tag `optin`** au modèle, puis l'**activer**. **Noter son ID.**
   - Facultatif : une version anglaise, avec son propre ID.
5. **Clé API** : *SMTP & API* → *Clés API* → *Générer* (nom : `site-newsletter`). La copier : elle ne s'affiche qu'une fois.
6. **IP autorisées** : *Paramètres* → *Sécurité* → *IP autorisées* → **Désactiver le blocage**.
   - Sans cela, Brevo refuse les appels du Worker (erreur 401), car les adresses IP de Cloudflare changent.

La désinscription est gérée par Brevo : le lien est présent par défaut dans chaque campagne. Il ne faut pas le retirer du modèle.

## 4. Cloudflare — déployer l'API

1. https://dash.cloudflare.com (compte gratuit) → *Workers & Pages* → *Create* → *Create Worker*.
2. Nom `mgc-newsletter` → *Deploy* → *Edit code* → coller tout `newsletter-api/worker.js` → *Deploy*.
3. *Settings* → *Variables and Secrets* → ajouter les variables ci-dessous → *Deploy*.
4. Copier l'URL du Worker, par ex. `https://mgc-newsletter.<compte>.workers.dev`.

### Variables d'environnement (Worker)

| Nom | Type | Valeur |
|---|---|---|
| `BREVO_API_KEY` | **Secret** | clé API de l'étape 3.5 |
| `BREVO_LIST_ID` | Texte | ID de la liste « Newsletter MGC » |
| `BREVO_DOI_TEMPLATE_ID` | Texte | ID du modèle de confirmation FR |
| `BREVO_DOI_TEMPLATE_ID_EN` | Texte (facultatif) | ID du modèle EN |
| `DOI_REDIRECT_URL` | Texte | `https://www.mgc-paris.fr/?newsletter=confirmee#newsletter` |
| `DOI_REDIRECT_URL_EN` | Texte (facultatif) | `https://www.mgc-paris.fr/en/home.html?newsletter=confirmed#newsletter` |
| `ALLOWED_ORIGINS` | Texte | `https://www.mgc-paris.fr,https://mgc-paris.fr` |

Adapter les URL si la page d'accueil du site n'est pas servie à la racine.

## 5. Brancher le site

Dans `site/MGC_page_principale.html` et `site/en/home.html`, remplacer :

```html
<form class="newsletter-form" id="newsletterForm" data-endpoint="" novalidate>
```

par l'URL du Worker :

```html
<form class="newsletter-form" id="newsletterForm" data-endpoint="https://mgc-newsletter.<compte>.workers.dev" novalidate>
```

Tant que ce champ est vide, le formulaire affiche « inscription momentanément indisponible ».

## 6. Tester une inscription complète

1. Sur le site en ligne : saisir **sa propre adresse**, cocher la case, *S'inscrire* → message « email de confirmation envoyé ».
2. Brevo → liste *Newsletter MGC* : le contact n'y est **pas encore**. C'est le principe du double opt-in.
3. Ouvrir l'email → *Confirmer* → retour sur le site avec « Votre inscription est confirmée ».
4. Brevo → liste *Newsletter MGC* : le contact y est maintenant.
5. Se réinscrire avec la même adresse → « Cette adresse est déjà inscrite ».
6. Saisir `test@exemple` → « Cette adresse email n'est pas valide ».
7. Envoyer une campagne test à la liste → cliquer sur le lien de désinscription en bas → le contact est désinscrit.
8. Sécurité : navigateur → *Outils de développement* → *Réseau*.
   - La requête part vers le Worker, sans aucune clé.
   - Aucune trace de `api.brevo.com` ni de `xkeysib` dans le code de la page.

En cas d'échec : Cloudflare → Worker → *Logs*. Les messages commencent par `newsletter:` et donnent le code renvoyé par Brevo (401 = clé ou IP, 400 = modèle ou liste).

## 7. Ce qui a été vérifié

- **API** : 22 scénarios testés en local, avec réponses Brevo simulées selon les codes documentés (201, 204, 404, 400, 401, délai dépassé). Parmi eux :
  - origine refusée, robots, email invalide, absence de consentement,
  - nouvel inscrit, déjà inscrit, contact désinscrit, erreurs Brevo,
  - la clé n'apparaît jamais dans les réponses.
- **Formulaire relié à l'API en local** : email invalide, sans consentement, inscription, déjà inscrit, erreur, retour du lien de confirmation, FR et EN.
- **Affichage** : ordinateur, tablette, mobile, mode sombre ; pas de défilement horizontal ; les 14 pages sans erreur.
- **Pas testé contre le vrai Brevo** : le réseau de mon environnement de travail bloque api.brevo.com. Le test réel, c'est la section 6.

## 8. À savoir

- Le message « déjà inscrite » révèle si une adresse est abonnée. C'est demandé, et limité par les protections anti-robots. Pour le masquer, remplacer `already_subscribed` par `pending` dans `worker.js`.
- Politique de confidentialité (FR et EN) complétée : traitement « newsletter », base légale consentement, sous-traitant Brevo, conservation jusqu'à la désinscription. **À valider par MGC.**
- Protection anti-abus renforcée possible : règle *Rate limiting* Cloudflare sur le Worker (facultatif).

## 9. Fichiers

| Fichier | Rôle |
|---|---|
| `site/MGC_page_principale.html`, `site/en/home.html` | Bloc newsletter (avant le pied de page) + script |
| `site/newsletter.js` | Validation, envoi, messages FR/EN, retour du double opt-in |
| `site/styles.css` | Styles du bloc newsletter |
| `site/mentions_legales.html`, `site/en/legal-notice.html` | Traitement « newsletter » ajouté en section 3 |
| `newsletter-api/worker.js` | API sécurisée (Cloudflare Worker) |
| `NEWSLETTER-BREVO.md` | Cette notice |
