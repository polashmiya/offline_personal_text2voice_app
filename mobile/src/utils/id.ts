/** Collision-resistant local id (time-ordered). Not for security purposes. */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const random = Math.floor(Math.random() * 36 ** 8)
    .toString(36)
    .padStart(8, '0');
  return `${prefix}${time}${random}`;
}
