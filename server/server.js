const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const NFeService = require('./nfe-service');

const app = express();

// ✅ CORREÇÃO CRÍTICO-004: Remover caminho hardcoded do Windows
const certPath = path.join(__dirname, '../certificado/certificado.pfx');

const nfeService = new NFeService(
    certPath,
    process.env.CERT_PASSWORD || '12345678',
    false
);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mm_cebolas_secret_key_change_in_production';

app.use(cors());
app.use(bodyParser.json());

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

// ✅ MIDDLEWARE DE AUTENTICAÇÃO JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

// ✅ MIDDLEWARE DE VERIFICAÇÃO DE ADMIN
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}

// --- BANCO DE DADOS ---
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro no Banco:', err.message);
    else {
        console.log('Banco de Dados Conectado.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Tabela de Caminhões
        db.run(`CREATE TABLE IF NOT EXISTS caminhoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            placa TEXT UNIQUE,
            motorista TEXT,
            modelo TEXT
        )`);

        // Tabela Movimentações com associação ao Caminhão
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT, 
            descricao TEXT, 
            produto TEXT, 
            quantidade INTEGER, 
            valor REAL, 
            data TEXT,
            caminhao_id INTEGER,
            FOREIGN KEY(caminhao_id) REFERENCES caminhoes(id)
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimentacoes(tipo)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data)`);

        // Tabelas de Cadastro
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);

        // Tabela de Produtos
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            ncm TEXT,
            preco_venda REAL,
            estoque_minimo INTEGER DEFAULT 0,
            icone TEXT DEFAULT 'fa-box',
            cor TEXT DEFAULT '#1A5632'
        )`);

        // Tabela de NF-e
        db.run(`CREATE TABLE IF NOT EXISTS nfe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venda_id INTEGER,
            chave_acesso TEXT,
            xml_content TEXT,
            status TEXT,
            data_emissao TEXT
        )`);

        // Tabela de Usuários
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            label TEXT
        )`, async () => {
            const hashedPassword = await bcrypt.hash('123', 10);
            db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`,
                ['admin', hashedPassword, 'admin', 'Administrador']);
        });

        // Tabela de Configurações
        db.run(`CREATE TABLE IF NOT EXISTS configs (
            chave TEXT PRIMARY KEY,
            valor TEXT
        )`, () => {
            db.run(`INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)`, ['nfe_modo', 'homologacao'], () => {
                db.get(`SELECT valor FROM configs WHERE chave = ?`, ['nfe_modo'], (err, row) => {
                    if (row) nfeService.isProduction = (row.valor === 'producao');
                });
            });
        });
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM usuarios WHERE username = ?`, [username], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Usuário ou senha incorretos" });
        const validPassword = await bcrypt.compare(password, row.password);
        if (!validPassword) return res.status(401).json({ error: "Usuário ou senha incorretos" });
        const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ id: row.id, username: row.username, role: row.role, label: row.label, token });
    });
});

// --- ROTAS DE CAMINHÕES ---
app.get('/api/caminhoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM caminhoes ORDER BY placa ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/caminhoes', authenticateToken, (req, res) => {
    const { placa, motorista, modelo } = req.body;
    db.run(`INSERT INTO caminhoes (placa, motorista, modelo) VALUES (?, ?, ?)`, [placa, motorista, modelo], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.delete('/api/caminhoes/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM caminhoes WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- ROTAS DE MOVIMENTAÇÕES ---
app.get('/api/movimentacoes', authenticateToken, (req, res) => {
    db.all(`SELECT m.*, c.placa as caminhao_placa FROM movimentacoes m LEFT JOIN caminhoes c ON m.caminhao_id = c.id ORDER BY m.id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/entrada', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date, caminhao_id } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data, caminhao_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['entrada', desc, productType, qty, value, date, caminhao_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.post('/api/saida', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date, caminhao_id } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data, caminhao_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['saida', desc, productType, qty, value, date, caminhao_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

// --- OUTRAS ROTAS (PRODUTOS, CLIENTES, FORNECEDORES, NFE) ---
app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo, icone, cor) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, ncm, preco_venda, estoque_minimo, icone, cor], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.get('/api/clientes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/fornecedores', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM fornecedores ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/clientes', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`INSERT INTO clientes (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, documento, ie, email, telefone, endereco], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`INSERT INTO fornecedores (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, documento, ie, email, telefone, endereco], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    try {
        const { venda_id, destinatario, itens, caminhao } = req.body;
        const agora = new Date();
        const chave = agora.getTime().toString().padEnd(44, '0');
        
        // Aqui o nfeService seria usado para gerar o XML real. 
        // Para este desafio, simulamos a geração e associação.
        const xml = `<nfe><chave>${chave}</chave><venda>${venda_id}</venda><caminhao>${caminhao ? caminhao.placa : 'N/A'}</caminhao></nfe>`;
        
        db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
            [venda_id, chave, xml, 'autorizada', agora.toISOString()], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, chave, status: 'autorizada' });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/nfe', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM nfe ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM movimentacoes WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR ONLINE NA PORTA ${PORT}`);
});
