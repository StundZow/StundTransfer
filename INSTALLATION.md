# Installer StundTransfer sur ton NAS Synology

Guide pas à pas, sans code, pour un NAS Synology comme le **DS225+**. Compte environ **45 minutes**.

À la fin, tu auras :

- une page où n'importe qui peut t'envoyer des rushs, qui arrivent directement dans un dossier de ton NAS ;
- des liens de téléchargement pour partager des fichiers déjà sur le NAS, ou envoyés depuis ton PC ;
- un bouton « Mettre à jour » pour installer les nouvelles versions en un clic.

---

## Ce qu'il te faut

- Un NAS Synology à **processeur Intel ou AMD** : la gamme « + », comme les DS224+, DS225+ ou DS423+. Les modèles sans « + » (DS223, DS220j…) ne marchent pas.
- **DSM 7.2** ou plus récent.
- Un **compte administrateur** DSM.
- Un **dossier partagé pour tes rushs**. Dans ce guide, il s'appelle `Rushs` : remplace par le nom du tien.
- L'accès à ta **box internet**, pour rendre le site visible depuis l'extérieur (étape 8).

> 💡 Dans ce guide, tout ce qui est écrit `COMME_CECI` est à remplacer par ta propre valeur.

---

## Étape 1 — Installer Container Manager

1. Ouvre **Centre de paquets**.
2. Cherche **Container Manager** et clique sur **Installer**.

Un dossier partagé `docker` est créé tout seul.

---

## Étape 2 — Créer l'utilisateur `stundtransfer`

StundTransfer va tourner avec son propre compte DSM. Il ne pourra lire et écrire **que** dans les dossiers que tu lui autorises, et rien d'autre sur le NAS.

1. **Panneau de configuration → Utilisateur et groupe → Utilisateur → Créer**.
2. Nom : `stundtransfer`. Mot de passe : n'importe lequel, long. Tu n'en auras jamais besoin.
3. Groupes : laisse `users`.
4. **Autorisations des dossiers partagés** :
   - `Rushs` (ton dossier de rushs) : **Lecture/Écriture** ;
   - `docker` : **Lecture/Écriture** ;
   - tous les autres : **Pas d'accès**.
5. **Applications** : coche **Refuser** partout. Ce compte ne sert pas à se connecter.
6. Termine la création.

---

## Étape 3 — Créer les dossiers de l'appli

Dans **File Station** :

1. Ouvre le dossier `docker` et crée un dossier `stundtransfer`.
2. Dans `stundtransfer`, crée un dossier `data`.
3. Dans `data`, crée un dossier `images`.

Tu dois obtenir `docker/stundtransfer/data/images`.

> 💡 Vérifie sur quel volume sont tes dossiers : clic droit sur `docker` → **Propriétés** → **Emplacement**. Ça commence en général par `/volume1/…`. Si c'est `/volume2`, remplace `volume1` par `volume2` partout dans ce guide.

---

## Étape 4 — Inventer le mot de passe de l'assistant de mise à jour

Le bouton « Mettre à jour » utilise un petit assistant, protégé par un mot de passe que seul StundTransfer connaît.

Invente un mot de passe **long** (au moins 30 caractères), avec seulement des **lettres et des chiffres**, sans espace ni symbole. Par exemple, prends-en un dans un générateur de mots de passe.

Note-le juste le temps de l'étape 5. Tu n'auras plus jamais à le taper.

---

## Étape 5 — Créer le projet dans Container Manager

1. **Container Manager → Projet → Créer**.
2. Nom du projet : `stundtransfer`.
3. Chemin : choisis `docker/stundtransfer`.
4. Source : **Créer un fichier docker-compose.yaml**, puis colle le texte ci-dessous.

```yaml
services:
  stundtransfer:
    image: ghcr.io/stundzow/stundtransfer:latest
    container_name: stundtransfer
    restart: unless-stopped
    ports:
      - 3000:3000
    environment:
      - TRUST_PROXY=true
      # Le compte DSM de l'étape 2 : l'appli trouve son numéro toute seule
      - STUNDTRANSFER_RUN_AS=stundtransfer
      # Ton dossier de rushs, tel que l'appli le voit
      - STUNDTRANSFER_ROOT_DIR=/nas
      - STUNDTRANSFER_ROOT_NAME=Rushs
      # Bouton "Mettre à jour"
      - STUNDTRANSFER_UPDATER_URL=http://stundtransfer-updater:8080/v1/update
      - STUNDTRANSFER_UPDATER_TOKEN=TON_MOT_DE_PASSE_DE_MISE_A_JOUR
      - TZ=Europe/Paris
    volumes:
      - /volume1/docker/stundtransfer/data:/opt/app/backend/data
      - /volume1/docker/stundtransfer/data/images:/opt/app/frontend/public/img
      - "/volume1/Rushs:/nas"
      # Liste des comptes du NAS, en lecture seule (noms et numéros, aucun mot de passe)
      - /etc/passwd:/etc/nas-passwd:ro
    labels:
      # Le seul conteneur que l'assistant a le droit de mettre à jour
      - com.centurylinklabs.watchtower.enable=true

  # Assistant de mise à jour : il dort et n'installe une nouvelle version
  # que quand tu cliques sur "Mettre à jour". Aucun port ouvert.
  stundtransfer-updater:
    image: nickfedor/watchtower:1.19.0
    container_name: stundtransfer-updater
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_HTTP_API_UPDATE=true
      - WATCHTOWER_HTTP_API_TOKEN=TON_MOT_DE_PASSE_DE_MISE_A_JOUR
      - WATCHTOWER_LABEL_ENABLE=true
      - WATCHTOWER_CLEANUP=true
      - TZ=Europe/Paris
```

**Ce que tu dois remplacer :**

| Dans le texte | Remplace par |
|---|---|
| `TON_MOT_DE_PASSE_DE_MISE_A_JOUR` (2 fois) | le mot de passe de l'étape 4, **identique aux deux endroits** |
| `/volume1/Rushs` | **où se trouve** ton dossier de rushs sur le NAS : c'est le seul dossier que l'appli pourra utiliser (les dépôts y arrivent, et « Partager depuis le NAS » choisit dedans). Pour le trouver : File Station → clic droit sur le dossier → **Propriétés** → **Emplacement**. Exemple : un dossier « Mes Rushs » donne `"/volume1/Mes Rushs:/nas"`. Garde les guillemets, et ne change jamais la fin `:/nas` |
| `STUNDTRANSFER_ROOT_NAME=Rushs` | juste **le nom affiché** pour ce dossier dans l'appli (en haut de « Partager depuis le NAS » et de « Dossier de réception »). Ça ne change rien au fonctionnement : mets le nom de ton dossier, ex. `STUNDTRANSFER_ROOT_NAME=Mes Rushs` |

5. Clique sur **Suivant**. À l'écran « Portail web » (Web Station), **ne coche rien**.
6. Coche **Démarrer le projet une fois créé**, puis **Terminé**.

Le NAS télécharge l'appli. Ça prend quelques minutes la première fois. Quand c'est fini, **Container Manager → Conteneur** affiche `stundtransfer` et `stundtransfer-updater` en vert (« En cours d'exécution »).

> 💡 Pour vérifier que tout va bien : **Conteneur → stundtransfer → Journal**. Tu dois y voir `Deposit mode enabled`. Si tu vois `Deposit folders are not usable`, la raison est écrite juste après : c'est presque toujours un droit manquant à l'étape 2.

---

## Étape 6 — Créer ton compte administrateur

1. Trouve l'adresse locale de ton NAS : **Panneau de configuration → Réseau → Interface réseau**, par exemple `192.168.1.20`.
2. Sur un PC de la maison, ouvre `http://ADRESSE_DU_NAS:3000/auth/signUp`.
3. Crée ton compte. **Le premier compte créé est administrateur.**
4. Tout de suite après : **Administration → Paramètres → Sécurité & Accès** → décoche **Autoriser les inscriptions** → **Enregistrer**.

⚠️ Ne saute pas le point 4 : sans lui, n'importe qui pourrait se créer un compte.

---

## Étape 7 — Régler l'appli

Tout se fait dans **Administration**, sans jamais redémarrer :

- **Paramètres → Général** : le nom affiché en haut de la page.
- **Paramètres → Apparence** : ton logo et tes couleurs.
- **Paramètres → StundTransfer** : active **Dépôt public** pour que la page d'accueil accepte les envois sans compte. C'est aussi là que se règlent la taille maximale et l'espace à garder libre.
- **Dossier de réception** : choisis dans quel dossier de `Rushs` arrivent les dépôts. Chaque dépôt crée un dossier « Nom - Vidéo ».

---

## Étape 8 — Rendre le site accessible depuis internet

### 8.1 Une adresse et un certificat (gratuits)

1. **Panneau de configuration → Accès externe → DDNS → Ajouter**.
2. Fournisseur : **Synology**. Nom d'hôte : choisis-en un, par exemple `TONNOM.synology.me`.
3. Coche **Obtenir un certificat de Let's Encrypt et le définir par défaut**.
4. **OK**.

### 8.2 Le proxy inversé : relier l'adresse à l'appli

1. **Panneau de configuration → Portail de connexion → Avancé → Proxy inversé → Créer**.
2. Nom : `StundTransfer`.
3. **Source** : protocole **HTTPS**, nom d'hôte `TONNOM.synology.me`, port **443**.
4. **Destination** : protocole **HTTP**, nom d'hôte `localhost`, port **3000**.
5. **Enregistrer**.

### 8.3 Ouvrir le port sur la box

Dans l'interface de ta box internet (Livebox, Freebox…), crée une **redirection de port** :

- port externe **443** (TCP) → **adresse du NAS**, port **443**.

Si tu as **deux routeurs** (par exemple une box plus un système Wi-Fi comme eero ou Deco), fais la redirection sur **les deux**. La box redirige vers le second routeur, qui redirige vers le NAS.

> ⚠️ N'ouvre **jamais** le port **3000** sur ta box. Tout doit passer par le 443 et le proxy inversé, qui gère le HTTPS.

> 💡 Si DSM n'arrive pas à créer ou renouveler le certificat, ajoute aussi une redirection du port **80** vers le NAS.

### 8.4 Vérifier

1. Sur ton téléphone, **en 4G/5G** (Wi-Fi coupé), ouvre `https://TONNOM.synology.me`. La page d'envoi doit s'afficher avec le cadenas.
2. Dans **Administration → Paramètres → Général → URL de l'appli**, mets `https://TONNOM.synology.me` et enregistre. C'est cette adresse qui sera utilisée dans les liens que tu partages.

Pour ouvrir DSM, utilise ensuite toujours `https://TONNOM.synology.me:5001`.

---

## C'est prêt ! Ce que tu peux faire

| Je veux… | Où ? |
|---|---|
| Recevoir des rushs | Envoie l'adresse `https://TONNOM.synology.me` : la page d'envoi est l'accueil du site |
| Voir ce que j'ai reçu | Administration → **Dépôts reçus** |
| Partager un fichier déjà sur le NAS | Bouton **Partager depuis le NAS** en haut. Aucune copie, le lien n'efface jamais rien |
| Envoyer des fichiers depuis mon PC | Bouton **Partager** en haut. Le lien est copié tout seul à la fin |

> ⚠️ Avec « Partager », les fichiers envoyés sont **supprimés définitivement** quand le lien expire. Tes originaux sur ton PC ne sont pas touchés. Pour garder plus longtemps : choisis « Jamais » comme expiration, ou utilise « Partager depuis le NAS ».

---

## Mettre à jour

**Administration → Mettre à jour → Vérifier → Mettre à jour maintenant.**

L'appli redémarre et revient au bout de 1 à 2 minutes. La page affiche alors « Mise à jour installée ! ». À chaque démarrage, une copie de la base est rangée dans `docker/stundtransfer/data/backups-auto` (les 10 dernières).

⚠️ Ne lance pas une mise à jour pendant qu'un envoi est en cours : le redémarrage le couperait.

---

## Arrêter les e-mails « conteneur arrêté de manière inattendue »

À chaque mise à jour, DSM peut t'envoyer cet e-mail. C'est normal : c'est l'assistant qui remplace l'appli. Pour ne plus le recevoir :

1. **Panneau de configuration → Notification → Règles → Ajouter**. Les règles « All », « Warning » et « Critical » ne se modifient pas, il faut en créer une.
2. Nom : `Alertes sans Container`. Avec la loupe, filtre les niveaux **Avertissement** et **Critique**, coche tout, puis **décoche** l'événement Container Manager « conteneur arrêté de manière inattendue ». Clique sur **Ajouter**.
3. Onglet **E-mail → Profils de destinataire** → ton profil → **Modifier** → Règle : `Alertes sans Container` → **OK** → **Appliquer**.

---

## Astuce : envoyer plus vite depuis la maison

Depuis un PC de la maison, ouvre `http://ADRESSE_DU_NAS:3000` au lieu de l'adresse internet. Tu parles alors directement au NAS, sans passer par la box, et les envois vont plus vite. Les liens que tu crées gardent quand même l'adresse internet.

Ça ne marche **qu'à la maison**. Il faudra te connecter une fois sur cette adresse.

---

## Les règles de sécurité

- 🔒 Les inscriptions restent **désactivées** (étape 6).
- 🔒 Ne donne **jamais** l'accès « Everyone » / « Tout le monde » au dossier des rushs.
- 🔒 N'ouvre **jamais** le port **3000** sur ta box.
- 🔒 N'utilise **jamais** l'image officielle `smp46/pingvin-share-x` à la place de `ghcr.io/stundzow/stundtransfer` : elle efface tous les réglages StundTransfer.

---

## En cas de problème

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| Container Manager dit qu'un chemin n'existe pas | Crée les dossiers de l'étape 3, et vérifie `volume1` / `volume2` et le nom du dossier de rushs |
| `NAS account "stundtransfer" not found` dans le journal | Le compte de l'étape 2 doit s'appeler exactement `stundtransfer`, et la ligne `/etc/passwd:/etc/nas-passwd:ro` doit être dans le projet |
| `Deposit folders are not usable` dans le journal | Donne **Lecture/Écriture** à `stundtransfer` sur le dossier de rushs et sur `docker` (étape 2), puis redémarre le projet |
| Les dépôts échouent avec « droits » ou « permission » | Même chose : les droits de l'utilisateur `stundtransfer` |
| Le site ne s'ouvre pas depuis l'extérieur | Teste d'abord `http://ADRESSE_DU_NAS:3000` à la maison. Si ça marche, vérifie le proxy inversé (8.2) puis les redirections de port (8.3) |
| « Mettre à jour » dit que l'assistant ne répond pas | Vérifie que `stundtransfer-updater` est en vert dans Container Manager, et que le mot de passe est **identique** aux deux endroits du projet |
| N'importe qui peut créer un compte | Administration → Paramètres → Sécurité & Accès → décoche « Autoriser les inscriptions » |

Pour aller plus loin (tous les réglages, revenir à une ancienne version…) : [STUNDTRANSFER.md](STUNDTRANSFER.md).
