# Bali-Can Limited — VPS Production Deployment

## Architecture

```
┌─────────┐     ┌──────────┐     ┌───────────┐
│ Caddy   │────▶│ Frontend │     │ Backend   │
│ :443    │     │ :3000    │     │ :4000     │
│ (HTTPS) │     │ (Next.js)│     │ (Express) │
└────┬────┘     └──────────┘     └─────┬─────┘
     │                                 │
     │           ┌──────────┐          │
     └──────────▶│ PostgreSQL│◄─────────┘
                 │ :5432    │
                 └──────────┘
```

All services run in Docker containers on a single VPS. Caddy terminates TLS and routes traffic:

| Route              | Target      | Service   |
|--------------------|-------------|-----------|
| `domain.com/*`     | :3000       | Frontend  |
| `domain.com/api/*` | :4000       | Backend   |
| `domain.com/uploads/*` | :4000  | Backend   |

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

**Update the Caddyfile** to use your actual domain:

```bash
sed -i 's/sslplan.com/your-actual-domain.com/g' Caddyfile
```

Or edit `Caddyfile` manually.

---

## Step 5: Build & Start Services

```bash
# Build all Docker images
docker compose build

# Start all services in detached mode
docker compose up -d

# Check that all services are running
docker compose ps
```

Expected output:
```
NAME                STATUS
sslplan-postgres    Up (healthy)
sslplan-backend     Up
sslplan-frontend    Up
sslplan-caddy       Up
```

---

## Step 6: Run Database Migrations

```bash
docker compose run --rm backend node dist/src/config/migrate.js
```

All migrations are idempotent (use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so they can be safely re-run.

---

## Step 7: Verify Everything

```bash
# Health check endpoint
curl https://your-domain.com/api/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-01T00:00:00.000Z"}

# Check frontend loads properly
# Visit https://your-domain.com in a browser

# Check uploaded product images accessible
# Visit https://your-domain.com/uploads/products/xxx.jpg (if any exist)

# View service logs
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
docker compose logs caddy --tail=50
```

---

## Backup Strategy

### Automated Daily Backup (Recommended)

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

### Restore from Backup

```bash
# List available backups
ls -la ./backups/

# Restore
./scripts/restore-db.sh ./backups/sslplan_db_20260101_120000.sql.gz
```

> **Warning**: Restore drops and recreates the database. All data since the backup was taken will be lost.

---

## Rollback Strategy

### Option A: Rollback to previous Docker images

```bash
# Revert to a specific git tag or commit
git log --oneline -10
git checkout <previous-stable-tag>

# Rebuild and restart
docker compose build
docker compose up -d

# Run migrations (if any new ones were rolled back, old code handles them gracefully)
docker compose run --rm backend node dist/src/config/migrate.js
```

### Option B: Rollback database

```bash
# Restore the database to a known-good state before the problematic deploy
./scripts/restore-db.sh ./backups/sslplan_db_<pre-deploy-timestamp>.sql.gz

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
# API health
curl -f https://your-domain.com/api/health

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

---

## Updating the Application

```bash
cd /opt/sslplan

# Pull latest code
git pull

# Rebuild and restart
docker compose build
docker compose up -d

# Run any new migrations
docker compose run --rm backend node dist/src/config/migrate.js

# Verify health
curl https://your-domain.com/api/health
```

Or use the deploy script:

```bash
./scripts/deploy.sh
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
# Check that uploads volume is mounted
docker compose exec backend ls -la /app/uploads

# Check PUBLIC_UPLOAD_BASE_URL matches the actual domain
docker compose exec backend env | grep PUBLIC_UPLOAD

# Check Caddy logs for /uploads requests
docker compose logs caddy | grep uploads
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
