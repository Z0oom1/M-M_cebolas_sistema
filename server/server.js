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
    // Adicionado 'unidade' ao corpo da requisição
    const { tipo, produto, quantidade, valor, descricao, data, unidade } = req.body;

    // Atualize a query para incluir a coluna unidade (veja nota abaixo sobre o banco)
    db.run(`INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data, unidade) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tipo, produto, quantidade, valor, descricao, data, unidade || 'CX'], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log detalhado com a unidade
            registrarLog(req, 'MOVIMENTACAO', `${tipo.toUpperCase()}: ${quantidade}${unidade || 'CX'} de ${produto} - R$ ${valor}`);
            res.json({ id: this.lastID });
        });
});
app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.get('/api/produtos', authenticateToken, (req, res) => db.all('SELECT * FROM produtos', [], (err, rows) => res.json(rows || [])));
app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, cor, icone } = req.body;
    if (id) db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, cor = ?, icone = ? WHERE id = ?`, [nome, ncm, preco_venda, cor, icone, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'PRODUTO_EDIT', `Editou produto: ${nome}`);
        res.json({ success: true });
    });
    else db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone) VALUES (?, ?, ?, ?, ?)`, [nome, ncm, preco_venda, cor, icone], function (err) {
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
    const cleanDoc = documento.replace(/\D/g, '');
    db.get('SELECT id FROM clientes WHERE (REPLACE(REPLACE(REPLACE(documento, ".", ""), "-", ""), "/", "") = ? OR documento = ?) AND id != ?', [cleanDoc, documento, id || 0], (err, row) => {
        if (row) return res.status(400).json({ error: "Já existe este documento cadastrado." });
        if (id) db.run(`UPDATE clientes SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
        else db.run(`INSERT INTO clientes (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
    });
});

app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    const cleanDoc = documento.replace(/\D/g, '');
    db.get('SELECT id FROM fornecedores WHERE (REPLACE(REPLACE(REPLACE(documento, ".", ""), "-", ""), "/", "") = ? OR documento = ?) AND id != ?', [cleanDoc, documento, id || 0], (err, row) => {
        if (row) return res.status(400).json({ error: "Já existe este documento cadastrado." });
        if (id) db.run(`UPDATE fornecedores SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
        else db.run(`INSERT INTO fornecedores (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
    });
});

app.delete('/api/cadastros/:type/:id', authenticateToken, (req, res) => {
    const { type, id } = req.params;
    let table = type === 'cliente' ? 'clientes' : (type === 'fornecedor' ? 'fornecedores' : 'produtos');
    db.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/nfe', authenticateToken, (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM nfe';
    let params = [];

    if (search) {
        query += ` WHERE venda_id LIKE ? OR chave_acesso LIKE ? OR xml_content LIKE ?`;
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm, searchTerm];
    }

    query += ' ORDER BY data_emissao DESC';
    db.all(query, params, (err, rows) => res.json(rows || []));
});

app.delete('/api/nfe/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.run('DELETE FROM nfe WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'NFE_DELETE', `Excluiu NFe ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/configs', authenticateToken, (req, res) => {
    db.all('SELECT * FROM configs', [], (err, rows) => {
        const configs = {};
        rows?.forEach(r => configs[r.chave] = r.valor);
        res.json(configs);
    });
});

app.post('/api/configs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { chave, valor } = req.body;
    db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'CONFIG_UPDATE', `Atualizou config: ${chave}`);
        res.json({ success: true });
    });
});

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario, itens } = req.body;
    db.all('SELECT * FROM configs', [], async (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro configs: " + err.message });
        const configs = {};
        rows?.forEach(r => configs[r.chave] = r.valor);
        const nfeModoEnv = (process.env.NFE_MODO || '').toLowerCase();
        const isProduction = (configs.nfe_modo === 'producao') || (nfeModoEnv === 'producao');
        console.log(`[NFe] Modo: ${isProduction ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'} (Config: ${configs.nfe_modo}, Env: ${nfeModoEnv})`);
        const certPass = configs.cert_password || process.env.CERT_PASSWORD || '';
        const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');

        if (!certPass) {
            const chave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');
            const xml = `<nfe><infNFe><ide><nNF>${venda_id}</nNF></ide><dest><xNome>${destinatario} (SIMULAÇÃO)</xNome></dest></infNFe></nfe>`;
            return db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`, [venda_id, chave, xml, 'simulada', new Date().toISOString()], function () { res.json({ id: this.lastID, chave, warning: "Modo Simulação" }); });
        }

        if (!fs.existsSync(pfxPath)) {
            return res.status(500).json({ error: 'Certificado PFX não encontrado em server/certificado/certificado.pfx.' });
        }

        try {
            const nfeService = new NFeService(pfxPath, certPass, isProduction);
            const emitente = {
                cnpj: (configs.emit_cnpj || '56421395000150').replace(/\D/g, ''),
                xNome: configs.emit_nome || 'M & M HF COMERCIO DE CEBOLAS LTDA',
                xFant: configs.emit_fant || 'M & M HF COMERCIO DE CEBOLAS',
                ie: (configs.emit_ie || '562696411110').replace(/\D/g, ''),
                crt: configs.emit_crt || '3',
                enderEmit: {
                    xLgr: configs.emit_lgr || 'RUA MANOEL CRUZ', nro: configs.emit_nro || '36', xBairro: configs.emit_bairro || 'RESIDENCIAL MINERVA I',
                    cMun: configs.emit_cmun || '3541406', xMun: configs.emit_xmun || 'PRESIDENTE PRUDENTE', UF: configs.emit_uf || 'SP', CEP: (configs.emit_cep || '19026168').replace(/\D/g, '')
                }
            };
            const paramsChave = {
                cUF: configs.emit_uf_cod || '35', year: new Date().getFullYear().toString().slice(-2),
                month: (new Date().getMonth() + 1).toString().padStart(2, '0'), cnpj: emitente.cnpj, mod: '55',
                serie: parseInt(configs.nfe_serie || '1'), nNF: parseInt(configs.nfe_prox_numero || venda_id), tpEmis: '1', cNF: Math.floor(Math.random() * 100000000)
            };
            const chaveAcesso = nfeService.generateChaveAcesso(paramsChave);
            const dadosNFe = {
                ide: { ...paramsChave, chaveAcesso, natOp: 'VENDA DE MERCADORIA', dhEmi: new Date().toISOString(), tpNF: '1', idDest: '1', cMunFG: emitente.enderEmit.cMun, tpImp: '1', finNFe: '1', indFinal: '1', indPres: '1' },
                emit: emitente,
                dest: { xNome: isProduction ? destinatario : 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', enderDest: { xLgr: 'Rua', nro: '1', xBairro: 'B', cMun: '3550308', xMun: 'SP', UF: 'SP', CEP: '19000000' }, indIEDest: '9' },
                det: itens.map(item => ({
                    prod: {
                        cProd: '001',
                        xProd: item.produto,
                        NCM: '07031019',
                        CFOP: '5102',
                        uCom: item.unidade || 'CX', // Usa a unidade vinda do front-end
                        qCom: item.qtd,
                        vUnCom: (item.valor / item.qtd).toFixed(2),
                        vProd: item.valor.toFixed(2)
                    },
                    imposto: { vTotTrib: '0.00' }
                })),
                total: { icmsTot: { vBC: '0.00', vICMS: '0.00', vProd: itens.reduce((a, b) => a + b.valor, 0).toFixed(2), vNF: itens.reduce((a, b) => a + b.valor, 0).toFixed(2) } },
                transp: { modFrete: '9' }, infAdic: { infCpl: 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.' }
            };

            const xmlAssinado = nfeService.createNFeXML(dadosNFe);
            const resultadoSefaz = await nfeService.transmitirSefaz(xmlAssinado, paramsChave.cUF);

            db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                [venda_id, chaveAcesso, xmlAssinado, resultadoSefaz.status, new Date().toISOString()], function (err) {
                    if (isProduction && resultadoSefaz.status === 'autorizada') {
                        db.run("UPDATE configs SET valor = ? WHERE chave = 'nfe_prox_numero'", [paramsChave.nNF + 1]);
                    }
                    res.json({ id: this.lastID, chave: chaveAcesso, status: resultadoSefaz.status, mensagem: resultadoSefaz.message });
                });
        } catch (nfeErr) {
            res.status(500).json({ error: nfeErr.message });
        }
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get('SELECT xml_content FROM nfe WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).send("XML não encontrado");
        res.setHeader('Content-Type', 'application/xml');
        res.send(row.xml_content);
    });
});

app.get('/api/nfe/:id/pdf', authenticateToken, (req, res) => {
    db.get(`SELECT n.*, m.valor, m.produto, m.quantidade, m.descricao as cliente_nome, 
            c.documento as cliente_doc, c.endereco as cliente_end, c.nome as cliente_razao,
            c.telefone as cliente_tel, c.email as cliente_email, c.ie as cliente_ie
            FROM nfe n 
            JOIN movimentacoes m ON n.venda_id = m.id
            LEFT JOIN clientes c ON m.descricao = c.nome 
            WHERE n.id = ?`, [req.params.id], async (err, row) => {

        if (err || !row) return res.status(404).json({ error: "Nota não encontrada" });

        try {
            const doc = new jsPDF();
            const logoPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
            let logoData = fs.existsSync(logoPath) ? fs.readFileSync(logoPath).toString('base64') : null;

            let barcodePng = null;
            if (row.chave_acesso) {
                barcodePng = await bwipjs.toBuffer({
                    bcid: 'code128', text: row.chave_acesso.replace(/\s/g, ''), scale: 3, height: 10
                });
            }

            const box = (x, y, w, h, title = '', bold = false) => {
                doc.setDrawColor(0); doc.setLineWidth(0.1); doc.rect(x, y, w, h);
                if (title) {
                    doc.setFontSize(5); doc.setFont("helvetica", bold ? "bold" : "normal");
                    doc.text(title.toUpperCase(), x + 1.5, y + 2.5);
                }
            };

            const field = (x, y, w, h, title, value, align = 'left', fontSize = 8) => {
                box(x, y, w, h, title);
                doc.setFontSize(fontSize); doc.setFont("helvetica", "bold");
                const safeValue = value ? String(value) : '';
                const yPos = y + (h / 2) + 2.5;
                if (align === 'center') doc.text(safeValue, x + (w / 2), yPos, { align: 'center' });
                else if (align === 'right') doc.text(safeValue, x + w - 1.5, yPos, { align: 'right' });
                else doc.text(safeValue, x + 1.5, yPos);
            };

            // --- LAYOUT DANFE (IDENTICO AO PDF) ---

            // CANHOTO
            box(10, 8, 160, 15, "RECEBEMOS DE M&M CEBOLAS OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO");
            doc.line(45, 18, 155, 18);
            doc.setFontSize(5); doc.text("DATA DE RECEBIMENTO", 12, 16);
            doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", 100, 21, { align: 'center' });

            box(170, 8, 30, 15, "NF-e", true);
            doc.setFontSize(10); doc.text(`Nº ${row.venda_id}`, 185, 15, { align: 'center' });
            doc.setFontSize(8); doc.text(`SÉRIE 1`, 185, 19, { align: 'center' });

            doc.setLineDash([1, 1], 0); doc.line(10, 26, 200, 26); doc.setLineDash([]);

            // EMITENTE
            const Y_EMIT = 30;
            box(10, Y_EMIT, 80, 32);
            if (logoData) doc.addImage(logoData, 'PNG', 12, Y_EMIT + 2, 28, 24);
            doc.setTextColor(0, 80, 0); doc.setFontSize(14); doc.setFont("helvetica", "bold");
            doc.text("M&M CEBOLAS", 44, Y_EMIT + 10);
            doc.setTextColor(0); doc.setFontSize(7); doc.setFont("helvetica", "normal");
            doc.text("Rua Manoel Cruz, 36\nPres. Prudente - SP\nCEP: 19026-168\nFone: (18) 9999-9999", 44, Y_EMIT + 16);

            // DANFE CENTRAL
            box(90, Y_EMIT, 30, 32);
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("DANFE", 105, Y_EMIT + 7, { align: 'center' });
            doc.setFontSize(6); doc.setFont("helvetica", "normal");
            doc.text("Documento Auxiliar\nda Nota Fiscal\nEletrônica", 105, Y_EMIT + 12, { align: 'center' });
            doc.text("0 - Entrada\n1 - Saída", 95, Y_EMIT + 21);
            doc.rect(112, Y_EMIT + 19, 6, 6); doc.setFontSize(10); doc.text("1", 115, Y_EMIT + 23.5, { align: 'center' });
            doc.setFontSize(8); doc.setFont("helvetica", "bold");
            doc.text(`Nº ${row.venda_id}\nSÉRIE 1`, 105, Y_EMIT + 28, { align: 'center' });

            // CHAVE DE ACESSO
            box(120, Y_EMIT, 80, 32, "CHAVE DE ACESSO");
            if (barcodePng) doc.addImage(barcodePng, 'PNG', 123, Y_EMIT + 4, 74, 11);
            doc.setFont("courier", "bold"); doc.setFontSize(6.5);
            const chaveFmt = row.chave_acesso ? row.chave_acesso.match(/.{1,4}/g).join(' ') : '';
            doc.text(chaveFmt, 160, Y_EMIT + 19, { align: 'center' });
            doc.setFont("helvetica", "normal"); doc.setFontSize(6);
            doc.text("Consulta de autenticidade no portal nacional da NF-e\nwww.nfe.fazenda.gov.br/portal ou no site da Sefaz", 160, Y_EMIT + 26, { align: 'center' });

            // NATUREZA
            field(10, 62, 110, 8, "NATUREZA DA OPERAÇÃO", "VENDA DE MERCADORIA");
            field(120, 62, 80, 8, "PROTOCOLO DE AUTORIZAÇÃO DE USO", row.status === 'autorizada' ? "135240001234567 - 12/02/2026 10:00" : "EMITIDA EM HOMOLOGAÇÃO - SEM VALOR", 'center');
            field(10, 70, 65, 8, "INSCRIÇÃO ESTADUAL", "562.696.411.110");
            field(75, 70, 45, 8, "INSC. ESTADUAL SUBST. TRIB.", "");
            field(120, 70, 80, 8, "CNPJ", "56.421.395/0001-50");

            // DESTINATÁRIO
            const Y_DEST = 82;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_DEST, 190, 5, 'F');
            doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text("DESTINATÁRIO / REMETENTE", 12, Y_DEST + 3.5);
            field(10, Y_DEST + 5, 110, 8, "NOME / RAZÃO SOCIAL", row.cliente_razao || row.cliente_nome);
            field(120, Y_DEST + 5, 40, 8, "CNPJ / CPF", row.cliente_doc, 'center');
            field(160, Y_DEST + 5, 40, 8, "DATA DA EMISSÃO", new Date(row.data_emissao).toLocaleDateString('pt-BR'), 'center');

            const endParts = (row.cliente_end || '').split(',');
            field(10, Y_DEST + 13, 90, 8, "ENDEREÇO", endParts[0] || '');
            field(100, Y_DEST + 13, 40, 8, "BAIRRO / DISTRITO", endParts[2] || 'Centro');
            field(140, Y_DEST + 13, 20, 8, "CEP", "19000-000", 'center');
            field(160, Y_DEST + 13, 40, 8, "DATA SAÍDA/ENTRADA", new Date(row.data_emissao).toLocaleDateString('pt-BR'), 'center');

            field(10, Y_DEST + 21, 60, 8, "MUNICÍPIO", "PRESIDENTE PRUDENTE");
            field(70, Y_DEST + 21, 10, 8, "UF", "SP", 'center');
            // Pega apenas o primeiro telefone se houver mais de um (separados por / ou ,)
            const firstPhone = (row.cliente_tel || '').split(/[\/,]/)[0].trim();
            field(80, Y_DEST + 21, 30, 8, "FONE", firstPhone);
            field(110, Y_DEST + 21, 80, 8, "INSCRIÇÃO ESTADUAL", row.cliente_ie || '');

            // IMPOSTO
            const Y_IMP = 115;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.setFontSize(7); doc.text("CÁLCULO DO IMPOSTO", 12, Y_IMP + 3.5);
            field(10, Y_IMP + 5, 38, 8, "BASE DE CÁLCULO DO ICMS", "0,00", 'right');
            field(48, Y_IMP + 5, 38, 8, "VALOR DO ICMS", "0,00", 'right');
            field(86, Y_IMP + 5, 38, 8, "BASE CÁLC. ICMS S.T.", "0,00", 'right');
            field(124, Y_IMP + 5, 38, 8, "VALOR DO ICMS S.T.", "0,00", 'right');
            field(162, Y_IMP + 5, 38, 8, "VALOR TOTAL PRODUTOS", row.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'right');

            field(10, Y_IMP + 13, 38, 8, "VALOR DO FRETE", "0,00", 'right');
            field(48, Y_IMP + 13, 38, 8, "VALOR DO SEGURO", "0,00", 'right');
            field(86, Y_IMP + 13, 38, 8, "DESCONTO", "0,00", 'right');
            field(124, Y_IMP + 13, 38, 8, "OUTRAS DESP. ACESS.", "0,00", 'right');
            field(162, Y_IMP + 13, 38, 8, "VALOR TOTAL DA NOTA", row.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'right');

            // TRANSPORTADOR
            const Y_TRA = 140;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_TRA, 190, 5, 'F');
            doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", 12, Y_TRA + 3.5);
            field(10, Y_TRA + 5, 80, 8, "RAZÃO SOCIAL", "O MESMO");
            field(90, Y_TRA + 5, 20, 8, "FRETE", "9-Sem Frete", 'center', 6);
            field(110, Y_TRA + 5, 20, 8, "CÓDIGO ANTT", "");
            field(130, Y_TRA + 5, 20, 8, "PLACA", "");
            field(150, Y_TRA + 5, 10, 8, "UF", "");
            field(160, Y_TRA + 5, 40, 8, "CNPJ/CPF", "");

            // PRODUTOS
            const Y_PROD = 158;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_PROD, 190, 5, 'F');
            doc.text("DADOS DO PRODUTO / SERVIÇO", 12, Y_PROD + 3.5);
            const yH = Y_PROD + 5;
            box(10, yH, 15, 5, "CÓDIGO"); box(25, yH, 70, 5, "DESCRIÇÃO"); box(95, yH, 15, 5, "NCM/SH"); box(110, yH, 10, 5, "CST"); box(120, yH, 10, 5, "CFOP"); box(130, yH, 10, 5, "UN"); box(140, yH, 15, 5, "QTD"); box(155, yH, 20, 5, "V.UNIT"); box(175, yH, 25, 5, "V.TOTAL");

            const yR = yH + 5;
            field(10, yR, 15, 8, "", "001");
            field(25, yR, 70, 8, "", row.produto);
            field(95, yR, 15, 8, "", "07031019", 'center', 7);
            field(110, yR, 10, 8, "", "0102", 'center', 7);
            field(120, yR, 10, 8, "", "5102", 'center', 7);
            field(130, yR, 10, 8, "", row.unidade || "CX", 'center', 7);
            field(140, yR, 15, 8, "", row.quantidade, 'center');
            field(155, yR, 20, 8, "", (row.valor / row.quantidade).toFixed(2), 'right');
            field(175, yR, 25, 8, "", row.valor.toFixed(2), 'right');

            // ADICIONAIS
            const Y_ADI = 210;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_ADI, 190, 5, 'F');
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

app.get('/api/configs', authenticateToken, (req, res) => { db.all('SELECT * FROM configs', [], (err, rows) => { const c = {}; rows?.forEach(r => c[r.chave] = r.valor); res.json(c); }); });
app.post('/api/configs', authenticateToken, (req, res) => { const { chave, valor } = req.body; db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], () => res.json({ success: true })); });
app.delete('/api/reset', authenticateToken, (req, res) => { if (req.user.role !== 'admin') return res.sendStatus(403); db.serialize(() => { ['movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos'].forEach(t => db.run(`DELETE FROM ${t}`)); res.json({ success: true }); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor M&M Cebolas rodando na porta ${PORT}`);
});
