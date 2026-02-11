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

// ✅ CORREÇÃO CRÍTICO-004: Remover caminho hardcoded do Windows
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

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

// ✅ MIDDLEWARE DE AUTENTICAÇÃO JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

// ✅ MIDDLEWARE DE VERIFICAÇÃO DE ADMIN
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}

// ✅ MIDDLEWARE DE TRATAMENTO DE ERROS GLOBAL
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
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
        // Tabela Movimentações com índices
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT, 
            descricao TEXT, 
            produto TEXT, 
            quantidade INTEGER, 
            valor REAL, 
            data TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimentacoes(tipo)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data)`);

        // Tabelas de Cadastro com índices
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cli_doc ON clientes(documento)`);

        db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome TEXT, 
            documento TEXT, 
            ie TEXT, 
            email TEXT, 
            telefone TEXT,
            endereco TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_forn_doc ON fornecedores(documento)`);

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
            status TEXT,
            data_emissao TEXT
        )`);

        // Tabela de Usuários
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            label TEXT
        )`, async () => {
            // ✅ CORREÇÃO CRÍTICO-001: Hash de senha com bcrypt
            const hashedPassword = await bcrypt.hash('123', 10);
            db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`,
                ['admin', hashedPassword, 'admin', 'Administrador']);
        });

        // Tabela de Configurações
        db.run(`CREATE TABLE IF NOT EXISTS configs (
            chave TEXT PRIMARY KEY,
            valor TEXT
        )`, () => {
            db.run(`INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)`, ['nfe_modo', 'homologacao'], () => {
                db.get(`SELECT valor FROM configs WHERE chave = ?`, ['nfe_modo'], (err, row) => {
                    if (row) nfeService.isProduction = (row.valor === 'producao');
                });
            });
        });
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---

// ✅ CORREÇÃO CRÍTICO-002: Login com JWT
app.post('/api/login', 
    body('username').trim().notEmpty().withMessage('Usuário é obrigatório'),
    body('password').notEmpty().withMessage('Senha é obrigatória'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;
        
        db.get(`SELECT * FROM usuarios WHERE username = ?`, [username], async (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(401).json({ error: "Usuário ou senha incorretos" });

            // Verificar senha com bcrypt
            const validPassword = await bcrypt.compare(password, row.password);
            if (!validPassword) {
                return res.status(401).json({ error: "Usuário ou senha incorretos" });
            }

            // Gerar token JWT
            const token = jwt.sign(
                { id: row.id, username: row.username, role: row.role },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            res.json({
                id: row.id,
                username: row.username,
                role: row.role,
                label: row.label,
                token
            });
        });
    }
);

// --- ROTAS DE MOVIMENTAÇÕES (Protegidas) ---

app.get('/api/movimentacoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM movimentacoes ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/entrada', 
    authenticateToken,
    body('desc').trim().notEmpty(),
    body('productType').trim().notEmpty(),
    body('qty').isInt({ min: 1 }),
    body('value').isFloat({ min: 0 }),
    body('date').isISO8601(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { desc, productType, qty, value, date } = req.body;
        db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
            ['entrada', desc, productType, qty, value, date],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    }
);

app.post('/api/saida',
    authenticateToken,
    body('desc').trim().notEmpty(),
    body('productType').trim().notEmpty(),
    body('qty').isInt({ min: 1 }),
    body('value').isFloat({ min: 0 }),
    body('date').isISO8601(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { desc, productType, qty, value, date } = req.body;
        db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
            ['saida', desc, productType, qty, value, date],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    }
);

app.post('/api/despesa',
    authenticateToken,
    body('desc').trim().notEmpty(),
    body('value').isFloat({ min: 0 }),
    body('date').isISO8601(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { desc, value, date } = req.body;
        db.run(`INSERT INTO movimentacoes (tipo, descricao, produto, quantidade, valor, data) VALUES (?, ?, ?, ?, ?, ?)`,
            ['despesa', desc, '-', 0, value, date],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    }
);

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM movimentacoes WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Registro não encontrado' });
        res.json({ deleted: true });
    });
});

app.put('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    const { desc, productType, qty, value } = req.body;
    db.run(`UPDATE movimentacoes SET descricao = ?, produto = ?, quantidade = ?, valor = ? WHERE id = ?`,
        [desc, productType, qty, value, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Registro não encontrado' });
            res.json({ updated: this.changes });
        }
    );
});

// --- ROTAS DE CLIENTES (Protegidas) ---

app.get('/api/clientes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/clientes',
    authenticateToken,
    body('nome').trim().notEmpty(),
    body('documento').optional().trim(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nome, documento, ie, email, telefone, endereco } = req.body;
        db.run(`INSERT INTO clientes (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`, 
            [nome, documento, ie, email, telefone, endereco], 
            function(err) { 
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID }); 
            }
        );
    }
);

app.delete('/api/clientes/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM clientes WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json({ deleted: true });
    });
});

app.put('/api/clientes/:id', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`UPDATE clientes SET nome = ?, documento = ?, ie = ?, email = ?, telefone = ?, endereco = ? WHERE id = ?`, 
        [nome, documento, ie, email, telefone, endereco, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
            res.json({ updated: this.changes });
        }
    );
});

// --- ROTAS DE PRODUTOS (Protegidas) ---

app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo } = req.body;
    db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo) VALUES (?, ?, ?, ?)`,
        [nome, ncm, preco_venda, estoque_minimo],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo } = req.body;
    db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, estoque_minimo = ? WHERE id = ?`,
        [nome, ncm, preco_venda, estoque_minimo, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });
            res.json({ updated: this.changes });
        }
    );
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });
        res.json({ deleted: true });
    });
});

// --- ROTAS DE FORNECEDORES (Protegidas) ---

app.get('/api/fornecedores', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM fornecedores ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`INSERT INTO fornecedores (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`, 
        [nome, documento, ie, email, telefone, endereco], 
        function(err) { 
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID }); 
        }
    );
});

app.delete('/api/fornecedores/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM fornecedores WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
        res.json({ deleted: true });
    });
});

app.put('/api/fornecedores/:id', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`UPDATE fornecedores SET nome = ?, documento = ?, ie = ?, email = ?, telefone = ?, endereco = ? WHERE id = ?`, 
        [nome, documento, ie, email, telefone, endereco, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
            res.json({ updated: this.changes });
        }
    );
});

// --- ROTAS DE NF-e (Protegidas) ---

app.get('/api/nfe', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM nfe ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get(`SELECT xml_content, chave_acesso FROM nfe WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).send('Nota não encontrada');
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFe${row.chave_acesso}.xml`);
        res.send(row.xml_content);
    });
});

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, cliente_id, itens, emitente, destinatario } = req.body;
    
    if (!venda_id || !emitente || !destinatario || !itens) {
        return res.status(400).json({ error: "Dados incompletos para geração da NF-e" });
    }

    try {
        console.log("[API] Iniciando geração de NF-e para venda:", venda_id);
        if (!nfeService.certInfo) {
            console.error("[API] Erro: Certificado não carregado.");
            throw new Error("Certificado digital não configurado ou inválido.");
        }
        const agora = new Date();
        const year = agora.getFullYear().toString().slice(-2);
        const month = (agora.getMonth() + 1).toString().padStart(2, '0');
        const cNF = Math.floor(Math.random() * 99999999).toString().padStart(8, '0');
        
        const paramsChave = {
            cUF: '35',
            year,
            month,
            cnpj: emitente.cnpj.replace(/\D/g, ''),
            mod: '55',
            serie: 1,
            nNF: venda_id,
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
                cMunFG: '3541406',
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
                crt: '1'
            },
            dest: {
                cnpj: (destinatario.documento && destinatario.documento.length > 11) ? destinatario.documento.replace(/\D/g, '') : undefined,
                cpf: (destinatario.documento && destinatario.documento.length <= 11) ? destinatario.documento.replace(/\D/g, '') : undefined,
                xNome: destinatario.nome,
                enderDest: typeof destinatario.endereco === 'string' ? JSON.parse(destinatario.endereco) : destinatario.endereco,
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

        console.log("[API] Gerando XML...");
        const xml = nfeService.createNFeXML(dadosNFe);
        console.log("[API] XML gerado com sucesso. Salvando no banco...");
        
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

app.get('/api/nfe/download/:id', authenticateToken, (req, res) => {
    db.get(`SELECT xml_content, chave_acesso FROM nfe WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'NF-e não encontrada' });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=${row.chave_acesso}.xml`);
        res.send(row.xml_content);
    });
});

// --- ROTAS DE USUÁRIOS (Apenas Admin) ---

app.get('/api/usuarios', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT id, username, role, label FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/usuarios', 
    authenticateToken, 
    requireAdmin,
    body('username').trim().notEmpty(),
    body('password').isLength({ min: 3 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password, role, label } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO usuarios (username, password, role, label) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, role, label],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    }
);

app.delete('/api/usuarios/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run(`DELETE FROM usuarios WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ deleted: true });
    });
});

// --- ROTAS DE CONFIGURAÇÕES (Apenas Admin) ---

app.get('/api/configs', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT * FROM configs`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const configObj = {};
        rows.forEach(row => configObj[row.chave] = row.valor);
        res.json(configObj);
    });
});

app.post('/api/configs', authenticateToken, requireAdmin, (req, res) => {
    const { chave, valor } = req.body;
    db.run(`INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)`, [chave, valor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (chave === 'nfe_modo') {
            nfeService.isProduction = (valor === 'producao');
        }
        
        res.json({ success: true });
    });
});

// --- RESET GERAL (Apenas Admin) ---
app.delete('/api/reset', authenticateToken, requireAdmin, (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM movimentacoes");
        db.run("DELETE FROM clientes");
        db.run("DELETE FROM fornecedores");
        db.run("DELETE FROM nfe");
    });
    res.json({ message: "Resetado" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SERVIDOR ONLINE NA PORTA ${PORT}`);
    console.log(`- Segurança: JWT + Bcrypt ativados`);
    console.log(`- Acesso Web/iPad: Liberado (http://SEU_IP:${PORT})\n`);
});
