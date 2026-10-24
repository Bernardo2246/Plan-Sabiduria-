-- Plan Sabiduría · avance sincronizado entre dispositivos
-- Correr UNA vez en el SQL Editor del proyecto de Supabase de Finanzas-Personales
-- (mismo usuario, mismo login). Es idempotente: volver a correrlo no rompe nada.

-- 1. Tabla ---------------------------------------------------------------
create table if not exists public.plan_progress (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  dia          int         not null check (dia between 1 and 49),
  done         boolean     not null default false,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, dia)
);

-- 2. RLS: cada quien solo ve y escribe sus filas ---------------------------
alter table public.plan_progress enable row level security;
revoke all on public.plan_progress from anon;
grant select, insert, update on public.plan_progress to authenticated;

drop policy if exists plan_progress_own on public.plan_progress;
create policy plan_progress_own on public.plan_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Conflictos: gana el updated_at más reciente ---------------------------
-- La app manda la hora del cambio en updated_at. Si llega un cambio más viejo
-- (p. ej. una cola sin conexión que se envía tarde), no pisa al nuevo; solo se
-- aprovecha si trae una fecha de completado anterior. Si ambos lados dicen
-- "completado", se conserva la fecha de completado más antigua.
create or replace function public.plan_progress_merge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    if old.done and new.done and new.completed_at < old.completed_at then
      old.completed_at := new.completed_at;
      return old;
    end if;
    return null; -- se descarta el cambio viejo
  end if;
  if old.done and new.done then
    new.completed_at := least(old.completed_at, new.completed_at); -- least ignora nulls
  end if;
  return new;
end;
$$;

drop trigger if exists plan_progress_merge on public.plan_progress;
create trigger plan_progress_merge
  before update on public.plan_progress
  for each row execute function public.plan_progress_merge();

-- 4. Realtime: avisar al otro dispositivo en segundos ----------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_progress'
  ) then
    alter publication supabase_realtime add table public.plan_progress;
  end if;
end $$;

-- 5. Fechas reales de los días 1-10 (tomadas de las notas de día en Obsidian) --
-- El localStorage de la v1 solo guardaba "completado", sin fecha. La app sube
-- esos días sin fecha y aquí se les pone la fecha real. Solo corre si hay un
-- único usuario en Auth (el tuyo); si no, avisa y no hace nada.
do $$
declare
  uid uuid;
  n   int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise notice 'Hay % usuarios en Auth: no se cargan las fechas automáticamente.', n;
    return;
  end if;
  select id into uid from auth.users;

  insert into public.plan_progress (user_id, dia, done, completed_at, updated_at)
  select uid, v.dia, true, v.fecha::timestamptz, '2026-10-12 00:00-06'::timestamptz
  from (values
    (1,  '2026-10-12 12:00-06'), (2,  '2026-10-13 12:00-06'), (3,  '2026-10-14 12:00-06'),
    (4,  '2026-10-15 12:00-06'), (5,  '2026-10-16 12:00-06'), (6,  '2026-10-17 12:00-06'),
    (7,  '2026-10-19 12:00-06'), (8,  '2026-10-20 12:00-06'), (9,  '2026-10-21 12:00-06'),
    (10, '2026-10-22 12:00-06')
  ) as v (dia, fecha)
  on conflict (user_id, dia) do update
    set done = excluded.done, completed_at = excluded.completed_at, updated_at = excluded.updated_at;
end $$;

-- 6. Comprobación: deberías ver los días 1 a 10 con done = true -------------
select dia, done, completed_at at time zone 'America/Mexico_City' as completado, updated_at
from public.plan_progress
order by dia;
