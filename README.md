# FlameBot website

This repository is a small Node.js website service that serves the static marketing pages, the download page, and the admin and ambassador dashboards.

The app does not depend on Railway. Railway was only running `node server.js` for you. Moving to a VPS means running the same process under a process manager or `systemd`, then putting Nginx in front of it.

## Structure

- `index.html`, `about.html`, `contact.html`, `privacy.html`, `terms.html`
- `download/index.html`
- `admin/index.html`
- `ambassador/index.html`
- `server.js` for static file serving, security headers, compression, and backend proxying

## Runtime

- Node.js 18 or newer
- Start command: `npm start`
- Default port: `3000`

## Environment variables

- `PORT`: local port for the Node server. Default is `3000`.
- `FLAMEBOT_BACKEND_BASE_URL`: base URL of the backend used by the admin and ambassador dashboards.
- `FLAMEBOT_WEBSITE_ANALYTICS_SECRET`: shared secret for website analytics forwarding.
- `FLAMEBOT_CANONICAL_HOST`: optional canonical host such as `www.example.com`. Leave empty to disable host redirects.
- `FLAMEBOT_FORCE_HTTPS`: optional. Set to `true` when the site is behind Nginx or another proxy that sets `X-Forwarded-Proto: https`.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## VPS deployment

These steps assume Ubuntu and a domain already pointed to your VPS.

### 1. Install Node.js and Nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
```

### 2. Upload the project

```bash
cd /var/www
sudo git clone https://github.com/Emperorgeneral/FLAMEBOT-WEBSITE-.git flamebotwebsite
cd flamebotwebsite
sudo npm install --omit=dev
```

### 3. Create the service env file

```bash
sudo cp deploy/flamebot-website.env.example /etc/flamebot-website.env
sudo nano /etc/flamebot-website.env
```

Set at least:

- `PORT=3000`
- `FLAMEBOT_BACKEND_BASE_URL=https://your-backend-domain`
- `FLAMEBOT_CANONICAL_HOST=your-domain.com` or `www.your-domain.com`
- `FLAMEBOT_FORCE_HTTPS=true`

### 4. Install the `systemd` service

```bash
sudo cp deploy/flamebot-website.service /etc/systemd/system/flamebot-website.service
sudo systemctl daemon-reload
sudo systemctl enable flamebot-website
sudo systemctl start flamebot-website
sudo systemctl status flamebot-website
```

### 5. Install the Nginx site

```bash
sudo cp deploy/flamebot-website.nginx.conf /etc/nginx/sites-available/flamebot-website
sudo nano /etc/nginx/sites-available/flamebot-website
sudo ln -s /etc/nginx/sites-available/flamebot-website /etc/nginx/sites-enabled/flamebot-website
sudo nginx -t
sudo systemctl reload nginx
```

Update the `server_name` entries in the Nginx file to your real domain.

### 6. Add TLS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## Deploy updates later

```bash
cd /var/www/flamebotwebsite
sudo git pull
sudo npm install --omit=dev
sudo systemctl restart flamebot-website
```

## Important notes

- This service listens on `0.0.0.0`, so Nginx can reverse proxy to it.
- The app already supports `PORT`, so no code change is needed for VPS hosting.
- The old hardcoded domain redirect has been replaced with `FLAMEBOT_CANONICAL_HOST`, which is safer for VPS deployment.
- If your backend lives on a different host, make sure `FLAMEBOT_BACKEND_BASE_URL` points to its public HTTPS URL.
