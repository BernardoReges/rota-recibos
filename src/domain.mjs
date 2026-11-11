import { extractedObject } from "./contracts.mjs";
export const instructions =
  "Leia um comprovante de despesa de viagem. amountCents deve representar o total efetivamente pago, sem somar troco, valor recebido ou descontos novamente. Identifique BRL apenas quando houver indicação de reais. Data YYYY-MM-DD, sem presumir ano ausente. Não extraia CPF, dados do cartão ou dados bancários. Categoria outros se incerta.";
import { fail, text, integer, date, id, now, csv, money } from "./core.mjs";
import { nullable } from "./ai.mjs";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
export const categories = [
  "combustivel",
  "pedagio",
  "alimentacao",
  "hospedagem",
  "outros",
];
const admin = (u) => {
  if (u.role !== "admin") fail("Acesso restrito à empresa.", 403);
};
export function access(user, trip) {
  if (user.role !== "admin" && trip.driverId !== user.id)
    fail("Viagem não encontrada.", 404);
}
export function validateExpense(b, trip) {
  if (!categories.includes(b.category)) fail("Categoria inválida.", 400);
  const day = date(b.date);
  if (day < trip.startDate || day > trip.endDate)
    fail("A data deve estar dentro do período da viagem.", 400);
  if (b.currency !== "BRL") fail("Somente despesas em reais são aceitas.", 400);
  const state = b.state ? text(b.state, 2, 2).toUpperCase() : "";
  if (
    state &&
    ![
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ].includes(state)
  )
    fail("UF inválida.", 400);
  return {
    merchant: text(b.merchant, 2, 160),
    date: day,
    category: b.category,
    amountCents: integer(b.amountCents, 1, 100000000),
    currency: "BRL",
    city: b.city ? text(b.city, 1, 100) : "",
    state,
    receiptNumber: b.receiptNumber ? text(b.receiptNumber, 1, 100) : "",
    note: b.note ? text(b.note, 1, 1000) : "",
  };
}
export function totals(expenses) {
  const result = {
    approvedCents: 0,
    pendingCents: 0,
    returnedCents: 0,
    categories: {},
  };
  for (const e of expenses) {
    const amount = e.amountCents || 0;
    if (e.status === "approved") {
      result.approvedCents += amount;
      result.categories[e.category] =
        (result.categories[e.category] || 0) + amount;
    } else if (e.status === "returned") result.returnedCents += amount;
    else result.pendingCents += amount;
  }
  return result;
}
export function tripCsv(s, trip) {
  const approved = s
    .list("expense")
    .filter((e) => e.tripId === trip.id && e.status === "approved");
  return csv([
    [
      "Viagem",
      "Motorista",
      "Data",
      "Categoria",
      "Estabelecimento",
      "Cidade",
      "UF",
      "Valor BRL",
      "Recibo",
      "Situação",
    ],
    ...approved.map((e) => [
      "#" + trip.number,
      trip.driverName,
      e.date,
      e.category,
      e.merchant,
      e.city,
      e.state,
      money(e.amountCents),
      e.receiptNumber,
      "Aprovada",
    ]),
    [
      "TOTAL APROVADO",
      "",
      "",
      "",
      "",
      "",
      "",
      money(totals(approved).approvedCents),
      "",
      "",
    ],
  ]);
}
export function syncSheet(s, trip) {
  const dir = join(s.dir, "exports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "viagem-" + trip.number + "-aprovadas.csv");
  writeFileSync(path + ".tmp", tripCsv(s, trip), { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
const props = {
  merchant: { type: ["string", "null"] },
  date: { type: ["string", "null"], pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
  category: {
    type: "string",
    enum: ["combustivel", "pedagio", "alimentacao", "hospedagem", "outros"],
  },
  amountCents: { type: ["integer", "null"] },
  currency: { type: ["string", "null"] },
  city: { type: ["string", "null"] },
  state: { type: ["string", "null"] },
  receiptNumber: { type: ["string", "null"] },
  evidence: { type: "string" },
};
export const schema = {
  type: "object",
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
};
export const domain = {
  product: "rota",
  demoUserId: (store, role) =>
    role === "driver"
      ? store.users().find((u) => u.email === "motorista@example.test")?.id
      : undefined,
  canReadFile: (s, u, f) => {
    if (u.role === "admin") return true;
    const expense = s.list("expense").find((e) => e.fileId === f.id);
    return !!expense && s.get("trip", expense.tripId).driverId === u.id;
  },
  async process(s, job, runner) {
    const e = s.get("expense", job.record_id),
      version = e.version;
    if (!["draft", "returned"].includes(e.status))
      throw Error("Documento mudou durante a leitura.");
    const f = s.db.prepare("SELECT * FROM files WHERE id=?").get(e.fileId);
    const result = await runner(f, schema, instructions);
    const d = result.data;
    extractedObject(d, {
      merchant: "string",
      date: "string",
      amountCents: "integer",
      currency: "string",
      city: "string",
      state: "string",
      receiptNumber: "string",
      evidence: "string",
    });
    if (d.date !== null) date(d.date);
    if (
      !d ||
      typeof d.evidence !== "string" ||
      !categories.includes(d.category) ||
      (d.amountCents !== null &&
        (!Number.isSafeInteger(d.amountCents) ||
          d.amountCents < 1 ||
          d.amountCents > 100000000))
    )
      throw Error("Extração fora do contrato.");
    const current = s.get("expense", e.id);
    if (
      current.version !== version ||
      !["draft", "returned"].includes(current.status)
    )
      throw Error(
        "Documento mudou durante a leitura. Nenhuma edição foi substituída.",
      );
    current.extraction = d;
    current.ai = {
      provider: result.provider,
      model: result.model,
      elapsedMs: result.elapsedMs,
    };
    current.version++;
    s.save("expense", current);
    s.log({ id: e.ownerId }, "expense.extracted", e.id, {
      provider: result.provider,
    });
  },
  async route({ store: s, user: u, path, method, body, url }) {
    if (method === "GET" && ["/api/report", "/api/report.csv"].includes(path)) {
      admin(u);
      const from = url.searchParams.get("from"),
        to = url.searchParams.get("to"),
        category = url.searchParams.get("category"),
        uf = url.searchParams.get("uf");
      if (from) date(from);
      if (to) date(to);
      if (from && to && from > to) fail("Período inválido.", 400);
      if (category && !categories.includes(category))
        fail("Categoria inválida.", 400);
      if (uf && !/^[A-Z]{2}$/.test(uf))
        fail("Informe uma UF com duas letras maiúsculas.", 400);
      const trips = new Map(s.list("trip").map((t) => [t.id, t]));
      const expenses = s
        .list("expense")
        .filter(
          (e) =>
            e.status === "approved" &&
            (!from || e.date >= from) &&
            (!to || e.date <= to) &&
            (!category || e.category === category) &&
            (!uf || e.state === uf),
        );
      const rows = expenses.map((e) => ({
        ...e,
        tripNumber: trips.get(e.tripId)?.number,
        tripTitle: trips.get(e.tripId)?.title,
        driverName: trips.get(e.tripId)?.driverName,
      }));
      if (path.endsWith(".csv"))
        return {
          name: "custos-aprovados.csv",
          csv: csv([
            [
              "Viagem",
              "Motorista",
              "Data",
              "Categoria",
              "Estabelecimento",
              "Cidade",
              "UF",
              "Valor BRL",
            ],
            ...rows.map((e) => [
              "#" + e.tripNumber,
              e.driverName,
              e.date,
              e.category,
              e.merchant,
              e.city,
              e.state,
              money(e.amountCents),
            ]),
            [
              "TOTAL APROVADO",
              "",
              "",
              "",
              "",
              "",
              "",
              money(totals(expenses).approvedCents),
            ],
          ]),
        };
      const byState = {};
      for (const e of expenses)
        byState[e.state || "Não informada"] =
          (byState[e.state || "Não informada"] || 0) + e.amountCents;
      return {
        rows,
        totals: totals(expenses),
        byState,
        tripCount: new Set(rows.map((e) => e.tripId)).size,
      };
    }
    if (method === "GET" && path === "/api/state") {
      const trips = s
          .list("trip")
          .filter((t) => u.role === "admin" || t.driverId === u.id),
        ids = new Set(trips.map((t) => t.id)),
        expenses = s.list("expense").filter((e) => ids.has(e.tripId)),
        recordIds = new Set(expenses.map((e) => e.id));
      return {
        trips,
        expenses,
        totals: totals(expenses),
        jobs: s.db
          .prepare("SELECT * FROM jobs ORDER BY created DESC")
          .all()
          .filter((j) => recordIds.has(j.record_id))
          .slice(0, 50),
      };
    }
    if (method === "POST" && path === "/api/trips") {
      admin(u);
      const driver = s
        .users()
        .find((x) => x.id === body.driverId && x.role === "driver");
      if (!driver) fail("Selecione um motorista cadastrado.", 400);
      const startDate = date(body.startDate),
        endDate = date(body.endDate);
      if (endDate < startDate) fail("Período da viagem inválido.", 400);
      const trip = s.create("trip", {
        title: text(body.title, 3, 150),
        origin: text(body.origin, 2, 100),
        destination: text(body.destination, 2, 100),
        startDate,
        endDate,
        driverId: driver.id,
        driverName: driver.name,
        advanceCents: integer(body.advanceCents || 0),
        budgetCents: integer(body.budgetCents || 0),
        status: "open",
        ownerId: u.id,
      });
      s.log(u, "trip.created", trip.id);
      return trip;
    }
    const em = path.match(/^\/api\/trips\/([a-f0-9]+)\/expenses$/);
    if (method === "POST" && em) {
      const trip = s.get("trip", em[1]);
      access(u, trip);
      if (trip.status !== "open") fail("Viagem encerrada.", 409);
      if (!body.file) fail("Anexe o comprovante.", 400);
      return s.transaction(() => {
        const fileId = s.file(body.file, u),
          key = id();
        s.db
          .prepare(
            "INSERT INTO sequences VALUES('expense',1) ON CONFLICT(kind) DO UPDATE SET value=value+1",
          )
          .run();
        const expense = s.save("expense", {
          id: key,
          number: s.db
            .prepare("SELECT value FROM sequences WHERE kind='expense'")
            .get().value,
          tripId: trip.id,
          ownerId: u.id,
          fileId,
          status: "draft",
          version: 1,
          createdAt: now(),
          merchant: "",
          date: "",
          category: "outros",
          amountCents: null,
          currency: "BRL",
          city: "",
          state: "",
          receiptNumber: "",
          note: "",
        });
        s.log(u, "expense.uploaded", key);
        return expense;
      });
    }
    const xm = path.match(
      /^\/api\/expenses\/([a-f0-9]+)\/(read|save|submit|review)$/,
    );
    if (method === "POST" && xm) {
      const e = s.get("expense", xm[1]),
        trip = s.get("trip", e.tripId);
      access(u, trip);
      if (trip.status !== "open") fail("Viagem encerrada.", 409);
      const action = xm[2];
      if (action === "review") {
        admin(u);
        if (e.status !== "submitted")
          fail("Despesa não está aguardando revisão.", 409);
        if (body.version !== e.version)
          fail("Despesa mudou. Atualize a página.", 409);
        if (!["approved", "returned"].includes(body.status))
          fail("Decisão inválida.", 400);
        e.status = body.status;
        e.review = { by: u.id, at: now(), note: text(body.note, 3, 1000) };
        e.version++;
        s.save("expense", e);
        s.log(u, "expense." + e.status, e.id, { note: e.review.note });
        try {
          syncSheet(s, trip);
        } catch {
          s.log(u, "export.failed", trip.id, {
            note: "Reconstruir exportação a partir do banco.",
          });
        }
        return e;
      }
      if (!["draft", "returned"].includes(e.status))
        fail("Despesa enviada não pode ser alterada.", 409);
      if (action === "read") {
        if (body.consent !== true)
          fail("Autorize o envio do comprovante ao Gemini.", 400);
        if (
          s.db
            .prepare(
              "SELECT id FROM jobs WHERE record_id=? AND state IN ('pending','running')",
            )
            .get(e.id)
        )
          fail("Já existe leitura em andamento.", 409);
        s.db
          .prepare(
            "INSERT INTO jobs(id,record_id,state,created) VALUES(?,?,'pending',?)",
          )
          .run(id(), e.id, now());
        s.log(u, "expense.read.requested", e.id);
        return { queued: true };
      }
      if (body.version !== e.version)
        fail("Despesa mudou. Atualize a página.", 409);
      const fields = validateExpense(body, trip);
      const duplicates = s
        .list("expense")
        .filter(
          (x) =>
            x.id !== e.id &&
            x.tripId === trip.id &&
            x.date === fields.date &&
            x.amountCents === fields.amountCents &&
            x.merchant.toLowerCase() === fields.merchant.toLowerCase(),
        );
      if (
        action === "submit" &&
        duplicates.length &&
        body.duplicateAcknowledged !== true
      )
        fail(
          "Possível duplicidade de estabelecimento, data e valor. Confira e marque a confirmação antes de enviar.",
          409,
        );
      Object.assign(e, fields, {
        version: e.version + 1,
        status: action === "submit" ? "submitted" : "draft",
        possibleDuplicate: duplicates.length > 0,
        duplicateAcknowledged: body.duplicateAcknowledged === true,
      });
      s.save("expense", e);
      s.log(
        u,
        "expense." + (action === "submit" ? "submitted" : "saved"),
        e.id,
        { amountCents: e.amountCents },
      );
      return e;
    }
    const tm = path.match(/^\/api\/trips\/([a-f0-9]+)\/(export|close)$/);
    if (tm) {
      const trip = s.get("trip", tm[1]);
      access(u, trip);
      const expenses = s.list("expense").filter((e) => e.tripId === trip.id);
      if (method === "GET" && tm[2] === "export") {
        const approved = expenses.filter((e) => e.status === "approved");
        const rows = [
          [
            "Viagem",
            "Motorista",
            "Data",
            "Categoria",
            "Estabelecimento",
            "Cidade",
            "UF",
            "Valor BRL",
            "Recibo",
            "Situação",
          ],
          ...approved.map((e) => [
            "#" + trip.number,
            trip.driverName,
            e.date,
            e.category,
            e.merchant,
            e.city,
            e.state,
            money(e.amountCents),
            e.receiptNumber,
            "Aprovada",
          ]),
          [
            "TOTAL APROVADO",
            "",
            "",
            "",
            "",
            "",
            "",
            money(totals(approved).approvedCents),
            "",
            "",
          ],
        ];
        return {
          name: "viagem-" + trip.number + "-aprovadas.csv",
          csv: csv(rows),
        };
      }
      if (method === "POST" && tm[2] === "close") {
        admin(u);
        if (trip.status !== "open") fail("Viagem já encerrada.", 409);
        if (expenses.some((e) => e.status !== "approved"))
          fail("Resolva todas as despesas pendentes antes de encerrar.", 409);
        trip.status = "closed";
        trip.closedAt = now();
        s.save("trip", trip);
        s.log(u, "trip.closed", trip.id);
        return trip;
      }
    }
  },
};
