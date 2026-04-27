alter type logistica_tareas.tarea_estado_carga
  add value if not exists 'lista_para_recibir';
alter type logistica_tareas.tarea_estado_carga
  add value if not exists 'recibido';
