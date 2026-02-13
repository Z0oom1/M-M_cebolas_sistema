const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const NFeService = require('./nfe-service');
const { jsPDF } = require('jspdf');

const app = express();
const db = new sqlite3.Database('./database.sqlite');
const SECRET = 'mm_cebolas_secret_2024';

// Inicialização do Banco de Dados
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        ncm TEXT,
        preco_venda REAL,
        cor TEXT,
        icone TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        documento TEXT,
        telefone TEXT,
        ie TEXT,
        email TEXT,
        endereco TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        documento TEXT,
        telefone TEXT,
        ie TEXT,
        email TEXT,
        endereco TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        produto TEXT,
        quantidade INTEGER,
        valor REAL,
        descricao TEXT,
        data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS nfe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER,
        chave_acesso TEXT,
        xml_content TEXT,
        status TEXT,
        data_emissao TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS configs (
        chave TEXT PRIMARY KEY,
        valor TEXT
    )`);

    // Criar ou atualizar admin padrão com a senha '123'
    db.get("SELECT * FROM usuarios WHERE username = 'admin'", async (err, row) => {
        const hash = await bcrypt.hash('123', 10);
        if (!row) {
            db.run("INSERT INTO usuarios (label, username, password, role) VALUES ('Administrador', 'admin', ?, 'admin')", [hash]);
        } else {
            // Garante que a senha seja '123' mesmo se o usuário já existir
            db.run("UPDATE usuarios SET password = ? WHERE username = 'admin'", [hash]);
        }
    });
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// --- MIDDLEWARE ---
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

// --- AUTH ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Usuário não encontrado" });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Senha incorreta" });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET);
        res.json({ token, user: { id: user.id, label: user.label, role: user.role } });
    });
});

// --- MOVIMENTAÇÕES ---
app.get('/api/movimentacoes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/movimentacoes', authenticateToken, (req, res) => {
    const { tipo, produto, quantidade, valor, descricao, data } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data) VALUES (?, ?, ?, ?, ?, ?)`,
        [tipo, produto, quantidade, valor, descricao, data], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- PRODUTOS ---
app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all('SELECT * FROM produtos', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, cor, icone } = req.body;
    if (id) {
        db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, cor = ?, icone = ? WHERE id = ?`,
            [nome, ncm, preco_venda, cor, icone, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    } else {
        db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone) VALUES (?, ?, ?, ?, ?)`,
            [nome, ncm, preco_venda, cor, icone], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM produtos WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- CLIENTES E FORNECEDORES ---
app.get('/api/clientes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM clientes', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/clientes', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) {
        db.run(`UPDATE clientes SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`,
            [nome, documento, telefone, ie, email, endereco, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    } else {
        db.run(`INSERT INTO clientes (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, documento, telefone, ie, email, endereco], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.get('/api/fornecedores', authenticateToken, (req, res) => {
    db.all('SELECT * FROM fornecedores', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) {
        db.run(`UPDATE fornecedores SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`,
            [nome, documento, telefone, ie, email, endereco, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    } else {
        db.run(`INSERT INTO fornecedores (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, documento, telefone, ie, email, endereco], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/cadastros/:type/:id', authenticateToken, (req, res) => {
    const { type, id } = req.params;
    const table = type === 'cliente' ? 'clientes' : 'fornecedores';
    db.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- USUÁRIOS ---
app.get('/api/usuarios', authenticateToken, (req, res) => {
    db.all('SELECT id, label, username, role FROM usuarios', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    const { label, username, password, role } = req.body;
    const hash = await bcrypt.hash(password || '123', 10);
    db.run(`INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)`,
        [label, username, hash, role], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    const { label, username, password, role } = req.body;
    const id = req.params.id;
    
    let query = `UPDATE usuarios SET label = ?, username = ?, role = ?`;
    let params = [label, username, role];
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        query += `, password = ?`;
        params.push(hash);
    }
    query += ` WHERE id = ?`;
    params.push(id);
    db.run(query, params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    db.run('DELETE FROM usuarios WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- NF-e ---
app.get('/api/nfe', authenticateToken, (req, res) => {
    db.all('SELECT * FROM nfe ORDER BY data_emissao DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario, itens } = req.body;

    // Buscar configurações para o NFeService
    db.all('SELECT * FROM configs', [], async (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao ler configurações: " + err.message });

        const configs = {};
        rows?.forEach(r => configs[r.chave] = r.valor);
        
        const isProduction = configs.nfe_modo === 'producao';
        const certPass = configs.cert_password || '';
        const pfxPath = path.join(__dirname, 'certificado', 'certificado.pfx');

        // Se não houver senha, não podemos usar o NFeService real
        if (!certPass) {
            console.warn("AVISO: Senha do certificado não configurada. A gerar nota simulada.");
            const chave = Array.from({length: 44}, () => Math.floor(Math.random() * 10)).join('');
            const xml = `<nfe><infNFe><ide><nNF>${venda_id}</nNF></ide><dest><xNome>${destinatario} (SIMULAÇÃO)</xNome></dest></infNFe></nfe>`;
            
            return db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                [venda_id, chave, xml, 'simulada', new Date().toISOString()], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ id: this.lastID, chave, warning: "Certificado não configurado. Nota simulada interna apenas." });
                });
        }

        try {
            const nfeService = new NFeService(pfxPath, certPass, isProduction);
            
            // Dados básicos para a chave de acesso
            const emitente = {
                cnpj: (configs.emit_cnpj || '').replace(/\D/g, ''),
                xNome: configs.emit_nome || 'M&M CEBOLAS LTDA',
                xFant: configs.emit_fant || 'M&M CEBOLAS',
                ie: (configs.emit_ie || '').replace(/\D/g, ''),
                crt: configs.emit_crt || '1', // 1=Simples Nacional, 3=Regime Normal
                enderEmit: {
                    xLgr: configs.emit_lgr || 'Rua Desconhecida',
                    nro: configs.emit_nro || 'S/N',
                    xBairro: configs.emit_bairro || 'Centro',
                    cMun: configs.emit_cmun || '3550308', // Código IBGE obrigatório
                    xMun: configs.emit_xmun || 'SAO PAULO',
                    UF: configs.emit_uf || 'SP',
                    CEP: (configs.emit_cep || '00000000').replace(/\D/g, '')
                }
            };

            if (!emitente.cnpj || emitente.cnpj === '00000000000000') {
                throw new Error("CNPJ do emitente não configurado nas opções do sistema.");
            }

            
            const paramsChave = {
                cUF: configs.emit_uf_cod || '35', // Código numérico da UF (Ex: 35 para SP)
                year: new Date().getFullYear().toString().slice(-2),
                month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
                cnpj: emitente.cnpj,
                mod: '55',
                serie: parseInt(configs.nfe_serie || '1'),
                nNF: parseInt(configs.nfe_prox_numero || venda_id), // Idealmente deve ter um contador sequencial
                tpEmis: '1', // 1 = Normal
                cNF: Math.floor(Math.random() * 100000000)
            };
            
            const chaveAcesso = nfeService.generateChaveAcesso(paramsChave);
            
            // Estrutura mínima para o XML assinado
            const dadosNFe = {
                ide: { 
                    ...paramsChave, 
                    chaveAcesso, 
                    natOp: 'VENDA DE MERCADORIA', 
                    dhEmi: new Date().toISOString(), 
                    tpNF: '1', // 1=Saída
                    idDest: '1', 
                    cMunFG: emitente.enderEmit.cMun, 
                    tpImp: '1', 
                    finNFe: '1', // 1=Normal
                    indFinal: '1', 
                    indPres: '1' 
                },
                emit: emitente,
                dest: { 
                    xNome: isProduction ? destinatario : 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', 
                    enderDest: { 
                        xLgr: 'Rua Cliente', nro: '123', xBairro: 'Bairro', 
                        cMun: '3550308', xMun: 'Cidade', UF: 'SP', CEP: '01001000' 
                    }, 
                    indIEDest: '9' // 9=Não Contribuinte (ajustar conforme lógica de cliente real)
                },
                det: itens.map((item, index) => ({ 
                    prod: { 
                        cProd: item.produto_id || '001', 
                        xProd: item.produto, 
                        NCM: item.ncm || '07031019', // NCM da Cebola padrão se não tiver
                        CFOP: configs.nfe_cfop || '5102', 
                        uCom: 'CX', 
                        qCom: item.qtd, 
                        vUnCom: (item.valor / item.qtd).toFixed(2), 
                        vProd: item.valor.toFixed(2) 
                    }, 
                    imposto: { vTotTrib: '0.00' } 
                })),
                total: { 
                    icmsTot: { 
                        vBC: '0.00', vICMS: '0.00', 
                        vProd: itens.reduce((a, b) => a + b.valor, 0).toFixed(2), 
                        vNF: itens.reduce((a, b) => a + b.valor, 0).toFixed(2) 
                    } 
                },
                transp: { modFrete: '9' }, // 9=Sem Frete
                infAdic: { infCpl: 'NF-e gerada pelo sistema M&M Cebolas' }
            };

            const xmlAssinado = nfeService.createNFeXML(dadosNFe);
            
            db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                [venda_id, chaveAcesso, xmlAssinado, 'assinada', new Date().toISOString()], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    if (isProduction) {
                        db.run("UPDATE configs SET valor = ? WHERE chave = 'nfe_prox_numero'", [paramsChave.nNF + 1]);
                    }
                    res.json({ id: this.lastID, chave: chaveAcesso, modo: isProduction ? 'PRODUCAO' : 'HOMOLOGACAO' });
                });
            } catch (nfeErr) {
                console.error("Erro NFeService:", nfeErr);
                res.status(500).json({ error: "Erro crítico na geração da NF-e: " + nfeErr.message });
            }
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get('SELECT xml_content FROM nfe WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "XML não encontrado" });
        res.setHeader('Content-Type', 'application/xml');
        res.send(row.xml_content);
    });
});

app.get('/api/nfe/:id/pdf', authenticateToken, (req, res) => {
    db.get(`SELECT n.*, m.valor, m.produto, m.quantidade, m.descricao as cliente_nome 
            FROM nfe n 
            JOIN movimentacoes m ON n.venda_id = m.id 
            WHERE n.id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Nota não encontrada" });
        
        try {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('M&M CEBOLAS - DANFE SIMPLIFICADO', 105, 20, { align: 'center' });
            doc.setFontSize(10);
            doc.text('Documento Auxiliar da Nota Fiscal Eletronica', 105, 28, { align: 'center' });
            
            doc.setFillColor(240, 240, 240);
            doc.rect(10, 35, 190, 8, 'F');
            doc.text('DADOS DA NOTA FISCAL', 12, 41);
            
            doc.rect(10, 43, 190, 16);
            doc.text(`CHAVE DE ACESSO: ${row.chave_acesso}`, 12, 50);
            doc.text(`DATA EMISSAO: ${new Date(row.data_emissao).toLocaleString('pt-BR')}`, 12, 56);
            
            doc.setFillColor(240, 240, 240);
            doc.rect(10, 65, 190, 8, 'F');
            doc.text('DESTINATARIO', 12, 71);
            
            doc.rect(10, 73, 190, 10);
            doc.text(`NOME/RAZAO SOCIAL: ${row.cliente_nome}`, 12, 80);
            
            doc.setFillColor(240, 240, 240);
            doc.rect(10, 90, 190, 8, 'F');
            doc.text('DADOS DO PRODUTO', 12, 96);
            
            doc.rect(10, 98, 190, 20);
            doc.text('PRODUTO', 12, 105);
            doc.text('QTD', 110, 105);
            doc.text('UN', 140, 105);
            doc.text('VALOR TOTAL', 170, 105);
            
            doc.line(10, 108, 200, 108);
            doc.text(`${row.produto}`, 12, 115);
            doc.text(`${row.quantidade}`, 110, 115);
            doc.text('CX', 140, 115);
            doc.text(`R$ ${row.valor.toFixed(2)}`, 170, 115);
            
            doc.setFontSize(8);
            doc.text('ESTE DOCUMENTO EH UMA REPRESENTACAO SIMPLIFICADA DA NFE.', 105, 140, { align: 'center' });
            
            const pdfOutput = doc.output('arraybuffer');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=DANFE_${row.chave_acesso}.pdf`);
            res.send(Buffer.from(pdfOutput));
        } catch (pdfErr) {
            console.error('Erro PDF:', pdfErr);
            res.status(500).send('Erro ao gerar PDF');
        }
    });
});

// --- CONFIGS ---
app.get('/api/configs', authenticateToken, (req, res) => {
    db.all('SELECT * FROM configs', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const configs = {};
        rows.forEach(r => configs[r.chave] = r.valor);
        res.json(configs);
    });
});

app.post('/api/configs', authenticateToken, (req, res) => {
    const { chave, valor } = req.body;
    db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/reset', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    db.serialize(() => {
        db.run('DELETE FROM movimentacoes');
        db.run('DELETE FROM nfe');
        db.run('DELETE FROM clientes');
        db.run('DELETE FROM fornecedores');
        db.run('DELETE FROM produtos');
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
