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
require('jspdf-autotable');
const bwipjs = require('bwip-js');

const app = express();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);
const SECRET = process.env.JWT_SECRET || 'mm_cebolas_secret_2024';

// --- CONFIGURAÇÃO VISUAL E CACHE ---
const COR_DESTAQUE = [0, 80, 0];
let LOGO_CACHE = null;

function getLogoBase64() {
    if (LOGO_CACHE) return LOGO_CACHE;
    try {
        const logoPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath).toString('base64');
            LOGO_CACHE = `data:image/png;base64,${logoData}`;
            return LOGO_CACHE;
        }
    } catch (e) { console.error("Erro ao carregar logo:", e); }
    return null;
}

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
        if (!origin) return callback(null, true); // Electron (file://) e ferramentas sem origin
        if (CORS_ORIGINS.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        // Em modo desenvolvimento, liberar qualquer localhost
        if (process.env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
            return callback(null, true);
        }
        console.warn('[CORS] Origem n\u00e3o permitida:', origin);
        return callback(null, false);
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

// Endpoint de health check para o modo dev
app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'production' }));

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
            
            // Mapear campos do ReceitaWS para o formato esperado pelo frontend
            const mappedData = {
                nome: data.nome,
                razao_social: data.nome,
                fantasia: data.fantasia,
                telefone: data.telefone,
                email: data.email,
                logradouro: data.logradouro,
                numero: data.numero,
                bairro: data.bairro,
                municipio: data.municipio,
                uf: data.uf,
                cep: data.cep
            };
            res.json(mappedData);
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
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    
    if (id) {
        db.run(`UPDATE clientes SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_EDIT', `Editou cliente: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO clientes (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_ADD', `Adicionou cliente: ${nome}`);
            res.json({ id: this.lastID });
        });
    }
});

app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    
    if (id) {
        db.run(`UPDATE fornecedores SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'FORNECEDOR_EDIT', `Editou fornecedor: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO fornecedores (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'FORNECEDOR_ADD', `Adicionou fornecedor: ${nome}`);
            res.json({ id: this.lastID });
        });
    }
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
        
        // Buscar configurações necessárias
        db.all('SELECT chave, valor FROM configs', [], async (err2, configs) => {
            const configMap = {};
            configs?.forEach(c => configMap[c.chave] = c.valor);
            
            const modo = configMap['nfe_modo'] || 'homologacao';
            const isProduction = modo === 'producao';
            const certPassword = configMap['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            
            try {
                const nfeService = new NFeService(pfxPath, certPassword, isProduction);
                
                // Gerar chave de acesso
                const cNF = Math.floor(Math.random() * 100000000);
                const chaveParams = {
                    cUF: configMap['emit_uf_cod'] || '35',
                    year: new Date().getFullYear().toString().slice(-2),
                    month: String(new Date().getMonth() + 1).padStart(2, '0'),
                    cnpj: (configMap['emit_cnpj'] || '56421395000150').replace(/\D/g, ''),
                    mod: '55',
                    serie: parseInt(configMap['nfe_serie'] || '1'),
                    nNF: parseInt(configMap['nfe_prox_numero'] || venda_id),
                    tpEmis: '1',
                    cNF
                };
                const chaveAcesso = nfeService.generateChaveAcesso(chaveParams);
                
                // Montar dados da NF-e
                const nfeData = {
                    ide: {
                        cUF: configMap['emit_uf_cod'] || '35',
                        cNF,
                        natOp: 'Venda de mercadoria adquirida de terceiros',
                        mod: 55,
                        serie: parseInt(configMap['nfe_serie'] || '1'),
                        nNF: parseInt(configMap['nfe_prox_numero'] || venda_id),
                        dhEmi: new Date().toISOString(),
                        tpNF: '1',
                        idDest: '1',
                        cMunFG: configMap['emit_cmun'] || '3541406',
                        tpImp: '2',
                        tpEmis: '1',
                        chaveAcesso,
                        finNFe: '1',
                        indFinal: '1',
                        indPres: '1'
                    },
                    emit: {
                        cnpj: (configMap['emit_cnpj'] || '56421395000150').replace(/\D/g, ''),
                        xNome: configMap['emit_nome'] || 'M & M HF COMERCIO DE CEBOLAS LTDA',
                        xFant: configMap['emit_fant'] || 'M & M HF COMERCIO DE CEBOLAS',
                        ie: (configMap['emit_ie'] || '562696411110').replace(/\D/g, ''),
                        crt: configMap['emit_crt'] || '3',
                        enderEmit: {
                            xLgr: configMap['emit_lgr'] || 'RUA MANOEL CRUZ',
                            nro: configMap['emit_nro'] || '36',
                            xBairro: configMap['emit_bairro'] || 'RESIDENCIAL MINERVA I',
                            cMun: configMap['emit_cmun'] || '3541406',
                            xMun: configMap['emit_xmun'] || 'PRESIDENTE PRUDENTE',
                            UF: configMap['emit_uf'] || 'SP',
                            CEP: (configMap['emit_cep'] || '19026168').replace(/\D/g, '')
                        }
                    },
                    dest: {
                        cnpj: (destinatario.documento || '').replace(/\D/g, ''),
                        xNome: destinatario.nome || 'Consumidor Final',
                        indIEDest: '9',
                        enderDest: {
                            xLgr: destinatario.endereco?.split(',')[0] || 'Endereço não informado',
                            nro: destinatario.endereco?.split(',')[1]?.trim() || 'S/N',
                            xBairro: destinatario.endereco?.split(',')[2]?.trim() || 'Bairro',
                            cMun: '3541406', // Ideal seria buscar pelo município
                            xMun: destinatario.endereco?.split(',')[3]?.trim() || 'PRESIDENTE PRUDENTE',
                            UF: destinatario.uf || 'SP',
                            CEP: (destinatario.cep || '19000000').replace(/\D/g, '')
                        }
                    },
                    det: [{
                        prod: {
                            code: '001',
                            xProd: venda.produto,
                            NCM: '07031019',
                            CFOP: (destinatario.uf && destinatario.uf !== (configMap['emit_uf'] || 'SP')) ? '6102' : '5102',
                            uCom: 'CX',
                            qCom: venda.qtd_caixas || 1,
                            vUnCom: venda.valor / (venda.qtd_caixas || 1),
                            vProd: venda.valor
                        },
                        imposto: {
                            ICMS: { CST: '00', modBC: '0', vBC: '0', pICMS: '0', vICMS: '0' },
                            PIS: { CST: '99', vPIS: '0' },
                            COFINS: { CST: '99', vCOFINS: '0' }
                        }
                    }],
                    total: {
                        icmsTot: {
                            vBC: '0',
                            vICMS: '0',
                            vICMSDeson: '0',
                            vBCST: '0',
                            vST: '0',
                            vProd: venda.valor,
                            vFrete: '0',
                            vSeg: '0',
                            vDesc: '0',
                            vII: '0',
                            vIPI: '0',
                            vPIS: '0',
                            vCOFINS: '0',
                            vOutro: '0',
                            vNF: venda.valor
                        }
                    },
                    transp: {
                        modFrete: '9'
                    },
                    infAdic: {
                        infCpl: 'Documento emitido por ME ou EPP optante pelo Simples Nacional.'
                    }
                };
                
                // Gerar XML assinado
                const xmlAssinado = nfeService.createNFeXML(nfeData);
                
                // Transmitir para SEFAZ
                const transmissaoResult = await nfeService.transmitirSefaz(xmlAssinado, configMap['emit_uf_cod'] || '35');
                
                const dataEmissao = new Date().toISOString();
                const status = transmissaoResult.status || 'assinada';
                
                db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao, protocolo_autorizacao) VALUES (?, ?, ?, ?, ?, ?)`,
                    [venda_id, chaveAcesso, xmlAssinado, status, dataEmissao, transmissaoResult.protocolo || ''], function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });
                        registrarLog(req, 'NFE_GERAR', `NF-e gerada para venda #${venda_id} - Status: ${status}`);
                        res.json({ id: this.lastID, chave: chaveAcesso, status, message: transmissaoResult.message });
                    });
            } catch (nfeErr) {
                console.error('Erro ao gerar NF-e:', nfeErr);
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

app.post('/api/nfe/:id/transmitir', authenticateToken, async (req, res) => {
    db.get('SELECT * FROM nfe WHERE id = ?', [req.params.id], async (err, nfe) => {
        if (err || !nfe) return res.status(404).json({ error: "NF-e não encontrada" });
        if (nfe.status === 'autorizada') return res.status(400).json({ error: "NF-e já está autorizada" });

        db.all('SELECT chave, valor FROM configs', [], async (err2, configs) => {
            const configMap = {};
            configs?.forEach(c => configMap[c.chave] = c.valor);
            
            const modo = configMap['nfe_modo'] || 'homologacao';
            const isProduction = modo === 'producao';
            const certPassword = configMap['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            
            try {
                const nfeService = new NFeService(pfxPath, certPassword, isProduction);
                const transmissaoResult = await nfeService.transmitirSefaz(nfe.xml_content, configMap['emit_uf_cod'] || '35');
                
                if (transmissaoResult.status === 'autorizada') {
                    db.run(`UPDATE nfe SET status = ?, protocolo_autorizacao = ? WHERE id = ?`,
                        [transmissaoResult.status, transmissaoResult.protocolo, req.params.id], (err3) => {
                            if (err3) return res.status(500).json({ error: err3.message });
                            res.json({ success: true, status: transmissaoResult.status, message: transmissaoResult.message });
                        });
                } else {
                    res.json({ success: false, status: transmissaoResult.status, message: transmissaoResult.message });
                }
            } catch (nfeErr) {
                res.status(500).json({ error: nfeErr.message });
            }
        });
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
            
            // --- Helpers for Barcodes ---
            const generateBarcode = (text) => {
                return new Promise((resolve, reject) => {
                    bwipjs.toBuffer({
                        bcid: 'code128',       // Barcode type
                        text: text,            // Text to encode
                        scale: 3,              // 3x scaling factor
                        height: 12,            // Bar height
                        includetext: false,    // Don't show text below barcode
                    }, (err, png) => {
                        if (err) reject(err);
                        else resolve(png);
                    });
                });
            };

            const generateQRCode = (text) => {
                return new Promise((resolve, reject) => {
                    bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: text,
                        scale: 2,
                        width: 25,
                        height: 25
                    }, (err, png) => {
                        if (err) reject(err);
                        else resolve(png);
                    });
                });
            };

            const configs = await new Promise((resolve) => {
                db.all('SELECT chave, valor FROM configs', [], (err, rows) => {
                    const map = {};
                    rows?.forEach(r => map[r.chave] = r.valor);
                    resolve(map);
                });
            });

            // --- DANFE LAYOUT ---
            doc.setFont("helvetica", "normal");

            // 0. LOGO (Otimizado com Cache)
            const logoBase64 = getLogoBase64();
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 12, 24, 25, 25);
            }
            
            // 1. RECEBEMOS DE... (Topo)
            doc.rect(10, 10, 155, 12);
            doc.setFontSize(6);
            doc.text("RECEBEMOS DE " + (configs['emit_nome'] || "M&M HF COMERCIO DE CEBOLAS LTDA") + " OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO", 12, 13);
            doc.text("DATA DE RECEBIMENTO", 12, 20);
            doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", 50, 20);
            
            doc.rect(165, 10, 35, 12);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text("NF-e", 182.5, 15, { align: 'center' });
            doc.setFontSize(7);
            doc.text(`Nº ${row.numero_nfe || row.venda_id}`, 182.5, 19, { align: 'center' });
            doc.text(`SÉRIE ${row.serie_nfe || '1'}`, 182.5, 21, { align: 'center' });

            // 2. IDENTIFICAÇÃO DO EMITENTE
            doc.rect(10, 22, 85, 28);
            const xText = 38; 
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.text(configs['emit_nome'] || "M&M HF COMERCIO DE CEBOLAS LTDA", xText, 28);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text(configs['emit_lgr'] || "RUA MANOEL CRUZ, 36", xText, 32);
            doc.text(`${configs['emit_bairro'] || 'RESIDENCIAL MINERVA I'} - ${configs['emit_cep'] || '19026-168'}`, xText, 35);
            doc.text(`${configs['emit_xmun'] || 'PRESIDENTE PRUDENTE'} - ${configs['emit_uf'] || 'SP'}`, xText, 38);
            doc.text("Fone: " + (configs['emit_tel'] || "(18) 9999-9999"), xText, 41);

            // 3. DANFE BOX
            doc.rect(95, 22, 22, 28);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("DANFE", 106, 28, { align: 'center' });
            doc.setFontSize(5);
            doc.setFont("helvetica", "normal");
            doc.text("Documento Auxiliar da", 106, 31, { align: 'center' });
            doc.text("Nota Fiscal Eletrônica", 106, 33, { align: 'center' });
            doc.text("0 - Entrada", 97, 37);
            doc.text("1 - Saída", 97, 40);
            doc.rect(109, 36, 4, 4);
            doc.setFontSize(8);
            doc.text("1", 111, 39.2, { align: 'center' });
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text(`Nº ${row.numero_nfe || row.venda_id}`, 106, 44, { align: 'center' });
            doc.text(`SÉRIE ${row.serie_nfe || '1'}`, 106, 47, { align: 'center' });

            // 4. CHAVE DE ACESSO / BARCODE
            doc.rect(117, 22, 83, 28);
            if (row.chave_acesso) {
                try {
                    const barcodeBuffer = await generateBarcode(row.chave_acesso);
                    const barcodeBase64 = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;
                    doc.addImage(barcodeBase64, 'PNG', 119, 24, 79, 8);
                    doc.setFontSize(5); doc.setFont("helvetica", "normal");
                    doc.text("CHAVE DE ACESSO", 119, 34);
                    doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
                    const c = row.chave_acesso;
                    const chaveFormatada = `${c.slice(0,4)} ${c.slice(4,8)} ${c.slice(8,12)} ${c.slice(12,16)} ${c.slice(16,20)} ${c.slice(20,24)} ${c.slice(24,28)} ${c.slice(28,32)} ${c.slice(32,36)} ${c.slice(36,40)} ${c.slice(40,44)}`;
                    doc.text(chaveFormatada, 119, 37);
                } catch (e) { console.error("Erro barcode:", e); }
            }
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("Consulta de autenticidade no portal nacional da NF-e", 119, 43);
            doc.text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", 119, 46);

            // 5. NATUREZA DA OPERAÇÃO / PROTOCOLO
            doc.rect(10, 50, 107, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("NATUREZA DA OPERAÇÃO", 11.5, 53);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(row.descricao || "VENDA DE MERCADORIA", 11.5, 56.5);
            
            doc.rect(117, 50, 83, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("PROTOCOLO DE AUTORIZAÇÃO DE USO", 118.5, 53);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(row.protocolo_autorizacao || "ASSINADA LOCALMENTE", 118.5, 56.5);

            // 6. IE / CNPJ
            doc.rect(10, 58, 70, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("INSCRIÇÃO ESTADUAL", 11.5, 61);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(configs['emit_ie'] || "562.696.411.110", 11.5, 65);
            
            doc.rect(80, 58, 60, 8);
            doc.setFontSize(5.5); doc.text("INSC. ESTADUAL DO SUBST. TRIBUTÁRIO", 81.5, 61);
            
            doc.rect(140, 58, 60, 8);
            doc.setFontSize(5.5); doc.text("CNPJ", 141.5, 61);
            doc.setFontSize(7.5); doc.text(configs['emit_cnpj'] || "56.421.395/0001-50", 141.5, 65);

            // 7. DESTINATÁRIO
            doc.setFillColor(245, 245, 245);
            doc.rect(10, 68, 190, 5, 'F');
            doc.rect(10, 68, 190, 5);
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text("DESTINATÁRIO / REMETENTE", 12, 71.5);
            
            doc.rect(10, 73, 140, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("NOME / RAZÃO SOCIAL", 11.5, 76);
            doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.text(row.contato_nome || "CONSUMIDOR FINAL", 11.5, 80);

            doc.rect(150, 73, 50, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("CNPJ / CPF", 151.5, 76);
            doc.setFontSize(8.5); doc.text(row.contato_doc || "", 151.5, 80);

            doc.rect(10, 81, 100, 8);
            doc.setFontSize(5.5); doc.text("ENDEREÇO", 11.5, 84);
            doc.setFontSize(7.5); doc.text(row.contato_end || "", 11.5, 88);
            
            doc.rect(110, 81, 40, 8);
            doc.setFontSize(5.5); doc.text("BAIRRO / DISTRITO", 111.5, 84);
            
            doc.rect(150, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("CEP", 151.5, 84);
            
            doc.rect(175, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("DATA DA EMISSÃO", 176.5, 84);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(new Date(row.data_emissao).toLocaleDateString('pt-BR'), 176.5, 88);

            // 8. CÁLCULO DO IMPOSTO
            const Y_IMP = 95;
            doc.setFillColor(240, 240, 240);
            doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.rect(10, Y_IMP, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("CÁLCULO DO IMPOSTO", 12, Y_IMP + 3.5);
            
            const field = (x, y, w, h, label, value, align = 'right') => {
                doc.rect(x, y, w, h);
                doc.setFontSize(5); doc.setFont("helvetica", "normal");
                doc.text(label, x + 1, y + 2.5);
                doc.setFontSize(8);
                if (align === 'right') doc.text(value, x + w - 1, y + h - 1.5, { align: 'right' });
                else doc.text(value, x + 1, y + h - 1.5);
            };

            field(10, Y_IMP+5, 38, 8, "BASE DE CÁLCULO DO ICMS", "0,00");
            field(48, Y_IMP+5, 38, 8, "VALOR DO ICMS", "0,00");
            field(86, Y_IMP+5, 38, 8, "BASE DE CÁLCULO DO ICMS S.T.", "0,00");
            field(124, Y_IMP+5, 38, 8, "VALOR DO ICMS S.T.", "0,00");
            field(162, Y_IMP+5, 38, 8, "VALOR TOTAL DOS PRODUTOS", row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2}));

            field(10, Y_IMP+13, 30, 8, "VALOR DO FRETE", "0,00");
            field(40, Y_IMP+13, 30, 8, "VALOR DO SEGURO", "0,00");
            field(70, Y_IMP+13, 30, 8, "DESCONTO", "0,00");
            field(100, Y_IMP+13, 31, 8, "OUTRAS DESPESAS ACESSÓRIAS", "0,00");
            field(131, Y_IMP+13, 31, 8, "VALOR DO IPI", "0,00");
            field(162, Y_IMP+13, 38, 8, "VALOR TOTAL DA NOTA", row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2}));

            // 9. TRANSPORTADOR
            const Y_TRA = 113;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_TRA, 190, 5, 'F'); doc.rect(10, Y_TRA, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", 12, Y_TRA + 3.5);
            
            field(10, Y_TRA+5, 80, 8, "RAZÃO SOCIAL", "O MESMO", 'left');
            field(90, Y_TRA+5, 25, 8, "FRETE POR CONTA", "9-Sem Frete", 'left');
            field(115, Y_TRA+5, 20, 8, "CÓDIGO ANTT", "", 'left');
            field(135, Y_TRA+5, 20, 8, "PLACA DO VEÍCULO", "", 'left');
            field(155, Y_TRA+5, 10, 8, "UF", "", 'left');
            field(165, Y_TRA+5, 35, 8, "CNPJ / CPF", "", 'left');

            // 10. DADOS DOS PRODUTOS
            const Y_PROD = 130;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_PROD, 190, 5, 'F'); doc.rect(10, Y_PROD, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("DADOS DO PRODUTO / SERVIÇO", 12, Y_PROD + 3.5);
            
            const columns = [
                { header: 'CÓDIGO', dataKey: 'cod' },
                { header: 'DESCRIÇÃO DO PRODUTO / SERVIÇO', dataKey: 'desc' },
                { header: 'NCM/SH', dataKey: 'ncm' },
                { header: 'CST', dataKey: 'cst' },
                { header: 'CFOP', dataKey: 'cfop' },
                { header: 'UN', dataKey: 'un' },
                { header: 'QTD', dataKey: 'qtd' },
                { header: 'V.UNIT', dataKey: 'vunit' },
                { header: 'V.TOTAL', dataKey: 'vtotal' }
            ];
            
            const unidadeLabel = row.unidade === 'AMBOS' ? `${row.qtd_caixas}CX/${row.peso_kg}KG` : (row.unidade || 'CX');
            const qtdValue = row.unidade === 'AMBOS' ? row.qtd_caixas : row.quantidade;

            const tableData = [{
                cod: '001',
                desc: row.produto || "CEBOLA",
                ncm: '07031019',
                cst: '0102',
                cfop: '5102',
                un: unidadeLabel,
                qtd: (qtdValue || 1).toString(),
                vunit: (row.valor / (qtdValue || 1)).toLocaleString('pt-BR', {minimumFractionDigits:2}),
                vtotal: row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})
            }];

            console.log(`Generating DANFE for sale ${row.venda_id}`);
            doc.autoTable({
                startY: Y_PROD + 5,
                margin: { left: 10, right: 10 },
                columns: columns,
                body: tableData,
                theme: 'plain',
                styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1 },
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6 },
                columnStyles: {
                    cod: { cellWidth: 15 },
                    desc: { cellWidth: 'auto' },
                    ncm: { cellWidth: 15, halign: 'center' },
                    cst: { cellWidth: 10, halign: 'center' },
                    cfop: { cellWidth: 10, halign: 'center' },
                    un: { cellWidth: 15, halign: 'center' },
                    qtd: { cellWidth: 15, halign: 'center' },
                    vunit: { cellWidth: 20, halign: 'right' },
                    vtotal: { cellWidth: 25, halign: 'right' }
                }
            });

            // 11. DADOS ADICIONAIS
            const Y_FINAL = doc.lastAutoTable.finalY + 5;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_FINAL, 190, 5, 'F'); doc.rect(10, Y_FINAL, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("DADOS ADICIONAIS", 12, Y_FINAL + 3.5);
            
            doc.rect(10, Y_FINAL + 5, 150, 35);
            doc.setFontSize(5); doc.setFont("helvetica", "normal");
            doc.text("INFORMAÇÕES COMPLEMENTARES", 11, Y_FINAL + 8);
            doc.setFontSize(7);
            doc.text("Documento emitido por ME ou EPP optante pelo Simples Nacional.\nNão gera direito a crédito fiscal de IPI.\nTransação vinculada à venda #" + row.venda_id + "\n\n" + (row.protocolo_autorizacao ? "Protocolo: " + row.protocolo_autorizacao : "EMISSÃO EM HOMOLOGAÇÃO"), 11, Y_FINAL + 13);
            
            doc.rect(160, Y_FINAL + 5, 40, 35);
            doc.setFontSize(5); doc.text("RESERVADO AO FISCO / QR CODE", 161, Y_FINAL + 8);
            
            // Gerar e adicionar QR Code no final
            if (row.chave_acesso) {
                try {
                    const qrUrl = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&chaveAcesso=${row.chave_acesso}`;
                    const qrBuffer = await generateQRCode(qrUrl);
                    const qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    doc.addImage(qrBase64, 'PNG', 167, Y_FINAL + 10, 26, 26);
                } catch (e) { console.error("Erro QR Code:", e); }
            }

            const pdfOutput = doc.output('arraybuffer');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=DANFE_${row.venda_id}.pdf`);
            res.send(Buffer.from(new Uint8Array(pdfOutput)));

        } catch (pdfErr) {
            console.error("CRITICAL ERROR generating DANFE PDF:", pdfErr);
            res.status(500).json({ error: 'Erro ao gerar PDF: ' + pdfErr.message });
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
            const tables = ['movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos', 'logs'];
            tables.forEach(t => db.run(`DELETE FROM ${t}`));
            db.run("DELETE FROM sqlite_sequence WHERE name IN ('movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos', 'logs')");
            registrarLog(req, 'SYSTEM_RESET', 'Sistema resetado pelo administrador');
            res.json({ success: true, message: "Sistema resetado com sucesso." });
        });
    });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor M&M Cebolas rodando na porta ${PORT}`);
});
