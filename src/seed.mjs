import { randomBytes } from "node:crypto";
export function seed(s) {
  if (s.users().length) return;
  const password = () => randomBytes(30).toString("hex");
  const admin = s.user({
      name: "Marina · operação demonstrativa",
      email: "empresa@example.test",
      password: password(),
      role: "admin",
    }),
    driver = s.user({
      name: "Rafael · motorista fictício",
      email: "motorista@example.test",
      password: password(),
      role: "driver",
    });
  s.user({
    name: "Outro motorista fictício",
    email: "outro@example.test",
    password: password(),
    role: "driver",
  });
  const trip = s.create("trip", {
    title: "Distribuição Sudeste · exemplo fictício",
    origin: "São Paulo/SP",
    destination: "Belo Horizonte/MG",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    driverId: driver.id,
    driverName: driver.name,
    advanceCents: 150000,
    budgetCents: 200000,
    status: "open",
    ownerId: admin.id,
  });
  for (const [merchant, category, amount, status] of [
    ["Posto Exemplo", "combustivel", 38550, "submitted"],
    ["Restaurante Demonstração", "alimentacao", 4590, "approved"],
    ["Pedágio Fictício", "pedagio", 1870, "draft"],
  ]) {
    const receipt = `COMPROVANTE FICTÍCIO PARA DEMONSTRAÇÃO\n${merchant}\nData: 10/11/2026\nTOTAL PAGO: R$ ${(amount / 100).toFixed(2)}\nNenhum pagamento real.\n`;
    const fileId = s.file(
      {
        name: category + "-exemplo.txt",
        mime: "text/plain",
        data: Buffer.from(receipt).toString("base64"),
      },
      driver,
    );
    s.create("expense", {
      tripId: trip.id,
      ownerId: driver.id,
      fileId,
      status,
      merchant,
      date: "2026-11-10",
      category,
      amountCents: amount,
      currency: "BRL",
      city: "Campinas",
      state: "SP",
      receiptNumber: "DEMO-" + category,
      note: "Dados fictícios para experimentar o fluxo.",
    });
  }
  s.log(admin, "demo.seeded", trip.id);
}
