export function buildIntro(p1: string, p2: string): string {
  const clean = (s: string) => s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return `${clean(p1)}\\n\\n${clean(p2)}`;
}
