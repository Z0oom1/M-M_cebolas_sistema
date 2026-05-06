/**
 * dev.js — Script de inicialização para modo desenvolvimento
 * 
 * O que faz:
 *   1. Sobe o servidor Express (server/server.js) na porta 3000
 *   2. Aguarda o servidor estar pronto (health check)
 *   3. Abre o Electron apontando para o servidor LOCAL
 *   4. Quando o Electron fechar, mata o servidor também
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const SERVER_PORT = 3000;
const SERVER_DIR = path.join(__dirname, 'server');

// ── Cores no terminal ──────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    bold: '\x1b[1m',
};
const log = (color, prefix, msg) => console.log(`${color}${c.bold}[${prefix}]${c.reset} ${msg}`);

// ── 1. Iniciar o servidor ──────────────────────────────────────────
log(c.cyan, 'DEV', 'Iniciando servidor local...');

const serverProcess = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
});

serverProcess.stdout.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => log(c.green, 'SERVER', line));
});

serverProcess.stderr.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => log(c.red, 'SERVER ERR', line));
});

serverProcess.on('exit', (code) => {
    if (code !== null) log(c.yellow, 'SERVER', `Encerrado com código ${code}`);
});

// ── 2. Aguardar servidor estar pronto ─────────────────────────────
function pingServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
            resolve(res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(800, () => { req.destroy(); resolve(false); });
    });
}

async function waitForServer(maxAttempts = 30) {
    for (let i = 1; i <= maxAttempts; i++) {
        const ok = await pingServer();
        if (ok) return true;
        log(c.yellow, 'DEV', `Aguardando servidor... (${i}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

// ── 3. Abrir Electron ─────────────────────────────────────────────
async function startElectron() {
    const ready = await waitForServer();
    if (!ready) {
        log(c.yellow, 'DEV', 'Servidor demorou mais que o esperado, abrindo Electron mesmo assim...');
    } else {
        log(c.cyan, 'DEV', 'Servidor pronto! Abrindo Electron...');
    }

    // Descobre o caminho do electron instalado
    let electronPath;
    try {
        electronPath = require('electron');
    } catch (e) {
        log(c.red, 'DEV', 'Electron não encontrado! Execute: npm install');
        killAll();
        process.exit(1);
    }

    const electronProcess = spawn(electronPath, ['.'], {
        cwd: __dirname,
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: 'inherit',
    });

    electronProcess.on('exit', (code) => {
        log(c.yellow, 'DEV', `Electron encerrado (código ${code}). Encerrando servidor...`);
        killAll();
        process.exit(0);
    });
}

// ── 4. Limpeza ao sair ────────────────────────────────────────────
function killAll() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
    }
}

process.on('SIGINT', () => { log(c.yellow, 'DEV', 'CTRL+C — encerrando tudo...'); killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });

startElectron();
