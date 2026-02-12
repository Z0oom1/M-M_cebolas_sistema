const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/home/ubuntu/M-M_cebolas_sistema/server/database.sqlite');

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) console.error(err);
        console.log("Tables:", rows.map(r => r.name).join(", "));
    });
});
db.close();
