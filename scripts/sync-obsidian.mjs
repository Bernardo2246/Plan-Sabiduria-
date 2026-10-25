// Sincroniza el avance del Plan Sabiduría (Supabase, tabla plan_progress) con la
// bóveda de Obsidian "Segundo Cerebro":
//   - en 04 Proyectos/plan-sabiduria/días/ cambia SOLO las propiedades `realizado`
//     y `fecha` de cada nota de día (el texto y los embeds del diario no se tocan);
//   - regenera 04 Proyectos/plan-sabiduria/Progreso.md.
// Lee con el rol de SOLO LECTURA `obsidian_reader` (el mismo de Finanzas-Personales;
// permiso sobre plan_progress en supabase/obsidian_reader.sql). Idempotente: si nada
// cambió, no escribe nada.
//
// Uso:       cd scripts && npm install   (una vez)  →  node scripts/sync-obsidian.mjs
// Pruebas:   --boveda <carpeta>  escribe en otra carpeta en vez de la bóveda de iCloud
//            --prueba <json>     usa {"filas": [...], "ahora": "ISO"} en vez de Supabase
//
// La escritura en la bóveda reutiliza el módulo genérico de Finanzas-Personales.

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  editarSiCambia,
  escribirSiCambia,
  frontmatter,
  leerFrontmatter,
  leerNotas,
  leerSeccion,
  ponerPropiedades,
  rutaBoveda,
  verificarAcceso,
} from '../../Finanzas-Personales/scripts/obsidian/boveda.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROYECTO = '04 Proyectos/plan-sabiduria'
const DIAS = `${PROYECTO}/días`
const DIARIO = '06 Diario'
const SECCION_REFLEXION = 'Aprendizaje o idea'
const TOTAL = 49
const TZ = 'America/Mexico_City'

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

function argumentos() {
  const a = process.argv.slice(2)
  const valor = (flag) => {
    const i = a.indexOf(flag)
    return i >= 0 ? a[i + 1] : undefined
  }
  return { boveda: valor('--boveda'), prueba: valor('--prueba') }
}

/** Carga `.env` (KEY=valor) sin dependencias. No pisa variables ya definidas. */
async function cargarEnv() {
  let texto
  try {
    texto = await readFile(join(RAIZ, '.env'), 'utf8')
  } catch {
    return
  }
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** Lee plan_progress en una transacción de solo lectura. */
async function cargarDeSupabase() {
  const url = process.env.SUPABASE_READER_DB_URL
  if (!url) throw new Error('Falta SUPABASE_READER_DB_URL en .env (ver .env.example)')
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query('begin read only')
    const { rows } = await client.query('select user_id, dia, done, completed_at, updated_at from plan_progress order by dia')
    await client.query('commit')
    return rows.map((r) => ({ ...r, completed_at: r.completed_at?.toISOString?.() ?? r.completed_at, updated_at: r.updated_at?.toISOString?.() ?? r.updated_at }))
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Fechas (todo en hora de CDMX)
// ---------------------------------------------------------------------------

const fechaCDMX = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

const sumarDias = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function momento(isoForzado) {
  const d = isoForzado ? new Date(isoForzado) : new Date()
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  const hoy = fechaCDMX(d)
  return { hoy, legible: `${hoy} ${hora}` }
}

/**
 * Rachas por días de calendario con al menos un día del plan completado.
 * La actual sigue viva si el último día con lectura fue hoy o ayer.
 */
function rachas(fechas, hoy) {
  const unicas = [...new Set(fechas)].sort()
  let larga = { n: 0, desde: null, hasta: null }
  let run = null
  for (const f of unicas) {
    run = run && sumarDias(run.hasta, 1) === f ? { ...run, n: run.n + 1, hasta: f } : { n: 1, desde: f, hasta: f }
    if (run.n > larga.n) larga = run
  }
  const ultima = unicas.at(-1) ?? null
  const viva = run && (run.hasta === hoy || run.hasta === sumarDias(hoy, -1))
  return { actual: viva ? run : { n: 0, desde: null, hasta: null }, larga, ultima }
}

// ---------------------------------------------------------------------------
// Bóveda
// ---------------------------------------------------------------------------

/** Notas de día con su número, bloque y tema (del frontmatter que generó la app). */
async function leerDias(boveda) {
  const notas = await leerNotas(boveda, DIAS)
  return notas
    .map((n) => ({ ...leerFrontmatter(n.texto), archivo: n.nombre, nombre: n.nombre.replace(/\.md$/, '') }))
    .filter((d) => d.plan === 'plan-sabiduria' && Number.isInteger(d.dia))
    .sort((a, b) => a.dia - b.dia)
}

/** ¿El diario de esa fecha tiene algo escrito en "Aprendizaje o idea"? */
async function tieneReflexion(boveda, fecha, cache) {
  if (!cache.has(fecha)) {
    let texto = null
    try {
      texto = await readFile(join(boveda, DIARIO, `${fecha}.md`), 'utf8')
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    const seccion = texto == null ? null : leerSeccion(texto, SECCION_REFLEXION)
    const escrito = (seccion ?? '').split('\n').some((l) => l.replace(/^\s*(?:[-*]\s*(?:\[[ x]\]\s*)?)?/, '').trim() !== '')
    cache.set(fecha, { existe: texto != null, escrito })
  }
  return cache.get(fecha)
}

// ---------------------------------------------------------------------------
// Progreso.md
// ---------------------------------------------------------------------------

const enlace = (d) => `[[${d.nombre}|Día ${d.dia} · ${d.tema}]]`
const diasTexto = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

function notaProgreso({ dias, estado, r, sinReflexion, sinFecha, datosAl }) {
  const hechos = dias.filter((d) => estado.get(d.dia)?.done).length
  const pct = Math.round((hechos / TOTAL) * 100)

  const lineasSin = sinReflexion.length
    ? sinReflexion.map(({ d, fecha, existe }) => `- ${enlace(d)} · ${fecha} → ${existe ? `[[${fecha}]] tiene vacía la sección «${SECCION_REFLEXION}»` : `no hay nota de diario [[${fecha}]]`}`)
    : ['- Ninguno: todos los días completados tienen reflexión en el diario.']
  if (sinFecha.length) lineasSin.push(...sinFecha.map((d) => `- ${enlace(d)} · sin fecha de completado en la app: no se puede revisar el diario`))

  const bloques = []
  for (const d of dias) {
    let b = bloques.at(-1)
    if (!b || b.nombre !== d.bloque) bloques.push((b = { nombre: d.bloque, dias: [] }))
    b.dias.push(d)
  }
  const listado = bloques.flatMap((b) => {
    const n = b.dias.filter((d) => estado.get(d.dia)?.done).length
    return [
      '',
      `### ${b.nombre} (${n}/${b.dias.length})`,
      ...b.dias.map((d) => {
        const e = estado.get(d.dia)
        return `- ${e?.done ? '✅' : '⬜'} ${enlace(d)}${e?.done && e.fecha ? ` · ${e.fecha}` : ''}`
      }),
    ]
  })

  const racha = (x) => (x.n ? `**${diasTexto(x.n)}** (${x.desde === x.hasta ? x.desde : `${x.desde} → ${x.hasta}`})` : '**0 días**')

  return [
    frontmatter({
      tipo: 'progreso',
      plan: 'plan-sabiduria',
      generado_por: 'plan-sabiduria/scripts/sync-obsidian.mjs',
      completados: hechos,
      total: TOTAL,
      porcentaje: pct,
      racha_actual: r.actual.n,
      racha_mas_larga: r.larga.n,
      sin_reflexion: sinReflexion.length,
    }).trimEnd(),
    '',
    '# Progreso · Plan Sabiduría',
    '',
    `> [!info] Se genera sola desde la app (cada 30 min y al iniciar sesión en la Mac). No la edites a mano: un día se marca en la app.${datosAl ? ` Último cambio en la app: ${datosAl}.` : ''}`,
    '',
    `## ${hechos} de ${TOTAL} días · ${pct} %`,
    `- Racha actual: ${racha(r.actual)}${!r.actual.n && r.ultima ? ` · último día con lectura: ${r.ultima}` : ''}`,
    `- Racha más larga: ${racha(r.larga)}`,
    '',
    '> La racha cuenta días de calendario seguidos en los que completaste al menos un día del plan.',
    '',
    `## Completados sin reflexión en el diario (${sinReflexion.length + sinFecha.length})`,
    ...lineasSin,
    '',
    '## Los 49 días',
    ...listado.slice(1),
    '',
    'Ver también: [[plan-sabiduria|Plan Sabiduría]] · [[Completar el Plan Sabiduría]]',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main() {
  const args = argumentos()
  await cargarEnv()
  const boveda = rutaBoveda(args.boveda)
  await verificarAcceso(boveda)

  let filas, ahora
  if (args.prueba) {
    const fixture = JSON.parse(await readFile(resolve(args.prueba), 'utf8'))
    filas = fixture.filas
    ahora = momento(fixture.ahora)
  } else {
    filas = await cargarDeSupabase()
    ahora = momento()
  }

  // Sin filas casi siempre es falta de permiso (RLS devuelve vacío, no error):
  // nunca se desmarcan los 49 días por eso.
  if (!filas.length) throw new Error('plan_progress devolvió 0 filas: ¿falta correr supabase/obsidian_reader.sql? No se tocó la bóveda.')
  if (new Set(filas.map((f) => f.user_id)).size > 1) throw new Error('plan_progress tiene filas de más de un usuario; no sé cuál sincronizar.')

  const dias = await leerDias(boveda)
  if (dias.length !== TOTAL) throw new Error(`Esperaba ${TOTAL} notas de día en ${DIAS} y encontré ${dias.length}. No se tocó la bóveda.`)

  const porDia = new Map(filas.map((f) => [Number(f.dia), f]))
  const estado = new Map()
  const resultados = []
  for (const d of dias) {
    const f = porDia.get(d.dia)
    const done = !!f?.done
    // fecha: la de completado en la app. Si el día no está completado (o la app no tiene
    // fecha), se deja la que haya en la nota, para no borrar nada escrito a mano.
    const fecha = done && f.completed_at ? fechaCDMX(f.completed_at) : null
    const props = { realizado: done }
    if (fecha) props.fecha = fecha
    estado.set(d.dia, { done, fecha: fecha ?? (typeof d.fecha === 'string' ? d.fecha : null) })
    const r = await editarSiCambia(boveda, `${DIAS}/${d.archivo}`, (t) => ponerPropiedades(t, props))
    if (r !== 'sin cambios') resultados.push(`  días/${d.archivo}: ${r}`)
  }

  const cache = new Map()
  const sinReflexion = [], sinFecha = []
  for (const d of dias) {
    const e = estado.get(d.dia)
    if (!e.done) continue
    if (!e.fecha) { sinFecha.push(d); continue }
    const { existe, escrito } = await tieneReflexion(boveda, e.fecha, cache)
    if (!escrito) sinReflexion.push({ d, fecha: e.fecha, existe })
  }

  const fechas = [...estado.values()].filter((e) => e.done && e.fecha).map((e) => e.fecha)
  const r = rachas(fechas, ahora.hoy)
  const ultimoCambio = filas.map((f) => f.updated_at).filter(Boolean).sort().at(-1)
  const datosAl = ultimoCambio ? `${fechaCDMX(ultimoCambio)} ${new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ultimoCambio))}` : null

  const progreso = await escribirSiCambia(boveda, `${PROYECTO}/Progreso.md`, notaProgreso({ dias, estado, r, sinReflexion, sinFecha, datosAl }))

  const hechos = fechas.length + sinFecha.length
  console.log(`[${ahora.legible}] ${hechos}/${TOTAL} días · racha ${r.actual.n} (máx ${r.larga.n}) · sin reflexión ${sinReflexion.length}`)
  console.log(`  Progreso.md: ${progreso}`)
  for (const linea of resultados) console.log(linea)
}

main().catch((e) => {
  console.error(`[sync-obsidian] ERROR: ${e.message}`)
  process.exit(1)
})
