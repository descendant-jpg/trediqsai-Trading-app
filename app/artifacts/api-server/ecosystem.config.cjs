// PM2 process manifest for the TradiQs API (Digital Ocean droplet, shared host).
// Dedicated app name + PORT 5050 so it never collides with other apps on the server.
// Build first:  pnpm run build        (outputs dist/index.mjs)
// Start:        pm2 start ecosystem.config.cjs --env production
// Reload:       pm2 reload tradiqs-api-prod
module.exports = {
  apps: [
    {
      name: 'tradiqs-api-prod',
      script: './dist/index.mjs',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5050,
      },
    },
  ],
};
