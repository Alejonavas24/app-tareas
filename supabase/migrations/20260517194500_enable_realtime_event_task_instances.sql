do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'tareas'
      and tablename = 'event_task_instances'
  ) then
    alter publication supabase_realtime add table tareas.event_task_instances;
  end if;
end $$;
