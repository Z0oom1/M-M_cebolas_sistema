const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = 'admin';
const newPassword = '123';

async function resetAdmin() {
    try {
        const hash = await bcrypt.hash(newPassword, 10);
        db.get("SELECT * FROM usuarios WHERE username = ?", [username], (err, row) => {
            if (err) {
                console.error("Erro ao buscar usuário:", err);
                db.close();
                return;
            }

            if (row) {
                db.run("UPDATE usuarios SET password = ? WHERE username = ?", [hash, username], (updateErr) => {
                    if (updateErr) {
                        console.error("Erro ao atualizar senha:", updateErr);
                    } else {
                        console.log(`Senha do usuário '${username}' resetada para '${newPassword}' com sucesso!`);
                    }
                    db.close();
                });
            } else {
                db.run("INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)", 
                    ['Administrador', username, hash, 'admin'], (insertErr) => {
                    if (insertErr) {
                        console.error("Erro ao criar usuário admin:", insertErr);
                    } else {
                        console.log(`Usuário '${username}' criado com a senha '${newPassword}'!`);
                    }
                    db.close();
                });
            }
        });
    } catch (error) {
        console.error("Erro inesperado:", error);
        db.close();
    }
}

resetAdmin();
