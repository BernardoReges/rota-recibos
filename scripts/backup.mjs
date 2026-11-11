import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const dir = resolve(process.env.DATA_DIR || "data"),
  target = resolve(process.argv[2] || join(dir, "backups"));
await mkdir(target, { recursive: true });
const destination = join(
  target,
  "backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
);
const db = new DatabaseSync(join(dir, "app.sqlite"), { readOnly: true });
try {
  await backup(db, destination);
} finally {
  db.close();
}
const copy = new DatabaseSync(destination);
try {
  // Converte somente a cópia: backup portátil em um arquivo, sem WAL pendente.
  copy.exec("PRAGMA journal_mode=DELETE");
  const result = Object.values(copy.prepare("PRAGMA integrity_check").get())[0];
  if (result !== "ok") throw Error("Falha na integridade do backup.");
} finally {
  copy.close();
}
console.log("Backup privado íntegro: " + destination);
