import { describe, expect, it, vi } from 'vitest';
import { CacheLRU, ttlDesdeEnv } from '../../lib/cache';

describe('CacheLRU', () => {
  it('saca la entrada menos usada al pasar el límite', () => {
    const c = new CacheLRU<number>(2, 60_000);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a pasa a ser la más reciente
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(2);
  });

  it('vence por tiempo', () => {
    vi.useFakeTimers();
    const c = new CacheLRU<number>(10, 1000);
    c.set('a', 1);
    vi.advanceTimersByTime(1001);
    expect(c.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('lee el TTL de una variable de entorno', () => {
    process.env.PRUEBA_TTL = '2';
    expect(ttlDesdeEnv('PRUEBA_TTL', 10)).toBe(120_000);
    process.env.PRUEBA_TTL = 'x';
    expect(ttlDesdeEnv('PRUEBA_TTL', 10)).toBe(600_000);
  });
});
