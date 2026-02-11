const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const NFeService = require('./nfe-service');

const app = express();
const nfeService = new NFeService(
    '/home/ubuntu/upload/pasted_file_FR46kr_M___M_HF_COMERCIO_DE_CEBOLAS_LTDA_pj-1770813129310.pfx',
    '12345678',
    false // Ambiente de Homologação
);
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

app.post('/api/nfe/gerar', async (req, res) => {
    const { venda_id, cliente_id, itens, emitente, destinatario } = req.body;
    
    try {
        const agora = new Date();
        const year = agora.getFullYear().toString().slice(-2);
        const month = (agora.getMonth() + 1).toString().padStart(2, '0');
        const cNF = Math.floor(Math.random() * 99999999).toString().padStart(8, '0');
        
        const paramsChave = {
            cUF: '35', // São Paulo
            year,
            month,
            cnpj: emitente.cnpj.replace(/\D/g, ''),
            mod: '55',
            serie: 1,
            nNF: venda_id, // Usando ID da venda como número da nota para exemplo
            tpEmis: '1',
            cNF
        };

        const chave = nfeService.generateChaveAcesso(paramsChave);
        
        const dadosNFe = {
            ide: {
                ...paramsChave,
                chaveAcesso: chave,
                natOp: 'VENDA DE MERCADORIA',
                dhEmi: agora.toISOString().split('.')[0] + '-03:00',
                tpNF: '1',
                idDest: '1',
                cMunFG: '3541406', // Presidente Prudente
                tpImp: '1',
                finNFe: '1',
                indFinal: '1',
                indPres: '1'
            },
            emit: {
                cnpj: emitente.cnpj.replace(/\D/g, ''),
                xNome: emitente.nome,
                xFant: emitente.fantasia,
                enderEmit: emitente.endereco,
                ie: emitente.ie.replace(/\D/g, ''),
                crt: '1' // Simples Nacional
            },
            dest: {
                cnpj: destinatario.documento.length > 11 ? destinatario.documento.replace(/\D/g, '') : undefined,
                cpf: destinatario.documento.length <= 11 ? destinatario.documento.replace(/\D/g, '') : undefined,
                xNome: destinatario.nome,
                enderDest: destinatario.endereco,
                indIEDest: destinatario.ie ? '1' : '9',
                ie: destinatario.ie ? destinatario.ie.replace(/\D/g, '') : undefined,
                email: destinatario.email
            },
            det: itens.map(item => ({
                prod: {
                    cProd: item.id,
                    cEAN: 'SEM GTIN',
                    xProd: item.nome,
                    NCM: item.ncm || '07031019',
                    CFOP: '5102',
                    uCom: 'KG',
                    qCom: item.quantidade.toFixed(4),
                    vUnCom: item.valor.toFixed(10),
                    vProd: (item.quantidade * item.valor).toFixed(2),
                    cEANTrib: 'SEM GTIN',
                    uTrib: 'KG',
                    qTrib: item.quantidade.toFixed(4),
                    vUnTrib: item.valor.toFixed(10),
                    indTot: '1'
                },
                imposto: {
                    ICMS: { ICMSSN102: { orig: '0', CSOSN: '102' } },
                    PIS: { PISAliq: { CST: '01', vBC: '0.00', pPIS: '0.00', vPIS: '0.00' } },
                    COFINS: { COFINSAliq: { CST: '01', vBC: '0.00', pCOFINS: '0.00', vCOFINS: '0.00' } }
                }
            })),
            total: {
                icmsTot: {
                    vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00', vFCP: '0.00',
                    vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00',
                    vProd: itens.reduce((acc, item) => acc + (item.quantidade * item.valor), 0).toFixed(2),
                    vFrete: '0.00', vSeg: '0.00', vDesc: '0.00', vII: '0.00', vIPI: '0.00',
                    vIPIDevol: '0.00', vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00',
                    vNF: itens.reduce((acc, item) => acc + (item.quantidade * item.valor), 0).toFixed(2)
                }
            },
            transp: { modFrete: '9' },
            infAdic: { infCpl: 'Documento emitido por ME ou EPP optante pelo Simples Nacional.' }
        };

        const xml = nfeService.createNFeXML(dadosNFe);
        
        db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao) VALUES (?, ?, ?, ?, ?)`,
            [venda_id, chave, xml, 'pendente', agora.toISOString()],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, chave, xml, status: 'gerado_e_assinado' });
            }
        );
    } catch (error) {
        console.error('Erro ao gerar NF-e:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/nfe/download/:id', (req, res) => {
    db.get(`SELECT xml_content, chave_acesso FROM nfe WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'NF-e não encontrada' });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=${row.chave_acesso}.xml`);
        res.send(row.xml_content);
    });
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