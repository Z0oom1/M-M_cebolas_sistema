const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const dbPath = path.join(__dirname, 'database.sqlite');
const backupDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `database-backup-${timestamp}.sqlite`);

// Copiar o arquivo do banco de dados
fs.copyFile(dbPath, backupPath, (err) => {
    if (err) {
        console.error('❌ Erro ao criar backup:', err);
        return;
    }
    console.log(`✅ Backup criado com sucesso: ${backupPath}`);

    // Manter apenas os últimos 7 backups
    fs.readdir(backupDir, (err, files) => {
        if (err) return;
        const backups = files
            .filter(f => f.startsWith('database-backup-'))
            .sort((a, b) => fs.statSync(path.join(backupDir, b)).mtime - fs.statSync(path.join(backupDir, a)).mtime);

        if (backups.length > 7) {
            backups.slice(7).forEach(file => {
                fs.unlinkSync(path.join(backupDir, file));
                console.log(`🗑️ Backup antigo removido: ${file}`);
            });
        }
    });
});
