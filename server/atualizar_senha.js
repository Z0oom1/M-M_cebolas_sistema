// server/atualizar_senha.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// A SENHA CORRETA QUE VOCÊ FORNECEU
const NOVA_SENHA = '12345678'; 

console.log(`=== Atualizando senha do certificado para: ${NOVA_SENHA} ===`);

db.run("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)", 
    ['cert_password', NOVA_SENHA], 
    (err) => {
        if (err) {
            console.error("❌ Erro ao atualizar:", err.message);
        } else {
            console.log(`✅ Sucesso! A senha "${NOVA_SENHA}" foi salva.`);
            console.log("👉 Agora reinicie o servidor: 'node server.js'");
        }
        db.close();
    }
);