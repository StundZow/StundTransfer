# StundTransfer

Fork de [Pingvin Share X](https://github.com/smp46/pingvin-share-x) transformé en outil de **dépôt de rushs** : la personne dit qui elle est et pour quelle vidéo, dépose ses fichiers ou dossiers, et ils arrivent directement dans `<dossier de réception>/<Nom> - <Vidéo>/` sur le NAS. Aucun compte, aucun lien de partage, aucune page de téléchargement.

- Branche de travail : `stundtransfer` (basée sur la version officielle **v2.0.0**)
- Image Docker : `ghcr.io/stundzow/stundtransfer:latest`, construite par GitHub Actions à chaque envoi sur la branche `stundtransfer` (`.github/workflows/stundtransfer-image.yml`). Les tests tournent avant : si un test échoue, l'image n'est pas publiée.
- Le partage « classique » de Pingvin (toi → quelqu'un) est caché par défaut ; il se réactive dans Paramètres → StundTransfer → Partage classique.

## Comment ça marche

| Qui | Où | Ce qu'il voit |
|---|---|---|
| Visiteur | l'adresse publique, ex. `https://<ton-nom>.synology.me/` | La page de dépôt directement (si **Dépôt public** est activé), une icône « personne » en haut à droite pour se connecter |
| Visiteur | lien de dépôt `…/upload/<jeton>` | La page de dépôt de ce lien |
| Admin (connecté) | **Administration → Dépôts reçus** (ou menu liens) | **Tous** les dépôts : qui, quelle vidéo, quand, nombre de fichiers, taille, statut, détail fichier par fichier, « Réessayer le rangement » en cas d'erreur |
| Admin (connecté) | **Administration → Paramètres** | Tous les réglages : section **StundTransfer**, nom de l'appli (Général), logo et couleurs (Apparence), inscriptions (Sécurité & Accès), etc. |

- Le **dépôt public** (accueil) ne demande aucun lien. Les **liens de dépôt** (« partages inversés » de Pingvin) restent possibles en plus, par exemple pour une personne précise avec une expiration, une taille max et un nombre d'utilisations max.
- L'envoi se fait par morceaux (Paramètres → Partage → taille des morceaux, 20 Mo), plusieurs en parallèle, avec reprise automatique en cas de coupure et reprise après rafraîchissement de la page (il suffit de redéposer les mêmes fichiers).
- Pendant l'envoi, les morceaux sont écrits dans un dossier « en cours » **sur le même dossier partagé** que la destination : à la fin, le rangement est un simple renommage (instantané, jamais de doublon). Si ce n'est pas possible (autre disque), le serveur copie → vérifie la taille → supprime l'original, et l'affiche dans ses journaux.
- **Un dossier par dépôt** : `Nom - Vidéo`, puis `Nom - Vidéo (2)`, `(3)`… si le nom est déjà pris (sans tenir compte des majuscules). Le réglage « Regrouper les dépôts du même nom » revient à un dossier commun.
- **Renommage avant l'envoi** : un crayon à côté de chaque fichier. Les fichiers sans vrai nom (dates et heures comme `2026-07-22 14-32-10.mkv` d'OBS, numéros d'appareil comme `IMG_1234`, `DSC01234`, `GX010123`, `C0001`) sont renommés automatiquement `Nom - Vidéo 1`, `2`, `3`… dans l'ordre des dates (sans numéro s'il n'y en a qu'un). L'ancien nom reste affiché barré, la flèche ↺ le remet. Les fichiers qui ont déjà un vrai nom ne sont pas touchés.
- Noms nettoyés (caractères interdits Windows/Synology, `..`, chemins absolus, espaces), arborescence des dossiers conservée, jamais d'écrasement de fichier (` (2)`, ` (3)`…), date de modification d'origine conservée.
- **Dossier de réception** : Administration → Dossier de réception, un explorateur limité au dossier monté dans le conteneur (dossiers cachés, `#recycle` et `@eaDir` exclus). On peut y créer un dossier et le choisir.
- Les envois abandonnés sont supprimés du dossier « en cours » après le délai choisi (3 jours par défaut).
- **Partager depuis le NAS** (Administration → Partager depuis le NAS, admins seulement) : on parcourt le dossier monté (tri par date de modification, nom ou taille, mémorisé dans le navigateur), on crée un lien `…/d/<jeton>` sur un fichier ou sur le dossier affiché (expiration au choix ; jamais sur tout le dossier monté). La personne télécharge directement depuis le NAS par l'adresse publique (HTTPS 443), sans copie : un fichier reprend après une coupure (requêtes HTTP Range) ; un dossier se parcourt, ses fichiers se téléchargent un par un ou tous en zip (sans compression, zip64 au-delà de 4 Go, ne reprend pas). Fichiers cachés, `#recycle` et `@eaDir` jamais montrés. Les téléchargements portent `X-Accel-Buffering: no` pour que le proxy de DSM ne les copie pas d'abord sur le disque. Le lien affiche le nombre de téléchargements ; un fichier ou dossier déplacé ou supprimé est signalé.

## Réglages

**Dans l'interface** (Administration → Paramètres → **StundTransfer**), modifiables à chaud, sans redémarrage :

| Réglage | Défaut | Rôle |
|---|---|---|
| Dépôt public | désactivé | L'accueil accepte les dépôts sans compte ni lien |
| Taille maximale par dépôt | 500 Go | Pour le dépôt public (les liens de dépôt gardent leur propre limite) |
| Morceaux envoyés en même temps | 6 | Par navigateur (1 à 16) |
| Espace à garder libre | 20 Go | Refuse un dépôt si l'espace libre, moins ce qui est déjà promis aux envois en cours, passerait sous cette marge ; vérifié aussi pendant l'envoi |
| Supprimer les envois inachevés après | 3 jours | Nettoyage du dossier « en cours ». Les envois annulés ou abandonnés disparaissent de l'historique après 30 jours |
| Regrouper les dépôts du même nom | désactivé | Désactivé : un dossier par dépôt |
| Partage classique | désactivé | Affiche le partage d'origine de Pingvin (Téléverser, Mes partages, Partages inversés) dans le menu et l'accueil des admins. Quel que soit ce réglage, ses pages restent réservées aux admins : les visiteurs vont sur la page de dépôt, les autres comptes sur « Dépôts reçus » |
| Exemple « Qui es-tu ? » | `ex. Stund` | Texte gris dans le champ du nom |
| Exemple « Pour quelle vidéo ? » | `ex. Beamng` | Texte gris dans le champ de la vidéo |

Le nom affiché en haut se change dans **Paramètres → Général**, le logo et les couleurs dans **Paramètres → Apparence**.

La taille des morceaux (**Paramètres → Partage**, 20 Mo sur le NAS) peut se baisser pendant des envois en cours, sans les casser. En revanche, si le conteneur redémarre entre-temps, ces envois devront être recommencés.

**Dans le `compose.yaml`** (liés aux dossiers du NAS, donc pas dans l'interface) :

| Variable | Défaut | Rôle |
|---|---|---|
| `STUNDTRANSFER_ROOT_DIR` (ancien nom : `STUNDTRANSFER_TRANSFER_DIR`) | *(vide = mode dépôt désactivé)* | Dossier du NAS monté dans le conteneur. Le dossier de réception se choisit **dedans**, depuis l'admin (par défaut : lui-même) |
| `STUNDTRANSFER_ROOT_NAME` | nom du dossier monté | Nom affiché dans l'admin (ex. `A - STUND - NAS`) |
| `STUNDTRANSFER_STAGING_DIR` | `.stundtransfer-en-cours` dans le dossier monté | Envois en cours. Doit être dans le même dossier partagé Synology que la réception pour un rangement instantané |

Le conteneur lit et écrit avec le compte DSM indiqué par `PUID`/`PGID` (voir « Droits Synology ») : il n'a accès qu'aux dossiers autorisés pour ce compte.

**Pas de `config.yaml`** : quand un `config.yaml` est monté, Pingvin verrouille tous les réglages de l'interface. Pour passer d'un `config.yaml` à l'interface sans rien perdre, conteneur **arrêté** :

```bash
cd backend
node scripts/stundtransfer-import-config-yaml.cjs /chemin/config.yaml /chemin/data/pingvin-share.db --dry-run   # aperçu
node scripts/stundtransfer-import-config-yaml.cjs /chemin/config.yaml /chemin/data/pingvin-share.db --enable-public-deposit
```

puis retirer la ligne `config.yaml` du `compose.yaml` et reconstruire le projet.

## `compose.yaml` (NAS)

```yaml
services:
  pingvin-share-x:
    image: ghcr.io/stundzow/stundtransfer:latest
    container_name: pingvin
    restart: unless-stopped
    ports:
      - 3000:3000
    environment:
      - TRUST_PROXY=true
      # Compte DSM dédié "stundtransfer" (voir « Droits Synology »)
      - PUID=1031
      - PGID=1031
      # Dossier partagé visible par l'appli ; le dossier de réception se choisit dedans
      - STUNDTRANSFER_ROOT_DIR=/nas
      - STUNDTRANSFER_ROOT_NAME=A - STUND - NAS
      # Envois en cours : même dossier partagé (rangement instantané)
      - STUNDTRANSFER_STAGING_DIR=/nas/5 - StundTransfer/.en-cours
    volumes:
      - /volume1/docker/pingvin/data:/opt/app/backend/data
      - /volume1/docker/pingvin/data/images:/opt/app/frontend/public/img
      - "/volume1/A - STUND - NAS:/nas"
```

**Droits Synology** : le conteneur tourne avec un **compte DSM dédié**, il a donc exactement les droits de ce compte.

1. Panneau de configuration → Utilisateur et groupe → **Créer** `stundtransfer` : Lecture/Écriture sur le dossier partagé des rushs et sur `docker`, aucun accès ailleurs, aucune application.
2. Son numéro : en SSH, `id stundtransfer` (ex. `uid=1031`). Mets-le dans `PUID` **et** `PGID`. Pas `PGID=100` : ce numéro est déjà pris dans l'image.
3. Ne donne jamais « Everyone » / « Tout le monde » sur le dossier des rushs.

Au démarrage, le journal du conteneur indique `Deposit mode enabled` si tout est bon, ou `Deposit folders are not usable (…)` avec la raison.

## Nouvelle installation (autre NAS)

1. Le NAS doit avoir un processeur **Intel/AMD** (Synology « + », ex. DS224+, DS225+, DS423+). Les modèles ARM (DS223, DS220j…) ne sont pas pris en charge.
2. Crée le compte DSM dédié (voir « Droits Synology ») et un dossier pour les données de l'appli, ex. `docker/stundtransfer`.
3. Container Manager → **Projet** → **Créer**, colle le `compose.yaml` ci-dessus en adaptant les chemins de gauche (`/volume1/docker/pingvin` → ton dossier de données, `/volume1/A - STUND - NAS` → ton dossier partagé de rushs), `PUID`/`PGID` et `STUNDTRANSFER_ROOT_NAME` à ton NAS. `STUNDTRANSFER_STAGING_DIR` peut être retiré (par défaut : `.stundtransfer-en-cours` à la racine du dossier monté).
4. Ouvre `http://<ip-du-nas>:3000/auth/signUp` : **le premier compte créé est administrateur**.
5. Administration → Paramètres :
   - **Sécurité & Accès** → désactive « Autoriser les inscriptions » (sinon n'importe qui peut se créer un compte) ;
   - **Général** → nom de l'appli, adresse publique ;
   - **Apparence** → logo, couleurs ;
   - **StundTransfer** → active « Dépôt public ».
6. Pour l'accès depuis internet : adresse DDNS + certificat Let's Encrypt + proxy inversé DSM (HTTPS 443 → `localhost:3000`) + redirection du port 443 sur la box. Jamais le port 3000 directement.

## Mettre à jour le NAS avec la dernière image StundTransfer

**Bouton « Mettre à jour »** (Administration → Mettre à jour) : la page compare la version installée (`STUNDTRANSFER_VERSION`, commit inscrit dans l'image par le workflow) avec la dernière image publiée sur GitHub (publiée seulement si les tests passent). Le bouton dépose `data/update-requested` ; une tâche DSM lancée **chaque minute en root** le voit, télécharge l'image et relance le projet (le conteneur n'a jamais accès à Docker). Le conteneur copie la base dans `data/backups-auto/` à chaque démarrage (10 dernières copies). Le résultat est écrit dans `update.log` (copie lisible par la page dans `data/update.log`).

Tâche à créer une fois : Panneau de configuration → Planificateur de tâches → Créer → Tâche planifiée → Script défini par l'utilisateur ; utilisateur **root** ; tous les jours, **toutes les minutes** ; script :

```sh
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
DIR=/volume1/docker/pingvin
[ -e "$DIR/data/update-requested" ] || [ -L "$DIR/data/update-requested" ] || exit 0
rm -f "$DIR/data/update-requested"
cd "$DIR" || exit 1
IMAGE=ghcr.io/stundzow/stundtransfer:latest
PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' pingvin 2>/dev/null)
[ -n "$PROJECT" ] || PROJECT=pingvin
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
OLD=$(docker image inspect --format '{{.Id}}' $IMAGE 2>/dev/null)
if $DC -p "$PROJECT" pull --quiet; then
  NEW=$(docker image inspect --format '{{.Id}}' $IMAGE 2>/dev/null)
  if [ "$OLD" != "$NEW" ]; then
    if $DC -p "$PROJECT" up -d; then RESULT="mise a jour installee"; else RESULT="ECHEC du redemarrage"; fi
    docker image prune -f >/dev/null
  else
    RESULT="deja a jour"
  fi
else
  RESULT="ECHEC du telechargement de l'image"
fi
echo "$(date '+%Y-%m-%d %H:%M') $RESULT" >> "$DIR/update.log"
tail -n 20 "$DIR/update.log" > "$DIR/.update.log.tmp" && chmod 644 "$DIR/.update.log.tmp" && mv -f "$DIR/.update.log.tmp" "$DIR/data/update.log"
```

**À la main** :

1. Vérifie que le build GitHub est vert : https://github.com/StundZow/StundTransfer/actions
2. Container Manager → **Projet** → `pingvin` → **Arrêter**, puis **Nettoyer**.
3. Container Manager → **Image** → `ghcr.io/stundzow/stundtransfer` → **Supprimer** (force le re-téléchargement).
4. Container Manager → **Projet** → `pingvin` → **Construire**.
5. Vérifie que le site s'ouvre.

Avant une mise à jour qui ajoute une migration de base de données, sauvegarde `data/pingvin-share.db` (conteneur arrêté).

**Revenir en arrière** : chaque build est aussi publié avec un tag court (ex. `ghcr.io/stundzow/stundtransfer:a1b2c3d`). Si l'image visée est **plus ancienne que la base** (ex. `b0d9ae7`, la dernière image avant Pingvin 2.0) :

1. Arrête le projet.
2. Garde une copie de la base actuelle, puis remplace `data/pingvin-share.db` par la sauvegarde d'avant la mise à jour (pour la 2.0, sur ce NAS : `docker/pingvin/backups/pingvin-share-avant-2.0-2026-10-06.db`).
3. Mets le tag court à la place de `latest` dans `compose.yaml`, puis **Construire**.
4. Vérifie Administration → Paramètres → « Autoriser les inscriptions » : désactivé.

Sans remettre la sauvegarde, l'ancienne version efface les réglages qu'elle ne connaît pas et **rouvre les inscriptions**, même après être revenu à `latest`. Les dépôts reçus après la mise à jour disparaissent de l'historique, mais leurs fichiers restent sur le NAS. Ne mets jamais l'image officielle `smp46/pingvin-share-x` : elle efface tous les réglages StundTransfer.

## Récupérer une mise à jour du projet officiel (upstream)

Le plus simple : demande à Claude Code « mets à jour StundTransfer avec la dernière version officielle de Pingvin Share X ». Sinon, à la main :

```bash
git fetch upstream --tags
git checkout stundtransfer
git merge vX.Y.Z             # le tag de la nouvelle version
cd backend && npm ci && npm run test:stundtransfer && cd ..
git push origin stundtransfer # déclenche les tests et la construction de l'image
```

Règles :
- Fusionner uniquement des **tags de version stable** (`vX.Y.Z`), pas `main` (versions bêta).
- Avant de passer à une nouvelle version **majeure** (ex. 2.0), sauvegarder `data/pingvin-share.db` : les migrations ne se défont pas.
- Version majeure : relancer `node test/stundtransfer/e2e-deposit.mjs` sur une **copie** de la base du NAS migrée (serveur lancé avec `STUNDTRANSFER_CHUNK_MB=1`). La base du NAS n'a pas les liens de test : crée sur la copie deux liens de dépôt (un valide avec au moins 3 utilisations et 20 Mo, un épuisé) et passe leurs jetons avec `TOKEN=…` et `EXHAUSTED_TOKEN=…`. Avec un dossier de réception réglé, `TRANSFER_DIR` = `<dossier monté>/<dossier de réception>` et `STAGING_DIR` = le dossier « en cours ». Vérifier aussi les réglages déplacés (en 2.0 : inscriptions, cookies, durée de session… passés dans « Sécurité & Accès »). L'outil `stundtransfer-import-config-yaml.cjs` connaît ces déplacements (table `MOVED`).
- Les migrations Prisma de StundTransfer sont **additives uniquement** (ajout de tables/colonnes, jamais de suppression). Si une migration officielle a une date antérieure à la nôtre, `prisma migrate deploy` l'applique quand même : pas d'action à faire.

### Ce qui est modifié dans le code officiel

Tout le reste est dans des fichiers à nous (`backend/src/stundtransfer/`, `frontend/src/stundtransfer/`, `frontend/src/pages/depot.tsx`, `frontend/src/pages/account/deposits.tsx`, `frontend/src/pages/admin/destination.tsx`, `frontend/src/pages/admin/nas.tsx`, `frontend/src/pages/d/[token].tsx`, `backend/scripts/stundtransfer-import-config-yaml.cjs`, `.github/README.md`, tests, workflow). Chaque ligne modifiée dans un fichier officiel est marquée `StundTransfer` :

| Fichier | Modification |
|---|---|
| `backend/prisma/schema.prisma` | 3 tables ajoutées à la fin (`StundDeposit`, `StundDepositFile`, `StundNasLink`) |
| `backend/src/app.module.ts` | Branche le module `StundTransferModule` |
| `backend/package.json` | Script `test:stundtransfer` |
| `frontend/src/pages/upload/[reverseShareToken].tsx` | Affiche la page de dépôt pour les liens de dépôt |
| `frontend/src/middleware.ts` | L'accueil affiche `/depot` (visiteurs, et comptes connectés sans partage classique) ; pages du partage classique réservées aux admins ; `/d/*` (liens vers le NAS) public |
| `frontend/src/components/header/Header.tsx` | Visiteurs : icône de connexion seule (cachée si Paramètres → Général → « Afficher les boutons d'authentification » est désactivé) ; connecté sans partage classique : « Dépôts reçus » + profil |
| `frontend/src/components/header/NavbarShareMenu.tsx` | Entrée « Dépôts reçus » |
| `frontend/src/components/footer/Footer.tsx` | « Powered by » traduit |
| `frontend/src/pages/account/reverseShares.tsx` | Bouton « Dépôts reçus » |
| `frontend/src/i18n/locales.ts` | Ajoute les textes StundTransfer (fr + en) à toutes les langues, et simplifie quelques textes d'origine |
| `backend/prisma/seed/config.seed.ts` | Sections de réglages `stundtransfer` et `stundtransferpaths` (ajoutées à la fin) |
| `frontend/src/services/config.service.ts` | Autorise la section `stundtransfer` |
| `frontend/src/components/admin/configuration/ConfigurationNavBar.tsx` | Entrée « StundTransfer » dans les paramètres |
| `frontend/src/pages/admin/index.tsx` | Cartes « Dépôts reçus », « Dossier de réception », « Partager depuis le NAS », « Envoyer des fichiers », « Mes liens de partage », « Couleurs et thème », « Mettre à jour » ; « Paramètres » ouvre la section StundTransfer ; carte « Mise à jour » renvoyée vers ce fichier |
| `frontend/src/pages/_app.tsx` | Interface un peu plus grande sur les grands écrans (`ResponsiveScale`) |
| `backend/src/share/guard/createShare.guard.ts` | Seuls les admins créent des liens de partage ; en mode dépôt, un lien de dépôt ne permet jamais de créer un partage classique |
| `backend/src/reverseShare/reverseShare.controller.ts` | Seuls les admins créent des liens de dépôt |
| `backend/src/main.ts` | `TRUST_PROXY=true` ne fait confiance qu'aux relais locaux (DSM, Caddy), pour que les limites anti-abus ne se contournent pas ; délai d'envoi d'une requête porté à 2 h (connexions lentes) ; taille max des morceaux jamais réduite pendant que le serveur tourne |
| `frontend/src/pages/auth/signIn.tsx`, `frontend/src/utils/router.util.ts` | Redirection après connexion limitée aux pages du site (faille `?redirect=javascript:` de Pingvin) |
| `Dockerfile`, `.github/workflows/stundtransfer-image.yml` | Commit et date de construction inscrits dans l'image (`STUNDTRANSFER_VERSION`, `STUNDTRANSFER_BUILT_AT`) pour la page « Mettre à jour » |
| `scripts/docker/entrypoint.sh` | Copie de la base dans `data/backups-auto/` à chaque démarrage, avant les migrations (10 gardées) |
| `reverse-proxy/Caddyfile`, `reverse-proxy/Caddyfile.trust-proxy` | En-têtes de sécurité (HSTS, anti-iframe, nosniff, referrer). Effet de HSTS : les navigateurs forcent le HTTPS sur tous les ports de l'adresse publique pendant un an, donc DSM s'ouvre en `https://<adresse>:5001` (plus en `http://…:5000`) |

En cas de conflit lors d'une mise à jour : garder la version officielle du fichier, puis réappliquer ces quelques lignes.

## Tests

```bash
cd backend
npm run test:stundtransfer        # nettoyage des noms, chemins, déplacement fiable (tests unitaires)
# Test complet de l'API contre un serveur lancé (voir l'en-tête du fichier) :
node test/stundtransfer/e2e-deposit.mjs
```
