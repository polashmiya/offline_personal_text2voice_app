import { validateTokens } from '../tokens';

describe('validateTokens', () => {
  it('accepts a Piper tokens file with the space token', () => {
    expect(validateTokens('_ 0\n^ 1\n$ 2\n  3\n! 4\na 14\n3 133\n')).toBeNull();
  });

  it('rejects Windows line endings, which break the space token on Android', () => {
    expect(validateTokens('_ 0\r\n  3\r\n3 133\r\n')).toMatch(/line endings/);
  });

  it('rejects duplicates and multi-character symbols', () => {
    expect(validateTokens('a 1\na 2\n')).toMatch(/duplicate/);
    expect(validateTokens('aɪ 161\n')).toMatch(/one character/);
  });

  it('rejects malformed lines and empty files', () => {
    expect(validateTokens('a b c\n')).toMatch(/expected/);
    expect(validateTokens('a x\n')).toMatch(/invalid id/);
    expect(validateTokens('\n\n')).toMatch(/empty/);
  });
});
