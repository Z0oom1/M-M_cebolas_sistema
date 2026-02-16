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

// CORS: domínio oficial, localhost, Electron (origin null ou mesmo domínio) e IP da VPS
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
    origin: function(origin, callback) {
        // Electron / Postman / requisições sem origin
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
    if (!token) {
        console.warn('[Auth] Requisição sem token em', req.method, req.path);
        return res.sendStatus(401);
    }
    jwt.verify(token, SECRET, (err, user) => {
        if (err) {
            console.warn('[Auth] Token inválido ou expirado em', req.method, req.path, err.message);
            return res.sendStatus(403);
        }
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
    const { tipo, produto, quantidade, valor, descricao, data } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data) VALUES (?, ?, ?, ?, ?, ?)`, [tipo, produto, quantidade, valor, descricao, data], function(err) { 
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'MOVIMENTACAO', `${tipo.toUpperCase()}: ${quantidade}x ${produto} - R$ ${valor}`);
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
    else db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone) VALUES (?, ?, ?, ?, ?)`, [nome, ncm, preco_venda, cor, icone], function(err) { 
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
        db.run(`INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)`, [label, username, hash, role], function(err) {
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
        else db.run(`INSERT INTO clientes (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function(err) { 
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
        else db.run(`INSERT INTO fornecedores (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function(err) { 
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

app.get('/api/nfe', authenticateToken, (req, res) => db.all('SELECT * FROM nfe ORDER BY data_emissao DESC', [], (err, rows) => res.json(rows || [])));

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario, itens } = req.body;
    db.all('SELECT * FROM configs', [], async (err, rows) => {
        if (err) {
            console.error('[NFe] Erro ao ler configs do banco:', err.message);
            return res.status(500).json({ error: "Erro configs: " + err.message });
        }
        const configs = {};
        rows?.forEach(r => configs[r.chave] = r.valor);
        // Modo produção: .env NFE_MODO=producao ou config no banco; certificado em server/certificado/
        const nfeModoEnv = (process.env.NFE_MODO || '').toLowerCase();
        const isProduction = configs.nfe_modo === 'producao' || nfeModoEnv === 'producao';
        const certPass = configs.cert_password || process.env.CERT_PASSWORD || '';
        const pfxPath = '/var/www/mm_cebolas/certificado/certificado.pfx';

        if (!certPass) {
            console.warn('[NFe] Certificado sem senha configurada; emitindo em modo simulação.');
            const chave = Array.from({length: 44}, () => Math.floor(Math.random() * 10)).join('');
            const xml = `<nfe><infNFe><ide><nNF>${venda_id}</nNF></ide><dest><xNome>${destinatario} (SIMULAÇÃO)</xNome></dest></infNFe></nfe>`;
            return db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`, [venda_id, chave, xml, 'simulada', new Date().toISOString()], function() { res.json({ id: this.lastID, chave, warning: "Modo Simulação" }); });
        }

        if (!fs.existsSync(pfxPath)) {
            console.error('[NFe] Certificado não encontrado em:', pfxPath);
            return res.status(500).json({ error: 'Certificado PFX não encontrado em server/certificado/certificado.pfx. Verifique o arquivo na VPS.' });
        }

        try {
            const nfeService = new NFeService(pfxPath, certPass, isProduction);
            const emitente = {
                cnpj: (configs.emit_cnpj || '').replace(/\D/g, ''),
                xNome: configs.emit_nome || 'M&M CEBOLAS LTDA',
                xFant: configs.emit_fant || 'M&M CEBOLAS',
                ie: (configs.emit_ie || '').replace(/\D/g, ''),
                crt: configs.emit_crt || '3',
                enderEmit: {
                    xLgr: configs.emit_lgr || '', nro: configs.emit_nro || '', xBairro: configs.emit_bairro || '',
                    cMun: configs.emit_cmun || '3550308', xMun: configs.emit_xmun || 'SAO PAULO', UF: configs.emit_uf || 'SP', CEP: (configs.emit_cep || '').replace(/\D/g, '')
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
                dest: { xNome: isProduction ? destinatario : 'HOMOLOGACAO', enderDest: { xLgr: 'Rua', nro: '1', xBairro: 'B', cMun: '3550308', xMun: 'SP', UF: 'SP', CEP: '19000000' }, indIEDest: '9' },
                det: itens.map(item => ({ prod: { cProd: '001', xProd: item.produto, NCM: '07031019', CFOP: '5102', uCom: 'CX', qCom: item.qtd, vUnCom: (item.valor/item.qtd).toFixed(2), vProd: item.valor.toFixed(2) }, imposto: { vTotTrib: '0.00' } })),
                total: { icmsTot: { vBC: '0.00', vICMS: '0.00', vProd: itens.reduce((a,b)=>a+b.valor,0).toFixed(2), vNF: itens.reduce((a,b)=>a+b.valor,0).toFixed(2) } },
                transp: { modFrete: '9' }, infAdic: { infCpl: 'NF-e M&M Cebolas' }
            };

            const xmlAssinado = nfeService.createNFeXML(dadosNFe);
            console.log("Transmitindo à SEFAZ...");
            const resultadoSefaz = await nfeService.transmitirSefaz(xmlAssinado, paramsChave.cUF);
            console.log("Resposta SEFAZ:", resultadoSefaz);

            db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                [venda_id, chaveAcesso, xmlAssinado, resultadoSefaz.status, new Date().toISOString()], function(err) {
                    if (isProduction && resultadoSefaz.status === 'autorizada') {
                        db.run("UPDATE configs SET valor = ? WHERE chave = 'nfe_prox_numero'", [paramsChave.nNF + 1]);
                    }
                    res.json({ id: this.lastID, chave: chaveAcesso, status: resultadoSefaz.status, mensagem: resultadoSefaz.message });
                });
        } catch (nfeErr) {
            console.error("[NFe] Erro ao gerar/transmitir NF-e:", nfeErr.message);
            console.error("[NFe] Stack:", nfeErr.stack);
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
    db.get(`SELECT n.*, m.valor, m.produto, m.quantidade, m.descricao as cliente_nome, c.documento as cliente_doc, c.endereco as cliente_end, c.nome as cliente_razao FROM nfe n JOIN movimentacoes m ON n.venda_id = m.id LEFT JOIN clientes c ON m.descricao = c.nome WHERE n.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Não encontrado" });
        try {
            const doc = new jsPDF();
            const logoPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
            let logoData = fs.existsSync(logoPath) ? fs.readFileSync(logoPath).toString('base64') : null;
            let barcodePng = row.chave_acesso ? await bwipjs.toBuffer({ bcid: 'code128', text: row.chave_acesso, scale: 3, height: 10 }) : null;

            const box = (x, y, w, h, title = '', bold = false) => {
                doc.setDrawColor(0); doc.setLineWidth(0.1); doc.rect(x, y, w, h);
                if (title) { doc.setFontSize(5); doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(title.toUpperCase(), x + 1.5, y + 2.5); }
            };
            box(10, 8, 160, 15, "RECEBEMOS DE M&M CEBOLAS OS PRODUTOS...");
            doc.text(`Nº ${row.venda_id}`, 185, 15, {align:'center'});
            if (logoData) doc.addImage(logoData, 'PNG', 12, 32, 28, 24);
            if (barcodePng) doc.addImage(barcodePng, 'PNG', 123, 34, 74, 11);
            doc.text("DANFE - Documento Auxiliar da NF-e", 100, 45, {align:'center'});
            doc.text(`Chave: ${row.chave_acesso}`, 10, 65);
            doc.text(`Cliente: ${row.cliente_nome || 'Consumidor'}`, 10, 75);
            doc.text(`Produto: ${row.produto} - Qtd: ${row.quantidade} - Total: R$ ${row.valor.toFixed(2)}`, 10, 85);

            res.setHeader('Content-Type', 'application/pdf');
            res.send(Buffer.from(doc.output('arraybuffer')));
        } catch (pdfErr) { res.status(500).send(pdfErr.message); }
    });
});

app.get('/api/configs', authenticateToken, (req, res) => { db.all('SELECT * FROM configs', [], (err, rows) => { const c={}; rows?.forEach(r => c[r.chave]=r.valor); res.json(c); }); });
app.post('/api/configs', authenticateToken, (req, res) => { const { chave, valor } = req.body; db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], () => res.json({ success: true })); });
app.delete('/api/reset', authenticateToken, (req, res) => { if(req.user.role!=='admin') return res.sendStatus(403); db.serialize(() => { ['movimentacoes','nfe','clientes','fornecedores','produtos'].forEach(t => db.run(`DELETE FROM ${t}`)); res.json({ success: true }); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor M&M Cebolas rodando na porta ${PORT}`);
    console.log(`   NFE_MODO (env): ${process.env.NFE_MODO || '(não definido)'}`);
    console.log(`   Certificado: ${path.join(__dirname, 'certificado', 'certificado.pfx')}`);
});