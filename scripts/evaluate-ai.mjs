import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extract } from "../src/ai.mjs";
import { schema, domain, instructions } from "../src/domain.mjs";
const isRota = domain.product === "rota";
const examples = isRota
  ? [
      {
        name: "total-vs-troco",
        text: "COMPROVANTE FICTICIO - SEM VALOR FISCAL\nPOSTO EXEMPLO\nDATA 10/11/2026\nABASTECIMENTO DIESEL\nTOTAL PAGO R$ 385,50\nVALOR RECEBIDO R$ 400,00\nTROCO R$ 14,50\nCampinas SP\nRECIBO DEMO-001",
        expected: {
          amountCents: 38550,
          date: "2026-11-10",
          category: "combustivel",
        },
      },
      {
        name: "valor-ausente",
        text: "COMPROVANTE FICTICIO ILEGIVEL\nRESTAURANTE EXEMPLO\nRefeicao\nTotal pago: [ilegivel]\nData: [ilegivel]",
        expected: { amountCents: null, date: null },
      },
    ]
  : [
      {
        name: "embalagem-e-frete",
        text: "PROPOSTA FICTICIA\nFornecedor: Aurora Exemplo\nCopo de papel 200 ml: pacote de 100 unidades por R$ 18,90 cada pacote.\nCafe torrado: pacote de 1 kg por R$ 26,00 cada pacote.\nFrete total: R$ 35,00\nEntrega em 3 dias\nValida ate 31/12/2026.",
        expected: {
          freightCents: 3500,
          deadlineDays: 3,
          validUntil: "2026-12-31",
          firstPackUnits: 100,
          firstPackPriceCents: 1890,
        },
      },
      {
        name: "frete-ausente",
        text: "PROPOSTA FICTICIA\nFornecedor: Horizonte Exemplo\nCopo de papel 200 ml: pacote de 100 unidades por R$ 20,50 cada pacote.\nDemais condicoes a combinar.",
        expected: { freightCents: null, deadlineDays: null, validUntil: null },
      },
    ];
const results = [];
for (const example of examples) {
  try {
    const file = { mime: "text/plain", bytes: Buffer.from(example.text) };
    const result = await extract(file, schema, instructions);
    const checks = Object.entries(example.expected).map(([key, expected]) => ({
      field: key,
      expected,
      actual:
        key === "firstPackUnits"
          ? result.data.items?.[0]?.packUnits
          : key === "firstPackPriceCents"
            ? result.data.items?.[0]?.packPriceCents
            : result.data[key],
      passed:
        (key === "firstPackUnits"
          ? result.data.items?.[0]?.packUnits
          : key === "firstPackPriceCents"
            ? result.data.items?.[0]?.packPriceCents
            : result.data[key]) === expected,
    }));
    results.push({ name: example.name, ...result, checks });
    console.log(
      JSON.stringify({
        name: example.name,
        checksPassed: checks.filter((c) => c.passed).length,
        total: checks.length,
        elapsedMs: result.elapsedMs,
      }),
    );
  } catch (e) {
    results.push({ name: example.name, error: e.message });
    process.exitCode = 1;
    console.log(JSON.stringify({ name: example.name, error: e.message }));
  }
}
await mkdir(new URL("../docs", import.meta.url), { recursive: true });
await writeFile(
  new URL("../docs/ai-evaluation.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      synthetic: true,
      notes:
        "Casos de regressão do próprio projeto. Não medem acurácia em documentos reais.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => r.checks?.some((c) => !c.passed))) process.exitCode = 1;
