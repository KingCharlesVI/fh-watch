# Deploying FH Match Centre

Everything runs on one machine, **Windows or Linux**, with no containers. FH Match Centre's own server is **an old laptop running Ubuntu Desktop 24.04 LTS** (see [The laptop](#the-laptop-ubuntu-desktop)), so that's the path to follow; the Windows one stays for anyone else. It runs PostgreSQL, the API, the website, and a **Cloudflare Tunnel** that connects the machine to app.fhmatchcentre.com. The tunnel dials out to Cloudflare, so the machine needs no public IP address, no open ports and no certificates. A spare PC at home is enough while the user base is small; moving to a VPS later uses the same Linux setup (see [Moving to another machine](#moving-to-another-machine)).

The files live in [`deploy/`](../deploy): `fh.mjs` (the `fh` command, the same on both systems), `linux/` and `windows/` (setup scripts and service definitions), and `env/` (settings templates).

```
visitor ──HTTPS──> Cloudflare <══tunnel══ fh-tunnel (cloudflared) ──/v1/*──────────> fh-api  :3001 ──> PostgreSQL
                                                                  └─everything else─> fh-web  :3000
```

## Before you start

| You need | Notes |
| --- | --- |
| A machine that stays on | **Windows 10/11**, or **Ubuntu 22.04+ / Debian 12+** (Raspberry Pi OS 64-bit counts). 64-bit, 4 GB RAM, 40 GB free disk. A wired network connection is best. The site is down whenever the machine is off or asleep. |
| A Cloudflare account | The free plan is enough. |
| The domain on Cloudflare | See step 1. The domain stays registered where it is; only its DNS moves to Cloudflare. |
| The repository on GitHub | The machine clones releases from it. |
| An email provider (can wait) | Without one, emails (sign-up confirmations, password resets, appointments) are only written to the API log, so nobody else can register. See [Email](#email). |

## 1. Put the domain on Cloudflare (once)

1. In the Cloudflare dashboard, **Add a domain**: `fhmatchcentre.com`, Free plan.
2. **Check the records Cloudflare imported** before going any further. Moving the nameservers moves *all* of the domain's DNS, so anything that doesn't come across stops working when the nameservers change:
   - the landing page (`fhmatchcentre.com`) and the docs (`docs.fhmatchcentre.com`), both on Vercel — set these to **DNS only** (grey cloud) so Vercel serves its own certificates;
   - the **email** records, if SES is already set up: the three Easy DKIM CNAMEs, the SPF TXT record and the `_dmarc` TXT record (see [Email](#email)). Miss these and mail keeps being accepted but starts failing authentication, so confirmations and password resets go to spam.

   Compare the imported list against the registrar's and add anything missing *before* step 3.
3. Cloudflare gives you two nameservers. At your domain registrar, replace the domain's nameservers with those two. Cloudflare emails you when the domain is active, usually within an hour.
4. In Cloudflare, go to **SSL/TLS → Edge Certificates** and turn on **Always Use HTTPS**.
5. Leave **Bot Fight Mode** and **Under Attack mode** off. They answer some requests with a browser challenge, which the phone app and watches can't complete.

This machine serves **`app.fhmatchcentre.com`** only: the API on `/v1/*` and the website on everything else. The apex stays with the landing page on Vercel. You don't add `app`'s DNS record yourself: the setup script does that in step 2, from `SITE_URL` in `web.env`. From now on, any DNS records you add (e.g. for email) go in Cloudflare, not at the registrar.

## 2. Set up the machine (once)

Follow **2a** for Windows or **2b** for Linux. Both finish by setting up the tunnel, which opens a Cloudflare sign-in page: sign in and pick `fhmatchcentre.com`.

### 2a. Windows

1. **Install the tools**, in PowerShell:

   ```powershell
   winget install --id OpenJS.NodeJS.LTS
   winget install --id Git.Git
   winget install --id Cloudflare.cloudflared
   ```

   Then install **PostgreSQL** (16 or later) with the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). Keep the defaults, and note the password it asks you to choose for the `postgres` superuser. You don't need Stack Builder.

2. **Get the repository and run the setup**, in a *new* administrator PowerShell (right-click PowerShell → Run as administrator):

   ```powershell
   git clone https://github.com/KingCharlesVI/fh-watch.git C:\fh-setup
   powershell -ExecutionPolicy Bypass -File C:\fh-setup\deploy\windows\provision.ps1 -Repo https://github.com/KingCharlesVI/fh-watch.git
   ```

   The first `git clone` asks you to sign in to GitHub; Git remembers it for deploys. The setup asks for the PostgreSQL password, then takes a few minutes. It:

   - checks the tools and turns on Windows long paths
   - creates `C:\ProgramData\fh`, readable by the services but changeable only by administrators
   - creates the `fh` database role (random password) and the `fh` and `fh_restore_test` databases
   - writes the settings to `C:\ProgramData\fh\config`, including a random JWT secret
   - installs the `fh-api`, `fh-web` and `fh-tunnel` Windows services. Each runs under its own low-privilege account, starts at boot and restarts if it fails.
   - adds the `fh` command to the PATH
   - schedules a nightly backup and a weekly restore test in Task Scheduler, under *FH Match Centre*
   - turns off sleep and hibernate on mains power
   - sets up the Cloudflare Tunnel

   If it says PostgreSQL accepts connections from other computers, follow its instructions to limit it to this one.

3. **Laptops:** in *Control Panel → Power Options → Choose what closing the lid does*, set "When I close the lid" to **Do nothing** for "Plugged in".

Windows Update restarts the machine now and then. The services and tunnel start again by themselves, before anyone signs in.

### 2b. Linux

On Ubuntu Desktop, first do the steps in [The laptop](#the-laptop-ubuntu-desktop) below: the desktop edition has no SSH server until you install one.

1. **Copy the `deploy` folder to the machine** and sign in to it, from your computer in the repository folder:

   ```sh
   scp -r deploy you@MACHINE:fh-deploy
   ssh you@MACHINE
   ```

2. **Run the setup**:

   ```sh
   sudo bash ~/fh-deploy/linux/provision.sh --repo git@github.com:KingCharlesVI/fh-watch.git
   ```

   This takes about 5 minutes. It:

   - installs Node 24, PostgreSQL, cloudflared (from Cloudflare's package repository) and security updates
   - creates the `fh-api`, `fh-web`, `fh-tunnel` and `fh-deploy` users
   - creates the `fh` database role (random password) and the `fh` and `fh_restore_test` databases
   - writes the settings to `/etc/fh`, including a random JWT secret
   - installs the services and the backup timers, and the `fh` command
   - turns off sleep and suspend, and makes closing a laptop's lid do nothing
   - turns on the firewall with only SSH allowed in (the tunnel needs no inbound ports)
   - switches SSH to keys only, if it finds a key
   - sets up the Cloudflare Tunnel. On a machine without a browser, open the link it prints on any computer.

   At the end it prints a **deploy key**. In GitHub, open the repository's **Settings → Deploy keys → Add deploy key**, paste the key and leave write access off.

### The laptop (Ubuntu Desktop)

An old laptop makes a good small server: it uses little power, and its battery carries it through short power cuts. On the laptop itself, before step 1 above:

1. **Install and start SSH**, so you can run everything else from your own computer:

   ```sh
   sudo apt update && sudo apt install -y openssh-server
   hostname -I   # the address to use as MACHINE above
   ```

2. **The network.** A cable is best. On Wi-Fi, open **Settings → Wi-Fi →** the network's settings and tick **Available to all users**. Without it the connection only comes up once someone signs in, so after a restart the site stays down.
3. **Starting up by itself.** Leave automatic sign-in off: the services start at boot with no one signed in. In the laptop's BIOS/UEFI settings, turn on anything like **Power on after AC loss** (or *Restore on AC power loss*), so a power cut that outlasts the battery doesn't leave it off.
4. **Keep it plugged in,** lid open or closed: the setup turns off sleep and the lid switch. If the BIOS or the manufacturer's tool can cap charging (e.g. at 80%), turn that on: a battery held at 100% for months wears out and can swell.
5. **Give it a fixed address** on your router (a DHCP reservation), so `ssh` always finds it. The site doesn't need one: the tunnel works from any address.

Ubuntu installs security updates by itself (the setup turns that on) and needs a restart now and then; everything comes back without anyone signing in. 24.04 LTS has security updates until 2029.

Running either setup script again is safe: it keeps existing secrets and settings. Add `-SkipTunnel` (Windows) or `--skip-tunnel` (Linux) to leave the tunnel for later, then run `fh tunnel` when ready.

## 3. Deploy

Tag the release on your computer and push it:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Then deploy it on the machine: `fh deploy v0.1.0` in an administrator PowerShell on Windows, or `sudo fh deploy v0.1.0` on Linux. It:

1. clones the tag into a new folder under `releases`
2. installs dependencies and builds the API and website (on Linux as the unprivileged `fh-deploy` user)
3. installs Chromium for PDF reports
4. runs the database migrations
5. points `current` at the new release and restarts the API and website
6. checks both answer

If they don't answer, it switches back to the previous release and shows the logs. If it fails before the switch, the live site is untouched. The last 5 releases are kept.

A branch name works in place of a tag (e.g. `fh deploy main`), but tags make it clear what's running. The first deploy takes 5–10 minutes; later ones are quicker.

## 4. Create the first admin

1. Register on https://app.fhmatchcentre.com/register.
2. Make that account an admin: `fh admin you@example.com --verify` (with `sudo` on Linux).

   `--verify` also confirms your email address, so you can sign in before email is set up. From then on, use **Admin → Users** on the website to manage roles.

## Email

FH Match Centre sends its emails (sign-up confirmations, password resets, test requests, and club umpiring: appointments, cover, fixture changes and gap reminders) through **Amazon SES**, over SMTP. Each is sent as HTML with a plain-text version. Another provider with SMTP works the same way from step 5.

1. **In the AWS console, open Amazon SES** in **Europe (Stockholm), eu-north-1**, the region this deployment uses. Keep to one region: an identity, its DKIM records and the SMTP credentials all belong to the region they were made in, and the SMTP host names it.
2. **Verify the domain:** *Configuration → Identities → Create identity → Domain*, `fhmatchcentre.com`, with **Easy DKIM** (RSA 2048). SES shows three CNAME records: add them in **Cloudflare's DNS**, set to **DNS only** (grey cloud). Also in Cloudflare:
   - **SPF:** a TXT record on `fhmatchcentre.com`, `v=spf1 include:amazonses.com ~all` (or add `include:amazonses.com` to an SPF record that's already there).
   - **DMARC:** a TXT record on `_dmarc.fhmatchcentre.com`, `v=DMARC1; p=none; rua=mailto:dmarc@fhmatchcentre.com`. Tighten `p=` later, once the reports show all mail passing.

     The reporting address has to be **on this domain**: a receiver asked to send reports somewhere else (a Gmail address, say) first looks for a record authorising it at `fhmatchcentre.com._report._dmarc.THAT-DOMAIN`, which you can't add to someone else's domain, so most simply don't report. Cloudflare's **Email Routing** gives you `dmarc@fhmatchcentre.com` for nothing and forwards it wherever you read mail. Or leave `rua=` out: the policy still applies, you just see no reports.

   Of the three, **DKIM is the one that matters** for getting mail delivered and for DMARC to pass: it signs as `fhmatchcentre.com`, which is what alignment needs. The SPF record is worth having but doesn't align on its own, because SES's envelope sender is `amazonses.com` unless you set up a custom MAIL FROM (optional, below). SES shows the identity as verified once it sees the DKIM records, usually within an hour.

   **Optional, for SPF alignment as well:** *Identities → fhmatchcentre.com → Custom MAIL FROM*, with a subdomain such as `mail.fhmatchcentre.com`. SES then asks for an MX record on it, `feedback-smtp.eu-north-1.amazonses.com` at priority 10, and a TXT record on it, `v=spf1 include:amazonses.com ~all`. Both **DNS only**.
3. **Leave the sandbox.** A new SES account only sends to addresses you've verified. *Account dashboard → Request production access*: say it's transactional mail only (account confirmations, password resets, and notices about matches people are appointed to umpire) for a sports results site, sent to people who register. AWS usually answers within a day.
4. **Make SMTP credentials:** *SMTP settings → Create SMTP credentials*. It creates an IAM user and shows an **SMTP user name and password**, once: save them. They aren't your AWS access keys.
5. **Add the SMTP URL** to `api.env` (`/etc/fh/api.env` or `C:\ProgramData\fh\config\api.env`). SES passwords usually contain `/` or `+`, which must be URL-encoded (`%2F`, `%2B`); this prints the encoded form:

   ```sh
   node -e "console.log(encodeURIComponent(process.argv[1]))" 'THE-SMTP-PASSWORD'
   ```

   ```
   SMTP_URL=smtps://SMTP-USER-NAME:ENCODED-PASSWORD@email-smtp.eu-north-1.amazonaws.com:465
   MAIL_FROM=FH Match Centre <no-reply@fhmatchcentre.com>
   ```

   For another provider: `smtps://USERNAME:PASSWORD@smtp.provider.com:465`, encoded the same way.

6. **Restart the API:** `sudo systemctl restart fh-api` on Linux, `Restart-Service fh-api` on Windows.
7. **Test it:** use **Forgotten your password?** on the sign-in page. Until this works, `fh logs api` shows the emails that would have been sent.

## Backups

- **Nightly:** a `pg_dump` at about 03:15 (a systemd timer on Linux, a scheduled task on Windows). If the machine was off then, it runs when it's next on. 14 days are kept.
- **Logs:** the nightly run also deletes Windows log files over 30 days old. On Linux, journald keeps 30 days. A server set up before 7 October 2026 needs its setup script run again once to get this (it's safe to re-run).
- **Weekly restore test:** on Sunday mornings, the newest backup is restored into the `fh_restore_test` database and its row counts are printed next to the live ones. Check it with `journalctl -u fh-restore-test` (Linux) or `C:\ProgramData\fh\logs\tasks\restore-test.log` (Windows).
- **Off-site copies:** set these up soon. A backup that only lives on the same machine doesn't survive losing the machine, and a home PC is easier to lose than a server.

  1. Install rclone: it's already there on Linux; on Windows run `winget install --id Rclone.Rclone`.
  2. Create a bucket with any S3-compatible storage (Cloudflare R2, Backblaze B2, Wasabi, AWS S3). Give it a lifecycle rule that deletes old files, e.g. after 90 days.
  3. Add the bucket as a remote: `rclone config --config /etc/fh/rclone.conf` (Linux) or `rclone config --config C:\ProgramData\fh\config\rclone.conf` (Windows).
  4. In `fh.env`, set `RCLONE_REMOTE=remote-name:bucket-name`. On Windows also set `RCLONE=` to rclone's full path (`(Get-Command rclone).Source` shows it), because backups run as SYSTEM, which doesn't see your PATH.
  5. Test it with `fh backup`.

- **Restore from a backup:** `fh restore <file>` (e.g. `sudo fh restore /var/backups/fh/fh-20260920-031500.dump`). It takes a safety backup first, stops the site, and replaces the database in one transaction: if anything goes wrong, the database is left exactly as it was.

## Monitoring

The public status page is a separate site that checks this one from outside, so it still answers when this machine doesn't: [status/README.md](../status/README.md). Post an incident there (`/admin`) when something's wrong — it's where people look before they report anything.

- `fh status` shows the running release, whether each service is up and answering, whether the tunnel is connected, and the newest backup.
- Point a free uptime monitor (e.g. UptimeRobot or Better Stack) at `https://app.fhmatchcentre.com/v1/health`. It should return `{"ok":true}`. At home this also tells you about power cuts and broadband outages.

## Day-to-day

Run `fh` commands from an administrator PowerShell on Windows, or with `sudo` on Linux.

| Task | Command |
| --- | --- |
| Deploy a release | `fh deploy v0.2.0` |
| Go back one release | `fh rollback` |
| What's running, is it healthy | `fh status` |
| Logs | `fh logs` (all), `fh logs api`, add `-f` to follow |
| Make someone admin | `fh admin someone@example.com` |
| Back up now | `fh backup` |
| Restore | `fh restore <file>` |
| Reconnect the tunnel or repair its DNS records | `fh tunnel` |
| Restart | Linux: `sudo systemctl restart fh-api fh-web`. Windows: `Restart-Service fh-api, fh-web` |
| Change settings | Edit `api.env` or `web.env`, then restart that service. `SITE_URL` in `web.env` is built into the website, so deploy again after changing it. |
| Database shell | Linux: `sudo -u postgres psql fh`. Windows: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres fh` (use your PostgreSQL version) |

A rollback doesn't undo database migrations. Write migrations that the previous release can still run against, for example by adding columns rather than renaming them.

`fh.mjs` itself is updated by each deploy. The service definitions and scripts in `deploy/linux` and `deploy/windows` aren't, so run the setup script again after changing them.

## Moving to another machine

For example, from a home PC to a VPS:

1. Set up the new machine (step 2) with `--skip-tunnel` / `-SkipTunnel`, and deploy the same release.
2. On the old machine, run `fh backup`. Stop the old site: `sudo systemctl disable --now fh-tunnel fh-web fh-api` (Linux) or `Stop-Service fh-tunnel, fh-web, fh-api` and set them to Disabled (Windows).
3. Copy that backup to the new machine and run `fh restore <file>`.
4. On the new machine, run `fh tunnel`. It reconnects to the same tunnel, so the site follows it within a minute.

Stop the old tunnel before starting the new one: two machines running the same tunnel share its traffic between them.

## Where things live

| What | Linux | Windows |
| --- | --- | --- |
| Releases (one folder per deploy) and `current`, the live one | `/opt/fh/releases`, `/opt/fh/current` | `C:\ProgramData\fh\releases`, `C:\ProgramData\fh\current` |
| The `fh` command | `/opt/fh/bin/fh.mjs` (and `/usr/local/bin/fh`) | `C:\ProgramData\fh\bin` |
| API settings and secrets (database password, JWT secret, SMTP) | `/etc/fh/api.env` | `C:\ProgramData\fh\config\api.env` |
| Website settings | `/etc/fh/web.env` | `C:\ProgramData\fh\config\web.env` |
| Deploy and backup settings | `/etc/fh/fh.env` | `C:\ProgramData\fh\config\fh.env` |
| Tunnel settings and credentials (written by `fh tunnel`) | `/etc/fh/tunnel.yml`, `/etc/fh/tunnel.json` | `C:\ProgramData\fh\config\tunnel.yml`, `tunnel.json` |
| Cloudflare sign-in used by `fh tunnel` | `/root/.cloudflared/cert.pem` | `%USERPROFILE%\.cloudflared\cert.pem` |
| Database backups | `/var/backups/fh` | `C:\ProgramData\fh\backups` |
| Logs, kept 30 days (they hold visitors' IP addresses; see the privacy policy) | journald (`fh logs`), set to 30 days by `provision.sh` | `C:\ProgramData\fh\logs` (`fh logs`): a file a day, and `fh backup` deletes those over 30 days old |
| Cached PDF reports (safe to delete) | `/var/cache/fh-api/pdf` | `C:\ProgramData\fh\data\api\pdf` |
| Service definitions | `/etc/systemd/system/fh-*` | `C:\ProgramData\fh\services` (WinSW) |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Cloudflare error page **1033** | The tunnel isn't connected: the machine is off or asleep, or `fh-tunnel` has stopped. Check `fh status` and `fh logs tunnel`. |
| Cloudflare error page **502** | The tunnel is up but the API or website isn't. Check `fh status` and `fh logs api` / `fh logs web`. |
| `fh deploy` fails at "Fetching" on Windows | Git can't sign in to GitHub. Run `git clone` on the repository once in the same administrator PowerShell to sign in. |
| `fh deploy` fails at "Fetching" on Linux | The deploy key isn't added to GitHub (step 2b). |
| The phone app can't upload, but the website works | Bot Fight Mode or Under Attack mode is on in Cloudflare (step 1). |
