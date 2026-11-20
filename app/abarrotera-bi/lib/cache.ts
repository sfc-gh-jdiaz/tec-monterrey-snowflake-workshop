/**
 * Caché en memoria con límite de entradas (LRU) y vencimiento. Es por proceso: cada instancia de la app
 * tiene la suya. Sirve para no repetir consultas iguales; los datos del workshop están congelados.
 */
export class CacheLRU<V> {
  private readonly items = new Map<string, { at: number; valor: V }>();

  constructor(
    private readonly maxEntradas: number,
    private readonly ttlMs: number,
  ) {}

  get(llave: string): V | undefined {
    const hit = this.items.get(llave);
    if (!hit) return undefined;
    if (Date.now() - hit.at >= this.ttlMs) {
      this.items.delete(llave);
      return undefined;
    }
    // Reinsertar la marca como la más reciente
    this.items.delete(llave);
    this.items.set(llave, hit);
    return hit.valor;
  }

  set(llave: string, valor: V): void {
    this.items.delete(llave);
    this.items.set(llave, { at: Date.now(), valor });
    while (this.items.size > this.maxEntradas) this.items.delete(this.items.keys().next().value as string);
  }

  get size(): number {
    return this.items.size;
  }
}

/** Minutos desde una variable de entorno, con valor por defecto. */
export function ttlDesdeEnv(nombre: string, minutosPorDefecto: number): number {
  const v = Number(process.env[nombre]);
  return (Number.isFinite(v) && v >= 0 ? v : minutosPorDefecto) * 60_000;
}
