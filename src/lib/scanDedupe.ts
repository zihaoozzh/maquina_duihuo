/** Anti-rebote del escáner: el mismo código no se repite hasta pasado `windowMs`. */
export function createDedupe(windowMs = 2500) {
  let lastCode = "";
  let lastAt = 0;
  return {
    /** true si el código debe emitirse ahora. */
    accept(code: string, now: number): boolean {
      if (code === lastCode && now - lastAt < windowMs) return false;
      lastCode = code;
      lastAt = now;
      return true;
    },
  };
}
