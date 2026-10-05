/**
 * PM2 process file for the VPS. Exactly ONE instance: a bot token may be polled by a single
 * process only, and the amoCRM worker and rate limiter keep in-process state.
 * Give each client deployment its own name: PM2_APP_NAME=my-water-bot.
 */
module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'water-order-bot',
      cwd: __dirname,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      kill_timeout: 10000,
      time: true,
    },
  ],
};
