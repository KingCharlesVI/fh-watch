#!/usr/bin/env bash
# One-off setup of a Linux machine for FH Match Centre, behind a Cloudflare Tunnel. Safe to run again.
# For Ubuntu 22.04+ or Debian 12+ (including Raspberry Pi OS 64-bit), on x86-64 or ARM64.
#
# From a clone of the repository, as root:
#   sudo bash deploy/linux/provision.sh --repo git@github.com:OWNER/fh-watch.git
#
#   --repo         SSH clone URL releases are deployed from
#   --skip-tunnel  set everything up except the Cloudflare Tunnel (run `sudo fh tunnel` later)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(dirname "$HERE")"
NODE_MAJOR=24
PLAYWRIGHT_VERSION=1.63.0   # match api/package.json
REPO=""
SKIP_TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:?--repo needs a value}"; shift 2 ;;
    --skip-tunnel) SKIP_TUNNEL=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }
[[ -n $REPO ]] || { echo "--repo is required." >&2; exit 2; }
# shellcheck source=/dev/null
. /etc/os-release
[[ " $ID ${ID_LIKE:-} " == *" debian "* || " $ID ${ID_LIKE:-} " == *" ubuntu "* ]] ||
  { echo "This script is for Ubuntu or Debian (found $PRETTY_NAME)." >&2; exit 1; }
ARCH="$(dpkg --print-architecture)"
[[ $ARCH == amd64 || $ARCH == arm64 ]] || { echo "Needs a 64-bit system (amd64 or arm64), found $ARCH." >&2; exit 1; }
cd /

say "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg git postgresql ufw unattended-upgrades rclone openssl
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt $NODE_MAJOR ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -yq nodejs
fi
corepack enable
if ! command -v cloudflared >/dev/null; then
  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q
  apt-get install -yq cloudflared
fi

say "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

say "Never sleep"
# A laptop or desktop acting as a server must stay awake, lid closed or not.
systemctl mask --quiet sleep.target suspend.target hibernate.target hybrid-sleep.target

say "Users and folders"
for u in fh-api fh-web fh-tunnel; do
  id "$u" &>/dev/null || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$u"
done
id fh-deploy &>/dev/null || useradd --system --user-group --create-home --home-dir /home/fh-deploy --shell /bin/bash fh-deploy
install -d -o root -g root -m 755 /opt/fh /opt/fh/bin /etc/fh
install -d -o fh-deploy -g fh-deploy -m 755 /opt/fh/releases /opt/fh/ms-playwright
install -d -o fh-deploy -g fh-deploy -m 700 /home/fh-deploy/.ssh
install -d -o root -g root -m 700 /var/backups/fh

say "Database and configuration"
psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtA "$@"; }
if [[ ! -f /etc/fh/api.env ]]; then
  # New secrets; the database role gets the new password whether or not it existed.
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  if [[ "$(psql_admin -c "select 1 from pg_roles where rolname = 'fh'")" == 1 ]]; then
    psql_admin -c "alter role fh with login password '$DB_PASSWORD'"
  else
    psql_admin -c "create role fh with login password '$DB_PASSWORD'"
  fi
  sed -e "s|__DB_PASSWORD__|$DB_PASSWORD|" -e "s|__DB_PORT__|5432|" -e "s|__JWT_SECRET__|$JWT_SECRET|" \
    -e "s|__PDF_CACHE_DIR__|/var/cache/fh-api/pdf|" -e "s|__PLAYWRIGHT_DIR__|/opt/fh/ms-playwright|" \
    "$DEPLOY/env/api.env" > /etc/fh/api.env
  unset DB_PASSWORD JWT_SECRET
else
  echo "Keeping the existing /etc/fh/api.env."
fi
# The live database, and a scratch one of the same owner for the weekly restore test.
for db in fh fh_restore_test; do
  [[ "$(psql_admin -c "select 1 from pg_database where datname = '$db'")" == 1 ]] || runuser -u postgres -- createdb -O fh "$db"
done

[[ -f /etc/fh/web.env ]] || cp "$DEPLOY/env/web.env" /etc/fh/web.env
[[ -f /etc/fh/rclone.conf ]] || touch /etc/fh/rclone.conf
if [[ -f /etc/fh/fh.env ]]; then
  sed -i "s|^REPO_URL=.*|REPO_URL=$REPO|" /etc/fh/fh.env
else
  sed -e "s|__REPO_URL__|$REPO|" -e "s|__RCLONE_CONFIG__|/etc/fh/rclone.conf|" -e "s|__PG_BIN__||" -e "s|__CLOUDFLARED__||" \
    "$DEPLOY/env/fh.env" > /etc/fh/fh.env
fi
chown root:fh-api /etc/fh/api.env && chmod 640 /etc/fh/api.env
chown root:fh-web /etc/fh/web.env && chmod 640 /etc/fh/web.env
chown root:root /etc/fh/fh.env /etc/fh/rclone.conf && chmod 600 /etc/fh/fh.env /etc/fh/rclone.conf

say "Libraries Chromium needs for PDF reports"
(cd /tmp && npx -y "playwright-core@$PLAYWRIGHT_VERSION" install-deps chromium)

say "The fh command and services"
install -m 755 "$DEPLOY/fh.mjs" /opt/fh/bin/fh.mjs
install -m 755 "$HERE/fh" /opt/fh/bin/fh
ln -sfn /opt/fh/bin/fh /usr/local/bin/fh
install -m 644 "$HERE"/systemd/* /etc/systemd/system/
systemctl daemon-reload
# The app services start with the first deploy, the tunnel once `fh tunnel` has run; the timers start now.
systemctl enable --quiet fh-api.service fh-web.service fh-tunnel.service
systemctl enable --quiet --now fh-backup.timer fh-restore-test.timer

say "Deploy key"
if [[ ! -f /home/fh-deploy/.ssh/id_ed25519 ]]; then
  runuser -u fh-deploy -- ssh-keygen -q -t ed25519 -N "" -C "fh-deploy@$(hostname)" -f /home/fh-deploy/.ssh/id_ed25519
fi
host="$(sed -E 's#^(ssh://)?([^@]+@)?([^:/]+).*#\3#' <<<"$REPO")"
if [[ -n $host ]] && ! runuser -u fh-deploy -- ssh-keygen -F "$host" -f /home/fh-deploy/.ssh/known_hosts &>/dev/null; then
  ssh-keyscan -t ed25519 "$host" 2>/dev/null >> /home/fh-deploy/.ssh/known_hosts
  chown fh-deploy:fh-deploy /home/fh-deploy/.ssh/known_hosts
fi

say "Firewall"
# Only SSH comes in. The tunnel connects out to Cloudflare, so no web ports are opened.
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
ufw status

say "SSH"
if [[ -s /root/.ssh/authorized_keys ]] || grep -qs . /home/*/.ssh/authorized_keys; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/10-fh.conf
  systemctl reload ssh
  echo "Password logins are off; SSH keys only."
else
  warn "No SSH keys found, so password logins are left on. Add your key to ~/.ssh/authorized_keys and run this again."
fi

if [[ -f /etc/fh/tunnel.yml ]]; then
  say "Cloudflare Tunnel"
  echo "Already set up. Run 'sudo fh tunnel' again to reconnect it or repair the DNS records."
  systemctl restart fh-tunnel
elif [[ $SKIP_TUNNEL -eq 0 ]]; then
  /opt/fh/bin/fh tunnel || warn "The tunnel isn't set up yet. Fix the problem above, then run: sudo fh tunnel"
fi

say "Done"
cat <<EOF

Next steps:
  1. Add this deploy key to the repository with read-only access
     (GitHub: Settings → Deploy keys → Add deploy key):

$(sed 's/^/     /' /home/fh-deploy/.ssh/id_ed25519.pub)

  2. Deploy a release:        sudo fh deploy <tag or branch>
  3. Register on the website, then make yourself admin:
                              sudo fh admin you@example.com --verify
  4. Add SMTP details to /etc/fh/api.env when you have them, then: sudo systemctl restart fh-api

See docs/deployment.md for the full runbook.
EOF
