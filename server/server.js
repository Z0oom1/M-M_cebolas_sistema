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
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

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
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, descricao TEXT, produto TEXT, quantidade INTEGER, valor REAL, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT, ie TEXT, email TEXT, telefone TEXT, endereco TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT, ie TEXT, email TEXT, telefone TEXT, endereco TEXT)`);
        
        // Tabela de Produtos com Ícone e Cor
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            ncm TEXT,
            preco_venda REAL,
            estoque_minimo INTEGER DEFAULT 0,
            icone TEXT DEFAULT 'fa-box',
            cor TEXT DEFAULT '#1A5632'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS nfe (id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER, chave_acesso TEXT, xml_content TEXT, status TEXT, data_emissao TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, label TEXT)`, async () => {
            const hashedPassword = await bcrypt.hash('123', 10);
            db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`, ['admin', hashedPassword, 'admin', 'Administrador']);
        });
        db.run(`CREATE TABLE IF NOT EXISTS configs (chave TEXT PRIMARY KEY, valor TEXT)`, () => {
            db.run(`INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)`, ['nfe_modo', 'homologacao']);
        });
    });
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM usuarios WHERE username = ?`, [username], async (err, row) => {
        if (err || !row) return res.status(401).json({ error: "Credenciais inválidas" });
        const valid = await bcrypt.compare(password, row.password);
        if (!valid) return res.status(401).json({ error: "Credenciais inválidas" });
        const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ username: row.username, role: row.role, token });
    });
});

// ROTAS DE PRODUTOS
app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo, icone, cor) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, ncm, preco_venda, estoque_minimo, icone || 'fa-box', cor || '#1A5632'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, estoque_minimo = ?, icone = ?, cor = ? WHERE id = ?`,
        [nome, ncm, preco_venda, estoque_minimo, icone, cor, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: true });
        }
    );
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// Outras rotas (Movimentações, Clientes, etc.)
app.get('/api/movimentacoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM movimentacoes ORDER BY id DESC`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/entrada', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['entrada', desc, productType, qty, value, date], function(err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id: this.lastID });
        });
});

app.post('/api/saida', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['saida', desc, productType, qty, value, date], function(err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id: this.lastID });
        });
});

app.get('/api/clientes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nome ASC`, (err, rows) => res.json(rows || []));
});

app.get('/api/fornecedores', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM fornecedores ORDER BY nome ASC`, (err, rows) => res.json(rows || []));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
