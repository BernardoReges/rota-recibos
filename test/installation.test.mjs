import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core.mjs";
import { createApp } from "../src/http.mjs";
import { domain } from "../src/domain.mjs";
import { demoDirectory } from "../src/demo-config.mjs";

async function installation(t) {
  const dir = await mkdtemp(join(tmpdir(), "installation-")),
    apps = [];
  t.after(async () => {
    for (const app of apps)
      if (app.listening) await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    start: async (demo) => {
      const app = createApp(domain, { dir, demo });
      apps.push(app);
      await new Promise((r) => app.listen(0, "127.0.0.1", r));
      return app;
    },
  };
}
const person = {
  name: "Pessoa Teste",
  email: "pessoa@example.test",
  password: "senha-ficticia-123",
  role: "admin",
};

test("demo ignora DATA_DIR real e aceita somente a configuração própria de pasta", () => {
  assert.equal(demoDirectory({ DATA_DIR: "D:/dados-reais" }), "data/demo");
  assert.equal(
    demoDirectory({
      DATA_DIR: "D:/dados-reais",
      DEMO_DATA_DIR: "D:/demo-isolado",
    }),
    "D:/demo-isolado",
  );
});
test("base real recusa modo demo sem alterar usuários, registros ou tarefas", async (t) => {
  const env = await installation(t),
    app = await env.start(false);
  app.store.user(person);
  app.store.save("fixture", {
    id: "preserved",
    value: "Dado fictício preservado",
  });
  app.store.db
    .prepare(
      "INSERT INTO jobs(id,record_id,state,created) VALUES('test-job','preserved','running','2026-11-11')",
    )
    .run();
  await new Promise((r) => app.close(r));
  assert.throws(
    () => createApp(domain, { dir: env.dir, demo: true }),
    /outro modo/,
  );
  const check = new Store(env.dir);
  try {
    assert.equal(check.users().length, 1);
    assert.equal(
      check.get("fixture", "preserved").value,
      "Dado fictício preservado",
    );
    assert.equal(
      check.db.prepare("SELECT state FROM jobs WHERE id='test-job'").get()
        .state,
      "running",
    );
    assert.equal(
      check.db.prepare("SELECT value FROM installation WHERE key='mode'").get()
        .value,
      "real",
    );
  } finally {
    check.db.close();
  }
});
test("base demonstrativa não é reutilizada como instalação real", async (t) => {
  const env = await installation(t),
    app = await env.start(true);
  app.store.user(person);
  await new Promise((r) => app.close(r));
  assert.throws(
    () => createApp(domain, { dir: env.dir, demo: false }),
    /outro modo/,
  );
  const check = new Store(env.dir);
  try {
    assert.equal(check.users().length, 1);
    assert.equal(
      check.db.prepare("SELECT value FROM installation WHERE key='mode'").get()
        .value,
      "demo",
    );
  } finally {
    check.db.close();
  }
});
test("base antiga com dados exige início real e não ganha acesso demo sem senha", async (t) => {
  const env = await installation(t),
    legacy = new Store(env.dir);
  legacy.user(person);
  legacy.db.close();
  assert.throws(
    () => createApp(domain, { dir: env.dir, demo: true }),
    /sem identificação de demonstração/,
  );
  const app = await env.start(false);
  assert.equal(app.store.users().length, 1);
  assert.equal(
    app.store.db
      .prepare("SELECT value FROM installation WHERE key='mode'")
      .get().value,
    "real",
  );
});
test("uma aplicação não abre o banco marcado como pertencente ao outro projeto", async (t) => {
  const env = await installation(t),
    app = await env.start(false);
  app.store.user(person);
  await new Promise((r) => app.close(r));
  const other = {
    ...domain,
    product: domain.product === "rota" ? "cotaflux" : "rota",
  };
  assert.throws(() => createApp(other, { dir: env.dir }), /outra aplicação/);
  const check = new Store(env.dir);
  try {
    assert.equal(check.users().length, 1);
    assert.equal(
      check.db
        .prepare("SELECT value FROM installation WHERE key='product'")
        .get().value,
      domain.product,
    );
  } finally {
    check.db.close();
  }
});
