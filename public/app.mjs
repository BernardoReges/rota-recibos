import {
  $,
  el,
  append,
  btn,
  api,
  toast,
  money,
  day,
  badge,
  panel,
  field,
  select,
  check,
  formSubmit,
  fileField,
  attachment,
  sourceLink,
  link,
  table,
  metrics,
  empty,
  shell,
  hero,
  footer,
  login,
  account,
} from "./ui.mjs";
let session,
  state,
  view = "overview",
  active = null,
  expenseId = null;
const cats = [
  ["combustivel", "Combustível"],
  ["pedagio", "Pedágio"],
  ["alimentacao", "Alimentação"],
  ["hospedagem", "Hospedagem"],
  ["outros", "Outros"],
];
const category = (c) => cats.find(([k]) => k === c)?.[1] || c;
async function load() {
  session = await api("/api/session");
  if (!session.user) return login(session, "rota", load);
  state = await api("/api/state");
  render();
}
async function refresh() {
  state = await api("/api/state");
  render();
}
function go(v) {
  toast("");
  view = v;
  expenseId = null;
  render();
}
function render() {
  const nav = [
      ["overview", "◫  Visão geral"],
      ["trips", "↗  Viagens"],
      ["expenses", "▤  Despesas"],
      ...(session.user.role === "admin"
        ? [
            ["people", "♙  Motoristas"],
            ["reports", "▥  Relatórios"],
            ["audit", "◷  Histórico"],
          ]
        : []),
    ],
    main = shell(session, "rota", nav, view, go);
  if (view === "account") account(main, session);
  else if (view === "new") tripForm(main).catch((e) => toast(e.message));
  else if (view === "people") people(main).catch((e) => toast(e.message));
  else if (view === "reports") reports(main).catch((e) => toast(e.message));
  else if (view === "audit") audit(main).catch((e) => toast(e.message));
  else if (view === "trips") trips(main);
  else if (view === "expenses") expenses(main);
  else overview(main);
  footer(main, "rota");
}
function overview(main) {
  const driver = session.user.role === "driver";
  hero(
    main,
    driver ? "ÁREA DO MOTORISTA" : "OPERAÇÃO LOGÍSTICA",
    driver
      ? "Seus comprovantes, sem papel perdido."
      : "Cada viagem com seus custos à vista.",
    driver
      ? "Selecione a viagem, envie o comprovante e confira os dados antes de encaminhar."
      : "Receba os comprovantes, confira valores e acompanhe a prestação de contas.",
    [
      btn(driver ? "Ver minhas viagens" : "+ Nova viagem", () =>
        go(driver ? "trips" : "new"),
      ),
    ],
  );
  const t = state.totals;
  const unknown = state.expenses.filter(
    (e) =>
      !["approved", "returned"].includes(e.status) && e.amountCents == null,
  ).length;
  main.append(
    metrics([
      [
        "Despesas aprovadas",
        money(t.approvedCents),
        "Total conferido pela empresa",
      ],
      [
        "Aguardando conferência",
        money(t.pendingCents),
        unknown
          ? `${unknown} comprovante(s) sem valor confirmado`
          : "Rascunhos e despesas enviadas",
      ],
      [
        "Viagens em andamento",
        state.trips.filter((t) => t.status === "open").length,
        "Somente viagens do seu acesso",
      ],
      [
        "Despesas para revisar",
        state.expenses.filter((e) => e.status === "submitted").length,
        "Valores ainda não aprovados",
      ],
    ]),
  );
  const grid = el("div", null, "grid"),
    list = panel(driver ? "Minhas viagens" : "Viagens recentes"),
    review = panel(driver ? "Acompanhe seus envios" : "Fila de conferência");
  for (const trip of state.trips.slice(0, 5)) list.append(tripRow(trip));
  if (!state.trips.length)
    list.append(
      empty(
        "Nenhuma viagem cadastrada",
        driver
          ? "A empresa precisa vincular uma viagem ao seu acesso."
          : "Cadastre um motorista e depois crie a primeira viagem.",
      ),
    );
  for (const e of state.expenses
    .filter((e) =>
      driver ? e.status === "returned" : e.status === "submitted",
    )
    .slice(0, 5))
    review.append(expenseRow(e));
  if (!review.querySelector("button"))
    review.append(
      empty(
        "Tudo acompanhado",
        driver
          ? "As despesas devolvidas aparecerão aqui."
          : "Nenhuma despesa aguardando a empresa agora.",
      ),
    );
  grid.append(list, review);
  main.append(grid);
}
function tripRow(t) {
  const b = btn(
    "",
    () => {
      active = t.id;
      expenseId = null;
      view = "trips";
      render();
    },
    "record-row" + (active === t.id ? " selected" : ""),
  );
  b.append(
    append(
      el("div", null, "rowtop"),
      el("span", "Viagem #" + t.number),
      badge(t.status),
    ),
    el("strong", t.title),
    el("small", t.origin + " → " + t.destination),
    el("small", t.driverName + " · " + day(t.startDate)),
  );
  return b;
}
function expenseRow(e) {
  const trip = state.trips.find((t) => t.id === e.tripId),
    b = btn(
      "",
      () => {
        active = e.tripId;
        expenseId = e.id;
        view = "trips";
        render();
      },
      "record-row",
    );
  b.append(
    append(
      el("div", null, "rowtop"),
      el("span", "Despesa #" + e.number),
      badge(e.status),
    ),
    el("strong", e.merchant || "Comprovante a conferir"),
    el("small", category(e.category) + " · " + money(e.amountCents)),
    el("small", trip ? "Viagem #" + trip.number + " · " + trip.driverName : ""),
  );
  return b;
}
function sum(rows, status) {
  return rows
    .filter((e) => e.status === status)
    .reduce((n, e) => n + (e.amountCents || 0), 0);
}
function trips(main) {
  hero(
    main,
    "VIAGENS",
    session.user.role === "driver"
      ? "Sua rota, seus comprovantes."
      : "Do início da rota ao fechamento.",
    "Valores aprovados e pendentes ficam separados.",
    session.user.role === "admin"
      ? [btn("+ Nova viagem", () => go("new"))]
      : [],
  );
  const grid = el("div", null, "grid"),
    list = panel("Viagens"),
    out = el("div");
  const search = el("input");
  search.type = "search";
  search.placeholder = "Buscar viagem, motorista ou destino";
  search.setAttribute("aria-label", search.placeholder);
  list.append(search);
  const rows = el("div");
  function fill() {
    rows.replaceChildren();
    for (const t of state.trips.filter((t) =>
      (t.title + " " + t.driverName + " " + t.destination + " #" + t.number)
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    ))
      rows.append(tripRow(t));
  }
  search.oninput = fill;
  fill();
  list.append(rows);
  grid.append(list, out);
  main.append(grid);
  const trip = state.trips.find((t) => t.id === active);
  if (!trip) {
    out.append(
      append(
        panel("Acompanhar uma viagem"),
        empty(
          "Selecione uma viagem",
          "Os comprovantes e a prestação de contas ficam vinculados à viagem.",
        ),
      ),
    );
    return;
  }
  if (expenseId) {
    expenseDetail(
      out,
      trip,
      state.expenses.find((e) => e.id === expenseId),
    );
    return;
  }
  tripDetail(out, trip);
}
function tripDetail(out, t) {
  const rows = state.expenses.filter((e) => e.tripId === t.id),
    approved = sum(rows, "approved"),
    pending = rows
      .filter((e) => e.status !== "approved" && e.status !== "returned")
      .reduce((n, e) => n + (e.amountCents || 0), 0),
    p = panel("Viagem #" + t.number + " · " + t.title);
  p.append(
    badge(t.status),
    el("p", t.origin + " → " + t.destination),
    el(
      "p",
      t.driverName + " · " + day(t.startDate) + " a " + day(t.endDate),
      "hint",
    ),
  );
  p.append(
    table(
      ["Indicador", "Valor"],
      [
        ["Aprovado", money(approved)],
        ["Pendente de conferência", money(pending)],
        ["Adiantamento registrado", money(t.advanceCents)],
        [
          "Adiantamento menos aprovado",
          money(Math.abs(t.advanceCents - approved)) +
            (t.advanceCents >= approved
              ? " disponível para acerto"
              : " a complementar"),
        ],
        ["Orçamento", t.budgetCents ? money(t.budgetCents) : "Não definido"],
      ],
    ),
  );
  p.append(
    el(
      "p",
      "O saldo é uma referência para acerto, sem execução de pagamento. Despesas pendentes não são tratadas como aprovadas.",
      "hint",
    ),
    link(
      "Exportar aprovadas em planilha CSV",
      "/api/trips/" + t.id + "/export",
    ),
  );
  const unknown = rows.filter(
    (e) =>
      !["approved", "returned"].includes(e.status) && e.amountCents == null,
  ).length;
  if (unknown)
    p.append(
      el(
        "p",
        `${unknown} comprovante(s) ainda sem valor confirmado: o total pendente é parcial.`,
        "note warn",
      ),
    );
  out.append(p);
  const list = panel("Comprovantes da viagem");
  for (const e of rows) list.append(expenseRow(e));
  if (!rows.length) list.append(el("p", "Ainda não há comprovantes enviados."));
  out.append(list);
  if (t.status === "open") {
    const upload = panel("Adicionar comprovante"),
      f = el("form"),
      input = fileField(f, "Foto do comprovante, PDF ou TXT · até 8 MB");
    f.append(
      el(
        "p",
        "Use uma imagem legível, com data e total. Não inclua dados de cartão ou informações que não sejam necessárias à despesa.",
        "hint",
      ),
    );
    formSubmit(f, "Anexar à viagem", async () => {
      const file = await attachment(input);
      if (!file) throw Error("Escolha um comprovante.");
      const e = await api("/api/trips/" + t.id + "/expenses", { file });
      expenseId = e.id;
      await refresh();
      toast("Comprovante anexado. Confira ou peça a leitura com IA.");
    });
    upload.append(f);
    out.append(upload);
    if (session.user.role === "admin") {
      const close = panel("Concluir prestação de contas");
      close.append(
        el(
          "p",
          "A viagem só pode ser encerrada quando todas as despesas estiverem aprovadas.",
          "hint",
        ),
        btn(
          "Encerrar viagem",
          async () => {
            await api("/api/trips/" + t.id + "/close", {});
            await refresh();
            toast("Viagem encerrada. Os documentos permanecem disponíveis.");
          },
          "secondary",
        ),
      );
      out.append(close);
    }
  }
}
async function readReceipt(e) {
  toast("Lendo o comprovante. Nenhum valor será aprovado automaticamente.");
  await api("/api/expenses/" + e.id + "/read", { consent: true });
  for (let i = 0; i < 65; i++) {
    await new Promise((r) => setTimeout(r, 750));
    const fresh = await api("/api/state"),
      job = fresh.jobs.find((j) => j.record_id === e.id);
    if (job && !["pending", "running"].includes(job.state)) {
      state = fresh;
      render();
      toast(
        job.state === "failed"
          ? job.error
          : "Leitura concluída. Confira os valores antes de enviar.",
      );
      return;
    }
  }
  await refresh();
  toast("A leitura continua. Atualize a lista para acompanhar.");
}
function expenseDetail(out, trip, e) {
  if (!e) return;
  out.append(
    btn(
      "← Voltar à viagem",
      () => {
        expenseId = null;
        render();
      },
      "secondary back",
    ),
  );
  const p = panel("Despesa #" + e.number);
  p.append(
    badge(e.status),
    el("h3", e.merchant || "Conferir comprovante"),
    sourceLink(e.fileId),
  );
  if (e.review)
    p.append(
      el(
        "p",
        "Retorno da empresa: " + e.review.note,
        "note" + (e.status === "returned" ? " warn" : ""),
      ),
    );
  if (e.possibleDuplicate)
    p.append(
      el(
        "p",
        "Há uma possível duplicidade de data, estabelecimento e valor. Confira os documentos antes de aprovar.",
        "note warn",
      ),
    );
  const job = state.jobs.find((j) => j.record_id === e.id);
  if (job)
    p.append(
      el(
        "p",
        job.state === "failed"
          ? job.error
          : "Leitura: " + (job.state === "done" ? "concluída" : job.state),
        "hint",
      ),
    );
  out.append(p);
  if (["draft", "returned"].includes(e.status) && trip.status === "open") {
    const consent = check(
      p,
      "Permito enviar este comprovante ao Gemini para sugerir os campos.",
      "consent",
    );
    p.append(
      btn(
        "Ler comprovante com IA",
        async () => {
          if (!consent.checked)
            throw Error("Autorize o envio antes de consultar a IA.");
          await readReceipt(e);
        },
        "secondary",
      ),
    );
    const d = e.extraction && !e.merchant ? e.extraction : e,
      card = panel("Conferir dados do comprovante"),
      f = el("form"),
      grid = el("div", null, "form-grid");
    field(grid, "Estabelecimento", "merchant", "text", d.merchant || "");
    field(grid, "Data da despesa", "date", "date", d.date || "");
    select(grid, "Categoria", "category", cats, d.category || "outros");
    const amount = field(
      grid,
      "Total efetivamente pago (R$)",
      "amount",
      "number",
      d.amountCents == null ? "" : d.amountCents / 100,
    );
    amount.step = "0.01";
    amount.min = "0.01";
    field(grid, "Cidade", "city", "text", d.city || "", false);
    field(grid, "UF", "state", "text", d.state || "", false).maxLength = 2;
    field(
      grid,
      "Número do recibo, se houver",
      "receiptNumber",
      "text",
      d.receiptNumber || "",
      false,
    );
    select(
      grid,
      "Moeda",
      "currency",
      [["BRL", "Real brasileiro · BRL"]],
      d.currency === "BRL" ? "BRL" : "",
    );
    f.append(grid);
    field(
      f,
      "Observação para a empresa",
      "note",
      "textarea",
      e.note || "",
      false,
    );
    if (e.extraction?.evidence)
      f.append(el("div", e.extraction.evidence, "source"));
    f.append(
      el(
        "p",
        "A IA pode confundir total, troco e data. Compare com o original. Só despesas enviadas podem ser revisadas pela empresa.",
        "hint",
      ),
    );
    const dup = check(
      f,
      "Conferi eventual repetição e confirmo que este comprovante representa outra despesa legítima.",
      "duplicate",
      e.duplicateAcknowledged === true,
    );
    const saveBody = () => ({
      version: e.version,
      merchant: f.elements.merchant.value,
      date: f.elements.date.value,
      category: f.elements.category.value,
      amountCents: Math.round(Number(f.elements.amount.value) * 100),
      currency: f.elements.currency.value,
      city: f.elements.city.value,
      state: f.elements.state.value,
      receiptNumber: f.elements.receiptNumber.value,
      note: f.elements.note.value,
      duplicateAcknowledged: dup.checked,
    });
    const actions = el("div", null, "actions");
    actions.append(
      btn(
        "Salvar rascunho",
        async () => {
          if (!f.reportValidity()) return;
          await api("/api/expenses/" + e.id + "/save", saveBody());
          await refresh();
          toast("Rascunho salvo. Ainda não enviado à empresa.");
        },
        "secondary",
      ),
    );
    f.append(actions);
    formSubmit(f, "Enviar à empresa para revisão", async () => {
      await api("/api/expenses/" + e.id + "/submit", saveBody());
      await refresh();
      toast("Despesa enviada. Aguarde a revisão da empresa.");
    });
    card.append(f);
    out.append(card);
  } else {
    p.append(
      table(
        ["Campo", "Informação"],
        [
          ["Estabelecimento", e.merchant],
          ["Data", day(e.date)],
          ["Categoria", category(e.category)],
          ["Total", money(e.amountCents)],
          ["Local", [e.city, e.state].filter(Boolean).join("/")],
          ["Recibo", e.receiptNumber || "Não informado"],
          ["Observação", e.note || "—"],
        ],
      ),
    );
    if (e.status === "submitted" && session.user.role === "admin") {
      const card = panel("Revisão da empresa"),
        f = el("form");
      select(f, "Decisão", "status", [
        ["approved", "Aprovar despesa conferida"],
        ["returned", "Devolver para correção"],
      ]);
      field(f, "Motivo ou registro da conferência", "note", "textarea");
      formSubmit(f, "Registrar decisão", async (data) => {
        await api("/api/expenses/" + e.id + "/review", {
          ...Object.fromEntries(data),
          version: e.version,
        });
        await refresh();
        toast("Decisão registrada no histórico.");
      });
      card.append(
        el(
          "p",
          "Compare valor, data e categoria com o comprovante original. A aprovação não realiza pagamento.",
          "hint",
        ),
        f,
      );
      out.append(card);
    }
  }
}
function expenses(main) {
  hero(
    main,
    "DESPESAS",
    "Uma fila para cada etapa.",
    "Filtre o que está em rascunho, aguardando a empresa ou já foi aprovado.",
  );
  const p = panel("Despesas da operação"),
    filter = el("select");
  filter.setAttribute("aria-label", "Filtrar situação");
  for (const [k, v] of [
    ["all", "Todas"],
    ["draft", "Rascunhos"],
    ["submitted", "Aguardando empresa"],
    ["approved", "Aprovadas"],
    ["returned", "Devolvidas"],
  ]) {
    const o = el("option", v);
    o.value = k;
    filter.append(o);
  }
  const rows = el("div");
  function fill() {
    rows.replaceChildren();
    for (const e of state.expenses.filter(
      (e) => filter.value === "all" || e.status === filter.value,
    ))
      rows.append(expenseRow(e));
    if (!rows.childElementCount)
      rows.append(
        empty(
          "Nenhuma despesa nesta seleção",
          "Os comprovantes aparecerão após serem anexados a uma viagem.",
        ),
      );
  }
  filter.onchange = fill;
  fill();
  p.append(filter, rows);
  main.append(p);
}
async function tripForm(main) {
  hero(
    main,
    "NOVA VIAGEM",
    "Prepare a rota e o acompanhamento.",
    "Cada viagem pertence a um motorista cadastrado na empresa.",
  );
  const p = panel("Dados da viagem"),
    f = el("form");
  main.append(p);
  const users = await api("/api/users"),
    drivers = users.filter((u) => u.role === "driver");
  if (!drivers.length) {
    p.append(
      el("p", "Cadastre um motorista antes de criar a viagem."),
      btn("Abrir motoristas", () => go("people")),
    );
    return;
  }
  const grid = el("div", null, "form-grid");
  field(grid, "Identificação da viagem", "title");
  select(
    grid,
    "Motorista",
    "driverId",
    drivers.map((u) => [u.id, u.name]),
  );
  field(grid, "Origem (cidade/UF)", "origin");
  field(grid, "Destino (cidade/UF)", "destination");
  field(grid, "Início", "startDate", "date");
  field(grid, "Término previsto", "endDate", "date");
  field(grid, "Adiantamento (R$)", "advance", "number", 0).step = "0.01";
  field(grid, "Orçamento de referência (R$)", "budget", "number", 0).step =
    "0.01";
  f.append(grid);
  formSubmit(f, "Criar viagem", async (data) => {
    const t = await api("/api/trips", {
      ...Object.fromEntries(data),
      advanceCents: Math.round(Number(data.get("advance")) * 100),
      budgetCents: Math.round(Number(data.get("budget")) * 100),
    });
    active = t.id;
    view = "trips";
    await refresh();
    toast("Viagem criada e vinculada ao motorista.");
  });
  p.append(f);
}
async function people(main) {
  hero(
    main,
    "MOTORISTAS",
    "Acesso individual, viagens vinculadas.",
    "O motorista acessa somente suas viagens e comprovantes. A empresa acompanha a operação.",
  );
  const p = panel("Pessoas cadastradas");
  main.append(p);
  const users = await api("/api/users");
  p.append(
    table(
      ["Pessoa", "E-mail", "Perfil"],
      users.map((u) => [
        u.name,
        u.email,
        u.role === "admin" ? "Empresa" : "Motorista",
      ]),
    ),
  );
  if (!session.demo) {
    const f = el("form");
    field(f, "Nome do motorista", "name");
    field(f, "E-mail", "email", "email");
    field(
      f,
      "Senha inicial privada (mínimo de 12 caracteres)",
      "password",
      "password",
    ).minLength = 12;
    formSubmit(f, "Criar acesso do motorista", async (data) => {
      await api("/api/users", Object.fromEntries(data));
      render();
      toast("Motorista cadastrado. Entregue a senha por um canal privado.");
    });
    p.append(f);
  } else
    p.append(
      el("p", "Criação de pessoas desativada nesta demonstração.", "hint"),
    );
}
async function audit(main) {
  hero(
    main,
    "HISTÓRICO",
    "Cada envio e revisão deixam registro.",
    "Últimos 100 eventos da instalação. Não se trata de um registro inviolável.",
  );
  const p = panel("Eventos recentes");
  main.append(p);
  const rows = await api("/api/audit");
  p.append(
    table(
      ["Quando", "Pessoa", "Ação"],
      rows.map((r) => [
        new Date(r.at).toLocaleString("pt-BR"),
        r.name || "Operação",
        r.action,
      ]),
    ),
  );
}
async function reports(main) {
  hero(
    main,
    "RELATÓRIOS",
    "Os custos aprovados, por período e local.",
    "Filtre despesas conferidas da empresa. Rascunhos, devolvidas e pendentes não entram nos totais.",
  );
  const filters = panel("Filtros do relatório"),
    form = el("form"),
    fields = el("div", null, "form-grid");
  field(fields, "De", "from", "date", "", false);
  field(fields, "Até", "to", "date", "", false);
  select(fields, "Categoria", "category", [["", "Todas"], ...cats]);
  field(fields, "UF (opcional)", "uf", "text", "", false).maxLength = 2;
  form.append(fields);
  const out = el("div");
  async function show() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form))
      if (String(v).trim())
        params.set(k, k === "uf" ? String(v).trim().toUpperCase() : v);
    const query = params.size ? "?" + params : "";
    const data = await api("/api/report" + query);
    if (!out.isConnected) return;
    out.replaceChildren();
    out.append(
      metrics([
        [
          "Total aprovado",
          money(data.totals.approvedCents),
          "Soma em centavos dos registros filtrados",
        ],
        ["Comprovantes", data.rows.length, "Despesas aprovadas na seleção"],
        ["Viagens", data.tripCount, "Viagens presentes no período"],
        [
          "UFs informadas",
          Object.keys(data.byState).filter((k) => k !== "Não informada").length,
          "Local informado no comprovante",
        ],
      ]),
    );
    const summary = panel("Distribuição dos custos");
    summary.append(
      table(
        ["Categoria", "Aprovado"],
        cats.map(([key, title]) => [
          title,
          money(data.totals.categories[key] || 0),
        ]),
      ),
      table(
        ["UF", "Aprovado"],
        Object.entries(data.byState).map(([uf, total]) => [uf, money(total)]),
      ),
    );
    out.append(summary);
    const details = panel("Despesas da seleção");
    details.append(link("Exportar relatório CSV", "/api/report.csv" + query));
    if (!data.rows.length)
      details.append(
        empty(
          "Nenhuma aprovada nesta seleção",
          "Ajuste o período ou aguarde a revisão dos comprovantes.",
        ),
      );
    else
      details.append(
        table(
          ["Viagem / motorista", "Data", "Categoria", "UF", "Valor"],
          data.rows.map((e) => [
            "#" + e.tripNumber + " · " + e.driverName,
            day(e.date),
            category(e.category),
            e.state || "—",
            money(e.amountCents),
          ]),
        ),
      );
    out.append(details);
  }
  formSubmit(form, "Aplicar filtros", show);
  filters.append(form);
  main.append(filters, out);
  await show();
}
load().catch((e) => {
  toast(e.message);
  $("app").replaceChildren(
    empty(
      "Não foi possível abrir",
      "Verifique se o servidor está em execução e atualize a página.",
    ),
  );
});
