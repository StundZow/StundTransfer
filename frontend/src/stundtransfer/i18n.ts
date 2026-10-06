// StundTransfer: texts of the deposit mode. Merged into every language in
// i18n/locales.ts (languages other than French fall back to English).
const english: Record<string, string> = {
  "stundtransfer.page.title": "Drop files",
  "stundtransfer.footer.powered-by": "Powered by",
  "stundtransfer.guest.closed.title": "No drop open",
  "stundtransfer.guest.closed.description":
    "There is no open drop right now. If someone sent you a link, open it directly.",
  "stundtransfer.error.stund_public_disabled":
    "Drops are closed right now. Try again later or ask for a drop link.",

  "admin.config.category.stundtransfer": "StundTransfer",
  "admin.config.stundtransfer.public-deposit": "Public drop",
  "admin.config.stundtransfer.public-deposit.description":
    "Visitors of the home page can drop files directly, without an account or a link. Anyone who knows the address can then send files.",
  "admin.config.stundtransfer.max-deposit-size": "Maximum size per drop",
  "admin.config.stundtransfer.max-deposit-size.description":
    "For the public drop. Drop links (reverse shares) keep their own limit.",
  "admin.config.stundtransfer.parallel-uploads": "Parts sent at the same time",
  "admin.config.stundtransfer.parallel-uploads.description":
    "Parts of files each browser sends in parallel (1 to 16). 6 is the best value measured on a hard disk NAS.",
  "admin.config.stundtransfer.min-free-space": "Space to keep free",
  "admin.config.stundtransfer.min-free-space.description":
    "A drop is refused if it would leave less free space than this on the NAS.",
  "admin.config.stundtransfer.abandon-after": "Delete unfinished drops after",
  "admin.config.stundtransfer.abandon-after.description":
    "An upload with no activity for this long is deleted from the \"in progress\" folder. Received files are never touched.",
  "stundtransfer.admin.card": "Received drops",
  "stundtransfer.admin.send-files": "Send files",
  "stundtransfer.admin.official-update": "New Pingvin version: ask Claude to merge it",
  "stundtransfer.admin.my-links": "My share links",
  "stundtransfer.admin.theme": "Colors and theme",
  "admin.config.stundtransfer.uploader-placeholder": 'Example for "Who are you?"',
  "admin.config.stundtransfer.uploader-placeholder.description":
    "Grey text shown in the empty field. Leave empty for the default text.",
  "admin.config.stundtransfer.video-placeholder": 'Example for "Which video is it for?"',
  "admin.config.stundtransfer.video-placeholder.description":
    "Grey text shown in the empty field. Leave empty for the default text.",
  "stundtransfer.destination.title": "Destination folder",
  "stundtransfer.destination.current": "Drops arrive in:",
  "stundtransfer.destination.change": "Change",
  "stundtransfer.destination.choose": "Choose this folder",
  "stundtransfer.destination.chosen": "Drops will now arrive in {folder}",
  "stundtransfer.destination.new-folder": "New folder",
  "stundtransfer.destination.new-folder.label": "Folder name",
  "stundtransfer.destination.create": "Create",
  "stundtransfer.destination.empty": "No sub-folder here.",
  "stundtransfer.destination.help":
    "Only the folders of \"{root}\" are visible: it is the folder shared with StundTransfer in compose.yaml. Each drop creates its own folder \"Name - Video\" inside the chosen folder.",
  "admin.config.stundtransfer.group-deposits": "Group drops with the same name",
  "admin.config.stundtransfer.group-deposits.description":
    "Off: each drop gets its own folder (\"Litsu - Beamng\", then \"Litsu - Beamng (2)\"...). On: drops with the same name and video go into the same folder.",
  "admin.config.stundtransfer.classic-sharing": "Classic sharing",
  "admin.config.stundtransfer.classic-sharing.description":
    "Shows the upload page and the share menu in the header for administrators. Off: administrators send files and manage their links from the Administration page. Only administrators can create share links.",

  "stundtransfer.form.title": "Send your files",
  "stundtransfer.form.subtitle":
    "Tell us who you are and which video it is for, then add your files or folders.",
  "stundtransfer.form.uploader.label": "Who are you?",
  "stundtransfer.form.uploader.placeholder": "e.g. Stund",
  "stundtransfer.form.video.label": "Which video is it for?",
  "stundtransfer.form.video.placeholder": "e.g. Beamng",
  "stundtransfer.form.missing-fields": "Fill in both fields to send",

  "stundtransfer.dropzone.title": "Drop your files or folders here",
  "stundtransfer.dropzone.description":
    "or click to choose files. Maximum size: {maxSize}.",
  "stundtransfer.dropzone.folder": "Choose a folder",

  "stundtransfer.files.summary":
    "{count, plural, one {# file} other {# files}} · {size}",
  "stundtransfer.files.more": "… and {count} more",
  "stundtransfer.files.clear": "Remove all",
  "stundtransfer.files.rename": "Rename",
  "stundtransfer.files.revert": "Restore the original name",
  "stundtransfer.files.ignored":
    "{count, plural, one {# system file ignored} other {# system files ignored}} (.DS_Store, Thumbs.db…)",
  "stundtransfer.files.duplicate": "Already added: {name}",
  "stundtransfer.files.too-big":
    "Too big: this link accepts {maxSize} at most.",

  "stundtransfer.button.send": "Send",

  "stundtransfer.upload.preparing": "Preparing the upload…",
  "stundtransfer.upload.title": "Uploading…",
  "stundtransfer.upload.keep-open":
    "Keep this page open until the end. If the connection drops, the upload resumes by itself.",
  "stundtransfer.upload.progress": "{sent} of {total}",
  "stundtransfer.upload.speed": "{speed}/s",
  "stundtransfer.upload.eta": "Time left: {eta}",
  "stundtransfer.upload.files": "{done} / {total} files done",
  "stundtransfer.upload.reconnecting":
    "Connection lost, retrying automatically…",
  "stundtransfer.upload.finishing": "Finishing…",
  "stundtransfer.upload.cancel": "Cancel upload",
  "stundtransfer.upload.cancel.confirm.title": "Cancel the upload?",
  "stundtransfer.upload.cancel.confirm.description":
    "What was already sent will be deleted from the server. You can start again afterwards.",
  "stundtransfer.upload.cancel.confirm.yes": "Yes, cancel",
  "stundtransfer.upload.cancel.confirm.no": "Keep uploading",
  "stundtransfer.upload.cancelled": "Upload cancelled.",
  "stundtransfer.upload.confirm-leave":
    "The upload is not finished. If you leave, you can resume it later by dropping the same files again.",

  "stundtransfer.done.title": "✅ Received, thank you!",
  "stundtransfer.done.description":
    "{count, plural, one {Your file arrived safely} other {Your # files arrived safely}} ({size}).",
  "stundtransfer.done.again": "Send more files",

  "stundtransfer.resume.title": "An upload was interrupted",
  "stundtransfer.resume.description":
    "{uploader} / {video}: {received} of {total} already received. Drop the same files or folders again to resume where it stopped.",
  "stundtransfer.resume.matched": "{matched} / {needed} files found",
  "stundtransfer.resume.missing": "Still missing: {names}",
  "stundtransfer.resume.button": "Resume upload",
  "stundtransfer.resume.abandon": "Give up and start over",

  "stundtransfer.error.title": "The upload could not continue",
  "stundtransfer.error.retry": "Try again",
  "stundtransfer.error.stund_link_invalid":
    "This drop link is no longer valid (expired or already used). Ask for a new link.",
  "stundtransfer.error.stund_too_large": "Too big for this link.",
  "stundtransfer.error.stund_not_enough_space":
    "The server is running out of space. Let the person who sent you the link know.",
  "stundtransfer.error.stund_invalid_names":
    'Fill in "Who are you?" and "Which video is it for?".',
  "stundtransfer.error.stund_storage_unavailable":
    "The drop server is not available right now. Try again later.",
  "stundtransfer.error.stund_not_uploading":
    "This upload is already finished or was cancelled.",
  "stundtransfer.error.file-read":
    'Cannot read "{name}". The drive or card may have been unplugged. Plug it back in and drop the files again to resume.',
  "stundtransfer.error.unknown":
    "Something unexpected happened. Reload the page: the upload will resume where it stopped.",

  "stundtransfer.admin.title": "Received deposits",
  "stundtransfer.admin.button": "Received deposits",
  "stundtransfer.admin.empty": "No deposit yet.",
  "stundtransfer.admin.when": "When",
  "stundtransfer.admin.who": "Who",
  "stundtransfer.admin.video": "Video",
  "stundtransfer.admin.files": "Files",
  "stundtransfer.admin.size": "Size",
  "stundtransfer.admin.folder": "Folder",
  "stundtransfer.admin.status": "Status",
  "stundtransfer.admin.status.UPLOADING": "Uploading",
  "stundtransfer.admin.status.MOVING": "Storing",
  "stundtransfer.admin.status.DONE": "OK",
  "stundtransfer.admin.status.ERROR": "Error",
  "stundtransfer.admin.status.ABANDONED": "Abandoned",
  "stundtransfer.admin.retry": "Retry storing",
  "stundtransfer.admin.retry.done": "Storing started again",
  "stundtransfer.admin.remove": "Remove",
  "stundtransfer.admin.remove.confirm.title": "Remove this deposit?",
  "stundtransfer.admin.remove.confirm.pending":
    "The files of this deposit that are still waiting on the server will be deleted. Files already stored in the transfer folder are not touched.",
  "stundtransfer.admin.remove.confirm.history":
    "The deposit is removed from this history. Its files in the transfer folder are not touched.",
  "stundtransfer.admin.details": "Details",
  "stundtransfer.admin.file.original": "Sent as",
  "stundtransfer.admin.file.final": "Stored as",
  "stundtransfer.admin.error.cancelled-uploader": "Cancelled by the sender",
  "stundtransfer.admin.error.cancelled-admin": "Cancelled by you",
  "stundtransfer.admin.error.inactive": "Abandoned: no activity for {hours} hours",
};

const french: Record<string, string> = {
  "stundtransfer.page.title": "Déposer des fichiers",
  "stundtransfer.footer.powered-by": "Propulsé par",
  "stundtransfer.guest.closed.title": "Aucun dépôt ouvert",
  "stundtransfer.guest.closed.description":
    "Il n'y a pas de dépôt ouvert pour le moment. Si on t'a envoyé un lien, ouvre-le directement.",
  "stundtransfer.error.stund_public_disabled":
    "Les dépôts sont fermés pour le moment. Réessaie plus tard ou demande un lien de dépôt.",

  "admin.config.category.stundtransfer": "StundTransfer",
  "admin.config.stundtransfer.public-deposit": "Dépôt public",
  "admin.config.stundtransfer.public-deposit.description":
    "Les visiteurs de la page d'accueil peuvent déposer directement, sans compte ni lien. Toute personne qui connaît l'adresse peut alors envoyer des fichiers.",
  "admin.config.stundtransfer.max-deposit-size": "Taille maximale par dépôt",
  "admin.config.stundtransfer.max-deposit-size.description":
    "Pour le dépôt public. Les liens de dépôt (partages inversés) gardent leur propre limite.",
  "admin.config.stundtransfer.parallel-uploads": "Morceaux envoyés en même temps",
  "admin.config.stundtransfer.parallel-uploads.description":
    "Nombre de morceaux que chaque navigateur envoie en parallèle (1 à 16). 6 est la meilleure valeur mesurée sur un NAS à disques durs.",
  "admin.config.stundtransfer.min-free-space": "Espace à garder libre",
  "admin.config.stundtransfer.min-free-space.description":
    "Un dépôt est refusé s'il laissait moins d'espace libre que ça sur le NAS.",
  "admin.config.stundtransfer.abandon-after": "Supprimer les envois inachevés après",
  "admin.config.stundtransfer.abandon-after.description":
    "Un envoi sans activité depuis ce délai est supprimé du dossier « en cours ». Les fichiers reçus ne sont jamais touchés.",
  "stundtransfer.admin.card": "Dépôts reçus",
  "stundtransfer.admin.send-files": "Envoyer des fichiers",
  "stundtransfer.admin.official-update": "Nouvelle version Pingvin : demande à Claude de l'intégrer",
  "stundtransfer.admin.my-links": "Mes liens de partage",
  "stundtransfer.admin.theme": "Couleurs et thème",
  "admin.config.stundtransfer.uploader-placeholder": "Exemple pour « Qui es-tu ? »",
  "admin.config.stundtransfer.uploader-placeholder.description":
    "Texte gris affiché dans le champ vide. Laisse vide pour le texte par défaut.",
  "admin.config.stundtransfer.video-placeholder": "Exemple pour « Pour quelle vidéo ? »",
  "admin.config.stundtransfer.video-placeholder.description":
    "Texte gris affiché dans le champ vide. Laisse vide pour le texte par défaut.",
  "stundtransfer.destination.title": "Dossier de réception",
  "stundtransfer.destination.current": "Les dépôts arrivent dans :",
  "stundtransfer.destination.change": "Changer",
  "stundtransfer.destination.choose": "Choisir ce dossier",
  "stundtransfer.destination.chosen": "Les dépôts arriveront maintenant dans {folder}",
  "stundtransfer.destination.new-folder": "Nouveau dossier",
  "stundtransfer.destination.new-folder.label": "Nom du dossier",
  "stundtransfer.destination.create": "Créer",
  "stundtransfer.destination.empty": "Aucun sous-dossier ici.",
  "stundtransfer.destination.help":
    "Seuls les dossiers de « {root} » sont visibles : c'est le dossier partagé avec StundTransfer dans le compose.yaml. Chaque dépôt crée son propre dossier « Nom - Vidéo » dans le dossier choisi.",
  "admin.config.stundtransfer.group-deposits": "Regrouper les dépôts du même nom",
  "admin.config.stundtransfer.group-deposits.description":
    "Désactivé : chaque dépôt a son propre dossier (« Litsu - Beamng », puis « Litsu - Beamng (2) »…). Activé : les dépôts avec le même nom et la même vidéo vont dans le même dossier.",
  "admin.config.stundtransfer.classic-sharing": "Partage classique",
  "admin.config.stundtransfer.classic-sharing.description":
    "Affiche « Téléverser » et le menu des partages dans la barre du haut pour les administrateurs. Désactivé : les administrateurs envoient des fichiers et gèrent leurs liens depuis la page Administration. Seuls les administrateurs peuvent créer des liens de partage.",

  "stundtransfer.form.title": "Envoie tes fichiers",
  "stundtransfer.form.subtitle":
    "Indique qui tu es et pour quelle vidéo, puis ajoute tes fichiers ou dossiers.",
  "stundtransfer.form.uploader.label": "Qui es-tu ?",
  "stundtransfer.form.uploader.placeholder": "ex. Stund",
  "stundtransfer.form.video.label": "Pour quelle vidéo ?",
  "stundtransfer.form.video.placeholder": "ex. Beamng",
  "stundtransfer.form.missing-fields": "Remplis les deux champs pour envoyer",

  "stundtransfer.dropzone.title": "Glisse tes fichiers ou dossiers ici",
  "stundtransfer.dropzone.description":
    "ou clique pour choisir des fichiers. Taille maximale : {maxSize}.",
  "stundtransfer.dropzone.folder": "Choisir un dossier",

  "stundtransfer.files.summary":
    "{count, plural, one {# fichier} other {# fichiers}} · {size}",
  "stundtransfer.files.more": "… et {count} autres",
  "stundtransfer.files.clear": "Tout retirer",
  "stundtransfer.files.rename": "Renommer",
  "stundtransfer.files.revert": "Remettre le nom d'origine",
  "stundtransfer.files.ignored":
    "{count, plural, one {# fichier système ignoré} other {# fichiers système ignorés}} (.DS_Store, Thumbs.db…)",
  "stundtransfer.files.duplicate": "Déjà ajouté : {name}",
  "stundtransfer.files.too-big":
    "C'est trop lourd : ce lien accepte {maxSize} au maximum.",

  "stundtransfer.button.send": "Envoyer",

  "stundtransfer.upload.preparing": "Préparation de l'envoi…",
  "stundtransfer.upload.title": "Envoi en cours…",
  "stundtransfer.upload.keep-open":
    "Laisse cette page ouverte jusqu'à la fin. En cas de coupure, l'envoi reprend tout seul.",
  "stundtransfer.upload.progress": "{sent} sur {total}",
  "stundtransfer.upload.speed": "{speed}/s",
  "stundtransfer.upload.eta": "Temps restant : {eta}",
  "stundtransfer.upload.files": "{done} / {total} fichiers terminés",
  "stundtransfer.upload.reconnecting":
    "Connexion perdue, nouvelle tentative automatique…",
  "stundtransfer.upload.finishing": "Finalisation…",
  "stundtransfer.upload.cancel": "Annuler l'envoi",
  "stundtransfer.upload.cancel.confirm.title": "Annuler l'envoi ?",
  "stundtransfer.upload.cancel.confirm.description":
    "Ce qui a déjà été envoyé sera supprimé du serveur. Tu pourras recommencer ensuite.",
  "stundtransfer.upload.cancel.confirm.yes": "Oui, annuler",
  "stundtransfer.upload.cancel.confirm.no": "Continuer l'envoi",
  "stundtransfer.upload.cancelled": "Envoi annulé.",
  "stundtransfer.upload.confirm-leave":
    "L'envoi n'est pas terminé. Si tu quittes, tu pourras le reprendre plus tard en redéposant les mêmes fichiers.",

  "stundtransfer.done.title": "✅ Reçu, merci !",
  "stundtransfer.done.description":
    "{count, plural, one {Ton fichier est bien arrivé} other {Tes # fichiers sont bien arrivés}} ({size}).",
  "stundtransfer.done.again": "Envoyer d'autres fichiers",

  "stundtransfer.resume.title": "Un envoi a été interrompu",
  "stundtransfer.resume.description":
    "{uploader} / {video} : {received} sur {total} déjà reçus. Redépose les mêmes fichiers ou dossiers pour reprendre là où ça s'est arrêté.",
  "stundtransfer.resume.matched": "{matched} / {needed} fichiers retrouvés",
  "stundtransfer.resume.missing": "Il manque encore : {names}",
  "stundtransfer.resume.button": "Reprendre l'envoi",
  "stundtransfer.resume.abandon": "Abandonner et recommencer",

  "stundtransfer.error.title": "L'envoi n'a pas pu continuer",
  "stundtransfer.error.retry": "Réessayer",
  "stundtransfer.error.stund_link_invalid":
    "Ce lien de dépôt n'est plus valable (expiré ou déjà utilisé). Demande un nouveau lien.",
  "stundtransfer.error.stund_too_large": "C'est trop lourd pour ce lien.",
  "stundtransfer.error.stund_not_enough_space":
    "Le serveur n'a plus assez de place. Préviens la personne qui t'a envoyé le lien.",
  "stundtransfer.error.stund_invalid_names":
    "Remplis « Qui es-tu ? » et « Pour quelle vidéo ? ».",
  "stundtransfer.error.stund_storage_unavailable":
    "Le serveur de dépôt n'est pas disponible pour le moment. Réessaie plus tard.",
  "stundtransfer.error.stund_not_uploading":
    "Cet envoi est déjà terminé ou a été annulé.",
  "stundtransfer.error.file-read":
    "Impossible de lire « {name} ». Le disque ou la carte a peut-être été débranché. Rebranche-le et redépose les fichiers pour reprendre.",
  "stundtransfer.error.unknown":
    "Une erreur inattendue est survenue. Recharge la page : l'envoi reprendra là où il s'était arrêté.",

  "stundtransfer.admin.title": "Dépôts reçus",
  "stundtransfer.admin.button": "Dépôts reçus",
  "stundtransfer.admin.empty": "Aucun dépôt pour l'instant.",
  "stundtransfer.admin.when": "Quand",
  "stundtransfer.admin.who": "Qui",
  "stundtransfer.admin.video": "Vidéo",
  "stundtransfer.admin.files": "Fichiers",
  "stundtransfer.admin.size": "Taille",
  "stundtransfer.admin.folder": "Dossier",
  "stundtransfer.admin.status": "Statut",
  "stundtransfer.admin.status.UPLOADING": "En cours",
  "stundtransfer.admin.status.MOVING": "Rangement",
  "stundtransfer.admin.status.DONE": "OK",
  "stundtransfer.admin.status.ERROR": "Erreur",
  "stundtransfer.admin.status.ABANDONED": "Abandonné",
  "stundtransfer.admin.retry": "Réessayer le rangement",
  "stundtransfer.admin.retry.done": "Rangement relancé",
  "stundtransfer.admin.remove": "Supprimer",
  "stundtransfer.admin.remove.confirm.title": "Supprimer ce dépôt ?",
  "stundtransfer.admin.remove.confirm.pending":
    "Les fichiers de ce dépôt encore en attente sur le serveur seront supprimés. Les fichiers déjà rangés dans le dossier transfer ne sont pas touchés.",
  "stundtransfer.admin.remove.confirm.history":
    "Le dépôt est retiré de cet historique. Ses fichiers dans le dossier transfer ne sont pas touchés.",
  "stundtransfer.admin.details": "Détails",
  "stundtransfer.admin.file.original": "Envoyé sous le nom",
  "stundtransfer.admin.file.final": "Rangé sous",
  "stundtransfer.admin.error.cancelled-uploader": "Annulé par l'expéditeur",
  "stundtransfer.admin.error.cancelled-admin": "Annulé par toi",
  "stundtransfer.admin.error.inactive": "Abandonné : aucune activité depuis {hours} heures",
};

const stundTransferMessages: Record<string, Record<string, string>> = {
  "en-US": english,
  "fr-FR": french,
};

/** Pingvin texts replaced by simpler ones (applied over the upstream translations). */
export const upstreamOverrides: Record<string, Record<string, string>> = {
  "en-US": {
    "upload.dropzone.title": "Drag and drop your files or folders here to share them",
    "upload.dropzone.description.desktop":
      "Click or drop your files here. Use the button below for a whole folder, or press {shortcut} to paste text. Up to {maxSize} in total.",
    "upload.dropzone.description.desktop.no-folder":
      "Click or drop your files here, or press {shortcut} to paste text. Up to {maxSize} in total.",
    "upload.dropzone.description.mobile":
      "Tap here to pick files, photos or videos. Use the button below for a whole folder. Up to {maxSize} in total.",
    "upload.dropzone.description.mobile.no-folder":
      "Tap here to pick files, photos or videos. Up to {maxSize} in total.",
  },
  "fr-FR": {
    "upload.dropzone.title": "Glisse-dépose tes fichiers ou dossiers ici pour les partager",
    "upload.dropzone.description.desktop":
      "Clique ou glisse tes fichiers ici. Pour un dossier entier, utilise le bouton ci-dessous. {shortcut} colle du texte depuis le presse-papiers. Jusqu'à {maxSize} au total.",
    "upload.dropzone.description.desktop.no-folder":
      "Clique ou glisse tes fichiers ici. {shortcut} colle du texte depuis le presse-papiers. Jusqu'à {maxSize} au total.",
    "upload.dropzone.description.mobile":
      "Touche ici pour choisir des fichiers, photos ou vidéos. Pour un dossier entier, utilise le bouton ci-dessous. Jusqu'à {maxSize} au total.",
    "upload.dropzone.description.mobile.no-folder":
      "Touche ici pour choisir des fichiers, photos ou vidéos. Jusqu'à {maxSize} au total.",
    "upload.button.folder": "Choisir un dossier",
    "upload.button.folder.append": "Ajouter un dossier",
  },
};

export default stundTransferMessages;
