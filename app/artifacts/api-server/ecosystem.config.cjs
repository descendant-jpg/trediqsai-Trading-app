// PM2 process manifest for the TradiQs API (Digital Ocean droplet).
// Build first:  pnpm run build        (outputs dist/index.mjs)
// Start:        pm2 start ecosystem.config.cjs --env production
// Reload:       pm2 reload tradiqs-api
module.exports = {
  apps: [
    {
      name: 'tradiqs-api',
      script: './dist/index.mjs',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
