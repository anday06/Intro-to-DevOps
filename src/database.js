const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

async function createDatabase(databaseFile) {
  const resolvedPath = path.resolve(databaseFile);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  const sqlite = fs.existsSync(resolvedPath)
    ? new SQL.Database(fs.readFileSync(resolvedPath))
    : new SQL.Database();
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return {
    prepare(sql) {
      return {
        all(...params) {
          return queryRows(sqlite, sql, params);
        },
        get(...params) {
          return queryRows(sqlite, sql, params)[0];
        },
        run(...params) {
          sqlite.run(sql, params);
          const changes = sqlite.getRowsModified();
          const lastInsertRowid = sqlite.exec(
            "SELECT last_insert_rowid() AS id",
          )[0]?.values[0]?.[0];
          persist(sqlite, resolvedPath);
          return { changes, lastInsertRowid };
        },
      };
    },
    close() {
      persist(sqlite, resolvedPath);
      sqlite.close();
    },
  };
}

function queryRows(sqlite, sql, params) {
  const statement = sqlite.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function persist(sqlite, file) {
  fs.writeFileSync(file, Buffer.from(sqlite.export()));
}

module.exports = { createDatabase };
