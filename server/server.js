require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const NFeService = require('./nfe-service');
const { jsPDF } = require('jspdf');
const bwipjs = require('bwip-js');

const app = express();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);
const SECRET = process.env.JWT_SECRET || 'mm_cebolas_secret_2024';

// --- CONFIGURAÇÃO VISUAL ---
const COR_DESTAQUE = [0, 80, 0];

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT, username TEXT UNIQUE, password TEXT, role TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ncm TEXT, preco_venda REAL, cor TEXT, icone TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT UNIQUE, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT UNIQUE, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, produto TEXT, quantidade INTEGER, valor REAL, descricao TEXT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS nfe (id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER, chave_acesso TEXT, xml_content TEXT, status TEXT, data_emissao TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS configs (chave TEXT PRIMARY KEY, valor TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, username TEXT, acao TEXT, detalhes TEXT, data TEXT)`);

    // Migrações seguras: adiciona colunas se não existirem
    const safeMigrate = (sql, desc) => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error(`Erro migração (${desc}):`, err.message);
            }
        });
    };

    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN unidade TEXT DEFAULT 'CX'`, 'unidade');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN peso_kg REAL DEFAULT 0`, 'peso_kg');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN qtd_caixas INTEGER DEFAULT 0`, 'qtd_caixas');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN lote_id INTEGER`, 'lote_id');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN custo_unitario REAL`, 'custo_unitario');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN numero_nfe INTEGER`, 'numero_nfe');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN serie_nfe INTEGER DEFAULT 1`, 'serie_nfe');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN protocolo_autorizacao TEXT`, 'protocolo_autorizacao');
    safeMigrate(`ALTER TABLE produtos ADD COLUMN peso_por_caixa REAL DEFAULT 20`, 'peso_por_caixa');

    const upsertUser = async (label, username, envPassword, role) => {
        const password = process.env[envPassword] || '123';
        const hash = await bcrypt.hash(password, 10);
        db.get("SELECT * FROM usuarios WHERE username = ?", [username], (err, row) => {
            if (!row) {
                db.run("INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)", [label, username, hash, role]);
            } else if (process.env[envPassword]) {
                db.run("UPDATE usuarios SET password = ? WHERE username = ?", [hash, username]);
            }
        });
    };

    upsertUser('Administrador', 'admin', 'ADMIN_PASSWORD', 'admin');
    upsertUser('Vinicius', 'vinicius', 'VINICIUS_PASSWORD', 'chefe');
    upsertUser('Funcionario', 'funcionario', 'FUNCIONARIO_PASSWORD', 'funcionario');

    if (process.env.NFE_MODO) {
        db.run("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)", ['nfe_modo', process.env.NFE_MODO]);
    }
    if (process.env.CERT_PASSWORD) {
        db.run("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)", ['cert_password', process.env.CERT_PASSWORD]);
    }

    // Config padrão: peso por caixa = 20kg
    db.run("INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)", ['peso_por_caixa_padrao', '20']);
});

// CORS
const CORS_ORIGINS = [
    'https://portalmmcebolas.com',
    'https://www.portalmmcebolas.com',
    'http://portalmmcebolas.com',
    'http://www.portalmmcebolas.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://72.60.8.186'
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.indexOf(origin) !== -1) {
            return callback(null, true);
        } else {
            console.warn('[CORS] Origem não permitida:', origin);
            return callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function registrarLog(req, acao, detalhes) {
    const usuarioId = req.user ? req.user.id : null;
    const username = req.user ? req.user.username : 'sistema';
    const data = new Date().toISOString();
    db.run(`INSERT INTO logs (usuario_id, username, acao, detalhes, data) VALUES (?, ?, ?, ?, ?)`,
        [usuarioId, username, acao, detalhes, data]);
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Usuário não encontrado" });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Senha incorreta" });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET);
        const data = new Date().toISOString();
        db.run(`INSERT INTO logs (usuario_id, username, acao, detalhes, data) VALUES (?, ?, ?, ?, ?)`,
            [user.id, user.username, 'LOGIN', 'Usuário realizou login no sistema', data]);
        res.json({ token, user: { id: user.id, label: user.label, role: user.role }, role: user.role });
    });
});

app.get('/api/movimentacoes', authenticateToken, (req, res) => db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => res.json(rows || [])));

app.post('/api/movimentacoes', authenticateToken, (req, res) => {
    const { tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas } = req.body;

    // Calcular peso_kg e qtd_caixas com base na unidade
    let finalPesoKg = peso_kg || 0;
    let finalQtdCaixas = qtd_caixas || 0;
    let finalQuantidade = quantidade || 0;

    db.get("SELECT valor FROM configs WHERE chave = 'peso_por_caixa_padrao'", [], (err, row) => {
        const pesoPorCaixa = row ? parseFloat(row.valor) : 20;

        if (unidade === 'CX') {
            finalQtdCaixas = finalQuantidade;
            finalPesoKg = finalQuantidade * pesoPorCaixa;
        } else if (unidade === 'KG') {
            finalPesoKg = finalQuantidade;
            finalQtdCaixas = Math.round(finalQuantidade / pesoPorCaixa * 10) / 10;
        } else if (unidade === 'AMBOS') {
            // Quando "ambos", qtd_caixas e peso_kg vêm separados do frontend
            finalQtdCaixas = qtd_caixas || 0;
            finalPesoKg = peso_kg || 0;
            finalQuantidade = finalQtdCaixas; // quantidade principal = caixas
        }

        db.run(
            `INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tipo, produto, finalQuantidade, valor, descricao, data, unidade || 'CX', finalPesoKg, finalQtdCaixas],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const unidadeLabel = unidade === 'AMBOS'
                    ? `${finalQtdCaixas}CX / ${finalPesoKg}KG`
                    : `${finalQuantidade}${unidade || 'CX'}`;
                registrarLog(req, 'MOVIMENTACAO', `${tipo.toUpperCase()}: ${unidadeLabel} de ${produto} - R$ ${valor}`);
                res.json({ id: this.lastID });
            }
        );
    });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], () => res.json({ success: true })));

// Rota de dashboard com estatísticas completas
app.get('/api/dashboard', authenticateToken, (req, res) => {
    db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get("SELECT valor FROM configs WHERE chave = 'peso_por_caixa_padrao'", [], (err2, configRow) => {
            const pesoPorCaixa = configRow ? parseFloat(configRow.valor) : 20;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            let totalCaixas = 0;
            let totalKg = 0;
            let receitaMes = 0;
            let despesasMes = 0;
            let receitaTotal = 0;
            let despesasTotal = 0;

            // Estoque por produto
            const stockByCaixas = {};
            const stockByKg = {};

            // Dados mensais (últimos 6 meses)
            const monthlyData = {};
            for (let i = 5; i >= 0; i--) {
                const d = new Date(currentYear, currentMonth - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthlyData[key] = { receita: 0, despesa: 0, caixas_entrada: 0, caixas_saida: 0, kg_entrada: 0, kg_saida: 0 };
            }

            rows.forEach(t => {
                const tDate = new Date(t.data);
                const monthKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
                const isCurrentMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;

                // Calcular caixas e kg para cada movimentação
                let caixas = t.qtd_caixas || 0;
                let kg = t.peso_kg || 0;

                if (caixas === 0 && kg === 0) {
                    // Compatibilidade com registros antigos
                    if (t.unidade === 'KG') {
                        kg = t.quantidade;
                        caixas = t.quantidade / pesoPorCaixa;
                    } else {
                        caixas = t.quantidade;
                        kg = t.quantidade * pesoPorCaixa;
                    }
                }

                if (t.tipo === 'entrada') {
                    if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
                    stockByCaixas[t.produto] += caixas;
                    stockByKg[t.produto] += kg;
                    totalCaixas += caixas;
                    totalKg += kg;
                    despesasTotal += t.valor;
                    if (isCurrentMonth) despesasMes += t.valor;
                    if (monthlyData[monthKey]) {
                        monthlyData[monthKey].despesa += t.valor;
                        monthlyData[monthKey].caixas_entrada += caixas;
                        monthlyData[monthKey].kg_entrada += kg;
                    }
                } else if (t.tipo === 'saida') {
                    if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
                    stockByCaixas[t.produto] -= caixas;
                    stockByKg[t.produto] -= kg;
                    totalCaixas -= caixas;
                    totalKg -= kg;
                    receitaTotal += t.valor;
                    if (isCurrentMonth) receitaMes += t.valor;
                    if (monthlyData[monthKey]) {
                        monthlyData[monthKey].receita += t.valor;
                        monthlyData[monthKey].caixas_saida += caixas;
                        monthlyData[monthKey].kg_saida += kg;
                    }
                } else if (t.tipo === 'despesa') {
                    despesasTotal += t.valor;
                    if (isCurrentMonth) despesasMes += t.valor;
                    if (monthlyData[monthKey]) monthlyData[monthKey].despesa += t.valor;
                }
            });

            // Top produtos por estoque
            const topProdutos = Object.entries(stockByCaixas)
                .map(([nome, caixas]) => ({ nome, caixas: Math.round(caixas * 10) / 10, kg: Math.round((stockByKg[nome] || 0) * 10) / 10 }))
                .filter(p => p.caixas > 0)
                .sort((a, b) => b.caixas - a.caixas)
                .slice(0, 5);

            // Últimas movimentações
            const ultimasMovimentacoes = rows.slice(0, 10);

            res.json({
                estoque: {
                    totalCaixas: Math.round(totalCaixas * 10) / 10,
                    totalKg: Math.round(totalKg * 10) / 10,
                    porProduto: topProdutos
                },
                financeiro: {
                    receitaMes,
                    despesasMes,
                    lucroMes: receitaMes - despesasMes,
                    receitaTotal,
                    despesasTotal,
                    lucroTotal: receitaTotal - despesasTotal
                },
                mensal: monthlyData,
                ultimasMovimentacoes,
                pesoPorCaixa
            });
        });
    });
});

app.get('/api/produtos', authenticateToken, (req, res) => db.all('SELECT * FROM produtos', [], (err, rows) => res.json(rows || [])));
app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, cor, icone, peso_por_caixa } = req.body;
    if (id) db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, cor = ?, icone = ?, peso_por_caixa = ? WHERE id = ?`, [nome, ncm, preco_venda, cor, icone, peso_por_caixa || 20, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'PRODUTO_EDIT', `Editou produto: ${nome}`);
        res.json({ success: true });
    });
    else db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone, peso_por_caixa) VALUES (?, ?, ?, ?, ?, ?)`, [nome, ncm, preco_venda, cor, icone, peso_por_caixa || 20], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'PRODUTO_ADD', `Adicionou produto: ${nome}`);
        res.json({ id: this.lastID });
    });
});
app.delete('/api/produtos/:id', authenticateToken, (req, res) => db.run('DELETE FROM produtos WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.all('SELECT id, label, username, role FROM usuarios', [], (err, rows) => res.json(rows || []));
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id, label, username, password, role } = req.body;
    const hash = password ? await bcrypt.hash(password, 10) : null;
    if (id) {
        if (hash) {
            db.run(`UPDATE usuarios SET label = ?, username = ?, password = ?, role = ? WHERE id = ?`, [label, username, hash, role, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                registrarLog(req, 'USER_EDIT', `Editou usuário: ${username}`);
                res.json({ success: true });
            });
        } else {
            db.run(`UPDATE usuarios SET label = ?, username = ?, role = ? WHERE id = ?`, [label, username, role, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                registrarLog(req, 'USER_EDIT', `Editou usuário: ${username}`);
                res.json({ success: true });
            });
        }
    } else {
        db.run(`INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)`, [label, username, hash, role], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'USER_ADD', `Adicionou usuário: ${username}`);
            res.json({ id: this.lastID });
        });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'USER_DELETE', `Excluiu usuário ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/logs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.all('SELECT * FROM logs ORDER BY data DESC LIMIT 500', [], (err, rows) => res.json(rows || []));
});

app.get('/api/consultar/:type/:doc', authenticateToken, async (req, res) => {
    const { type, doc } = req.params;
    const cleanDoc = doc.replace(/\D/g, '');
    try {
        if (type === 'CNPJ') {
            const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanDoc}`);
            const data = await response.json();
            if (data.status === 'ERROR') return res.status(400).json({ error: data.message });
            res.json(data);
        } else if (type === 'CPF') {
            res.status(400).json({ error: "Consulta de CPF requer API paga." });
        } else {
            res.status(400).json({ error: "Tipo inválido" });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro ao consultar API externa" });
    }
});

app.get('/api/clientes', authenticateToken, (req, res) => db.all('SELECT * FROM clientes', [], (err, rows) => res.json(rows || [])));
app.post('/api/clientes', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) db.run(`UPDATE clientes SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'CLIENTE_EDIT', `Editou cliente: ${nome}`);
        res.json({ success: true });
    });
    else db.run(`INSERT INTO clientes (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'CLIENTE_ADD', `Adicionou cliente: ${nome}`);
        res.json({ id: this.lastID });
    });
});

app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) db.run(`UPDATE fornecedores SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'FORNECEDOR_EDIT', `Editou fornecedor: ${nome}`);
        res.json({ success: true });
    });
    else db.run(`INSERT INTO fornecedores (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'FORNECEDOR_ADD', `Adicionou fornecedor: ${nome}`);
        res.json({ id: this.lastID });
    });
});

app.delete('/api/cadastros/:type/:id', authenticateToken, (req, res) => {
    const table = req.params.type === 'cliente' ? 'clientes' : req.params.type === 'fornecedor' ? 'fornecedores' : 'produtos';
    db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'CADASTRO_DELETE', `Excluiu ${req.params.type} ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/nfe', authenticateToken, (req, res) => {
    const search = req.query.search || '';
    const query = search
        ? `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id WHERE n.chave_acesso LIKE ? OR m.produto LIKE ? ORDER BY n.data_emissao DESC`
        : `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id ORDER BY n.data_emissao DESC`;
    const params = search ? [`%${search}%`, `%${search}%`] : [];
    db.all(query, params, (err, rows) => res.json(rows || []));
});

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario, itens } = req.body;
    db.get('SELECT * FROM movimentacoes WHERE id = ?', [venda_id], async (err, venda) => {
        if (err || !venda) return res.status(404).json({ error: "Venda não encontrada" });
        db.get('SELECT valor FROM configs WHERE chave = ?', ['nfe_modo'], async (err2, modoRow) => {
            const modo = modoRow ? modoRow.valor : 'homologacao';
            try {
                const nfeService = new NFeService(db, modo);
                const result = await nfeService.gerarNFe(venda, destinatario, itens);
                const chave = result.chave || `NFe${Date.now()}`;
                const xml = result.xml || '';
                const data = new Date().toISOString();
                db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                    [venda_id, chave, xml, 'autorizada', data], function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });
                        registrarLog(req, 'NFE_GERAR', `NF-e gerada para venda #${venda_id}`);
                        res.json({ id: this.lastID, chave });
                    });
            } catch (nfeErr) {
                res.status(500).json({ error: "Erro ao gerar NF-e: " + nfeErr.message });
            }
        });
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get('SELECT * FROM nfe WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "NF-e não encontrada" });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFe_${row.venda_id}.xml`);
        res.send(row.xml_content || '<?xml version="1.0"?><nfe>Sem XML</nfe>');
    });
});

app.delete('/api/nfe/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.run('DELETE FROM nfe WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'NFE_DELETE', `Removeu NF-e ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/nfe/:id/pdf', authenticateToken, (req, res) => {
    db.get(`SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade, m.descricao, m.peso_kg, m.qtd_caixas
            FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id WHERE n.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "NF-e não encontrada" });

        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            // --- DANFE SIMPLIFICADO ---
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");

            // Borda externa
            doc.rect(10, 10, 190, 277);

            // Cabeçalho
            const Y_HEAD = 10;
            doc.setFillColor(240, 240, 240);
            doc.rect(10, Y_HEAD, 190, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA", 105, Y_HEAD + 3.5, { align: 'center' });

            // Emitente
            const Y_EMIT = 15;
            doc.rect(10, Y_EMIT, 130, 30);
            doc.setFontSize(10);
            doc.text("M&M CEBOLAS", 12, Y_EMIT + 8);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text("Comércio de Cebolas", 12, Y_EMIT + 13);

            // Caixa NF-e
            doc.rect(140, Y_EMIT, 60, 30);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("NF-e", 170, Y_EMIT + 8, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text(`Nº: ${row.venda_id}`, 170, Y_EMIT + 14, { align: 'center' });
            doc.text(`Série: 001`, 170, Y_EMIT + 19, { align: 'center' });

            // Chave de Acesso
            const Y_CHAVE = Y_EMIT + 30;
            doc.rect(10, Y_CHAVE, 190, 10);
            doc.setFont("helvetica", "bold");
            doc.text("CHAVE DE ACESSO:", 12, Y_CHAVE + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.text(row.chave_acesso || '', 12, Y_CHAVE + 8);

            // Destinatário
            const Y_DEST = Y_CHAVE + 10;
            doc.rect(10, Y_DEST, 190, 20);
            doc.setFillColor(240, 240, 240);
            doc.rect(10, Y_DEST, 190, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("DESTINATÁRIO / REMETENTE", 12, Y_DEST + 3.5);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.text(`NOME / RAZÃO SOCIAL: ${row.descricao || ''}`, 12, Y_DEST + 10);
            doc.text(`DATA DE EMISSÃO: ${new Date(row.data_emissao).toLocaleDateString('pt-BR')}`, 12, Y_DEST + 15);

            // Impostos
            const Y_IMP = Y_DEST + 20;
            doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.setFillColor(240, 240, 240);
            doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("CÁLCULO DO IMPOSTO", 12, Y_IMP + 3.5);

            const box = (x, y, w, h, label) => {
                doc.rect(x, y, w, h);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(6);
                doc.text(label, x + 1, y + 3);
            };
            const field = (x, y, w, h, label, value, align = 'left', size = 7) => {
                doc.rect(x, y, w, h);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(6);
                doc.text(label, x + 1, y + 3);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(size);
                if (align === 'right') doc.text(String(value), x + w - 1, y + h - 2, { align: 'right' });
                else if (align === 'center') doc.text(String(value), x + w / 2, y + h - 2, { align: 'center' });
                else doc.text(String(value), x + 1, y + h - 2);
            };

            field(10, Y_IMP + 5, 38, 8, "BASE CÁLC. ICMS", "0,00", 'right');
            field(48, Y_IMP + 5, 38, 8, "VALOR DO ICMS", "0,00", 'right');
            field(86, Y_IMP + 5, 38, 8, "BASE CÁLC. ICMS S.T.", "0,00", 'right');
            field(124, Y_IMP + 5, 38, 8, "VALOR DO ICMS S.T.", "0,00", 'right');
            field(162, Y_IMP + 5, 38, 8, "VALOR TOTAL PRODUTOS", row.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'right');

            field(10, Y_IMP + 13, 38, 8, "VALOR DO FRETE", "0,00", 'right');
            field(48, Y_IMP + 13, 38, 8, "VALOR DO SEGURO", "0,00", 'right');
            field(86, Y_IMP + 13, 38, 8, "DESCONTO", "0,00", 'right');
            field(124, Y_IMP + 13, 38, 8, "OUTRAS DESP. ACESS.", "0,00", 'right');
            field(162, Y_IMP + 13, 38, 8, "VALOR TOTAL DA NOTA", row.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'right');

            // Transportador
            const Y_TRA = Y_IMP + 21 + 10;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_TRA, 190, 5, 'F');
            doc.setFont("helvetica", "bold"); doc.setFontSize(8);
            doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", 12, Y_TRA + 3.5);
            field(10, Y_TRA + 5, 80, 8, "RAZÃO SOCIAL", "O MESMO");
            field(90, Y_TRA + 5, 20, 8, "FRETE", "9-Sem Frete", 'center', 6);
            field(110, Y_TRA + 5, 20, 8, "CÓDIGO ANTT", "");
            field(130, Y_TRA + 5, 20, 8, "PLACA", "");
            field(150, Y_TRA + 5, 10, 8, "UF", "");
            field(160, Y_TRA + 5, 40, 8, "CNPJ/CPF", "");

            // Produtos
            const Y_PROD = Y_TRA + 13 + 10;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_PROD, 190, 5, 'F');
            doc.setFont("helvetica", "bold"); doc.setFontSize(8);
            doc.text("DADOS DO PRODUTO / SERVIÇO", 12, Y_PROD + 3.5);
            const yH = Y_PROD + 5;
            box(10, yH, 15, 5, "CÓDIGO"); box(25, yH, 70, 5, "DESCRIÇÃO"); box(95, yH, 15, 5, "NCM/SH");
            box(110, yH, 10, 5, "CST"); box(120, yH, 10, 5, "CFOP"); box(130, yH, 10, 5, "UN");
            box(140, yH, 15, 5, "QTD"); box(155, yH, 20, 5, "V.UNIT"); box(175, yH, 25, 5, "V.TOTAL");

            const yR = yH + 5;
            const unidadeLabel = row.unidade === 'AMBOS'
                ? `${row.qtd_caixas}CX/${row.peso_kg}KG`
                : (row.unidade || 'CX');
            const qtdLabel = row.unidade === 'AMBOS' ? row.qtd_caixas : row.quantidade;

            field(10, yR, 15, 8, "", "001");
            field(25, yR, 70, 8, "", row.produto);
            field(95, yR, 15, 8, "", "07031019", 'center', 7);
            field(110, yR, 10, 8, "", "0102", 'center', 7);
            field(120, yR, 10, 8, "", "5102", 'center', 7);
            field(130, yR, 10, 8, "", unidadeLabel, 'center', 7);
            field(140, yR, 15, 8, "", qtdLabel, 'center');
            field(155, yR, 20, 8, "", (row.valor / (qtdLabel || 1)).toFixed(2), 'right');
            field(175, yR, 25, 8, "", row.valor.toFixed(2), 'right');

            // Adicionais
            const Y_ADI = yR + 8 + 15;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_ADI, 190, 5, 'F');
            doc.setFont("helvetica", "bold"); doc.setFontSize(8);
            doc.text("DADOS ADICIONAIS", 12, Y_ADI + 3.5);
            box(10, Y_ADI + 5, 125, 25, "INFORMAÇÕES COMPLEMENTARES");
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text("Documento emitido por ME ou EPP optante pelo Simples Nacional.\nNão gera direito a crédito fiscal de IPI.", 12, Y_ADI + 15);
            box(135, Y_ADI + 5, 65, 25, "RESERVADO AO FISCO");

            const pdfOutput = doc.output('arraybuffer');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=DANFE_${row.venda_id}.pdf`);
            res.send(Buffer.from(new Uint8Array(pdfOutput)));

        } catch (pdfErr) {
            res.status(500).send('Erro ao gerar PDF: ' + pdfErr.message);
        }
    });
});

app.get('/api/configs', authenticateToken, (req, res) => {
    db.all('SELECT * FROM configs', [], (err, rows) => {
        const c = {};
        rows?.forEach(r => c[r.chave] = r.valor);
        res.json(c);
    });
});

app.post('/api/configs', authenticateToken, (req, res) => {
    const { chave, valor } = req.body;
    db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], () => {
        registrarLog(req, 'CONFIG_UPDATE', `Configuração atualizada: ${chave} = ${valor}`);
        res.json({ success: true });
    });
});

app.delete('/api/reset', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.serialize(() => {
        ['movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos'].forEach(t => db.run(`DELETE FROM ${t}`));
        registrarLog(req, 'SYSTEM_RESET', 'Sistema resetado pelo administrador');
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor M&M Cebolas rodando na porta ${PORT}`);
});
