# Deploying FH Match Centre

Everything runs on one Ubuntu 24.04 server: nginx in front, the API and website as systemd services, PostgreSQL on the same machine. There are no containers. The files live in [`deploy/`](../deploy).

## Before you start

| You need | Notes |
| --- | --- |
| A server | Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 40 GB disk (e.g. Hetzner CX22 or a DigitalOcean 4 GB droplet). You must be able to SSH in as root with a key. |
| DNS for fhmatchcentre.com | At your domain registrar, add **A** records for `fhmatchcentre.com` and `www.fhmatchcentre.com` pointing at the server's IPv4 address (and **AAAA** records for its IPv6 address, if it has one). Allow up to an hour to spread. |
| The repository on GitHub | The server clones releases from it using a read-only deploy key. |
| An email provider (can wait) | Without one, sign-up confirmations and password resets are only written to the API log, so nobody else can register. See [Email](#email). |

## 1. Provision the server (once)

From your computer, in the repository folder:

```sh
scp -r deploy root@SERVER_IP:/root/fh-deploy
ssh root@SERVER_IP "bash /root/fh-deploy/provision.sh --email you@example.com --repo git@github.com:KingCharlesVI/fh-watch.git"
```

This takes about 5 minutes. It:

- installs Node 22, PostgreSQL 16, nginx, certbot and security updates
- creates the `fh-api`, `fh-web` and `fh-deploy` users
- creates the `fh` database, with a random password
- writes `/etc/fh/*.env`, including a random JWT secret
- turns on the firewall (SSH, HTTP and HTTPS only)
- switches SSH to keys only, if it finds a key
- gets the HTTPS certificate
- installs the services and the nightly backup timer

If DNS isn't pointing at the server yet, run it with `--skip-tls`, then run it again without that flag once DNS has spread. Running `provision.sh` again is always safe: it keeps existing secrets and configuration.

At the end it prints a **deploy key**. In GitHub, open the repository's **Settings → Deploy keys → Add deploy key**, paste the key and leave write access off.

## 2. Deploy

Tag the release on your computer and push it:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Then deploy it on the server:

```sh
ssh root@SERVER_IP "/opt/fh/bin/deploy.sh v0.1.0"
```

`deploy.sh` clones the tag into `/opt/fh/releases/<time>-<tag>`, then:

1. installs dependencies and builds everything as `fh-deploy`
2. installs Chromium for PDF reports
3. runs the database migrations
4. points `/opt/fh/current` at the new release and restarts both services
5. checks both services answer

If they don't answer, it switches back to the previous release and prints the logs. If it fails before the switch, the live site is untouched. The last 5 releases are kept.

A branch name works in place of a tag (e.g. `deploy.sh main`), but tags make it clear what's running.

## 3. Create the first admin

1. Register on https://fhmatchcentre.com/register.
2. Make that account an admin:

   ```sh
   ssh root@SERVER_IP "/opt/fh/bin/fh-admin you@example.com --verify"
   ```

   `--verify` also confirms your email address, so you can sign in before email is set up. From then on, use **Admin → Users** on the website to manage roles.

## Email

Pick a transactional email provider, e.g. Postmark, Resend, Mailgun or Amazon SES. Then:

1. **Verify the domain with the provider.** Add the DNS records it gives you (SPF, DKIM, and ideally a DMARC record) at your registrar. Without them, mail from `no-reply@fhmatchcentre.com` lands in spam.
2. **Add the SMTP URL** to `/etc/fh/api.env`, URL-encoding any special characters in the password:

   ```
   SMTP_URL=smtps://USERNAME:PASSWORD@smtp.provider.com:465
   ```

3. **Restart the API:** `systemctl restart fh-api`.
4. **Test it:** use **Forgotten your password?** on the sign-in page. Until this works, `journalctl -u fh-api | grep "Email to"` shows the emails that would have been sent.

## Backups

- **Nightly:** `fh-backup.timer` runs a `pg_dump` at about 03:15. It keeps 14 days of backups in `/var/backups/fh`.
- **Monthly restore test:** `fh-restore-test.timer` restores the newest backup into a scratch database on the 1st of each month, compares row counts, then drops it. Check the result with `journalctl -u fh-restore-test`.
- **Off-site copies:** set these up soon. A backup that only lives on the same server doesn't survive losing the server.

  1. Create a bucket with any S3-compatible storage (Backblaze B2, Cloudflare R2, Wasabi, AWS S3). Give it a lifecycle rule that deletes old files, e.g. after 90 days.
  2. Run `rclone config --config /etc/fh/rclone.conf` and add the bucket as a remote.
  3. Set `RCLONE_REMOTE=remote-name:bucket-name` in `/etc/fh/backup.env`.
  4. Test it with `systemctl start fh-backup && journalctl -u fh-backup -n 5`.

- **Restore from a backup:** this stops the site, takes a safety backup, then replaces the database.

  ```sh
  /opt/fh/bin/restore.sh /var/backups/fh/fh-YYYYMMDD-HHMMSS.dump
  ```

## Monitoring

Point a free uptime monitor (e.g. UptimeRobot or Better Stack) at `https://fhmatchcentre.com/v1/health`. It should return `{"ok":true}`.

## Day-to-day

| Task | Command (on the server, as root) |
| --- | --- |
| Deploy a release | `/opt/fh/bin/deploy.sh v0.2.0` |
| Go back one release | `/opt/fh/bin/rollback.sh` |
| See what's running | `readlink /opt/fh/current` |
| Follow the logs | `journalctl -u fh-api -u fh-web -f` |
| Restart | `systemctl restart fh-api fh-web` |
| Service status | `systemctl status fh-api fh-web` |
| Change configuration | edit `/etc/fh/api.env` or `/etc/fh/web.env`, then restart that service |
| Make someone admin | `/opt/fh/bin/fh-admin someone@example.com` |
| Back up now | `systemctl start fh-backup` |
| Database shell | `sudo -u postgres psql fh` |

A rollback doesn't undo database migrations. Write migrations that the previous release can still run against, for example by adding columns rather than renaming them.

## Where things live

| Path | What |
| --- | --- |
| `/opt/fh/releases/` | One folder per deploy. `/opt/fh/current` links to the live one. |
| `/opt/fh/bin/` | `deploy.sh`, `rollback.sh`, `fh-admin`, the backup and restore scripts. Updated by each deploy. |
| `/etc/fh/api.env` | API settings and secrets (database password, JWT secret, SMTP). |
| `/etc/fh/web.env` | Website settings. |
| `/etc/fh/backup.env`, `/etc/fh/rclone.conf` | Backup settings. |
| `/etc/fh/deploy.env` | Repository URL, number of releases to keep. |
| `/var/backups/fh/` | Database backups. |
| `/var/cache/fh-api/` | Cached PDF reports (safe to delete). |
| `/etc/nginx/sites-available/fhmatchcentre.conf` | nginx site. It's installed by `provision.sh`, so run that again after changing `deploy/nginx/`. |
