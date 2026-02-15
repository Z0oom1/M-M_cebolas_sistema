/**
 * PM2 - M&M Cebolas
 * Uso: na pasta server/ execute: pnpm exec pm2 start ecosystem.config.js
 * Reinício automático em falha e gerenciamento de logs.
 */
module.exports = {
    apps: [{
        name: 'mm-cebolas',
        script: 'server.js',
        cwd: __dirname,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,
        merge_logs: true
    }]
};
