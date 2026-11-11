export const $ = (id) => document.getElementById(id);
export function account(main, session) {
  hero(
    main,
    "SUA CONTA",
    "Mantenha seu acesso privado.",
    "A troca de senha encerra as outras sessões da sua conta.",
  );
  const p = panel(session.user.name);
  p.append(el("p", session.user.email, "hint"));
  if (session.demo) {
    p.append(
      el("p", "Troca de senha desativada no ambiente demonstrativo.", "note"),
    );
    main.append(p);
    return;
  }
  const form = el("form");
  field(form, "Senha atual", "currentPassword", "password").autocomplete =
    "current-password";
  const password = field(
    form,
    "Nova senha (mínimo de 12 caracteres)",
    "newPassword",
    "password",
  );
  password.minLength = 12;
  password.autocomplete = "new-password";
  const confirm = field(
    form,
    "Confirme a nova senha",
    "confirmation",
    "password",
  );
  confirm.minLength = 12;
  confirm.autocomplete = "new-password";
  formSubmit(form, "Alterar minha senha", async (data) => {
    if (data.get("newPassword") !== data.get("confirmation"))
      throw Error("As novas senhas precisam ser iguais.");
    await api("/api/password", {
      currentPassword: data.get("currentPassword"),
      newPassword: data.get("newPassword"),
    });
    form.reset();
    toast("Senha alterada. As outras sessões foram encerradas.");
  });
  p.append(form);
  main.append(p);
}
export const money = (c) =>
  c == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(c / 100);
export const day = (s) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "Não informada";
export function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
export function append(parent, ...children) {
  parent.append(...children.filter(Boolean));
  return parent;
}
export function btn(text, fn, cls = "") {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
export function toast(t) {
  $("toast").textContent = t;
}
export async function api(path, data) {
  const r = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "app",
          },
          body: JSON.stringify(data),
        },
  );
  const v = await r.json();
  if (!r.ok) throw Error(v.error || "Falha na operação.");
  return v;
}
export const statusNames = {
  open: "Em andamento",
  closed: "Encerrada",
  draft: "Rascunho",
  review: "Conferir leitura",
  confirmed: "Conferida",
  submitted: "Em revisão",
  approved: "Aprovada",
  returned: "Devolvida",
  pending: "Na fila",
  running: "Lendo documento",
  done: "Leitura concluída",
  failed: "Falha na leitura",
};
export const badge = (status) =>
  el("span", statusNames[status] || status, "badge " + status);
export function panel(title) {
  const p = el("section", null, "panel");
  p.append(el("h2", title));
  return p;
}
let fieldSequence = 0;
export function field(
  form,
  label,
  name,
  type = "text",
  value = "",
  required = true,
) {
  const l = el("label", label),
    i = el(type === "textarea" ? "textarea" : "input");
  i.name = name;
  i.id = "f-" + name + "-" + ++fieldSequence;
  i.value = value ?? "";
  if (type !== "textarea") i.type = type;
  i.required = required;
  if (type === "number") {
    i.step = "any";
    i.min = "0";
  }
  l.append(i);
  form.append(l);
  return i;
}
export function select(form, label, name, options, value) {
  const l = el("label", label),
    s = el("select");
  s.name = name;
  for (const [key, title] of options) {
    const o = el("option", title);
    o.value = key;
    s.append(o);
  }
  if (value != null) s.value = value;
  l.append(s);
  form.append(l);
  return s;
}
export function check(form, label, name, value = false) {
  const l = el("label"),
    i = el("input");
  i.type = "checkbox";
  i.name = name;
  i.checked = value;
  l.append(i, document.createTextNode(label));
  form.append(l);
  return i;
}
export function formSubmit(form, label, fn) {
  const b = el("button", label);
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    b.disabled = true;
    try {
      await fn(new FormData(form));
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
export async function attachment(input) {
  const f = input.files?.[0];
  if (!f) return null;
  if (f.size > 8 * 1024 * 1024) throw Error("O arquivo deve ter até 8 MB.");
  const mime = f.type || (f.name.endsWith(".txt") ? "text/plain" : "");
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(f);
  });
  return { name: f.name, mime, data };
}
export function fileField(form, label = "Anexe PDF, foto JPG/PNG ou TXT") {
  const i = field(form, label, "file", "file", "", true);
  i.accept = ".pdf,.png,.jpg,.jpeg,.txt";
  i.parentElement.className = "file-label";
  return i;
}
export function sourceLink(fileId) {
  if (!fileId) return null;
  const a = el("a", "Baixar documento original");
  a.href = "/api/files/" + fileId;
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "pill";
  const container = el("div", null, "document-source"),
    preview = el("details", null, "document-preview"),
    content = el("div");
  preview.append(el("summary", "Conferir original no painel"), content);
  let loaded = false,
    pending = false;
  preview.addEventListener("toggle", async () => {
    if (!preview.open || loaded || pending) return;
    pending = true;
    content.replaceChildren(el("p", "Abrindo documento…", "hint"));
    try {
      const response = await fetch(a.href);
      if (!response.ok)
        throw Error(
          "Não foi possível abrir o documento. Confira sua sessão e tente novamente.",
        );
      const type = response.headers.get("content-type")?.split(";")[0];
      if (type === "image/png" || type === "image/jpeg") {
        const blob = await response.blob(),
          url = URL.createObjectURL(blob),
          image = el("img");
        image.alt = "Documento original anexado a este registro";
        image.onload = () => URL.revokeObjectURL(url);
        image.onerror = () => URL.revokeObjectURL(url);
        image.src = url;
        content.replaceChildren(image);
      } else if (type === "text/plain") {
        const value = await response.text();
        content.replaceChildren(el("pre", value.slice(0, 10000)));
        if (value.length > 10000)
          content.append(
            el(
              "p",
              "Prévia limitada a 10 mil caracteres. Baixe o original para consultar todo o texto.",
              "hint",
            ),
          );
      } else
        content.replaceChildren(
          el(
            "p",
            "Para conferir este PDF, use Baixar documento original e abra-o no seu leitor.",
            "hint",
          ),
        );
      loaded = true;
    } catch (e) {
      content.replaceChildren(el("p", e.message, "note error"));
    } finally {
      pending = false;
    }
  });
  container.append(a, preview);
  return container;
}
export function link(text, href) {
  const a = el("a", text, "pill");
  a.href = href;
  return a;
}
export function table(headers, rows) {
  const wrap = el("div", null, "comparison"),
    t = el("table"),
    head = el("thead"),
    tr = el("tr");
  headers.forEach((h) => tr.append(el("th", h)));
  head.append(tr);
  t.append(head);
  const body = el("tbody");
  for (const row of rows) {
    const r = el("tr");
    for (const v of row) {
      const c = el("td");
      c.append(
        v instanceof Node ? v : document.createTextNode(String(v ?? "")),
      );
      r.append(c);
    }
    body.append(r);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}
export function metrics(items) {
  const grid = el("section", null, "metrics");
  for (const [title, value, hint] of items) {
    grid.append(
      append(
        el("div", null, "metric"),
        el("span", title),
        el("strong", String(value)),
        el("small", hint),
      ),
    );
  }
  return grid;
}
export function empty(title, copy) {
  return append(
    el("div", null, "empty"),
    el("div", "◇", "symbol"),
    el("h3", title),
    el("p", copy),
  );
}
export function shell(session, product, nav, active, onNav) {
  const root = $("app");
  root.replaceChildren();
  const layout = el("div", null, "layout"),
    side = el("aside", null, "sidebar"),
    brand = el("a", null, "brand");
  brand.href = "/";
  brand.append(
    el("span", product === "rota" ? "↗" : "≋", "brand-symbol"),
    document.createTextNode(product === "rota" ? "Rota Recibos" : "CotaFlux"),
  );
  side.append(brand, el("span", "OPERAÇÃO", "nav-label"));
  const n = el("nav");
  n.setAttribute("aria-label", "Navegação");
  for (const [key, title] of [...nav, ["account", "⚙  Minha conta"]]) {
    const b = btn(title, () => onNav(key), active === key ? "active" : "");
    b.setAttribute("aria-pressed", String(active === key));
    n.append(b);
  }
  side.append(n);
  const bottom = el("div", null, "bottom");
  bottom.append(
    el("small", session.user.name),
    el(
      "small",
      session.user.role === "driver" ? "Área do motorista" : "Área da empresa",
    ),
    btn(
      "Sair",
      async () => {
        await api("/api/logout", {});
        location.reload();
      },
      "secondary",
    ),
  );
  side.append(bottom);
  const work = el("div", null, "workspace"),
    top = el("header", null, "topbar");
  top.append(
    el(
      "span",
      product === "rota"
        ? "Logística / prestação de contas"
        : "Compras / comparação de propostas",
    ),
  );
  const identity = el("div", null, "identity");
  identity.append(
    el(
      "span",
      session.configured
        ? "Leitura com IA configurada"
        : "Preenchimento manual disponível",
    ),
    el("span", session.user.name.split(" ")[0], "username"),
    el("span", session.user.name.slice(0, 1), "avatar"),
  );
  top.append(identity);
  work.append(top);
  if (session.demo)
    work.append(
      el(
        "div",
        "Demonstração local · dados fictícios · não envie documentos reais neste ambiente.",
        "demo",
      ),
    );
  const main = el("main", null, "content");
  main.id = "main";
  work.append(main);
  layout.append(side, work);
  root.append(layout);
  return main;
}
export function hero(main, eyebrow, title, description, actions = []) {
  const h = el("section", null, "hero"),
    copy = el("div");
  copy.append(
    el("p", eyebrow, "eyebrow"),
    el("h1", title),
    el("p", description),
  );
  h.append(copy, append(el("div", null, "actions"), ...actions));
  main.append(h);
}
export function footer(main, product) {
  main.append(
    append(
      el("footer", null, "footer"),
      el(
        "span",
        product === "rota"
          ? "Rota Recibos · cada despesa no seu lugar."
          : "CotaFlux · decisões com critério.",
      ),
      el("span", "Documentos privados. Conferência humana."),
    ),
  );
}
export function login(session, product, onLogin) {
  const root = $("app");
  root.replaceChildren();
  const wrap = el("main", null, "login-wrap"),
    story = el("section", null, "login-story");
  story.append(
    el("div", product === "rota" ? "↗ Rota Recibos" : "≋ CotaFlux", "brand"),
    el(
      "h1",
      product === "rota"
        ? "Da estrada à prestação de contas."
        : "Propostas diferentes. Uma decisão clara.",
    ),
    el(
      "p",
      product === "rota"
        ? "Motoristas enviam comprovantes. A operação confere cada valor. Os custos da viagem chegam organizados."
        : "Reúna propostas, confira embalagens e compare o custo completo antes de escolher um fornecedor.",
    ),
  );
  const steps = el("div", null, "steps");
  (product === "rota"
    ? [
        "01  Envie o comprovante na viagem certa",
        "02  Confira os dados lidos pela IA",
        "03  Revise despesas e exporte custos",
      ]
    : [
        "01  Defina a necessidade da compra",
        "02  Leia e confira as propostas",
        "03  Compare critérios e registre a decisão",
      ]
  ).forEach((t) => steps.append(el("div", t)));
  story.append(steps);
  const area = el("section", null, "login-form"),
    card = el("div", null, "login-card");
  card.append(
    el("p", "SEU ESPAÇO DE OPERAÇÃO", "eyebrow"),
    el(
      "h2",
      session.needsSetup ? "Configure sua empresa" : "Entre para continuar",
    ),
  );
  const f = el("form");
  if (session.needsSetup) field(f, "Seu nome", "name", "text");
  field(f, "E-mail", "email", "email");
  const pass = field(
    f,
    session.needsSetup ? "Crie uma senha (mínimo de 12 caracteres)" : "Senha",
    "password",
    "password",
  );
  pass.autocomplete = session.needsSetup ? "new-password" : "current-password";
  pass.minLength = session.needsSetup ? 12 : 1;
  formSubmit(
    f,
    session.needsSetup ? "Criar acesso da empresa" : "Entrar",
    async (data) => {
      await api(
        session.needsSetup ? "/api/setup" : "/api/login",
        Object.fromEntries(data),
      );
      await onLogin();
    },
  ).className = "full";
  card.append(f);
  if (session.demo) {
    card.append(
      el("div", null, "divider"),
      el(
        "p",
        "Explore com dados fictícios. Nenhum cadastro necessário.",
        "hint",
      ),
    );
    const actions = el("div", null, "actions");
    actions.append(
      btn(
        "Entrar como empresa",
        async () => {
          await api("/api/demo", { role: "admin" });
          await onLogin();
        },
        "secondary",
      ),
    );
    if (product === "rota")
      actions.append(
        btn(
          "Entrar como motorista",
          async () => {
            await api("/api/demo", { role: "driver" });
            await onLogin();
          },
          "secondary",
        ),
      );
    card.append(actions);
  }
  card.append(
    el(
      "p",
      "Seus documentos ficam no servidor da instalação. O envio ao provedor de IA exige uma ação explícita.",
      "hint",
    ),
  );
  area.append(card);
  wrap.append(story, area);
  wrap.id = "main";
  root.append(wrap);
}
