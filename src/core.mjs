import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
export const now = () => new Date().toISOString();
export const id = () => randomBytes(16).toString("hex");
export function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
export function text(value, min = 1, max = 500) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(`Use texto entre ${min} e ${max} caracteres.`);
  return value.trim();
}
export function integer(value, min = 0, max = 100000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail("Valor inteiro fora do intervalo permitido.");
  return value;
}
export function positive(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1000000 ||
    Math.round(value * 1e6) < 1 ||
    Math.abs(value * 1e6 - Math.round(value * 1e6)) > 0.00001
  )
    fail("Quantidade inválida.");
  return value;
}
export function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail("Data inválida.");
  return value;
}
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function csv(rows) {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
export function money(cents) {
  return (integer(cents, 0, Number.MAX_SAFE_INTEGER) / 100)
    .toFixed(2)
    .replace(".", ",");
}
export function passwordHash(password) {
  text(password, 12, 200);
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 200) return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class Store {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, "app.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sequences(kind TEXT PRIMARY KEY,value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,owner TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(record_id) WHERE state IN ('pending','running');`);
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  get(kind, key) {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, key);
    if (!row) fail("Registro não encontrado.", 404);
    return JSON.parse(row.data);
  }
  list(kind) {
    return this.db
      .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid DESC")
      .all(kind)
      .map((r) => JSON.parse(r.data));
  }
  save(kind, data) {
    this.db
      .prepare(
        "INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(data.id, kind, JSON.stringify(data));
    return data;
  }
  create(kind, data) {
    return this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO sequences(kind,value) VALUES(?,1) ON CONFLICT(kind) DO UPDATE SET value=value+1",
        )
        .run(kind);
      return this.save(kind, {
        ...data,
        id: id(),
        number: this.db
          .prepare("SELECT value FROM sequences WHERE kind=?")
          .get(kind).value,
        version: 1,
        createdAt: now(),
      });
    });
  }
  log(user, action, target, detail = {}) {
    this.db
      .prepare(
        "INSERT INTO audit(at,actor,action,target,detail) VALUES(?,?,?,?,?)",
      )
      .run(now(), user.id, action, target, JSON.stringify(detail));
  }
  users() {
    return this.db
      .prepare("SELECT id,name,email,role FROM users ORDER BY name")
      .all();
  }
  user(data) {
    const email = text(data.email, 3, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("E-mail inválido.");
    const u = {
      id: id(),
      name: text(data.name, 2, 80),
      email,
      role: data.role,
    };
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(u.id, u.name, u.email, passwordHash(data.password), u.role);
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        fail("E-mail já cadastrado.", 409);
      throw e;
    }
    return u;
  }
  session(user) {
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), user.id, Date.now() + 8 * 3600000);
    return token;
  }
  authenticate(cookie = "", cookieName = "session") {
    const token = cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!token) return null;
    return (
      this.db
        .prepare(
          "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        )
        .get(digest(token), Date.now()) || null
    );
  }
  file(file, user) {
    if (
      !file ||
      !["image/jpeg", "image/png", "application/pdf", "text/plain"].includes(
        file.mime,
      )
    )
      fail("Use JPG, PNG, PDF ou TXT.");
    if (this.db.prepare("SELECT COUNT(*) n FROM files").get().n >= 500)
      fail("Limite de 500 documentos atingido.", 400);
    const name = text(file.name, 1, 120).replace(/[\\/\x00-\x1f]/g, "_");
    if (
      typeof file.data !== "string" ||
      file.data.length > 11200000 ||
      file.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)
    )
      fail("Arquivo inválido ou maior que 8 MB.");
    const bytes = Buffer.from(file.data, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024)
      fail("Arquivo inválido ou maior que 8 MB.");
    const valid =
      file.mime === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : file.mime === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : file.mime === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216
            : !bytes.includes(0);
    if (!valid) fail("Conteúdo do arquivo não corresponde ao formato.");
    const key = id();
    try {
      this.db
        .prepare("INSERT INTO files VALUES(?,?,?,?,?,?)")
        .run(key, digest(bytes), name, file.mime, bytes, user.id);
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        fail("Este comprovante ou documento já foi recebido.", 409);
      throw e;
    }
    return key;
  }
}
