alter table planner.events
  add column if not exists event_start_time time;

comment on column planner.events.event_start_time is
  'Hora de inicio operativa del evento. Se usa como referencia para el primer bloque excluyendo coffee break.';;
