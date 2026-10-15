# If we aren't running as root, just exec the CMD
[ "$(id -u)" -ne 0 ] && exec "$@"

echo "Creating user and group..."

# StundTransfer: run as a NAS account given by its name, so that nobody has to
# look up its number. Needs the NAS list of accounts, mounted read-only:
#   - /etc/passwd:/etc/nas-passwd:ro   and   STUNDTRANSFER_RUN_AS=stundtransfer
# (PUID/PGID, when set, still win)
if [ -n "$STUNDTRANSFER_RUN_AS" ] && [ -z "$PUID" ]; then
    nas_uid=""
    [ -r /etc/nas-passwd ] && nas_uid=$(awk -F: -v name="$STUNDTRANSFER_RUN_AS" '$1 == name { print $3; exit }' /etc/nas-passwd)
    case "$nas_uid" in *[!0-9]*) nas_uid="" ;; esac
    if [ -z "$nas_uid" ]; then
        echo "StundTransfer: NAS account \"$STUNDTRANSFER_RUN_AS\" not found (is /etc/passwd mounted at /etc/nas-passwd?)"
        exit 1
    fi
    echo "StundTransfer: running as the NAS account $STUNDTRANSFER_RUN_AS ($nas_uid)"
    PUID=$nas_uid
    # Same number for the group: 100 ("users" on the NAS) is taken in the image
    PGID=${PGID:-$nas_uid}
fi

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Check if the group with PGID exists; if not, create it
if ! getent group pingvin-share-group > /dev/null 2>&1; then
    addgroup -g "$PGID" pingvin-share-group
fi

# Check if a user with PUID exists; if not, create it
if ! id -u pingvin-share > /dev/null 2>&1; then
    if ! getent passwd "$PUID" > /dev/null 2>&1; then
        adduser -u "$PUID" -G pingvin-share-group pingvin-share > /dev/null 2>&1
    else
        # If a user with the PUID already exists, use that user
        existing_user=$(getent passwd "$PUID" | cut -d: -f1)
        echo "Using existing user: $existing_user"
    fi
fi

# Change ownership of the data directory
mkdir -p /opt/app/backend/data
find /opt/app/backend/data \( ! -group "${PGID}" -o ! -user "${PUID}" \) -exec chown "${PUID}:${PGID}" {} +
# Change ownership of the frontend public directory
find /opt/app/frontend/public \( ! -group "${PGID}" -o ! -user "${PUID}" \) -exec chown "${PUID}:${PGID}" {} +

# Switch to the non-root user
exec su-exec "$PUID:$PGID" "$@"