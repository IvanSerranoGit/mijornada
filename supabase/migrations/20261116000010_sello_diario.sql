-- Sello diario: raíz Merkle de los eventos del día por tenant.
--
-- Árbol (el mismo que implementa packages/dominio):
--   * hoja  = SHA-256(0x00 || hash del evento);
--   * nodo  = SHA-256(0x01 || izquierdo || derecho);
--   * un nodo sin pareja sube tal cual al nivel siguiente;
--   * las hojas van en orden (ts_servidor, id);
--   * sin eventos, la raíz es SHA-256 de la cadena vacía.

create function jornada.raiz_merkle(p_hashes text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_nivel bytea[];
  v_siguiente bytea[];
  v_n integer;
  v_i integer;
begin
  if p_hashes is null or cardinality(p_hashes) = 0 then
    return encode(sha256(''::bytea), 'hex');
  end if;

  select array_agg(sha256('\x00'::bytea || decode(t.h, 'hex')) order by t.ord)
  into v_nivel
  from unnest(p_hashes) with ordinality as t (h, ord);

  while cardinality(v_nivel) > 1 loop
    v_siguiente := '{}';
    v_n := cardinality(v_nivel);
    v_i := 1;
    while v_i <= v_n loop
      if v_i < v_n then
        v_siguiente := array_append(v_siguiente, sha256('\x01'::bytea || v_nivel[v_i] || v_nivel[v_i + 1]));
      else
        v_siguiente := array_append(v_siguiente, v_nivel[v_i]);
      end if;
      v_i := v_i + 2;
    end loop;
    v_nivel := v_siguiente;
  end loop;

  return encode(v_nivel[1], 'hex');
end;
$$;

comment on function jornada.raiz_merkle(text[]) is 'Raíz Merkle (hex) de una lista ordenada de hashes de evento.';

-- Raíz y número de eventos de un día del tenant (día en la zona horaria del tenant).
create function jornada.raiz_merkle_dia(p_tenant_id uuid, p_fecha date)
returns table (hash_raiz text, n_eventos integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text;
  v_hashes text[];
begin
  select e.zona_horaria into v_zona from tenants.empresa e where e.id = p_tenant_id;
  if v_zona is null then
    raise exception 'No existe la empresa %.', p_tenant_id using errcode = 'no_data_found';
  end if;

  select coalesce(array_agg(ev.hash order by ev.ts_servidor, ev.id), '{}')
  into v_hashes
  from jornada.evento ev
  where ev.tenant_id = p_tenant_id
    and ev.ts_servidor >= (p_fecha::timestamp at time zone v_zona)
    and ev.ts_servidor < ((p_fecha + 1)::timestamp at time zone v_zona);

  return query select jornada.raiz_merkle(v_hashes), cardinality(v_hashes);
end;
$$;

-- Sella un día ya terminado. Si el día ya estaba sellado, devuelve el sello existente.
create function jornada.sellar_dia(p_tenant_id uuid, p_fecha date)
returns jornada.sello_diario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text;
  v_raiz record;
  v_sello jornada.sello_diario;
begin
  select e.zona_horaria into v_zona from tenants.empresa e where e.id = p_tenant_id;
  if v_zona is null then
    raise exception 'No existe la empresa %.', p_tenant_id using errcode = 'no_data_found';
  end if;

  if ((p_fecha + 1)::timestamp at time zone v_zona) > now() then
    raise exception 'No se puede sellar el % porque el día no ha terminado.', p_fecha
      using errcode = 'check_violation';
  end if;

  select r.hash_raiz, r.n_eventos into v_raiz from jornada.raiz_merkle_dia(p_tenant_id, p_fecha) r;

  insert into jornada.sello_diario (tenant_id, fecha, hash_raiz, n_eventos)
  values (p_tenant_id, p_fecha, v_raiz.hash_raiz, v_raiz.n_eventos)
  on conflict (tenant_id, fecha) do nothing;

  select s.* into v_sello from jornada.sello_diario s where s.tenant_id = p_tenant_id and s.fecha = p_fecha;
  return v_sello;
end;
$$;

-- Compara el sello guardado contra los eventos actuales del día.
create function jornada.verificar_sello(p_tenant_id uuid, p_fecha date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.hash_raiz = r.hash_raiz and s.n_eventos = r.n_eventos
  from jornada.sello_diario s, jornada.raiz_merkle_dia(p_tenant_id, p_fecha) r
  where s.tenant_id = p_tenant_id
    and s.fecha = p_fecha;
$$;

comment on function jornada.verificar_sello(uuid, date) is 'true si el sello del día coincide con los eventos; null si el día no está sellado.';

-- Sella, para cada tenant, los días pendientes cuya hora local ya pasó de las 02:00
-- del día siguiente. Corre cada hora: así cubre cualquier zona horaria y se pone al
-- corriente si el job no corrió algún día.
create function jornada.sellar_dias_pendientes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa record;
  v_ultimo date;
  v_fecha date;
  v_sellados integer := 0;
begin
  for v_empresa in select e.id, e.zona_horaria from tenants.empresa e loop
    -- Último día sellable: ayer, una vez que son las 02:00 locales.
    v_ultimo := ((now() at time zone v_empresa.zona_horaria) - interval '2 hours')::date - 1;

    -- Se continúa desde el último sello; si no hay, desde el día del primer evento.
    select max(s.fecha) + 1 into v_fecha from jornada.sello_diario s where s.tenant_id = v_empresa.id;
    if v_fecha is null then
      select (min(ev.ts_servidor) at time zone v_empresa.zona_horaria)::date
      into v_fecha
      from jornada.evento ev
      where ev.tenant_id = v_empresa.id;
    end if;

    while v_fecha is not null and v_fecha <= v_ultimo loop
      perform jornada.sellar_dia(v_empresa.id, v_fecha);
      v_sellados := v_sellados + 1;
      v_fecha := v_fecha + 1;
    end loop;
  end loop;
  return v_sellados;
end;
$$;

comment on function jornada.sellar_dias_pendientes() is 'Job horario: sella los días terminados de cada tenant a partir de las 02:00 de su hora local.';

revoke all on function jornada.sellar_dia(uuid, date) from public;
revoke all on function jornada.sellar_dias_pendientes() from public;
grant execute on function jornada.sellar_dia(uuid, date) to service_role;
grant execute on function jornada.sellar_dias_pendientes() to service_role;

select cron.schedule(
  'jornada-sello-diario',
  '0 * * * *',
  $$select jornada.sellar_dias_pendientes()$$
);
