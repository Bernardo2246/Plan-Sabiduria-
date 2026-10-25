-- Plan Sabiduría · lectura para la sincronización con Obsidian
-- Da al rol de SOLO LECTURA obsidian_reader (creado por la migración 0010 de
-- Finanzas-Personales) acceso de lectura a plan_progress. Correr una vez en el
-- SQL Editor del mismo proyecto. Idempotente.

grant select on public.plan_progress to obsidian_reader;

drop policy if exists "obsidian_reader_select" on public.plan_progress;
create policy "obsidian_reader_select" on public.plan_progress
  for select to obsidian_reader using (true);

-- Comprobación: debe decir plan_progress · SELECT
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'obsidian_reader' and table_name = 'plan_progress';
