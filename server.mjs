import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createApp } from "./src/http.mjs";
import { domain } from "./src/domain.mjs";
import { seed } from "./src/seed.mjs";
export { createApp, domain };
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir =
      process.env.DATA_DIR || fileURLToPath(new URL("./data", import.meta.url)),
    demo = process.env.DEMO === "true",
    host = process.env.HOST || "127.0.0.1";
  if (host !== "127.0.0.1" && (!process.env.APP_ORIGIN || demo))
    throw Error(
      "Servidor remoto exige APP_ORIGIN e demonstração desativada. Use HTTPS no proxy.",
    );
  const app = createApp(domain, {
    dir,
    demo,
    origin: process.env.APP_ORIGIN,
    secure: process.env.SECURE_COOKIES === "true",
  });
  if (demo) seed(app.store);
  app.listen(Number(process.env.PORT || 3070), host, () =>
    console.log(
      "Rota Recibos: http://" + host + ":" + (process.env.PORT || 3070),
    ),
  );
}
