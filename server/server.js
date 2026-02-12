const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
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
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT, 
            descricao TEXT, 
            produto TEXT, 
            quantidade INTEGER, 
            valor REAL, 
            data TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT UNIQUE, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT UNIQUE, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE,
            ncm TEXT,
            preco_venda REAL,
            estoque_minimo INTEGER DEFAULT 0,
            icone TEXT DEFAULT 'fa-box',
            cor TEXT DEFAULT '#1A5632'
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS nfe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venda_id INTEGER,
            chave_acesso TEXT,
            xml_content TEXT,
            status TEXT,
            data_emissao TEXT
        )`);
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
        db.run(`CREATE TABLE IF NOT EXISTS configs (chave TEXT PRIMARY KEY, valor TEXT)`, () => {
            db.run(`INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)`, ['nfe_modo', 'homologacao']);
        });
    });
}

// --- AUTENTICAÇÃO ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    db.get(`SELECT * FROM usuarios WHERE username = ?`, [username], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Usuário ou senha incorretos" });
        const validPassword = await bcrypt.compare(password, row.password);
        if (!validPassword) return res.status(401).json({ error: "Usuário ou senha incorretos" });
        const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ id: row.id, username: row.username, role: row.role, label: row.label, token });
    });
});

// --- USUÁRIOS (FUNCIONÁRIOS) ---
app.get('/api/usuarios', authenticateToken, (req, res) => {
    db.all(`SELECT id, username, role, label FROM usuarios ORDER BY label ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    const { id, username, password, role, label } = req.body;
    if (id) {
        let query = `UPDATE usuarios SET username=?, role=?, label=? WHERE id=?`;
        let params = [username, role, label, id];
        if (password) {
            query = `UPDATE usuarios SET username=?, password=?, role=?, label=? WHERE id=?`;
            const hashedPassword = await bcrypt.hash(password, 10);
            params = [username, hashedPassword, role, label, id];
        }
        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: true });
        });
    } else {
        const hashedPassword = await bcrypt.hash(password || '123', 10);
        db.run(`INSERT INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, role, label], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    if (req.params.id == 1) return res.status(400).json({ error: "Não é possível excluir o admin principal" });
    db.run(`DELETE FROM usuarios WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- MOVIMENTAÇÕES & FINANCEIRO ---
app.get('/api/movimentacoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM movimentacoes ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/entrada', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['entrada', desc, productType, qty, value, date], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.post('/api/saida', authenticateToken, (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['saida', desc, productType, qty, value, date], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.post('/api/despesa', authenticateToken, (req, res) => {
    const { desc, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['despesa', desc, 'Financeiro', 0, value, date], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

// --- PRODUTOS ---
app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    if (id) {
        db.run(`UPDATE produtos SET nome=?, ncm=?, preco_venda=?, estoque_minimo=?, icone=?, cor=? WHERE id=?`,
            [nome, ncm, preco_venda, estoque_minimo, icone, cor, id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ updated: true });
            });
    } else {
        db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo, icone, cor) VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, ncm, preco_venda, estoque_minimo, icone, cor], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- CLIENTES & FORNECEDORES ---
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
    const { id, nome, documento, ie, email, telefone, endereco } = req.body;
    if (id) {
        db.run(`UPDATE clientes SET nome=?, documento=?, ie=?, email=?, telefone=?, endereco=? WHERE id=?`,
            [nome, documento, ie, email, telefone, endereco, id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ updated: true });
            });
    } else {
        db.run(`INSERT INTO clientes (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, documento, ie, email, telefone, endereco], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, ie, email, telefone, endereco } = req.body;
    if (id) {
        db.run(`UPDATE fornecedores SET nome=?, documento=?, ie=?, email=?, telefone=?, endereco=? WHERE id=?`,
            [nome, documento, ie, email, telefone, endereco, id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ updated: true });
            });
    } else {
        db.run(`INSERT INTO fornecedores (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, documento, ie, email, telefone, endereco], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/clientes/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM clientes WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

app.delete('/api/fornecedores/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM fornecedores WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- CONSULTA CNPJ ---
app.get('/api/consulta-cnpj/:cnpj', authenticateToken, async (req, res) => {
    try {
        const response = await axios.get(`https://receitaws.com.br/v1/cnpj/${req.params.cnpj.replace(/\D/g, '')}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Erro ao consultar CNPJ" });
    }
});

// --- NF-e (XML / PDF) ---
app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    try {
        const { venda_id, destinatario, itens } = req.body;
        const agora = new Date();
        const chave = agora.getTime().toString().padEnd(44, '0');
        const xml = `<nfe><chave>${chave}</chave><venda>${venda_id}</venda><status>autorizada</status></nfe>`;
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

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get(`SELECT xml_content, chave_acesso FROM nfe WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Nota não encontrada" });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFe_${row.chave_acesso}.xml`);
        res.send(row.xml_content);
    });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    db.run(`DELETE FROM movimentacoes WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- CONFIGURAÇÕES ---
app.get('/api/configs', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM configs`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const configObj = {};
        rows.forEach(row => configObj[row.chave] = row.valor);
        res.json(configObj);
    });
});

app.post('/api/configs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    const { chave, valor } = req.body;
    if (!chave) return res.status(400).json({ error: "Chave não informada" });
    db.run(`INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)`, [chave, valor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/reset', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    db.serialize(() => {
        db.run("DELETE FROM movimentacoes");
        db.run("DELETE FROM clientes");
        db.run("DELETE FROM fornecedores");
        db.run("DELETE FROM nfe");
    });
    res.json({ message: "Sistema resetado" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR ONLINE NA PORTA ${PORT}`);
});
