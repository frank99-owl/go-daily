/**
 * Safely serialize JSON-LD for inline script tags.
 *
 * JSON.stringify alone can leave literal "<" characters in strings. Escaping
 * them prevents accidental `</script>` termination if content ever contains
 * markup-like text.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
