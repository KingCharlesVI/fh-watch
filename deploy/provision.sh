#!/usr/bin/env bash
# One-off setup of a fresh Ubuntu 24.04 server for FH Match Centre. Safe to run again.
#
# Copy the repository's deploy/ folder to the server, then as root:
#   bash provision.sh --email you@example.com --repo git@github.com:OWNER/fh-watch.git
#
#   --email     contact address for Let's Encrypt expiry notices
#   --repo      SSH clone URL the server deploys from
#   --skip-tls  set everything up except the HTTPS certificate (e.g. DNS isn't ready yet)
set -euo pipefail

DOMAIN=fhmatchcentre.com
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL=""
REPO=""
SKIP_TLS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:?--email needs a value}"; shift 2 ;;
    --repo) REPO="${2:?--repo needs a value}"; shift 2 ;;
    --skip-tls) SKIP_TLS=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo "This script is for Ubuntu 24.04 (found $PRETTY_NAME)." >&2; exit 1; }
[[ -n $REPO ]] || { echo "--repo is required." >&2; exit 2; }
[[ $SKIP_TLS -eq 1 || -n $EMAIL ]] || { echo "--email is required for the HTTPS certificate (or use --skip-tls)." >&2; exit 2; }
cd /

say "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg git nginx postgresql certbot ufw unattended-upgrades rclone openssl
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
corepack enable

say "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

say "Users and folders"
for u in fh-api fh-web; do
  id "$u" &>/dev/null || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$u"
done
id fh-deploy &>/dev/null || useradd --system --create-home --home-dir /home/fh-deploy --shell /bin/bash fh-deploy
install -d -o root -g root -m 755 /opt/fh /opt/fh/bin /etc/fh /var/www/certbot
install -d -o fh-deploy -g fh-deploy -m 755 /opt/fh/releases /opt/fh/ms-playwright
install -d -o fh-deploy -g fh-deploy -m 700 /home/fh-deploy/.ssh
install -d -o postgres -g postgres -m 700 /var/backups/fh

say "Database and configuration"
role_exists() { runuser -u postgres -- psql -tAc "select 1 from pg_roles where rolname = 'fh'" | grep -q 1; }
if [[ ! -f /etc/fh/api.env ]]; then
  # New secrets; the database role gets the new password whether or not it existed.
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  if role_exists; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qc "alter role fh with login password '$DB_PASSWORD'"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qc "create role fh with login password '$DB_PASSWORD'"
  fi
  sed -e "s|__DB_PASSWORD__|$DB_PASSWORD|" -e "s|__JWT_SECRET__|$JWT_SECRET|" "$HERE/env/api.env" > /etc/fh/api.env
  unset DB_PASSWORD JWT_SECRET
else
  echo "Keeping the existing /etc/fh/api.env."
fi
runuser -u postgres -- psql -tAc "select 1 from pg_database where datname = 'fh'" | grep -q 1 || runuser -u postgres -- createdb -O fh fh

[[ -f /etc/fh/web.env ]] || cp "$HERE/env/web.env" /etc/fh/web.env
[[ -f /etc/fh/backup.env ]] || cp "$HERE/env/backup.env" /etc/fh/backup.env
[[ -f /etc/fh/rclone.conf ]] || touch /etc/fh/rclone.conf
if [[ -f /etc/fh/deploy.env ]]; then
  sed -i "s|^REPO_URL=.*|REPO_URL=$REPO|" /etc/fh/deploy.env
else
  sed "s|__REPO_URL__|$REPO|" "$HERE/env/deploy.env" > /etc/fh/deploy.env
fi
chown root:fh-api /etc/fh/api.env && chmod 640 /etc/fh/api.env
chown root:fh-web /etc/fh/web.env && chmod 640 /etc/fh/web.env
chown root:postgres /etc/fh/backup.env /etc/fh/rclone.conf && chmod 640 /etc/fh/backup.env /etc/fh/rclone.conf
chown root:root /etc/fh/deploy.env && chmod 600 /etc/fh/deploy.env

say "Libraries Chromium needs for PDF reports"
(cd /tmp && npx -y playwright-core@1.63.0 install-deps chromium)

say "Scripts and services"
install -m 755 "$HERE"/bin/* /opt/fh/bin/
install -m 644 "$HERE"/systemd/* /etc/systemd/system/
systemctl daemon-reload
# The app services start with the first deploy; the backup timers start now.
systemctl enable fh-api.service fh-web.service
systemctl enable --now fh-backup.timer fh-restore-test.timer

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
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
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

say "Web server and HTTPS"
install -m 644 "$HERE/nginx/fh-tls.conf" /etc/nginx/snippets/fh-tls.conf
install -m 644 "$HERE/nginx/bootstrap.conf" /etc/nginx/sites-available/fh-bootstrap.conf
install -m 644 "$HERE/nginx/fhmatchcentre.conf" /etc/nginx/sites-available/fhmatchcentre.conf
rm -f /etc/nginx/sites-enabled/default
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx

cert="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [[ ! -f $cert && $SKIP_TLS -eq 0 ]]; then
  rm -f /etc/nginx/sites-enabled/fhmatchcentre.conf
  ln -sf /etc/nginx/sites-available/fh-bootstrap.conf /etc/nginx/sites-enabled/fh-bootstrap.conf
  nginx -t && systemctl reload nginx
  if ! certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" \
      --email "$EMAIL" --agree-tos --no-eff-email --non-interactive; then
    warn "Couldn't get a certificate. Check that $DOMAIN and www.$DOMAIN point at this server's IP address, then run provision.sh again."
    exit 1
  fi
fi
if [[ -f $cert ]]; then
  rm -f /etc/nginx/sites-enabled/fh-bootstrap.conf
  ln -sf /etc/nginx/sites-available/fhmatchcentre.conf /etc/nginx/sites-enabled/fhmatchcentre.conf
  echo "HTTPS is set up for $DOMAIN."
else
  ln -sf /etc/nginx/sites-available/fh-bootstrap.conf /etc/nginx/sites-enabled/fh-bootstrap.conf
  warn "No certificate yet (--skip-tls). Run provision.sh again without --skip-tls once DNS points here."
fi
nginx -t && systemctl reload nginx

say "Done"
cat <<EOF

Next steps:
  1. Add this deploy key to the repository with read-only access
     (GitHub: Settings → Deploy keys → Add deploy key):

$(sed 's/^/     /' /home/fh-deploy/.ssh/id_ed25519.pub)

  2. Deploy a release:        sudo /opt/fh/bin/deploy.sh <tag or branch>
  3. Register on the website, then make yourself admin:
                              sudo /opt/fh/bin/fh-admin you@example.com --verify
  4. Add SMTP details to /etc/fh/api.env when you have them, then: sudo systemctl restart fh-api

See docs/deployment.md for the full runbook.
EOF
