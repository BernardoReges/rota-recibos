import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Store,
  passwordHash,
  verifyPassword,
  csv,
  date,
  integer,
  positive,
} from "../src/core.mjs";
import { extract } from "../src/ai.mjs";
export async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "operacao-"));
  return dir;
}
test("senha exige 12 caracteres e não é guardada em texto puro", () => {
  assert.throws(() => passwordHash("curta"));
  const h = passwordHash("senha-ficticia-123");
  assert.ok(!h.includes("senha-ficticia"));
  assert.equal(verifyPassword("senha-ficticia-123", h), true);
  assert.equal(verifyPassword("errada", h), false);
});
test("sessões usam token aleatório, resumo no banco e vencimento", async (t) => {
  const s = new Store(await temporary(t));
  t.after(async () => {
    s.db.close();
    await rm(s.dir, { recursive: true, force: true });
  });
  const u = s.user({
    name: "Pessoa Teste",
    email: "teste@example.test",
    password: "senha-ficticia-123",
    role: "admin",
  });
  const token = s.session(u);
  assert.equal(s.authenticate("session=" + token).id, u.id);
  assert.notEqual(
    s.db.prepare("SELECT token FROM sessions").get().token,
    token,
  );
  s.db.prepare("UPDATE sessions SET expires=0").run();
  assert.equal(s.authenticate("session=" + token), null);
});
test("centavos, datas e quantidades inválidas são rejeitados", () => {
  assert.throws(() => integer(12.34));
  assert.throws(() => integer(-1));
  assert.throws(() => date("2026-02-30"));
  assert.throws(() => positive(0));
  assert.throws(() => positive(0.0000001));
  assert.equal(positive(0.1), 0.1);
});
test("CSV protege texto de fórmulas e mantém separador brasileiro", () => {
  const c = csv([["=CMD()", "@teste", "a;b", 'a"b', "10,25"]]);
  assert.ok(c.startsWith("\uFEFF"));
  assert.match(c, /'=CMD/);
  assert.match(c, /'@teste/);
  assert.match(c, /"a;b"/);
  assert.match(c, /a""b/);
  assert.match(c, /10,25/);
});
test("transação reverte escrita incompleta", async (t) => {
  const s = new Store(await temporary(t));
  t.after(async () => {
    s.db.close();
    await rm(s.dir, { recursive: true, force: true });
  });
  assert.throws(() =>
    s.transaction(() => {
      s.save("x", { id: "one" });
      throw Error("falha");
    }),
  );
  assert.equal(s.list("x").length, 0);
});
test("upload verifica assinatura, duplicidade e limite", async (t) => {
  const s = new Store(await temporary(t));
  t.after(async () => {
    s.db.close();
    await rm(s.dir, { recursive: true, force: true });
  });
  const f = {
    name: "nota.txt",
    mime: "text/plain",
    data: Buffer.from("Comprovante fictício").toString("base64"),
  };
  s.file(f, { id: "user" });
  assert.throws(() => s.file(f, { id: "other" }), /já foi recebido/);
  assert.throws(
    () => s.file({ ...f, mime: "image/png" }, { id: "user" }),
    /formato/,
  );
  assert.throws(() => s.file({ ...f, data: "not-base64" }, { id: "user" }));
  assert.throws(() =>
    s.file({ ...f, data: "a".repeat(11200004) }, { id: "user" }),
  );
});
test("sem chave não simula extração", async () => {
  await assert.rejects(
    () =>
      extract({ mime: "text/plain", bytes: Buffer.from("teste") }, {}, "", {
        key: "",
      }),
    /Configure/,
  );
});
test("provedor falha sem expor token ou transformar erro em resultado", async () => {
  await assert.rejects(
    () =>
      extract(
        { mime: "text/plain", bytes: Buffer.from("teste") },
        {},
        "",
        { key: "segredo-ficticio", model: "modelo" },
        async () => ({ ok: false, status: 429 }),
      ),
    /Limite do provedor/,
  );
});
test("extração envia segredo no cabeçalho e valida JSON de retorno", async () => {
  let request;
  const r = await extract(
    { mime: "text/plain", bytes: Buffer.from("RECIBO FICTÍCIO") },
    { type: "object" },
    "Extrair total",
    { key: "segredo-ficticio", model: "modelo" },
    async (url, init) => {
      request = { url, ...init };
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"valor":100}' }] } }],
        }),
      };
    },
  );
  assert.equal(r.data.valor, 100);
  assert.equal(request.headers["x-goog-api-key"], "segredo-ficticio");
  assert.ok(!request.body.includes("segredo-ficticio"));
  assert.ok(!request.url.includes("segredo-ficticio"));
  assert.equal(request.redirect, "error");
});
