alter table public.contacto
add column if not exists created_by uuid;

alter table public.contacto
alter column created_by set default auth.uid();

update public.contacto
set created_by = user_id
where created_by is null and user_id is not null;

-- contacto policies
drop policy if exists "contacto_insert_by_creator" on public.contacto;
drop policy if exists "contacto_select_by_creator" on public.contacto;
drop policy if exists "contacto_update_by_creator" on public.contacto;

create policy "contacto_insert_by_creator"
on public.contacto for insert
to authenticated
with check (created_by = auth.uid() or user_id = auth.uid());

create policy "contacto_select_by_creator"
on public.contacto for select
to authenticated
using (created_by = auth.uid() or user_id = auth.uid());

create policy "contacto_update_by_creator"
on public.contacto for update
to authenticated
using (created_by = auth.uid() or user_id = auth.uid())
with check (created_by = auth.uid() or user_id = auth.uid());

-- contratoEvento insert policy
drop policy if exists "contratoEvento_insert_by_contact_owner" on public."contratoEvento";

create policy "contratoEvento_insert_by_contact_owner"
on public."contratoEvento" for insert
to authenticated
with check (
  exists (
    select 1 from public.contacto c
    where c.id = "contratoEvento".id_contacto1
      and (c.user_id = auth.uid() or c.created_by = auth.uid())
  )
  or exists (
    select 1 from public.contacto c
    where c.id = "contratoEvento".id_contacto2
      and (c.user_id = auth.uid() or c.created_by = auth.uid())
  )
);

-- eventoXcontacto insert/select policies
drop policy if exists "eventoXcontacto_insert_by_contact_owner" on public."eventoXcontacto";
drop policy if exists "eventoXcontacto_select_by_contact_owner" on public."eventoXcontacto";

create policy "eventoXcontacto_insert_by_contact_owner"
on public."eventoXcontacto" for insert
to authenticated
with check (
  exists (
    select 1 from public.contacto c
    where c.id = "eventoXcontacto".id_contacto
      and (c.user_id = auth.uid() or c.created_by = auth.uid())
  )
);

create policy "eventoXcontacto_select_by_contact_owner"
on public."eventoXcontacto" for select
to authenticated
using (
  exists (
    select 1 from public.contacto c
    where c.id = "eventoXcontacto".id_contacto
      and (c.user_id = auth.uid() or c.created_by = auth.uid())
  )
);
;
