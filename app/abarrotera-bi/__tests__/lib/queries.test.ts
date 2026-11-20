import { describe, expect, it } from 'vitest';
import { FECHAS } from '../../lib/constants';
import { QUERIES, ROLES_QUERY, compile } from '../../lib/queries';

describe('compile', () => {
  it('sustituye {R} por region IN (?, ...) con un bind por región', () => {
    const { sql, binds } = compile('SELECT 1 FROM t WHERE {R}', ['Bajío', 'Norte']);
    expect(sql).toBe('SELECT 1 FROM t WHERE region IN (?, ?)');
    expect(binds).toEqual(['Bajío', 'Norte']);
  });

  it('usa la columna indicada en {R:col} y repite los binds en cada aparición', () => {
    const { sql, binds } = compile('WHERE {R:v.region} OR {R:region_destino}', ['Sur']);
    expect(sql).toBe('WHERE v.region IN (?) OR region_destino IN (?)');
    expect(binds).toEqual(['Sur', 'Sur']);
  });

  it('sin regiones filtra a nada (IN (NULL)) en vez de quitar el filtro', () => {
    const { sql, binds } = compile('WHERE {R}', []);
    expect(sql).toBe('WHERE region IN (NULL)');
    expect(binds).toEqual([]);
  });

  it('nunca interpola el valor de la región en el SQL (solo binds)', () => {
    const malicioso = "Bajío') OR 1=1 --";
    const { sql, binds } = compile('WHERE {R}', [malicioso]);
    expect(sql).not.toContain(malicioso);
    expect(binds).toEqual([malicioso]);
  });
});

describe('QUERIES', () => {
  const fechasPermitidas = new Set(Object.values(FECHAS));

  it.each(Object.entries(QUERIES))('%s filtra por región', (_nombre, sql) => {
    expect(sql).toMatch(/\{R(:[\w.]+)?\}/);
  });

  it.each(Object.entries(QUERIES))('%s solo usa fechas de lib/constants (FECHAS)', (_nombre, sql) => {
    const fechas = sql.match(/'(\d{4}-\d{2}-\d{2})'/g) ?? [];
    for (const f of fechas) expect(fechasPermitidas).toContain(f.slice(1, -1));
  });

  it.each(Object.entries(QUERIES))('%s no deja marcadores sin compilar', (_nombre, sql) => {
    const { sql: compilado, binds } = compile(sql, ['Bajío']);
    expect(compilado).not.toMatch(/\{R/);
    expect(binds.length).toBeGreaterThan(0);
  });

  it('ROLES_QUERY expande el comodín * con RAW.REGIONES', () => {
    expect(ROLES_QUERY).toContain("a.region = '*'");
    expect(ROLES_QUERY).toContain('RAW.REGIONES');
  });
});
