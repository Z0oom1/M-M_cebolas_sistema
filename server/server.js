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
            estoque_minimo INTEGER DEFAULT 0,
            icone TEXT DEFAULT 'fa-box',
            cor TEXT DEFAULT '#1A5632'
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
            res.json({ updated: true });
        }
    );
});

// --- ROTAS DE PRODUTOS ---
app.get('/api/produtos', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    db.run(`INSERT INTO produtos (nome, ncm, preco_venda, estoque_minimo, icone, cor) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, ncm, preco_venda, estoque_minimo, icone || 'fa-box', cor || '#1A5632'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
    const { nome, ncm, preco_venda, estoque_minimo, icone, cor } = req.body;
    db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, estoque_minimo = ?, icone = ?, cor = ? WHERE id = ?`,
        [nome, ncm, preco_venda, estoque_minimo, icone, cor, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: true });
        }
    );
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// --- ROTAS DE CLIENTES/FORNECEDORES ---

app.get('/api/clientes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/fornecedores', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM fornecedores ORDER BY nome ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/clientes', authenticateToken, (req, res) => {
    const { nome, documento, ie, email, telefone, endereco } = req.body;
    db.run(`INSERT INTO clientes (nome, documento, ie, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, documento, ie, email, telefone, endereco],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
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

// --- NF-E ---

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    try {
        const { venda_id, destinatario, itens } = req.body;
        const agora = new Date();
        const chave = agora.getTime().toString().padEnd(44, '0');

        const dadosNFe = {
            ide: {
                cUF: '42', cNF: Math.floor(Math.random() * 99999999).toString(),
                natOp: 'VENDA DE MERCADORIA', mod: '55', serie: '1', nNF: Math.floor(Math.random() * 99999).toString(),
                dhEmi: agora.toISOString(), tpNF: '1', idDest: '1', cMunFG: '4205407', tpImp: '1', tpEmis: '1',
                cDV: '1', tpAmb: nfeService.isProduction ? '1' : '2', finNFe: '1', indFinal: '1', indPres: '1', procEmi: '0', verProc: '1.0.0'
            },
            emit: {
                cnpj: '00000000000000', xNome: 'M&M CEBOLAS LTDA', xFant: 'M&M CEBOLAS',
                enderEmit: { xLgr: 'RUA DAS CEBOLAS', nro: '100', xBairro: 'CENTRO', cMun: '4205407', xMun: 'FLORIANOPOLIS', UF: 'SC', CEP: '88000000', cPais: '1058', xPais: 'BRASIL' },
                ie: '000000000',
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
