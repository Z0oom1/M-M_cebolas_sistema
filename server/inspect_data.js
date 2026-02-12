const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    const tables = ['usuarios', 'produtos', 'clientes', 'fornecedores', 'movimentacoes', 'nfe'];
    
    tables.forEach(table => {
        db.all(`SELECT * FROM ${table} LIMIT 5`, (err, rows) => {
            if (err) {
                console.error(`Erro ao ler tabela ${table}:`, err.message);
            } else {
                console.log(`\n--- Tabela: ${table} (${rows.length} registros exibidos) ---`);
                console.table(rows);
            }
        });
    });
});
db.close();
