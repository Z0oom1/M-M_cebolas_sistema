/**
 * Script de Migração do Banco de Dados
 * Adiciona novas tabelas e colunas para suportar:
 * - Gestão de Lotes
 * - Custo Médio Ponderado
 * - Cancelamento e Inutilização de NF-e
 * - Carta de Correção Eletrônica
 * - Armazenamento de XMLs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Iniciando migração do banco de dados...\n');

db.serialize(() => {
    // ============================================
    // 1. TABELA DE LOTES
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_lote TEXT UNIQUE NOT NULL,
        produto TEXT NOT NULL,
        quantidade_total INTEGER NOT NULL,
        quantidade_disponivel INTEGER NOT NULL,
        data_entrada TEXT NOT NULL,
        data_validade TEXT,
        preco_unitario REAL NOT NULL,
        fornecedor TEXT,
        observacoes TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela lotes:', err);
        else console.log('✅ Tabela lotes criada/verificada');
    });

    // ============================================
    // 2. TABELA DE RASTREAMENTO DE LOTES EM VENDAS
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS lotes_vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL,
        lote_id INTEGER NOT NULL,
        quantidade_utilizada INTEGER NOT NULL,
        data_saida TEXT NOT NULL,
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela lotes_vendas:', err);
        else console.log('✅ Tabela lotes_vendas criada/verificada');
    });

    // ============================================
    // 3. ATUALIZAR TABELA MOVIMENTACOES
    // ============================================
    db.run(`ALTER TABLE movimentacoes ADD COLUMN lote_id INTEGER`, (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('ℹ️  Coluna lote_id já existe em movimentacoes');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna lote_id:', err);
        } else {
            console.log('✅ Coluna lote_id adicionada a movimentacoes');
        }
    });

    db.run(`ALTER TABLE movimentacoes ADD COLUMN custo_unitario REAL`, (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('ℹ️  Coluna custo_unitario já existe em movimentacoes');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna custo_unitario:', err);
        } else {
            console.log('✅ Coluna custo_unitario adicionada a movimentacoes');
        }
    });

    // ============================================
    // 4. TABELA DE CUSTO MÉDIO PONDERADO
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS custo_medio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT UNIQUE NOT NULL,
        custo_medio REAL NOT NULL,
        quantidade_total INTEGER NOT NULL,
        valor_total REAL NOT NULL,
        atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela custo_medio:', err);
        else console.log('✅ Tabela custo_medio criada/verificada');
    });

    // ============================================
    // 5. ATUALIZAR TABELA NF-E COM NOVOS CAMPOS
    // ============================================
    db.run(`ALTER TABLE nfe ADD COLUMN numero_nfe INTEGER`, (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('ℹ️  Coluna numero_nfe já existe em nfe');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna numero_nfe:', err);
        } else {
            console.log('✅ Coluna numero_nfe adicionada a nfe');
        }
    });

    db.run(`ALTER TABLE nfe ADD COLUMN serie_nfe INTEGER DEFAULT 1`, (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('ℹ️  Coluna serie_nfe já existe em nfe');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna serie_nfe:', err);
        } else {
            console.log('✅ Coluna serie_nfe adicionada a nfe');
        }
    });

    db.run(`ALTER TABLE nfe ADD COLUMN protocolo_autorizacao TEXT`, (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('ℹ️  Coluna protocolo_autorizacao já existe em nfe');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna protocolo_autorizacao:', err);
        } else {
            console.log('✅ Coluna protocolo_autorizacao adicionada a nfe');
        }
    });

    // ============================================
    // 6. TABELA DE CANCELAMENTO DE NF-E
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS nfe_cancelamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nfe_id INTEGER NOT NULL,
        motivo_cancelamento TEXT NOT NULL,
        data_cancelamento TEXT NOT NULL,
        usuario_id INTEGER,
        protocolo_cancelamento TEXT,
        xml_cancelamento TEXT,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (nfe_id) REFERENCES nfe(id)
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela nfe_cancelamentos:', err);
        else console.log('✅ Tabela nfe_cancelamentos criada/verificada');
    });

    // ============================================
    // 7. TABELA DE INUTILIZAÇÃO DE NUMERAÇÃO
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS nfe_inutilizacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_inicial INTEGER NOT NULL,
        numero_final INTEGER NOT NULL,
        serie_nfe INTEGER DEFAULT 1,
        motivo_inutilizacao TEXT NOT NULL,
        data_inutilizacao TEXT NOT NULL,
        usuario_id INTEGER,
        protocolo_inutilizacao TEXT,
        xml_inutilizacao TEXT,
        status TEXT DEFAULT 'pendente'
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela nfe_inutilizacoes:', err);
        else console.log('✅ Tabela nfe_inutilizacoes criada/verificada');
    });

    // ============================================
    // 8. TABELA DE CARTA DE CORREÇÃO ELETRÔNICA
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS nfe_correcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nfe_id INTEGER NOT NULL,
        numero_sequencial INTEGER NOT NULL,
        campo_corrigido TEXT NOT NULL,
        valor_original TEXT NOT NULL,
        valor_corrigido TEXT NOT NULL,
        motivo_correcao TEXT NOT NULL,
        data_correcao TEXT NOT NULL,
        usuario_id INTEGER,
        protocolo_correcao TEXT,
        xml_correcao TEXT,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (nfe_id) REFERENCES nfe(id)
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela nfe_correcoes:', err);
        else console.log('✅ Tabela nfe_correcoes criada/verificada');
    });

    // ============================================
    // 9. TABELA DE ARMAZENAMENTO DE XMLS
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS xml_arquivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nfe_id INTEGER,
        tipo_xml TEXT,
        caminho_arquivo TEXT NOT NULL,
        tamanho_bytes INTEGER,
        hash_arquivo TEXT,
        mes_ano TEXT NOT NULL,
        data_armazenamento TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (nfe_id) REFERENCES nfe(id)
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela xml_arquivos:', err);
        else console.log('✅ Tabela xml_arquivos criada/verificada');
    });

    // ============================================
    // 10. TABELA DE CONFIGURAÇÃO DE RELATÓRIOS
    // ============================================
    db.run(`CREATE TABLE IF NOT EXISTS relatorios_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_relatorio TEXT NOT NULL,
        filtros TEXT,
        arquivo_pdf TEXT,
        arquivo_excel TEXT,
        data_geracao TEXT NOT NULL,
        expira_em TEXT
    )`, (err) => {
        if (err) console.error('❌ Erro ao criar tabela relatorios_cache:', err);
        else console.log('✅ Tabela relatorios_cache criada/verificada');
    });

    console.log('\n✨ Migração concluída com sucesso!');
    db.close();
});
