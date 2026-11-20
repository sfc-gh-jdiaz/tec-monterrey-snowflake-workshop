import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getLlamada } from '../../app/api/llamadas/[id]/route';
import { ROLES_QUERY } from '../../lib/queries';

/**
 * Detalle de llamada: el enlace al audio solo sale si la llamada es de una región que el usuario ve
 * (RAP_REGION con caller's rights). Ni el `rol` del selector ni el id pueden ampliar eso.
 */
const mocks = vi.hoisted(() => ({ ownerQuery: vi.fn(), callerQuery: vi.fn() }));

vi.mock('../../lib/snowflake', () => ({
  snowflake: { query: mocks.ownerQuery },
  asCaller: vi.fn(async () => ({ query: mocks.callerQuery })),
}));

const ACCESO = [
  ...['Norte', 'Bajío', 'Centro', 'Sur', 'Sureste'].map((REGION) => ({ ROL: 'DIRECTOR_COMERCIAL', REGION })),
  { ROL: 'GERENTE_BAJIO', REGION: 'Bajío' },
  { ROL: 'GERENTE_NORTE', REGION: 'Norte' },
];
const LLAMADA = { LLAMADA_ID: 11, REGION: 'Bajío', AUDIO_URL: 'https://stage/x.mp3?sig', SEGMENTOS: '[{"inicio":0,"fin":1,"hablante":"Agente","texto":"Hola"}]' };

function usuarioVe(regiones: string[]) {
  mocks.callerQuery.mockResolvedValue({ rows: regiones.map((REGION) => ({ REGION })) });
}
const get = (id: string, qs = '') => getLlamada(new Request(`http://app/api/llamadas/${id}${qs}`), { params: Promise.resolve({ id }) });
const consulta = () => mocks.ownerQuery.mock.calls.find(([sql]) => sql !== ROLES_QUERY)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.ownerQuery.mockImplementation(async (sql: string) => (sql === ROLES_QUERY ? { rows: ACCESO } : { rows: [LLAMADA] }));
});

describe('GET /api/llamadas/<id>', () => {
  it('filtra por las regiones del usuario con binds y genera el enlace temporal al audio', async () => {
    usuarioVe(['Bajío']);
    const res = await get('11', '?rol=DIRECTOR_COMERCIAL');
    expect(res.status).toBe(200);
    const [sql, opts] = consulta();
    expect(sql).toContain('llamada_id = ? AND region IN (?)');
    expect(sql).toContain('GET_PRESIGNED_URL(@TEC_DEMO.RAW.AUDIOS, archivo, 600)');
    expect(opts.binds).toEqual([11, 'Bajío']);
    const json = await res.json();
    expect(json.audio_url).toBe(LLAMADA.AUDIO_URL);
    expect(json.segmentos).toEqual([{ inicio: 0, fin: 1, hablante: 'Agente', texto: 'Hola' }]);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('un gerente del Norte no obtiene una llamada del Bajío (404, sin enlace)', async () => {
    usuarioVe(['Norte']);
    mocks.ownerQuery.mockImplementation(async (sql: string) => (sql === ROLES_QUERY ? { rows: ACCESO } : { rows: [] }));
    const res = await get('11', '?rol=GERENTE_NORTE');
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('https://');
    expect(consulta()[1].binds).toEqual([11, 'Norte']);
  });

  it('un rol inventado no consulta Snowflake', async () => {
    usuarioVe(['Norte', 'Bajío']);
    const res = await get('11', '?rol=HACKER');
    expect(res.status).toBe(404);
    expect(mocks.ownerQuery.mock.calls.every(([sql]) => sql === ROLES_QUERY)).toBe(true);
  });

  it.each(['11 OR 1=1', '-1', '1e3', 'abc', '1234567'])('rechaza el id %s sin tocar Snowflake', async (id) => {
    usuarioVe(['Bajío']);
    const res = await get(encodeURIComponent(id));
    expect(res.status).toBe(400);
    expect(mocks.ownerQuery).not.toHaveBeenCalled();
    expect(mocks.callerQuery).not.toHaveBeenCalled();
  });

  it('un error no expone el detalle de Snowflake', async () => {
    usuarioVe(['Bajío']);
    mocks.ownerQuery.mockImplementation(async (sql: string) => {
      if (sql === ROLES_QUERY) return { rows: ACCESO };
      throw new Error("Stage 'TEC_DEMO.RAW.AUDIOS' does not exist");
    });
    const res = await get('11');
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain('TEC_DEMO');
  });
});
