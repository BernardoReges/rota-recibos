import { demoDirectory } from "../src/demo-config.mjs";
process.env.DEMO = "true";
process.env.DATA_DIR = demoDirectory();
const { createApp, domain } = await import("../server.mjs");
const { seed } = await import("../src/seed.mjs");
const app = createApp(domain, { dir: process.env.DATA_DIR, demo: true });
seed(app.store);
const port = Number(process.env.PORT || 3070);
app.listen(port, "127.0.0.1", () =>
  console.log("Demonstração: http://127.0.0.1:" + port),
);
