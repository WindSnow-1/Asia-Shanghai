# Deploy On A Small VPS

This deployment keeps the backend local on `127.0.0.1:8091` and exposes only the built frontend plus `/api` through nginx.

## 1. Clone

```bash
cd /opt
git clone https://github.com/WindSnow-1/Asia-Shanghai.git lattice-monitor
cd /opt/lattice-monitor
```

## 2. Build Frontend

```bash
cd /opt/lattice-monitor/frontend
npm ci
npm run build
```

## 3. Install Backend Service

Generate an agent token:

```bash
openssl rand -hex 32
```

Copy the service file:

```bash
cp /opt/lattice-monitor/deploy/lattice-backend.service /etc/systemd/system/lattice-backend.service
nano /etc/systemd/system/lattice-backend.service
```

Replace:

```text
AGENT_TOKEN=change-this-token
ADMIN_INITIAL_PASSWORD=admin123456
```

`SESSION_SECRET` is optional. If it is not set, the backend uses `AGENT_TOKEN` for signing dashboard sessions.

Start it:

```bash
systemctl daemon-reload
systemctl enable --now lattice-backend
systemctl status lattice-backend --no-pager
```

## 4. Configure Nginx

```bash
cp /opt/lattice-monitor/deploy/nginx-lattice.conf /etc/nginx/conf.d/lattice-monitor.conf
nano /etc/nginx/conf.d/lattice-monitor.conf
```

Replace:

```text
monitor.example.com
```

Test and reload:

```bash
nginx -t
systemctl reload nginx
```

## 5. Check

```bash
curl http://127.0.0.1:8091/health
curl http://127.0.0.1:8091/api/session
```

Open:

```text
http://your-domain
```

First login is `admin / admin123456` unless you changed `ADMIN_INITIAL_PASSWORD`.
