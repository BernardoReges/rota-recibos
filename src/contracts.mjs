export function extractedObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Extração fora do contrato.");
  for (const [name, type] of Object.entries(fields)) {
    const v = value[name];
    if (v === null) continue;
    if (
      type === "integer" &&
      (!Number.isSafeInteger(v) || v < 0 || v > 100000000)
    )
      throw Error("Extração contém valor monetário ou inteiro inválido.");
    if (type === "string" && (typeof v !== "string" || v.length > 1000))
      throw Error("Extração contém texto inválido.");
  }
}
