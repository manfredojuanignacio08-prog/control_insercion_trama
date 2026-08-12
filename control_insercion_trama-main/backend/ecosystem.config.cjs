// Alternativa a Docker: gestión del proceso con PM2 en un servidor propio
// (VPS, droplet, servidor on-premise en la planta, etc.)
//
// Uso:
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup     (configura el arranque automático con el sistema)
//
module.exports = {
  apps: [
    {
      name: 'control-trama-backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
