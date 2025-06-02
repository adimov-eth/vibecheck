/* eslint-env node */
module.exports = {
  apps: [
    {
      name: 'vibecheck-api',
      script: 'bun',
      args: 'src/index.ts',
      cwd: process.env.PM2_CWD || __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_file: '.env',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'vibecheck-audio-worker',
      script: 'bun',
      args: 'src/workers/audio-worker.ts',
      cwd: process.env.PM2_CWD || __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env',
      error_file: './logs/audio-worker-error.log',
      out_file: './logs/audio-worker-out.log',
      log_file: './logs/audio-worker-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'vibecheck-gpt-worker',
      script: 'bun',
      args: 'src/workers/gpt-worker.ts',
      cwd: process.env.PM2_CWD || __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env',
      error_file: './logs/gpt-worker-error.log',
      out_file: './logs/gpt-worker-out.log',
      log_file: './logs/gpt-worker-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'vibecheck-notification-worker',
      script: 'bun',
      args: 'src/workers/notification-worker.ts',
      cwd: process.env.PM2_CWD || __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env',
      error_file: './logs/notification-worker-error.log',
      out_file: './logs/notification-worker-out.log',
      log_file: './logs/notification-worker-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'vibecheck-cleanup-worker',
      script: 'bun',
      args: 'src/workers/cleanup-worker.ts',
      cwd: process.env.PM2_CWD || __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env',
      error_file: './logs/cleanup-worker-error.log',
      out_file: './logs/cleanup-worker-out.log',
      log_file: './logs/cleanup-worker-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
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
      'post-deploy': 'cd check && bun install --production && bun run db:migrate && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': 'mkdir -p /home/sammy/vibecheck/check/logs /home/sammy/vibecheck/check/uploads'
    },
    staging: {
      user: 'sammy',
      host: 'staging.vibecheck.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/vibecheck.git',
      path: '/home/sammy/vibecheck-staging',
      'pre-deploy': 'git pull',
      'post-deploy': 'cd check && bun install && bun run db:migrate && pm2 reload ecosystem.config.cjs',
      'pre-setup': 'mkdir -p /home/sammy/vibecheck-staging/check/logs /home/sammy/vibecheck-staging/check/uploads'
    }
  }
}; 