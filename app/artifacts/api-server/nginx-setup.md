# Nginx Reverse Proxy — api.tradiqsai.com

Reverse proxies public traffic on port 80 to the PM2-managed API on
`http://localhost:5000` (see `ecosystem.config.js`).

## Server block

Save as `/etc/nginx/sites-available/tradiqs-api`, then
`sudo ln -s /etc/nginx/sites-available/tradiqs-api /etc/nginx/sites-enabled/`.

```nginx
server {
    listen 80;
    server_name api.tradiqsai.com;

    location / {
        proxy_pass http://localhost:5000;
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

## Apply

```bash
sudo nginx -t                 # validate config
sudo systemctl reload nginx   # apply without dropping connections
```

## TLS (recommended once DNS resolves)

```bash
sudo certbot --nginx -d api.tradiqsai.com
```

Certbot rewrites the block to listen on 443 and redirects 80 → 443; the
`proxy_pass http://localhost:5000` target is unchanged.

## Process lifecycle

```bash
pnpm run build
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup       # survive droplet reboots
```
