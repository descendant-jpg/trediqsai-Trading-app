# Nginx Reverse Proxy — api.tradiqsai.com (isolated server block)

This server also hosts other apps, so the TradiQs API gets its **own isolated
server block and its own port (5050)** — nothing else on the host is touched.
The block proxies public port-80 traffic for `api.tradiqsai.com` to the
PM2-managed API on `http://localhost:5050` (see `ecosystem.config.cjs`).

## 1. Create the server block file

```bash
sudo nano /etc/nginx/sites-available/api.tradiqsai.com
```

Contents:

```nginx
server {
    listen 80;
    server_name api.tradiqsai.com;

    location / {
        proxy_pass http://localhost:5050;
        proxy_http_version 1.1;

        # WebSocket / keep-alive upgrade support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Preserve the original request context
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }
}
```

## 2. Enable the block (symlink)

```bash
sudo ln -s /etc/nginx/sites-available/api.tradiqsai.com /etc/nginx/sites-enabled/api.tradiqsai.com
```

## 3. Validate and apply

```bash
sudo nginx -t                 # validate config
sudo systemctl reload nginx   # apply without dropping other sites' traffic
```

## 4. TLS (recommended once DNS resolves)

```bash
sudo certbot --nginx -d api.tradiqsai.com
```

Certbot rewrites only this domain's block to listen on 443 and redirects
80 → 443; the `proxy_pass http://localhost:5050` target is unchanged.

## 5. API process lifecycle (PM2)

```bash
pnpm run build
pm2 start ecosystem.config.cjs --env production   # name: tradiqs-api-prod, PORT 5050
pm2 save && pm2 startup                           # survive droplet reboots
```
