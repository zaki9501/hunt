// PM2 Configuration for Invariant Hunter Backend
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'invariant-hunter-api',
      script: 'dist/index.js',
      cwd: '/opt/invariant-hunter',
      instances: 1, // Can increase for load balancing
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',  // Set to 'production' when ready for auth
        PORT: 4000,
        // Add other env vars as needed
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Logging
      error_file: '/var/log/invariant-hunter/error.log',
      out_file: '/var/log/invariant-hunter/out.log',
      log_file: '/var/log/invariant-hunter/combined.log',
      time: true,
      // Restart policy
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
