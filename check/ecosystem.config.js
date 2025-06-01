module.exports = {
  apps: [
    {
      name: 'vibecheck-api',
      script: 'bun',
      args: 'src/index.ts',
      cwd: '/home/sammy/check',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Health check
      wait_ready: true,
      // Monitoring
      instance_var: 'INSTANCE_ID'
    },
    {
      name: 'vibecheck-workers',
      script: 'bun',
      args: 'src/workers/index.ts',
      cwd: '/home/sammy/check',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      log_file: './logs/workers-combined.log',
      time: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000
    }
  ],

  // Deploy configuration
  deploy: {
    production: {
      user: 'sammy',
      host: 'v.bkk.lol',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/vibecheck.git',
      path: '/home/sammy/vibecheck',
      'pre-deploy': 'git pull',
      'post-deploy': 'cd check && bun install --production && bun run db:migrate && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /home/sammy/vibecheck/check/logs /home/sammy/vibecheck/check/uploads'
    },
    staging: {
      user: 'sammy',
      host: 'staging.vibecheck.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/vibecheck.git',
      path: '/home/sammy/vibecheck-staging',
      'pre-deploy': 'git pull',
      'post-deploy': 'cd check && bun install && bun run db:migrate && pm2 reload ecosystem.config.js',
      'pre-setup': 'mkdir -p /home/sammy/vibecheck-staging/check/logs /home/sammy/vibecheck-staging/check/uploads'
    }
  }
}; 