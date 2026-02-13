// server/configurar_nfe.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho para o banco de dados
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("=== Configurando Dados da M&M HF COMERCIO DE CEBOLAS ===");

// DADOS EXTRAÍDOS DOS PDFS (CNPJ e CADESP)
const CONFIGS = {
    // --- 1. CERTIFICADO ---
    // ATENÇÃO: Troque '123' pela senha real do seu arquivo .pfx se for diferente
    'cert_password': '123', 
    
    // --- 2. AMBIENTE ---
    // 'producao' = Nota vale de verdade. 'homologacao' = Teste.
    'nfe_modo': 'homologacao',

    // --- 3. IDENTIFICAÇÃO DA EMPRESA ---
    'emit_cnpj': '56421395000150',
    'emit_nome': 'M & M HF COMERCIO DE CEBOLAS LTDA',
    'emit_fant': 'M & M HF COMERCIO DE CEBOLAS',
    'emit_ie': '562696411110',
    
    // CRT 3 = Regime Normal (Baseado no "Regime Periódico de Apuração" do seu documento)
    'emit_crt': '3', 

    // --- 4. ENDEREÇO (Conforme CNPJ e Cadesp) ---
    'emit_lgr': 'RUA MANOEL CRUZ',
    'emit_nro': '36',
    'emit_bairro': 'RESIDENCIAL MINERVA I',
    'emit_cmun': '3541406', // Código IBGE de Presidente Prudente - SP
    'emit_xmun': 'PRESIDENTE PRUDENTE',
    'emit_uf': 'SP',
    'emit_uf_cod': '35', // Código de São Paulo
    'emit_cep': '19026168',

    // --- 5. NUMERAÇÃO AUTOMÁTICA ---
    'nfe_serie': '1',
    // Se esta for a sua PRIMEIRA nota neste CNPJ, deixe 1. 
    // Se já emitiu outras por outro sistema, coloque o próximo número aqui.
    'nfe_prox_numero': '1', 
    'nfe_cfop': '5102' // Venda de mercadoria adquirida de terceiros
};

db.serialize(() => {
    // Garante que a tabela existe
    db.run(`CREATE TABLE IF NOT EXISTS configs (
        chave TEXT PRIMARY KEY,
        valor TEXT
    )`);

    const stmt = db.prepare("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)");

    let count = 0;
    Object.entries(CONFIGS).forEach(([chave, valor]) => {
        stmt.run(chave, valor, (err) => {
            if (err) {
                console.error(`❌ Erro em ${chave}:`, err.message);
            } else {
                console.log(`✅ Configurado: ${chave}`);
            }
            count++;
            if (count === Object.keys(CONFIGS).length) {
                console.log("\n✅ Todas as configurações foram salvas!");
                console.log("👉 Agora reinicie o servidor: 'node server.js'");
            }
        });
    });
    stmt.finalize();
});