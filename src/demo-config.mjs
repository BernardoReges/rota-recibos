// DATA_DIR pode apontar para dados reais. O demo usa uma configuração independente.
export function demoDirectory(env = process.env) {
  return env.DEMO_DATA_DIR || "data/demo";
}
