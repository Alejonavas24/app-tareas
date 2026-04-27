alter table planner.liquidation_lines
  add column if not exists event_moment text;

alter table planner.liquidation_lines
  drop constraint if exists liquidation_lines_event_moment_check;

alter table planner.liquidation_lines
  add constraint liquidation_lines_event_moment_check
  check (event_moment in ('ceremonia', 'coctel', 'banquete', 'fiesta'));

comment on column planner.liquidation_lines.event_moment is
  'Momento operativo del evento para la línea (ceremonia, coctel, banquete, fiesta).';

update planner.liquidation_lines ll
set event_moment = case ll.source_type
  when 'menu' then (
    select m.default_event_moment
    from public.menu m
    where m.id = ll.source_id
  )
  when 'bebidas' then (
    select b.default_event_moment
    from public.bebidas b
    where b.id = ll.source_id
  )
  when 'bodega' then (
    select bg.default_event_moment
    from public.bodega bg
    where bg.id = ll.source_id
  )
  when 'adicionales' then (
    select a.default_event_moment
    from public.adicionales a
    where a.id = ll.source_id
  )
  when 'tematicas' then (
    select t.default_event_moment
    from public.tematicas t
    where t.id = ll.source_id
  )
  else null
end
where ll.event_moment is null
  and ll.source_id is not null;

update planner.liquidation_lines
set event_moment = 'banquete'
where event_moment is null
  and source_type = 'menu'
  and description in ('Menú adultos', 'Menú niños', 'Menú profesionales');;
