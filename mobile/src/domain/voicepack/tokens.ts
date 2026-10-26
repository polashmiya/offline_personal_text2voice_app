/**
 * Validates a VITS/Piper tokens.txt the way sherpa-onnx parses it.
 *
 * sherpa-onnx 1.13.8 terminates the whole process (exit) on a malformed or
 * duplicated token, so a bad voice package would crash the app during its
 * test-load. Checking first turns that into a normal "invalid package" error.
 *
 * Format: one "<symbol> <id>" per line; a line with only an id is the space
 * token. Symbols are a single Unicode code point.
 */
export function validateTokens(text: string): string | null {
  if (text.includes('\r')) {
    return 'tokens.txt must use \\n line endings';
  }
  const seen = new Map<string, number>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      continue;
    }
    const fields = line.trim().split(/\s+/);
    let symbol: string;
    let idText: string;
    if (fields.length === 1) {
      symbol = ' ';
      idText = fields[0];
    } else if (fields.length === 2) {
      [symbol, idText] = fields;
    } else {
      return `tokens.txt line ${i + 1}: expected "<symbol> <id>"`;
    }
    if (!/^\d+$/.test(idText)) {
      return `tokens.txt line ${i + 1}: invalid id`;
    }
    if (symbol === '<BLNK>') {
      continue;
    }
    if ([...symbol].length !== 1) {
      return `tokens.txt line ${i + 1}: symbol must be one character`;
    }
    if (seen.has(symbol)) {
      return `tokens.txt line ${i + 1}: duplicate symbol`;
    }
    seen.set(symbol, Number(idText));
  }
  return seen.size > 0 ? null : 'tokens.txt is empty';
}
