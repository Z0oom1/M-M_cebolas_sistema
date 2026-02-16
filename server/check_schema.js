const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.all("PRAGMA table_info(clientes)", (err, rows) => {
    if (err) console.error(err);
    else console.log("Clientes:", rows);
    db.close();
});
