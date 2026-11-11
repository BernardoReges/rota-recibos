import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  Store,
  fail,
  text,
  verifyPassword,
  digest,
  passwordHash,
} from "./core.mjs";
import { extract } from "./ai.mjs";
export function createApp(
  domain,
  { dir, demo = false, runner = extract, origin, secure = false } = {},
) {
  const store = new Store(dir);
  const attempts = new Map();
  const readLimits = new Map();
  let processing = false;
  store.db
    .prepare(
      "UPDATE jobs SET state='failed',error='Processamento interrompido. Solicite nova leitura.' WHERE state='running'",
    )
    .run();
  async function tick() {
    if (processing) return;
    const job = store.db
      .prepare(
        "SELECT * FROM jobs WHERE state='pending' ORDER BY created LIMIT 1",
      )
      .get();
    if (!job) return;
    processing = true;
    store.db
      .prepare("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=?")
      .run(job.id);
    try {
      await domain.process(store, job, runner);
      store.db
        .prepare("UPDATE jobs SET state='done',error=NULL WHERE id=?")
        .run(job.id);
    } catch (e) {
      store.db
        .prepare("UPDATE jobs SET state='failed',error=? WHERE id=?")
        .run(
          /Configure|Provedor|Limite do provedor|Resposta da IA|Documento mudou|Extração/.test(
            e.message,
          )
            ? e.message
            : "Falha na leitura. Documento preservado. Revise manualmente ou tente novamente.",
          job.id,
        );
    } finally {
      processing = false;
    }
  }
  const timer = setInterval(tick, 500);
  timer.unref();
  const app = createServer(async (req, res) => {
    const json = (code, data, headers = {}) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        ...headers,
      });
      res.end(JSON.stringify(data));
    };
    const cookieName = domain.product + "_session";
    const cookie = (token) =>
      cookieName +
      "=" +
      token +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800" +
      (secure ? "; Secure" : "");
    for (const [k, v] of Object.entries({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    }))
      res.setHeader(k, v);
    try {
      const expected = origin || "http://" + req.headers.host;
      if (
        !origin &&
        !/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "")
      )
        fail("Host não permitido.", 403);
      if (origin && req.headers.host !== new URL(origin).host)
        fail("Host não permitido.", 403);
      if (req.headers.origin && req.headers.origin !== expected)
        fail("Origem não permitida.", 403);
      const url = new URL(req.url, expected),
        path = url.pathname;
      let body = {};
      if (!["GET", "HEAD"].includes(req.method)) {
        if (
          req.headers["content-type"] !== "application/json" ||
          req.headers["x-requested-with"] !== "app"
        )
          fail("Requisição inválida.", 403);
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 12 * 1024 * 1024) fail("Arquivo excede o limite.", 413);
          chunks.push(chunk);
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          fail("JSON inválido.");
        }
        if (!body || Array.isArray(body) || typeof body !== "object")
          fail("JSON inválido.");
      }
      const user = store.authenticate(req.headers.cookie, cookieName);
      if (req.method === "GET" && path === "/api/session")
        return json(200, {
          user,
          needsSetup: store.users().length === 0,
          demo,
          configured: !!(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY),
          product: domain.product,
        });
      if (req.method === "POST" && path === "/api/setup") {
        if (store.users().length) fail("Instalação já configurada.", 409);
        const u = store.user({ ...body, role: "admin" });
        store.log(u, "setup", u.id);
        return json(
          201,
          { user: u },
          { "Set-Cookie": cookie(store.session(u)) },
        );
      }
      if (req.method === "POST" && path === "/api/demo") {
        if (!demo) fail("Demonstração desativada.", 404);
        const role = body.role === "driver" ? "driver" : "admin";
        const preferredId = domain.demoUserId?.(store, role);
        const u = store
          .users()
          .find(
            (u) => u.role === role && (!preferredId || u.id === preferredId),
          );
        if (!u) fail("Demonstração não configurada.");
        return json(
          200,
          { user: u },
          { "Set-Cookie": cookie(store.session(u)) },
        );
      }
      if (req.method === "POST" && path === "/api/login") {
        const key = req.socket.remoteAddress || "local";
        const a = attempts.get(key) || { count: 0, until: Date.now() + 60000 };
        if (a.until < Date.now()) {
          a.count = 0;
          a.until = Date.now() + 60000;
        }
        if (++a.count > 8) fail("Muitas tentativas. Aguarde um minuto.", 429);
        attempts.set(key, a);
        const u = store.db
          .prepare("SELECT * FROM users WHERE email=?")
          .get(text(body.email, 3, 160).toLowerCase());
        if (!u || !verifyPassword(body.password, u.password))
          fail("E-mail ou senha inválidos.", 401);
        const { password, ...safe } = u;
        return json(
          200,
          { user: safe },
          { "Set-Cookie": cookie(store.session(safe)) },
        );
      }
      if (req.method === "POST" && path === "/api/logout") {
        const token = req.headers.cookie
          ?.split(";")
          .map((t) => t.trim())
          .find((t) => t.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1);
        if (token)
          store.db
            .prepare("DELETE FROM sessions WHERE token=?")
            .run(digest(token));
        return json(
          200,
          { ok: true },
          {
            "Set-Cookie":
              cookieName + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
          },
        );
      }
      if (path.startsWith("/api/")) {
        if (!user) fail("Entre para continuar.", 401);
        if (req.method === "POST" && path === "/api/password") {
          if (demo) fail("Troca de senha desativada na demonstração.", 400);
          const key = "password:" + user.id;
          const a = attempts.get(key) || {
            count: 0,
            until: Date.now() + 60000,
          };
          if (a.until < Date.now()) {
            a.count = 0;
            a.until = Date.now() + 60000;
          }
          if (++a.count > 5) fail("Muitas tentativas. Aguarde um minuto.", 429);
          attempts.set(key, a);
          const current = store.db
            .prepare("SELECT password FROM users WHERE id=?")
            .get(user.id);
          if (!verifyPassword(body.currentPassword, current.password))
            fail("Senha atual inválida.", 400);
          const hashed = passwordHash(body.newPassword);
          store.transaction(() => {
            store.db
              .prepare("UPDATE users SET password=? WHERE id=?")
              .run(hashed, user.id);
            store.db
              .prepare("DELETE FROM sessions WHERE user_id=?")
              .run(user.id);
            store.log(user, "user.password.changed", user.id);
          });
          return json(
            200,
            { ok: true },
            { "Set-Cookie": cookie(store.session(user)) },
          );
        }
        if (req.method === "GET" && path === "/api/users")
          return json(200, user.role === "admin" ? store.users() : [user]);
        if (req.method === "POST" && path === "/api/users") {
          if (user.role !== "admin") fail("Acesso restrito à empresa.", 403);
          if (demo) fail("Criação de usuários desativada na demonstração.");
          const u = store.user({
            ...body,
            role: domain.product === "rota" ? "driver" : "buyer",
          });
          store.log(user, "user.create", u.id);
          return json(201, u);
        }
        if (req.method === "GET" && path === "/api/audit") {
          if (user.role !== "admin") fail("Acesso restrito.", 403);
          return json(
            200,
            store.db
              .prepare(
                "SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY seq DESC LIMIT 100",
              )
              .all(),
          );
        }
        const fileMatch = path.match(/^\/api\/files\/([a-f0-9]+)$/);
        if (req.method === "GET" && fileMatch) {
          const f = store.db
            .prepare("SELECT * FROM files WHERE id=?")
            .get(fileMatch[1]);
          if (!f || !domain.canReadFile(store, user, f))
            fail("Arquivo não encontrado.", 404);
          res.writeHead(200, {
            "Content-Type": f.mime,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          });
          return res.end(f.bytes);
        }
        if (req.method === "POST" && path.endsWith("/read")) {
          const times = (readLimits.get(user.id) || []).filter(
            (t) => Date.now() - t < 60000,
          );
          if (times.length >= 6)
            fail("Limite de seis leituras por minuto. Aguarde.", 429);
          times.push(Date.now());
          readLimits.set(user.id, times);
        }
        const result = await domain.route({
          store,
          user,
          path,
          method: req.method,
          body,
          url,
          demo,
        });
        if (result?.csv !== undefined) {
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="' + result.name + '"',
          });
          return res.end(result.csv);
        }
        if (result !== undefined) return json(200, result);
        fail("Rota não encontrada.", 404);
      }
      if (req.method !== "GET") fail("Método não permitido.", 405);
      const files = {
        "/": "index.html",
        "/app.mjs": "app.mjs",
        "/style.css": "style.css",
        "/ui.mjs": "ui.mjs",
      };
      if (!files[path]) fail("Não encontrado.", 404);
      const file = files[path];
      res.writeHead(200, {
        "Content-Type": file.endsWith("html")
          ? "text/html; charset=utf-8"
          : file.endsWith("css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
      });
      res.end(await readFile(new URL("../public/" + file, import.meta.url)));
    } catch (e) {
      if (!res.headersSent)
        json(e.status || 400, {
          error: e.status
            ? e.message
            : /^Use texto|Valor inteiro|Quantidade|Data inválida|E-mail|Este comprovante|Use JPG|Arquivo inválido|Conteúdo do arquivo/.test(
                  e.message,
                )
              ? e.message
              : "Não foi possível concluir. Seus registros permanecem salvos.",
        });
      else res.end();
    }
  });
  app.store = store;
  app.on("close", () => {
    clearInterval(timer);
    if (!processing) store.db.close();
  });
  return app;
}
