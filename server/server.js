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
const SECRET = 'mm_cebolas_secret_2024';

// --- CONFIGURAÇÃO VISUAL ---
// Verde Escuro Profissional (RGB)
const COR_DESTAQUE = [0, 80, 0]; 

// Inicialização do Banco de Dados
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT, username TEXT UNIQUE, password TEXT, role TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ncm TEXT, preco_venda REAL, cor TEXT, icone TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, produto TEXT, quantidade INTEGER, valor REAL, descricao TEXT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS nfe (id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER, chave_acesso TEXT, xml_content TEXT, status TEXT, data_emissao TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS configs (chave TEXT PRIMARY KEY, valor TEXT)`);

    db.get("SELECT * FROM usuarios WHERE username = 'admin'", async (err, row) => {
        const hash = await bcrypt.hash('123', 10);
        if (!row) db.run("INSERT INTO usuarios (label, username, password, role) VALUES ('Administrador', 'admin', ?, 'admin')", [hash]);
        else db.run("UPDATE usuarios SET password = ? WHERE username = 'admin'", [hash]);
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

// --- ROTAS DE CADASTRO E LOGIN (Resumidas) ---
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
app.get('/api/movimentacoes', authenticateToken, (req, res) => db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => res.json(rows || [])));
app.post('/api/movimentacoes', authenticateToken, (req, res) => {
    const { tipo, produto, quantidade, valor, descricao, data } = req.body;
    db.run(`INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data) VALUES (?, ?, ?, ?, ?, ?)`, [tipo, produto, quantidade, valor, descricao, data], function(err) { 
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID }); 
    });
});
app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], () => res.json({ success: true })));
app.get('/api/produtos', authenticateToken, (req, res) => db.all('SELECT * FROM produtos', [], (err, rows) => res.json(rows || [])));
app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, cor, icone } = req.body;
    if (id) db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, cor = ?, icone = ? WHERE id = ?`, [nome, ncm, preco_venda, cor, icone, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
    else db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone) VALUES (?, ?, ?, ?, ?)`, [nome, ncm, preco_venda, cor, icone], function(err) { 
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID }); 
    });
});
app.delete('/api/produtos/:id', authenticateToken, (req, res) => db.run('DELETE FROM produtos WHERE id = ?', [req.params.id], () => res.json({ success: true })));
app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.all('SELECT id, label, username, role FROM usuarios', [], (err, rows) => res.json(rows || []));
});
app.get('/api/clientes', authenticateToken, (req, res) => db.all('SELECT * FROM clientes', [], (err, rows) => res.json(rows || [])));
app.post('/api/clientes', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) db.run(`UPDATE clientes SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
    else db.run(`INSERT INTO clientes (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function(err) { 
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID }); 
    });
});
app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (id) db.run(`UPDATE fornecedores SET nome = ?, documento = ?, telefone = ?, ie = ?, email = ?, endereco = ? WHERE id = ?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
    else db.run(`INSERT INTO fornecedores (nome, documento, telefone, ie, email, endereco) VALUES (?, ?, ?, ?, ?, ?)`, [nome, documento, telefone, ie, email, endereco], function(err) { 
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID }); 
    });
});
app.delete('/api/cadastros/:type/:id', authenticateToken, (req, res) => {
    const { type, id } = req.params;
    let table = '';
    if (type === 'cliente') table = 'clientes';
    else if (type === 'fornecedor') table = 'fornecedores';
    else if (type === 'produto') table = 'produtos';
    else return res.status(400).json({ error: "Tipo inválido" });

    db.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- ROTA DE GERAÇÃO NF-E ---
app.get('/api/nfe', authenticateToken, (req, res) => db.all('SELECT * FROM nfe ORDER BY data_emissao DESC', [], (err, rows) => res.json(rows || [])));

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario, itens } = req.body;

    db.all('SELECT * FROM configs', [], async (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro configs: " + err.message });
        const configs = {};
        rows?.forEach(r => configs[r.chave] = r.valor);
        
        const isProduction = configs.nfe_modo === 'producao';
        const certPass = configs.cert_password || '';
        const pfxPath = path.join(__dirname, '../certificado', 'certificado.pfx');

        if (!certPass) {
            console.warn("AVISO: Senha não configurada. Simulando.");
            const chave = Array.from({length: 44}, () => Math.floor(Math.random() * 10)).join('');
            const xml = `<nfe><infNFe><ide><nNF>${venda_id}</nNF></ide><dest><xNome>${destinatario} (SIMULAÇÃO)</xNome></dest></infNFe></nfe>`;
            return db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`, [venda_id, chave, xml, 'simulada', new Date().toISOString()], function() { res.json({ id: this.lastID, chave, warning: "Modo Simulação" }); });
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
                dest: { xNome: isProduction ? destinatario : 'AMBIENTE DE HOMOLOGACAO - SEM VALOR', enderDest: { xLgr: 'Rua Cliente', nro: '123', xBairro: 'Bairro', cMun: emitente.enderEmit.cMun, xMun: 'Cidade', UF: 'SP', CEP: '19000000' }, indIEDest: '9' },
                det: itens.map((item, i) => ({ 
                    prod: { cProd: item.produto_id || '001', xProd: item.produto, NCM: item.ncm || '07031019', CFOP: configs.nfe_cfop || '5102', uCom: 'CX', qCom: item.qtd, vUnCom: (item.valor / item.qtd).toFixed(2), vProd: item.valor.toFixed(2) }, 
                    imposto: { vTotTrib: '0.00' } 
                })),
                total: { icmsTot: { vBC: '0.00', vICMS: '0.00', vProd: itens.reduce((a, b) => a + b.valor, 0).toFixed(2), vNF: itens.reduce((a, b) => a + b.valor, 0).toFixed(2) } },
                transp: { modFrete: '9' }, infAdic: { infCpl: 'NF-e gerada pelo sistema M&M Cebolas' }
            };

            const xmlAssinado = nfeService.createNFeXML(dadosNFe);
            
            db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
                [venda_id, chaveAcesso, xmlAssinado, 'assinada', new Date().toISOString()], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    if (isProduction) db.run("UPDATE configs SET valor = ? WHERE chave = 'nfe_prox_numero'", [paramsChave.nNF + 1]);
                    res.json({ id: this.lastID, chave: chaveAcesso, modo: isProduction ? 'PRODUCAO' : 'HOMOLOGACAO' });
                });
        } catch (nfeErr) {
            console.error("Erro NFeService:", nfeErr);
            res.status(500).json({ error: "Erro NFe: " + nfeErr.message });
        }
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get('SELECT xml_content FROM nfe WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row || !row.xml_content) return res.status(404).json({ error: "XML não encontrado" });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFe_${req.params.id}.xml`);
        res.send(row.xml_content);
    });
});

// --- ROTA PDF DANFE (DESIGN DEFINITIVO) ---
app.get('/api/nfe/:id/pdf', authenticateToken, (req, res) => {
    db.get(`SELECT n.*, m.valor, m.produto, m.quantidade, m.descricao as cliente_nome, 
            c.documento as cliente_doc, c.endereco as cliente_end, c.nome as cliente_razao,
            c.telefone as cliente_tel, c.email as cliente_email
            FROM nfe n 
            JOIN movimentacoes m ON n.venda_id = m.id
            LEFT JOIN clientes c ON m.descricao = c.nome 
            WHERE n.id = ?`, [req.params.id], async (err, row) => {
        
        if (err || !row) return res.status(404).json({ error: "Nota não encontrada" });

        try {
            const doc = new jsPDF();
            
            // 1. CARREGAR LOGO
            const logoPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
            let logoData = null;
            if (fs.existsSync(logoPath)) {
                logoData = fs.readFileSync(logoPath).toString('base64');
            }

            // 2. CÓDIGO DE BARRAS
            let barcodePng = null;
            if (row.chave_acesso) {
                barcodePng = await bwipjs.toBuffer({
                    bcid: 'code128', text: row.chave_acesso, scale: 3, height: 10, includetext: false, textxalign: 'center',
                });
            }

            // --- ESTILIZAÇÃO (Box e Campos) ---
            const box = (x, y, w, h, title = '', bold = false) => {
                doc.setDrawColor(0); 
                doc.setLineWidth(0.1);
                doc.rect(x, y, w, h);
                if (title) {
                    doc.setTextColor(0);
                    doc.setFontSize(5); 
                    doc.setFont("helvetica", bold ? "bold" : "normal");
                    doc.text(title.toUpperCase(), x + 1.5, y + 2.5);
                }
            };
            
            const field = (x, y, w, h, title, value, align = 'left', fontSize = 8, isBold = true) => {
                box(x, y, w, h, title);
                doc.setFontSize(fontSize);
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setTextColor(0); 
                
                const safeValue = value ? String(value) : '';
                // Centralização vertical matemática (Y + Metade da Altura + Pequeno ajuste para a base da fonte)
                const yPos = y + (h / 2) + 1.5; 

                if (align === 'center') {
                    doc.text(safeValue, x + (w/2), yPos, { align: 'center' });
                } else if (align === 'right') {
                    doc.text(safeValue, x + w - 1.5, yPos, { align: 'right' });
                } else {
                    const textWidth = doc.getTextWidth(safeValue);
                    if (textWidth > w - 3) doc.setFontSize(fontSize - 2); 
                    doc.text(safeValue, x + 1.5, yPos);
                }
            };

            // --- LAYOUT DANFE ---
            
            // CANHOTO
            doc.setLineDash([1, 1], 0); doc.line(10, 26, 200, 26); doc.setLineDash([]);
            box(10, 8, 160, 15, "RECEBEMOS DE M&M CEBOLAS OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO");
            
            // CORREÇÃO DA ASSINATURA: Linha sobe um pouco, texto desce
            doc.setLineWidth(0.1);
            doc.line(45, 20, 155, 20); // Linha movida para Y=20
            doc.setFontSize(5); doc.setFont("helvetica", "normal");
            doc.text("DATA DE RECEBIMENTO", 12, 18); 
            doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", 100, 22.5, {align:'center'}); // Texto movido para Y=22.5
            
            // Box lateral do Canhoto
            box(170, 8, 30, 15, "NF-e", true);
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.text(`Nº ${row.venda_id}`, 185, 15, {align:'center'});
            doc.setFontSize(8); doc.text(`SÉRIE 1`, 185, 19, {align:'center'});

            // CABEÇALHO PRINCIPAL
            const Y_EMIT = 30;
            
            // Box Logo/Empresa
            box(10, Y_EMIT, 80, 32);
            if (logoData) {
                doc.addImage(logoData, 'PNG', 12, Y_EMIT + 2, 28, 24); 
                
                // NOME DA EMPRESA EM VERDE ESCURO
                doc.setTextColor(COR_DESTAQUE[0], COR_DESTAQUE[1], COR_DESTAQUE[2]);
                doc.setFontSize(14); doc.setFont("helvetica", "bold");
                doc.text("M&M CEBOLAS", 44, Y_EMIT + 10);
                
                doc.setTextColor(0);
                doc.setFontSize(7); doc.setFont("helvetica", "normal");
                doc.text("Rua Manoel Cruz, 36", 44, Y_EMIT + 16);
                doc.text("Pres. Prudente - SP", 44, Y_EMIT + 20);
                doc.text("CEP: 19026-168", 44, Y_EMIT + 24);
                doc.text("Fone: (18) 9999-9999", 44, Y_EMIT + 28);
            } else {
                doc.setTextColor(COR_DESTAQUE[0], COR_DESTAQUE[1], COR_DESTAQUE[2]);
                doc.setFontSize(16); doc.text("M&M CEBOLAS", 15, Y_EMIT + 12);
                doc.setTextColor(0);
            }

            // Bloco DANFE
            box(90, Y_EMIT, 30, 32);
            doc.setTextColor(COR_DESTAQUE[0], COR_DESTAQUE[1], COR_DESTAQUE[2]);
            doc.setFontSize(14); doc.setFont("helvetica", "bold");
            doc.text("DANFE", 105, Y_EMIT + 7, {align:'center'});
            doc.setTextColor(0);
            
            doc.setFontSize(6); doc.setFont("helvetica", "normal");
            doc.text("Documento Auxiliar\nda Nota Fiscal\nEletrônica", 105, Y_EMIT + 12, {align:'center'});
            doc.text("0 - Entrada", 95, Y_EMIT + 20);
            doc.text("1 - Saída", 95, Y_EMIT + 23);
            
            doc.rect(112, Y_EMIT + 19, 6, 6);
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.text("1", 115, Y_EMIT + 23.5, {align:'center'});
            
            doc.setFontSize(8);
            doc.text(`Nº ${row.venda_id}`, 105, Y_EMIT + 28, {align:'center'});
            doc.text(`SÉRIE 1`, 105, Y_EMIT + 31, {align:'center'});

            // Bloco Chave e Barcode
            box(120, Y_EMIT, 80, 32, "CHAVE DE ACESSO");
            if (barcodePng) {
                doc.addImage(barcodePng, 'PNG', 123, Y_EMIT + 4, 74, 11);
            }
            
            // CORREÇÃO: Fonte reduzida para 6.5 para caber os 44 números sem vazar
            doc.setFont("courier", "bold"); 
            doc.setFontSize(6.5); 
            const chaveFmt = row.chave_acesso ? row.chave_acesso.match(/.{1,4}/g).join(' ') : '';
            doc.text(chaveFmt, 160, Y_EMIT + 19, {align:'center'});
            
            doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            doc.text("Consulta de autenticidade no portal nacional da NF-e", 160, Y_EMIT + 24, {align:'center'});
            doc.text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz", 160, Y_EMIT + 28, {align:'center'});

            // LINHA 2
            const Y_NAT = 64;
            field(10, Y_NAT, 110, 8, "NATUREZA DA OPERAÇÃO", "VENDA DE MERCADORIA", 'left', 8, true);
            field(120, Y_NAT, 80, 8, "PROTOCOLO DE AUTORIZAÇÃO DE USO", row.status === 'autorizada' ? "135240001234567 - AUTORIZADA" : "EMITIDA EM HOMOLOGAÇÃO - SEM VALOR", 'center');

            field(10, Y_NAT+8, 60, 8, "INSCRIÇÃO ESTADUAL", "562.696.411.110");
            field(70, Y_NAT+8, 60, 8, "INSC. ESTADUAL SUBST. TRIB.", "");
            field(130, Y_NAT+8, 70, 8, "CNPJ", "56.421.395/0001-50");

            // DESTINATÁRIO
            const Y_DEST = 83;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_DEST, 190, 5, 'F');
            doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text("DESTINATÁRIO / REMETENTE", 12, Y_DEST + 3.5);
            
            const Y_DEST_D = Y_DEST + 5;
            field(10, Y_DEST_D, 110, 8, "NOME / RAZÃO SOCIAL", row.cliente_nome || row.cliente_razao || "CONSUMIDOR FINAL");
            field(120, Y_DEST_D, 40, 8, "CNPJ / CPF", row.cliente_doc || "", 'center');
            field(160, Y_DEST_D, 40, 8, "DATA DA EMISSÃO", new Date(row.data_emissao).toLocaleDateString('pt-BR'), 'center');

            field(10, Y_DEST_D+8, 90, 8, "ENDEREÇO", row.cliente_end || "");
            field(100, Y_DEST_D+8, 40, 8, "BAIRRO / DISTRITO", "Centro");
            field(140, Y_DEST_D+8, 20, 8, "CEP", "19000-000");
            field(160, Y_DEST_D+8, 40, 8, "DATA SAÍDA/ENTRADA", new Date(row.data_emissao).toLocaleDateString('pt-BR'), 'center');

            field(10, Y_DEST_D+16, 60, 8, "MUNICÍPIO", "PRESIDENTE PRUDENTE");
            field(70, Y_DEST_D+16, 10, 8, "UF", "SP");
            field(80, Y_DEST_D+16, 40, 8, "FONE / FAX", row.cliente_tel || "");
            field(120, Y_DEST_D+16, 80, 8, "INSCRIÇÃO ESTADUAL", "");

            // IMPOSTOS
            const Y_IMP = 114;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.text("CÁLCULO DO IMPOSTO", 12, Y_IMP + 3.5);

            const Y_IMP_D = Y_IMP + 5;
            const wBox = 190 / 5;
            field(10, Y_IMP_D, wBox, 8, "BASE DE CÁLCULO DO ICMS", "0,00", 'right');
            field(10+wBox, Y_IMP_D, wBox, 8, "VALOR DO ICMS", "0,00", 'right');
            field(10+wBox*2, Y_IMP_D, wBox, 8, "BASE CÁLC. ICMS S.T.", "0,00", 'right');
            field(10+wBox*3, Y_IMP_D, wBox, 8, "VALOR DO ICMS S.T.", "0,00", 'right');
            field(10+wBox*4, Y_IMP_D, wBox, 8, "VALOR TOTAL PRODUTOS", row.valor.toFixed(2), 'right');

            field(10, Y_IMP_D+8, wBox, 8, "VALOR DO FRETE", "0,00", 'right');
            field(10+wBox, Y_IMP_D+8, wBox, 8, "VALOR DO SEGURO", "0,00", 'right');
            field(10+wBox*2, Y_IMP_D+8, wBox, 8, "DESCONTO", "0,00", 'right');
            field(10+wBox*3, Y_IMP_D+8, wBox, 8, "OUTRAS DESP. ACESS.", "0,00", 'right');
            field(10+wBox*4, Y_IMP_D+8, wBox, 8, "VALOR TOTAL DA NOTA", row.valor.toFixed(2), 'right');

            // TRANSPORTADOR
            const Y_TRANS = 138;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_TRANS, 190, 5, 'F');
            doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", 12, Y_TRANS + 3.5);
            
            const Y_TRANS_D = Y_TRANS + 5;
            field(10, Y_TRANS_D, 90, 8, "RAZÃO SOCIAL", "O MESMO");
            field(100, Y_TRANS_D, 20, 8, "FRETE", "9-Sem Frete");
            field(120, Y_TRANS_D, 20, 8, "CÓDIGO ANTT", "");
            field(140, Y_TRANS_D, 20, 8, "PLACA", "");
            field(160, Y_TRANS_D, 10, 8, "UF", "");
            field(170, Y_TRANS_D, 30, 8, "CNPJ/CPF", "");

            // PRODUTOS
            const Y_PROD = 155;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_PROD, 190, 5, 'F');
            doc.text("DADOS DO PRODUTO / SERVIÇO", 12, Y_PROD + 3.5);

            const yHead = Y_PROD + 5;
            box(10, yHead, 20, 5, "CÓDIGO");
            box(30, yHead, 70, 5, "DESCRIÇÃO");
            box(100, yHead, 15, 5, "NCM/SH");
            box(115, yHead, 10, 5, "CST");
            box(125, yHead, 10, 5, "CFOP");
            box(135, yHead, 10, 5, "UN");
            box(145, yHead, 15, 5, "QTD");
            box(160, yHead, 20, 5, "V.UNIT");
            box(180, yHead, 20, 5, "V.TOTAL");

            const yItem = yHead + 5;
            doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            doc.setFillColor(252, 252, 252); doc.rect(10, yItem, 190, 6, 'F');
            
            box(10, yItem, 20, 6); doc.text("001", 12, yItem+4);
            box(30, yItem, 70, 6); doc.text(row.produto, 32, yItem+4);
            box(100, yItem, 15, 6); doc.text("07031019", 107.5, yItem+4, {align:'center'});
            box(115, yItem, 10, 6); doc.text("0102", 120, yItem+4, {align:'center'});
            box(125, yItem, 10, 6); doc.text("5102", 130, yItem+4, {align:'center'});
            box(135, yItem, 10, 6); doc.text("CX", 140, yItem+4, {align:'center'});
            box(145, yItem, 15, 6); doc.text(String(row.quantidade), 158, yItem+4, {align:'right'});
            box(160, yItem, 20, 6); doc.text((row.valor/row.quantidade).toFixed(2), 178, yItem+4, {align:'right'});
            box(180, yItem, 20, 6); doc.text(row.valor.toFixed(2), 198, yItem+4, {align:'right'});

            // RODAPÉ
            const Y_ADIC = 200;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_ADIC, 190, 5, 'F');
            doc.text("DADOS ADICIONAIS", 12, Y_ADIC + 3.5);
            
            const Y_ADIC_D = Y_ADIC + 5;
            field(10, Y_ADIC_D, 130, 25, "INFORMAÇÕES COMPLEMENTARES", "Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.");
            field(140, Y_ADIC_D, 60, 25, "RESERVADO AO FISCO", "");

            const pdfOutput = doc.output('arraybuffer');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=DANFE_${row.chave_acesso}.pdf`);
            res.send(Buffer.from(pdfOutput));

        } catch (pdfErr) {
            console.error('Erro PDF:', pdfErr);
            res.status(500).send('Erro ao gerar PDF: ' + pdfErr.message);
        }
    });
});

app.get('/api/configs', authenticateToken, (req, res) => { db.all('SELECT * FROM configs', [], (err, rows) => { const c={}; rows?.forEach(r => c[r.chave]=r.valor); res.json(c); }); });
app.post('/api/configs', authenticateToken, (req, res) => { const { chave, valor } = req.body; db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], () => res.json({ success: true })); });
app.delete('/api/reset', authenticateToken, (req, res) => { if(req.user.role!=='admin') return res.sendStatus(403); db.serialize(() => { ['movimentacoes','nfe','clientes','fornecedores','produtos'].forEach(t => db.run(`DELETE FROM ${t}`)); res.json({ success: true }); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));