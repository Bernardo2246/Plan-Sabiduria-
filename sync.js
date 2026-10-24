/* Plan Sabiduría — sincronización del avance con Supabase (tabla plan_progress).

   Estado local (localStorage), por dispositivo:
     ps_progress  {dia: {dia, done, completed_at, updated_at}}  última versión conocida de cada día
     ps_queue     {dia: fila}                                   cambios que el servidor aún no confirma
     ps_migrated  user_id que ya subió el ps_done heredado de la v1
   ps_done / ps_notes (v1) se borran solos tras migrar y sincronizar sin pendientes (dropLegacy).

   Reglas:
     - Marcar un día cambia la pantalla al instante y se encola; la cola se envía en cuanto hay red.
     - En conflicto gana el updated_at más reciente (aquí y en el trigger del servidor).
     - Lo heredado de la v1 se sube con una fecha vieja (MIGRATION_TS) para que nunca pise
       un cambio real hecho en otro dispositivo; así el resultado es la unión de días. */
(function (root) {
  "use strict";

  const K = { progress: "ps_progress", queue: "ps_queue", migrated: "ps_migrated", legacyDone: "ps_done", legacyNotes: "ps_notes" };
  const MIGRATION_TS = "2026-10-12T06:00:00.000Z"; // inicio del plan (00:00 CDMX)
  const TABLE = "plan_progress";
  const COLS = "dia,done,completed_at,updated_at";

  // Postgres devuelve microsegundos; Safari solo garantiza milisegundos al parsear.
  const ts = (s) => Date.parse(String(s).replace(/(\.\d{3})\d+/, "$1"));
  const isNewer = (a, b) => ts(a.updated_at) > ts(b.updated_at);

  function createSync({ client, storage, userId, onChange = () => {}, onStatus = () => {}, now = () => new Date().toISOString() }) {
    const read = (k) => { try { return JSON.parse(storage.getItem(k) || "{}") || {}; } catch (e) { return {}; } };
    const write = (k, v) => storage.setItem(k, JSON.stringify(v));

    const status = { online: true, pending: 0, lastSync: null, error: null };
    let flushing = null, again = false, channel = null;

    // supabase-js devuelve los fallos de red como error (no lanza): se distinguen por el mensaje.
    const NET = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;
    function fail(e) {
      const msg = (e && (e.message || e.details)) || String(e);
      if (NET.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false)) status.online = false;
      else { status.online = true; status.error = msg; }
    }
    function ok() { status.online = true; status.error = null; }

    function emitStatus() {
      status.pending = Object.keys(read(K.queue)).length;
      onStatus({ ...status });
    }

    function put(row) {
      const progress = read(K.progress), queue = read(K.queue);
      progress[row.dia] = row;
      queue[row.dia] = row;
      write(K.progress, progress);
      write(K.queue, queue);
    }

    // Fila que llega del servidor (consulta o Realtime).
    function applyServer(row) {
      const r = { dia: row.dia, done: !!row.done, completed_at: row.completed_at ?? null, updated_at: row.updated_at };
      const progress = read(K.progress), queue = read(K.queue);
      const pending = queue[r.dia];
      if (pending && isNewer(pending, r)) return false; // lo local es más nuevo: se enviará
      if (pending) { delete queue[r.dia]; write(K.queue, queue); }
      const cur = progress[r.dia];
      if (cur && cur.done === r.done && cur.completed_at === r.completed_at && cur.updated_at === r.updated_at) return false;
      progress[r.dia] = r;
      write(K.progress, progress);
      return true;
    }

    function doneMap() {
      const out = {};
      for (const r of Object.values(read(K.progress))) if (r.done) out[r.dia] = true;
      return out;
    }

    function setDone(dia, done) {
      const t = now();
      put({ dia, done, completed_at: done ? t : null, updated_at: t });
      onChange();
      emitStatus();
      flush();
    }

    // Sube el ps_done de la v1 una sola vez por usuario y dispositivo.
    function migrateLegacy() {
      if (storage.getItem(K.migrated) === userId) return 0;
      const legacy = read(K.legacyDone), progress = read(K.progress);
      let n = 0;
      for (const [dia, isDone] of Object.entries(legacy)) {
        const d = Number(dia);
        if (!isDone || !(d >= 1 && d <= 49) || progress[d]) continue;
        put({ dia: d, done: true, completed_at: null, updated_at: MIGRATION_TS });
        n++;
      }
      storage.setItem(K.migrated, userId); // la cola ya es persistente: no se pierde si no hay red
      if (n) onChange();
      emitStatus();
      return n;
    }

    function flush() {
      if (flushing) { again = true; return flushing; }
      const run = async () => {
        do {
          again = false;
          const sent = Object.values(read(K.queue));
          if (!sent.length) break;
          const rows = sent.map((r) => ({ user_id: userId, dia: r.dia, done: r.done, completed_at: r.completed_at, updated_at: r.updated_at }));
          try {
            const { error } = await client.from(TABLE).upsert(rows, { onConflict: "user_id,dia" });
            if (error) throw error;
            const queue = read(K.queue);
            for (const r of sent) if (queue[r.dia] && queue[r.dia].updated_at === r.updated_at) delete queue[r.dia];
            write(K.queue, queue);
            ok();
          } catch (e) {
            fail(e);
            break;
          }
        } while (again);
      };
      // finally corre después de asignar flushing, aunque la cola esté vacía y run() termine sin esperar nada.
      flushing = run().finally(() => { flushing = null; emitStatus(); });
      return flushing;
    }

    async function pull() {
      try {
        const { data, error } = await client.from(TABLE).select(COLS);
        if (error) throw error;
        let changed = false;
        for (const row of data || []) changed = applyServer(row) || changed;
        ok();
        status.lastSync = now();
        if (changed) onChange();
        dropLegacy();
      } catch (e) {
        fail(e);
      }
      emitStatus();
    }

    // Bernardo confirmó el 2026-10-24 que la sincronización funciona en ambos dispositivos:
    // la v1 se borra en cuanto este dispositivo ya migró y el servidor no tiene nada pendiente de él.
    // (Respaldos de ambos en backups/ del repo, fuera de git.)
    function dropLegacy() {
      if (storage.getItem(K.migrated) !== userId || Object.keys(read(K.queue)).length) return;
      storage.removeItem(K.legacyDone);
      storage.removeItem(K.legacyNotes);
    }

    // Primero se envía lo pendiente y luego se trae lo del otro dispositivo.
    async function syncNow() {
      await flush();
      await pull();
    }

    function subscribe() {
      if (channel) return;
      channel = client
        .channel(`${TABLE}:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${userId}` }, (payload) => {
          if (payload.new && payload.new.dia && applyServer(payload.new)) onChange();
          emitStatus();
        })
        .subscribe((st) => { if (st === "SUBSCRIBED") syncNow(); });
    }

    function stop() {
      if (channel) { client.removeChannel(channel); channel = null; }
    }

    function setOnline(v) { status.online = v; emitStatus(); }

    return { doneMap, setDone, migrateLegacy, flush, pull, syncNow, subscribe, stop, setOnline, status: () => ({ ...status }) };
  }

  const api = { createSync, MIGRATION_TS, KEYS: K };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PSync = api;
})(typeof window !== "undefined" ? window : globalThis);
