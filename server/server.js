const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// --- NOVO: SERVIR ARQUIVOS PARA ACESSO WEB/IPAD ---
// Permite acessar o sistema pelo navegador digitando o IP do computador
app.use(express.static(path.join(__dirname, '../frontend')));

// Redireciona a raiz "/" para a tela de login automaticamente
app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

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
        // Tabela Movimentações
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT, descricao TEXT, produto TEXT, quantidade INTEGER, valor REAL, data TEXT
        )`);

        // Tabelas de Cadastro
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT
        )`);

        // Tabela de Produtos
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            ncm TEXT,
            preco_venda REAL,
            estoque_minimo INTEGER DEFAULT 0
        )`);

        // Tabela de NF-e
        db.run(`CREATE TABLE IF NOT EXISTS nfe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venda_id INTEGER,
            chave_acesso TEXT,
            xml_content TEXT,
            status TEXT, -- 'pendente', 'autorizada', 'cancelada'
            data_emissao TEXT
        )`);
    });
}

// --- ROTAS DE MOVIMENTAÇÕES (Entrada, Saída, Despesa) ---

app.get('/api/movimentacoes', (req, res) => {
    db.all(`SELECT * FROM movimentacoes ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/entrada', (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['entrada', desc, productType, qty, value, date],
        function(err) { res.json({ id: this.lastID }); }
    );
});

app.post('/api/saida', (req, res) => {
    const { desc, productType, qty, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['saida', desc, productType, qty, value, date],
        function(err) { res.json({ id: this.lastID }); }
    );
});

app.post('/api/despesa', (req, res) => {
    const { desc, value, date } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
        ['despesa', desc, '-', 0, value, date],
        function(err) { res.json({ id: this.lastID }); }
    );
});

app.delete('/api/movimentacoes/:id', (req, res) => {
    db.run(`DELETE FROM movimentacoes WHERE id = ?`, req.params.id, (err) => res.json({ deleted: true }));
});

app.put('/api/movimentacoes/:id', (req, res) => {
    const { desc, productType, qty, value } = req.body;
    db.run(`UPDATE movimentacoes SET descricao = ?, produto = ?, quantidade = ?, valor = ? WHERE id = ?`,
        [desc, productType, qty, value, req.params.id],
        function(err) { res.json({ updated: this.changes }); }
    );
});

// --- ROTAS DE CLIENTES ---

app.get('/api/clientes', (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nome ASC`, [], (err, rows) => res.json(rows));
});

app.post('/api/clientes', (req, res) => {
    const { nome, documento, ie, email, telefone } = req.body;
    db.run(`INSERT INTO clientes (nome, documento, ie, email, telefone) VALUES (?, ?, ?, ?, ?)`, 
        [nome, documento, ie, email, telefone], 
        function(err) { 
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID }); 
        }
    );
});

app.delete('/api/clientes/:id', (req, res) => {
    db.run(`DELETE FROM clientes WHERE id = ?`, req.params.id, (err) => res.json({ deleted: true }));
});

// Rota de Edição (Adicionada)
app.put('/api/clientes/:id', (req, res) => {
    const { nome, documento, ie, email, telefone } = req.body;
    db.run(`UPDATE clientes SET nome = ?, documento = ?, ie = ?, email = ?, telefone = ? WHERE id = ?`, 
        [nome, documento, ie, email, telefone, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
});

// --- ROTAS DE PRODUTOS ---

app.get('/api/produtos', (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, [], (err, rows) => res.json(rows));
});

app.post('/api/produtos', (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo } = req.body;
    db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo) VALUES (?, ?, ?, ?)`,
        [nome, ncm, preco_venda, estoque_minimo],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/produtos/:id', (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo } = req.body;
    db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, estoque_minimo = ? WHERE id = ?`,
        [nome, ncm, preco_venda, estoque_minimo, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
});

app.delete('/api/produtos/:id', (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, (err) => res.json({ deleted: true }));
});

// --- ROTAS DE FORNECEDORES ---

app.get('/api/fornecedores', (req, res) => {
    db.all(`SELECT * FROM fornecedores ORDER BY nome ASC`, [], (err, rows) => res.json(rows));
});

app.post('/api/fornecedores', (req, res) => {
    const { nome, documento, ie, email, telefone } = req.body;
    db.run(`INSERT INTO fornecedores (nome, documento, ie, email, telefone) VALUES (?, ?, ?, ?, ?)`, 
        [nome, documento, ie, email, telefone], 
        function(err) { 
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID }); 
        }
    );
});

app.delete('/api/fornecedores/:id', (req, res) => {
    db.run(`DELETE FROM fornecedores WHERE id = ?`, req.params.id, (err) => res.json({ deleted: true }));
});

// Rota de Edição (Adicionada)
app.put('/api/fornecedores/:id', (req, res) => {
    const { nome, documento, ie, email, telefone } = req.body;
    db.run(`UPDATE fornecedores SET nome = ?, documento = ?, ie = ?, email = ?, telefone = ? WHERE id = ?`, 
        [nome, documento, ie, email, telefone, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
});

// --- ROTAS DE NF-e ---

app.get('/api/nfe', (req, res) => {
    db.all(`SELECT * FROM nfe ORDER BY id DESC`, [], (err, rows) => res.json(rows));
});

app.post('/api/nfe/gerar', (req, res) => {
    const { venda_id, cliente_id, itens } = req.body;
    
    // Simulação de geração de XML e Chave de Acesso
    const chave = "35" + Math.floor(Math.random() * 100000000000000000000000000000000000000000).toString().padStart(42, '0');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe${chave}"><ide><cUF>35</cUF></ide></infNFe></NFe></nfeProc>`;
    
    db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
        [venda_id, chave, xml, 'autorizada', new Date().toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, chave, status: 'autorizada' });
        }
    );
});

// --- RESET GERAL ---
app.delete('/api/reset', (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM movimentacoes");
        db.run("DELETE FROM clientes");
        db.run("DELETE FROM fornecedores");
    });
    res.json({ message: "Resetado" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SERVIDOR ONLINE NA PORTA ${PORT}`);
    console.log(`- App Electron: Funcionando`);
    console.log(`- Acesso Web/iPad: Liberado (http://SEU_IP:${PORT})\n`);
});