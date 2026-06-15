# Bali-Can Limited — VPS Production Deployment

## Architecture

```
┌─────────┐     ┌──────────┐     ┌───────────┐
│ Caddy   │────▶│ Frontend │     │ Backend   │────▶ S3-compatible storage
│ :443    │     │ :3000    │     │ :4000     │
│ (HTTPS) │     │ (Next.js)│     │ (Express) │
└────┬────┘     └──────────┘     └─────┬─────┘
     │                                 │
     │           ┌──────────┐          │
     └──────────▶│ PostgreSQL│◄─────────┘       Sentry + Prometheus
                 │ :5432    │
                 └──────────┘
```

All services run in Docker containers on a single VPS. Caddy terminates TLS and routes traffic:

| Route              | Target      | Service   |
|--------------------|-------------|-----------|
| `domain.com/*`     | :3000       | Frontend  |
| `domain.com/api/*` | :4000       | Backend   |
Public media is served from `PUBLIC_UPLOAD_BASE_URL`. Private documents remain
authorization-gated by the API and are delivered with short-lived signed URLs.

---

## Prerequisites

- Ubuntu 22.04+ VPS with at least 2 GB RAM, 20 GB disk
- Domain name (e.g., `sslplan.com`) with DNS A record pointing to the VPS IP
- SSH access to the VPS

---

## Step 1: Initial VPS Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required tools
sudo apt install -y git curl

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Add your user to the docker group (avoids needing sudo for docker commands)
sudo usermod -aG docker "$USER"

# Log out and back in for group changes to take effect
exit
# then ssh back in
```

**Verify Docker:**

```bash
docker --version
docker compose version
```

---

## Step 2: Configure DNS

Create an **A record** for your domain pointing to the VPS's public IP:

| Type | Name  | Value        | TTL     |
|------|-------|--------------|---------|
| A    | @     | <VPS_IP>     | 300     |
| A    | www   | <VPS_IP>     | 300     |

Allow 1-5 minutes for DNS propagation.

---

## Step 3: Clone the Repository

```bash
cd /opt
sudo mkdir -p sslplan
sudo chown "$USER":"$USER" sslplan
git clone <your-repo-url> sslplan
cd sslplan
```

---

## Step 4: Configure Environment

```bash
cp .env.production.example .env
nano .env
```

Fill in every variable in `.env`. Key variables:

| Variable                | Description                                      | Generate With                  |
|-------------------------|--------------------------------------------------|--------------------------------|
| `POSTGRES_PASSWORD`     | Database password                                | `openssl rand -base64 24`     |
| `JWT_SECRET`            | JWT signing key                                  | `openssl rand -hex 32`        |
| `AUTH_SECRET`           | Auth.js session encryption key                   | `openssl rand -base64 32`     |
| `ADMIN_SECRET_KEY`      | Admin registration secret                        | `openssl rand -hex 16`        |
| `PAYSTACK_SECRET_KEY`   | Paystack live secret key (sk_live_*)             | Paystack dashboard            |
| `PAYSTACK_PUBLIC_KEY`   | Paystack live public key (pk_live_*)             | Paystack dashboard            |
| `RESEND_API_KEY`        | Resend transactional email API key               | Resend dashboard              |
| `ALERT_WEBHOOK_URL`     | HTTPS critical-alert receiver                     | Incident platform or alert relay |
| `SENTRY_DSN`            | Centralized exception aggregation                 | Sentry project settings          |
| `METRICS_TOKEN`         | Protects `/internal/metrics`                      | `openssl rand -hex 32`           |
| `S3_BUCKET`             | Public/private object bucket                      | Storage provider                 |
| `S3_REGION`             | Object-storage region                             | Storage provider                 |
| `BACKUP_ENCRYPTION_KEY` | Encrypts database backups                         | `openssl rand -hex 32`           |
| `BACKUP_RCLONE_REMOTE`  | Versioned off-site backup destination             | rclone configuration             |

**Update the Caddyfile** to use your actual domain:

```bash
sed -i 's/sslplan.com/your-actual-domain.com/g' Caddyfile
```

Or edit `Caddyfile` manually.

---

## Step 5: Configure Object Storage

Use a private bucket with versioning enabled. The application writes public
objects under `public/` and private documents under `private/`. Only `public/*`
may be exposed through the bucket policy or CDN. Never grant anonymous access
to `private/*`.

For an existing installation, keep the uploads volume mounted and run this
once after configuring S3:

```bash
docker compose --env-file .env run --rm backend npm run migrate:uploads-s3
```

The command preserves storage keys, copies public and private objects, and
updates product-media URLs. It fails if any referenced local file is missing.

## Step 6: Deploy

```bash
./scripts/deploy.sh .env
```

The deploy script pulls with fast-forward only, starts PostgreSQL, creates and
uploads an encrypted backup, tags the currently running images, builds images
tagged with the target git SHA, runs all migrations, starts the release, and
checks backend and frontend health. A failed migration or health gate
automatically restores the previous application images.

---

## Step 7: Verify Everything

```bash
# Health check endpoint
curl https://your-domain.com/api/ready

# Expected response:
# {"status":"ok","timestamp":"2026-01-01T00:00:00.000Z"}

# Check frontend loads properly
# Visit https://your-domain.com in a browser

# Verify a public object through PUBLIC_UPLOAD_BASE_URL
# Verify a private document download redirects to a short-lived signed URL

# View service logs
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
docker compose logs caddy --tail=50
```

---

## Backup Strategy

### Required Backup Configuration

Set these values in the production environment:

```bash
NODE_ENV=production
BACKUP_ENCRYPTION_KEY=<strong-secret-stored-outside-the-server>
BACKUP_RCLONE_REMOTE=s3:balican-production/database
BACKUP_RETENTION_DAYS=14
```

`BACKUP_RCLONE_REMOTE` is optional in the script but required by the Balican
production policy. Configure `rclone` for an off-site, versioned storage
provider before launch.

### Automated Daily Backup

Set up a cron job for daily database backups:

```bash
crontab -e
```

Add this line to back up at 3 AM daily:

```
0 3 * * * /opt/sslplan/scripts/backup-db.sh /opt/sslplan/backups >> /var/log/sslplan-backup.log 2>&1
```

Or use the provided systemd timer template:

```bash
sudo cp scripts/sslplan-backup.service /etc/systemd/system/
sudo cp scripts/sslplan-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sslplan-backup.timer
```

### Manual Backup

```bash
./scripts/backup-db.sh ./backups
```

The script creates a PostgreSQL custom-format dump, encrypts it with
AES-256-CBC/PBKDF2, writes a SHA-256 checksum, uploads both files off-site when
`BACKUP_RCLONE_REMOTE` is configured, and removes expired local copies.

### Restore from Backup

```bash
# List available backups
ls -la ./backups/

# Restore into a separate database first
BACKUP_ENCRYPTION_KEY=... \
  ./scripts/restore-db.sh ./backups/balican_sslplan_20260611_030000.dump.enc sslplan_restore_check

# Run the complete automated backup/restore verification
BACKUP_ENCRYPTION_KEY=... ./scripts/restore-drill.sh

# Restore over the primary database only during an approved incident
RESTORE_FORCE=true BACKUP_ENCRYPTION_KEY=... \
  ./scripts/restore-db.sh ./backups/balican_sslplan_20260611_030000.dump.enc sslplan
```

The restore script verifies the checksum before decrypting. It refuses to
replace the primary database unless `RESTORE_FORCE=true`.

Run `restore-drill.sh` monthly and after any backup-tooling change. Record the
date, backup identifier, migration count, result, and operator.

---

## Rollback Strategy

### Option A: Rollback to preserved Docker images

```bash
./scripts/rollback.sh .env
```

The deploy script invokes this rollback path automatically when its release
health gates fail. Database migrations must remain backward-compatible with
the previous application release.

### Option B: Rollback database

```bash
# Restore the database to a known-good state before the problematic deploy
RESTORE_FORCE=true BACKUP_ENCRYPTION_KEY=... \
  ./scripts/restore-db.sh ./backups/balican_sslplan_<pre-deploy-timestamp>.dump.enc sslplan

# Rebuild and restart with previous code
git checkout <previous-stable-commit>
docker compose build
docker compose up -d
```

### Option C: Quick rollback (same images, env change only)

```bash
# Update .env with corrected values, then restart
docker compose up -d --force-recreate
```

---

## Health Monitoring

### Docker health checks

All services have Docker health checks configured. View status:

```bash
docker compose ps
```

### Manual checks

```bash
# API readiness
curl -f https://your-domain.com/api/ready

# Check Caddy TLS cert expiry
docker compose exec caddy caddy cert-info

# Disk usage
df -h

# Container resource usage
docker stats --no-stream
```

### Log aggregation

```bash
# Tail all service logs
docker compose logs --tail=20 -f

# Tail a specific service
docker compose logs backend -f
```

### Centralized errors and metrics

- Confirm a controlled exception appears in the configured Sentry project with
  `environment`, `release`, and `request_id`.
- Scrape metrics over the private Docker/VPN network:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  http://backend:4000/internal/metrics
```

Do not expose `/internal/metrics` through Caddy. Alert at minimum on readiness
failure, elevated 5xx rate, high p95 latency, process memory pressure, and
container restart loops.

---

## Updating the Application

```bash
cd /opt/sslplan

./scripts/deploy.sh .env
```

---

## Troubleshooting

### Caddy can't obtain TLS certificate

```bash
# Check Caddy logs
docker compose logs caddy

# Common causes:
# 1. DNS A record hasn't propagated yet — wait and retry
# 2. Port 80 is blocked by a firewall — ensure it's open
# 3. Domain doesn't point to this VPS — double-check DNS
```

### Backend can't connect to PostgreSQL

```bash
# Check that postgres is healthy
docker compose ps postgres

# Check the connection string in .env
# Verify POSTGRES_PASSWORD matches between .env and what postgres expects

# Check backend logs
docker compose logs backend
```

### Uploaded images return 404

```bash
# Confirm S3 readiness and configuration
docker compose exec backend env | grep -E 'UPLOAD_STORAGE|S3_|PUBLIC_UPLOAD'
curl -f https://your-domain.com/api/ready

# Confirm the public prefix/CDN maps to bucket public/*
# Confirm migrate:uploads-s3 completed for legacy files
```

### Frontend returns 500 on page load

```bash
docker compose logs frontend

# Common causes:
# 1. AUTH_SECRET mismatch between build and runtime — rebuild frontend
# 2. NEXT_PUBLIC_API_URL points to wrong backend URL
```

---

## Security Checklist

- [ ] `POSTGRES_PASSWORD` is a long random string
- [ ] `JWT_SECRET` is a long random hex string
- [ ] `AUTH_SECRET` is a long random base64 string
- [ ] `ADMIN_SECRET_KEY` is set and unique
- [ ] `PAYSTACK_WEBHOOK_SECRET` is set (webhook fail-closed)
- [ ] Paystack keys are live (not test) keys
- [ ] `FRONTEND_URL` uses `https://`
- [ ] `AUTH_URL` uses `https://`
- [ ] S3 bucket versioning and encryption are enabled
- [ ] Anonymous access is limited to `public/*`; `private/*` is denied
- [ ] Sentry receives events tagged with the current release
- [ ] `/internal/metrics` is reachable only from the monitoring network
- [ ] Automated rollback has been exercised in staging
- [ ] DNS A records point to this VPS
- [ ] Ports 80 and 443 are open; all other ports firewalled
- [ ] `.env` file has restricted permissions: `chmod 600 .env`
- [ ] Backend user runs as non-root (`nodeuser` in Dockerfile)
- [ ] Frontend user runs as non-root (`nextuser` in Dockerfile)
- [ ] Docker socket is not exposed to any container

---

## Appendix: UFW Firewall Setup

```bash
# Install UFW
sudo apt install -y ufw

# Allow SSH (or the port you connect on — default is 22)
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other incoming traffic
sudo ufw default deny incoming

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```
