import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/http.mjs";
import { domain, validateExpense, totals } from "../src/domain.mjs";
import { id } from "../src/core.mjs";
import { seed } from "../src/seed.mjs";
const password = "senha-ficticia-123";
test("botão de demonstração escolhe o motorista que tem a viagem de exemplo", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "rota-demo-"));
  const app = createApp(domain, { dir, demo: true });
  seed(app.store);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + app.address().port;
  const response = await fetch(base + "/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "app" },
    body: JSON.stringify({ role: "driver" }),
  });
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const session = await response.json();
  const state = await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(state.trips.length, 1);
  assert.equal(state.trips[0].driverId, session.user.id);
  assert.equal(session.user.email, "motorista@example.test");
});
async function setup(t, runner) {
  const dir = await mkdtemp(join(tmpdir(), "rota-"));
  const app = createApp(domain, { dir, ...(runner ? { runner } : {}) });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.address().port;
  let cookie = "";
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  async function request(path, data, headers = {}) {
    const r = await fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data === undefined
          ? {}
          : { "Content-Type": "application/json", "X-Requested-With": "app" }),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const type = r.headers.get("content-type");
    return {
      status: r.status,
      data: type?.includes("application/json")
        ? await r.json()
        : await r.text(),
    };
  }
  await request("/api/setup", {
    name: "Gestora Teste",
    email: "admin@example.test",
    password,
  });
  const driver = app.store.user({
      name: "Motorista Teste",
      email: "driver@example.test",
      password,
      role: "driver",
    }),
    other = app.store.user({
      name: "Outro Motorista",
      email: "other@example.test",
      password,
      role: "driver",
    });
  const trip = (
    await request("/api/trips", {
      title: "Viagem de teste",
      origin: "São Paulo/SP",
      destination: "Recife/PE",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      driverId: driver.id,
      advanceCents: 100000,
      budgetCents: 150000,
    })
  ).data;
  return { app, request, trip, driver, other, dir };
}
const fields = {
  merchant: "Posto Teste",
  date: "2026-11-10",
  category: "combustivel",
  amountCents: 38950,
  currency: "BRL",
  city: "São Paulo",
  state: "SP",
  receiptNumber: "FICTICIO",
  note: "Comprovante fictício.",
};
const file = (text = "RECIBO FICTÍCIO - R$ 389,50") => ({
  name: "comprovante.txt",
  mime: "text/plain",
  data: Buffer.from(text).toString("base64"),
});
test("motorista consegue baixar comprovante anexado pela empresa à sua viagem", async (t) => {
  const { request, trip } = await setup(t);
  const e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  await request("/api/login", { email: "driver@example.test", password });
  assert.equal((await request("/api/files/" + e.fileId)).status, 200);
  await request("/api/login", { email: "other@example.test", password });
  assert.equal((await request("/api/files/" + e.fileId)).status, 404);
});
test("relatório consolida somente aprovadas e aplica período, categoria e UF", async (t) => {
  const { request, trip } = await setup(t);
  let a = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  a = (
    await request("/api/expenses/" + a.id + "/submit", {
      ...fields,
      version: a.version,
    })
  ).data;
  await request("/api/expenses/" + a.id + "/review", {
    status: "approved",
    version: a.version,
    note: "Conferido no original.",
  });
  let b = (
    await request("/api/trips/" + trip.id + "/expenses", {
      file: file("Outro comprovante de teste"),
    })
  ).data;
  await request("/api/expenses/" + b.id + "/submit", {
    ...fields,
    date: "2026-11-11",
    category: "alimentacao",
    amountCents: 2500,
    version: b.version,
  });
  const r = (
    await request(
      "/api/report?from=2026-11-10&to=2026-11-10&category=combustivel&uf=SP",
    )
  ).data;
  assert.equal(r.rows.length, 1);
  assert.equal(r.totals.approvedCents, 38950);
  assert.equal(r.byState.SP, 38950);
  assert.equal(
    (await request("/api/report?from=2026-11-11")).data.rows.length,
    0,
  );
  assert.equal(
    (await request("/api/report?category=alimentacao")).data.rows.length,
    0,
  );
  assert.equal(
    (await request("/api/report?from=2026-11-30&to=2026-11-01")).status,
    400,
  );
  assert.match((await request("/api/report.csv")).data, /389,50/);
  await request("/api/login", { email: "driver@example.test", password });
  assert.equal((await request("/api/report")).status, 403);
  assert.equal((await request("/api/report.csv")).status, 403);
});
test("CSV vinculado é refeito na revisão sem repetir linhas já aprovadas", async (t) => {
  const { request, trip, dir } = await setup(t);
  for (const [label, amount] of [
    ["A", 1000],
    ["B", 2000],
  ]) {
    let e = (
      await request("/api/trips/" + trip.id + "/expenses", {
        file: file("Comprovante " + label),
      })
    ).data;
    e = (
      await request("/api/expenses/" + e.id + "/submit", {
        ...fields,
        merchant: "Fornecedor " + label,
        amountCents: amount,
        version: e.version,
      })
    ).data;
    await request("/api/expenses/" + e.id + "/review", {
      status: "approved",
      version: e.version,
      note: "Conferência controlada.",
    });
  }
  const saved = await readFile(
    join(dir, "exports", "viagem-1-aprovadas.csv"),
    "utf8",
  );
  assert.equal(saved.split("\r\n").length, 4);
  assert.match(saved, /30,00/);
  // Fetch decodifica UTF-8 removendo o BOM; o arquivo preserva-o para o Excel.
  assert.equal(
    saved.replace(/^\uFEFF/, ""),
    (await request("/api/trips/" + trip.id + "/export")).data,
  );
});
test("soma separa aprovado, pendente e devolvido sem duplicar centavos", () => {
  assert.deepEqual(
    totals([
      { ...fields, status: "approved" },
      { ...fields, status: "submitted", amountCents: 1050 },
      { ...fields, status: "returned", amountCents: 200 },
    ]),
    {
      approvedCents: 38950,
      pendingCents: 1050,
      returnedCents: 200,
      categories: { combustivel: 38950 },
    },
  );
});
test("despesas fora da viagem, moeda estrangeira e UF inválida são rejeitadas", () => {
  const trip = { startDate: "2026-11-01", endDate: "2026-11-30" };
  for (const change of [
    { date: "2026-12-01" },
    { currency: "USD" },
    { state: "XX" },
    { amountCents: 1.5 },
  ])
    assert.throws(() => validateExpense({ ...fields, ...change }, trip));
});
test("motorista não enxerga nem altera viagem, arquivo e despesa de outro", async (t) => {
  const { app, request, trip, other } = await setup(t);
  await request("/api/login", { email: "driver@example.test", password });
  const e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  await request("/api/login", { email: "other@example.test", password });
  assert.equal((await request("/api/state")).data.trips.length, 0);
  assert.equal(
    (
      await request("/api/trips/" + trip.id + "/expenses", {
        file: file("outro"),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/expenses/" + e.id + "/save", {
        ...fields,
        version: e.version,
      })
    ).status,
    404,
  );
  assert.equal((await request("/api/files/" + e.fileId)).status, 404);
  assert.equal(
    (await request("/api/trips/" + trip.id + "/export")).status,
    404,
  );
});
test("motorista não cria viagens, usuários ou aprova a própria despesa", async (t) => {
  const { request, trip } = await setup(t);
  await request("/api/login", { email: "driver@example.test", password });
  assert.equal((await request("/api/trips", {})).status, 403);
  assert.equal((await request("/api/users", {})).status, 403);
  const e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  assert.equal(
    (
      await request("/api/expenses/" + e.id + "/review", {
        status: "approved",
        version: 1,
        note: "Teste",
      })
    ).status,
    403,
  );
});
test("fluxo completo: anexo, envio, devolução, correção, aprovação e exportação", async (t) => {
  const { request, trip } = await setup(t);
  await request("/api/login", { email: "driver@example.test", password });
  let e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  e = (
    await request("/api/expenses/" + e.id + "/submit", {
      ...fields,
      version: e.version,
    })
  ).data;
  assert.equal(e.status, "submitted");
  assert.equal(
    (
      await request("/api/expenses/" + e.id + "/save", {
        ...fields,
        version: e.version,
      })
    ).status,
    409,
  );
  let csv = (await request("/api/trips/" + trip.id + "/export")).data;
  assert.ok(!csv.includes("Posto Teste"));
  await request("/api/login", { email: "admin@example.test", password });
  e = (
    await request("/api/expenses/" + e.id + "/review", {
      status: "returned",
      version: e.version,
      note: "Confira o total.",
    })
  ).data;
  assert.equal(e.status, "returned");
  await request("/api/login", { email: "driver@example.test", password });
  e = (
    await request("/api/expenses/" + e.id + "/submit", {
      ...fields,
      version: e.version,
      amountCents: 39950,
    })
  ).data;
  await request("/api/login", { email: "admin@example.test", password });
  e = (
    await request("/api/expenses/" + e.id + "/review", {
      status: "approved",
      version: e.version,
      note: "Total conferido com o original.",
    })
  ).data;
  assert.equal(e.status, "approved");
  csv = (await request("/api/trips/" + trip.id + "/export")).data;
  assert.match(csv, /399,50/);
  assert.match(csv, /Posto Teste/);
  assert.equal(
    (await request("/api/trips/" + trip.id + "/close", {})).data.status,
    "closed",
  );
  assert.equal(
    (
      await request("/api/trips/" + trip.id + "/expenses", {
        file: file("novo"),
      })
    ).status,
    409,
  );
});
test("mesmo arquivo é rejeitado; possível duplicidade semântica exige conferência", async (t) => {
  const { request, trip } = await setup(t);
  let e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  assert.equal(
    (await request("/api/trips/" + trip.id + "/expenses", { file: file() }))
      .status,
    409,
  );
  await request("/api/expenses/" + e.id + "/submit", {
    ...fields,
    version: e.version,
  });
  let second = (
    await request("/api/trips/" + trip.id + "/expenses", {
      file: file("Outra foto de comprovante fictício"),
    })
  ).data;
  assert.equal(
    (
      await request("/api/expenses/" + second.id + "/submit", {
        ...fields,
        version: second.version,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/expenses/" + second.id + "/submit", {
        ...fields,
        version: second.version,
        duplicateAcknowledged: true,
      })
    ).data.possibleDuplicate,
    true,
  );
});
test("revisão obsoleta e encerramento com pendência são rejeitados", async (t) => {
  const { request, trip } = await setup(t);
  let e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  await request("/api/expenses/" + e.id + "/submit", {
    ...fields,
    version: e.version,
  });
  assert.equal(
    (
      await request("/api/expenses/" + e.id + "/review", {
        status: "approved",
        version: 1,
        note: "Conferido",
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/trips/" + trip.id + "/close", {})).status,
    409,
  );
});
test("falha da IA mantém anexo e campos originais; é possível tentar de novo", async (t) => {
  const { request, app, trip } = await setup(t, async () => {
    throw Error("Provedor indisponível.");
  });
  const e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  assert.equal(
    (await request("/api/expenses/" + e.id + "/read", { consent: false }))
      .status,
    400,
  );
  await request("/api/expenses/" + e.id + "/read", { consent: true });
  await new Promise((r) => setTimeout(r, 900));
  const state = (await request("/api/state")).data;
  assert.equal(state.jobs[0].state, "failed");
  assert.equal(state.expenses[0].amountCents, null);
  assert.equal((await request("/api/files/" + e.fileId)).status, 200);
});
test("resposta atrasada da IA não substitui uma edição manual mais recente", async (t) => {
  let resolveAI;
  let started;
  const startedPromise = new Promise((r) => (started = r));
  const { request, trip } = await setup(t, async () => {
    started();
    return new Promise((r) => (resolveAI = r));
  });
  const e = (
    await request("/api/trips/" + trip.id + "/expenses", { file: file() })
  ).data;
  await request("/api/expenses/" + e.id + "/read", { consent: true });
  await startedPromise;
  await request("/api/expenses/" + e.id + "/save", {
    ...fields,
    version: e.version,
  });
  resolveAI({
    data: { ...fields, evidence: "Total fictício" },
    provider: "stub",
    model: "test",
    elapsedMs: 1,
  });
  await new Promise((r) => setTimeout(r, 100));
  const st = (await request("/api/state")).data;
  assert.equal(st.jobs[0].state, "failed");
  assert.match(st.jobs[0].error, /Documento mudou/);
  assert.equal(st.expenses[0].amountCents, 38950);
  assert.equal(st.expenses[0].extraction, undefined);
});
