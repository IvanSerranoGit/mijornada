-- El hash de un evento siempre lo calcula el trigger de inserción. El valor por
-- defecto solo evita que los clientes tengan que mandar la columna; si el trigger
-- faltara, la cadena vacía no pasaría la restricción de formato.
alter table jornada.evento alter column hash set default '';
