export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export function normalizeGeminiModelName(value: string): string {
  let model = value.trim();
  const quoted =
    (model.startsWith('"') && model.endsWith('"')) ||
    (model.startsWith("'") && model.endsWith("'"));
  if (quoted) model = model.slice(1, -1).trim();
  return model.replace(/^models\//, "");
}
