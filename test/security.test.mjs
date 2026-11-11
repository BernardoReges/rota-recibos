import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/http.mjs";
import { domain } from "../src/domain.mjs";
async function local(t) {
  const dir = await mkdtemp(join(tmpdir(), "security-")),
    app = createApp(domain, { dir });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  return { app, base: "http://127.0.0.1:" + app.address().port };
}
const payload = {
  name: "Pessoa Teste",
  email: "admin@example.test",
  password: "senha-ficticia-123",
};
test("troca de senha exige senha atual e revoga todas as sessões anteriores", async (t) => {
  const { base } = await local(t);
  const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "app",
  };
  const setup = await fetch(base + "/api/setup", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const old = setup.headers.get("set-cookie").split(";")[0];
  const bad = await fetch(base + "/api/password", {
    method: "POST",
    headers: { ...headers, Cookie: old },
    body: JSON.stringify({
      currentPassword: "incorreta",
      newPassword: "nova-senha-ficticia-123",
    }),
  });
  assert.equal(bad.status, 400);
  const changed = await fetch(base + "/api/password", {
    method: "POST",
    headers: { ...headers, Cookie: old },
    body: JSON.stringify({
      currentPassword: payload.password,
      newPassword: "nova-senha-ficticia-123",
    }),
  });
  assert.equal(changed.status, 200);
  const current = changed.headers.get("set-cookie").split(";")[0];
  assert.notEqual(current, old);
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: old } })).status,
    401,
  );
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: current } })).status,
    200,
  );
  const oldLogin = await fetch(base + "/api/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: payload.email, password: payload.password }),
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fetch(base + "/api/login", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: payload.email,
      password: "nova-senha-ficticia-123",
    }),
  });
  assert.equal(newLogin.status, 200);
});
test("requisições de formulário e sem cabeçalho da aplicação são bloqueadas", async (t) => {
  const { base } = await local(t);
  for (const headers of [
    { "Content-Type": "application/json" },
    { "Content-Type": "application/x-www-form-urlencoded" },
  ]) {
    const r = await fetch(base + "/api/setup", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(r.status, 403);
  }
});
test("cookie é próprio do produto e logout invalida a sessão no servidor", async (t) => {
  const { base } = await local(t);
  const r = await fetch(base + "/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "app" },
    body: JSON.stringify(payload),
  });
  const raw = r.headers.get("set-cookie");
  assert.ok(raw.startsWith(domain.product + "_session="));
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Strict/);
  const cookie = raw.split(";")[0];
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: cookie } })).status,
    200,
  );
  await fetch(base + "/api/logout", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Requested-With": "app",
    },
    body: "{}",
  });
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: cookie } })).status,
    401,
  );
});
test("demonstração não abre acesso sem estar habilitada na instalação", async (t) => {
  const { base } = await local(t);
  const r = await fetch(base + "/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "app" },
    body: '{"role":"admin"}',
  });
  assert.equal(r.status, 404);
});
test("login limita tentativas e não informa se o e-mail existe", async (t) => {
  const { base } = await local(t);
  for (let i = 0; i < 9; i++) {
    const r = await fetch(base + "/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "app",
      },
      body: '{"email":"inexistente@example.test","password":"senha-ficticia"}',
    });
    assert.equal(r.status, i === 8 ? 429 : 401);
    if (i === 0)
      assert.equal((await r.json()).error, "E-mail ou senha inválidos.");
  }
});
