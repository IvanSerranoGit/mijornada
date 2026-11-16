# Preguntas para el abogado

Lista viva de lo que necesitamos confirmar con el abogado laboral. Cada pregunta dice qué asume hoy
el sistema, para que la respuesta se traduzca en un cambio concreto (casi siempre una fila de
`calculo.regla`, sin tocar código).

Estados: **Abierta** · **Respondida** (anotar fecha, respuesta y qué se cambió).

## Reglas de jornada y tiempo extra

### 1. Máximo de días con tiempo extra por semana

- **Estado:** Abierta
- **Pregunta:** El calendario de transición dice "4 h extra diarias (máx. 4 días)" para 2026. ¿Ese
  máximo de 4 días por semana sigue aplicando de 2027 en adelante, cambia o desaparece?
- **Qué asume hoy el sistema:** aplica solo en 2026; de 2027 en adelante no hay límite de días.
- **Dónde cambia:** regla `dias_extra_max_semanal` en `supabase/seeds/0001_reglas_calculo.sql`.

### 2. Sexto día de trabajo cuando la jornada semanal baje a 42 y 40 horas

- **Estado:** Abierta
- **Pregunta:** En 2029 (42 h) y 2030 (40 h), si alguien trabaja seis días de 8 horas, el sexto día
  es casi todo tiempo extra (6 y 8 horas). ¿Eso viola el tope de 4 horas extra diarias, o el tope
  diario solo se mide contra la jornada pactada de ese día?
- **Qué asume hoy el sistema:** sí lo cuenta como exceso del tope diario y genera una alerta.
- **Dónde cambia:** `computeWeek` en `packages/dominio/src/calculo.ts`.

### 3. Qué reglas aplican a una semana que cruza el cambio de año

- **Estado:** Abierta
- **Pregunta:** Una semana que empieza en diciembre y termina en enero cae en dos años con distinta
  jornada máxima (por ejemplo 48 h en 2026 y 46 h en 2027). ¿Qué límite aplica a esa semana?
- **Qué asume hoy el sistema:** las reglas vigentes el primer día de la semana.
- **Dónde cambia:** `computeWeek` en `packages/dominio/src/calculo.ts`.

### 4. Cómo se determina qué es tiempo extra

- **Estado:** Abierta
- **Pregunta:** ¿Es tiempo extra lo que excede la jornada pactada del día, lo que excede el máximo
  semanal, o ambos? ¿Cambia para jornada mixta y nocturna (límites diarios distintos)?
- **Qué asume hoy el sistema:** ambos: lo que excede la jornada pactada del día según el horario del
  trabajador, y además lo que excede el máximo semanal. No distingue jornada diurna, mixta o
  nocturna más allá del horario pactado.
- **Dónde cambia:** `computeWeek`; si hay límites diarios por tipo de jornada, se agregan como
  reglas en `calculo.regla`.

### 5. Pago del tiempo extra: dobles y triples

- **Estado:** Abierta
- **Pregunta:** ¿Se pagan al doble las horas extra dentro del tope semanal y al triple las que lo
  rebasan? ¿El tope que separa dobles de triples es el mismo que sube de 9 a 12 horas entre 2026 y
  2030?
- **Qué asume hoy el sistema:** sí a las dos: dobles hasta el tope semanal vigente, triples lo
  demás.
- **Dónde cambia:** `computeWeek`; el tope es la regla `tope_extra_semanal`.

### 6. Menores de edad

- **Estado:** Abierta
- **Pregunta:** Un menor de 18 años no puede trabajar tiempo extra. Si de hecho lo trabajó, ¿cómo
  debe registrarse y pagarse? ¿Hay además una jornada máxima diaria distinta para menores que el
  sistema deba vigilar?
- **Qué asume hoy el sistema:** cualquier minuto extra de un menor genera alerta y se clasifica
  como triple. No vigila una jornada máxima especial para menores.
- **Dónde cambia:** regla `tope_extra_semanal_menor`; una jornada máxima para menores sería una
  regla nueva.

## Vigencias y montos

### 7. Vigencia de la UMA

- **Estado:** Abierta
- **Pregunta:** Para calcular multas, ¿la UMA 2026 ($117.31 diarios) aplica del 1 de febrero de
  2026 al 31 de enero de 2027? ¿Qué valor se usa en enero de 2026?
- **Qué asume hoy el sistema:** vigente del 1-feb-2026 al 31-ene-2027. Fuera de ese rango no hay
  valor cargado hasta que se registre la UMA correspondiente.
- **Dónde cambia:** regla `uma_diaria`.

### 8. Multa por no llevar el registro

- **Estado:** Abierta
- **Pregunta:** ¿La multa del art. 994 fr. IV Bis (250 a 5,000 UMA) es exigible desde el 1 de
  enero de 2027, cuando empieza la obligación? ¿Se aplica por trabajador, por centro de trabajo o
  por empresa?
- **Qué asume hoy el sistema:** vigente desde el 1-ene-2027. No calcula el monto; solo guarda los
  límites.
- **Dónde cambia:** reglas `multa_registro_min` y `multa_registro_max`.

## Registro, correcciones y valor probatorio

### 9. Qué hora cuenta cuando se corrige una marca

- **Estado:** Abierta
- **Pregunta:** Si un trabajador olvidó marcar y el patrón aprueba una corrección días después,
  ¿qué hora vale para el cálculo: la que declara la corrección o la del momento en que se
  registró? ¿Debe constar la conformidad del trabajador con la hora corregida?
- **Qué asume hoy el sistema:** nada todavía. La marca original nunca se modifica y la corrección
  es un evento nuevo con motivo y autor, pero el modelo no tiene un campo propio para la hora
  corregida. Esta respuesta bloquea el cálculo de días laborales.
- **Dónde cambia:** una columna nueva en `jornada.evento` (migración) y el proceso que llena
  `jornada.dia_laboral`.

### 10. Marcas que llegan tarde por falta de internet

- **Estado:** Abierta
- **Pregunta:** Cuando el dispositivo no tenía red, la marca se guarda con la hora del dispositivo
  y se envía después. ¿Es aceptable usar la hora del dispositivo para el cálculo si la marca llega
  dentro de 24 horas? ¿Y si llega después?
- **Qué asume hoy el sistema:** guarda las dos horas (dispositivo y servidor). El documento de
  fundamentos prevé marcar como "sincronización tardía" lo que llegue más de 24 h después; aún no
  está implementado.
- **Dónde cambia:** la API de marcaje (sprint 2).

### 11. Trabajador que no acepta el convenio de registro

- **Estado:** Abierta
- **Pregunta:** El art. 132 fr. XXXIV habla de un registro acordado con el trabajador. Si un
  trabajador no acepta el convenio o el aviso de privacidad, ¿el patrón puede seguir registrando
  su jornada? ¿Basta la aceptación con un clic y nombre escrito, o se necesita firma autógrafa?
- **Qué asume hoy el sistema:** el trabajador puede seguir marcando y aparece como pendiente. Se
  admiten clic, firma simple y firma autógrafa escaneada.
- **Dónde cambia:** flujo de consentimiento (sprint 2) y `cumplimiento.consentimiento`.

### 12. Conservación y borrado de datos

- **Estado:** Abierta
- **Pregunta:** ¿Cuánto tiempo debe conservarse el registro de jornada? Si un trabajador ejerce sus
  derechos ARCO o causa baja, ¿podemos negarnos a borrar sus marcas por obligación legal y borrar
  solo fotos y datos de contacto? ¿Es correcto purgar las fotos de marcaje a los 90 días?
- **Qué asume hoy el sistema:** la bitácora nunca se borra; las fotos se purgarán a los 90 días y
  queda solo su hash; los respaldos se planean a 5 años.
- **Dónde cambia:** políticas de purga y respaldo (sprints siguientes) y el aviso de privacidad.

### 13. Foto y ubicación en el marcaje

- **Estado:** Abierta
- **Pregunta:** ¿Tomar una foto del trabajador y su ubicación en el instante del marcaje requiere
  consentimiento expreso, o basta el aviso de privacidad? ¿La foto se considera dato biométrico
  aunque no se use para reconocimiento automático?
- **Qué asume hoy el sistema:** sin biometría; foto y ubicación solo en el instante del marcaje,
  informadas en el aviso de privacidad.
- **Dónde cambia:** configuración por centro y textos de consentimiento (sprint 2).

### 14. Valor probatorio de la bitácora

- **Estado:** Abierta
- **Pregunta:** ¿El hash encadenado más el sello diario bastan como prueba ante una inspección o un
  juicio, o conviene la constancia NOM-151 de un prestador de servicios de certificación desde el
  primer día? ¿Qué debe traer el reporte para que la autoridad lo acepte?
- **Qué asume hoy el sistema:** cadena de hashes por trabajador y sello diario interno; la
  constancia NOM-151 queda como opción activable por empresa.
- **Dónde cambia:** `jornada.sello_diario.proveedor_sello` y el reporte de inspección.

## Pendiente de los lineamientos de la STPS

### 15. Formato y entrega del registro

- **Estado:** Abierta
- **Pregunta:** Cuando la STPS publique los lineamientos, ¿qué formato, campos y medio de entrega
  exigen? ¿Piden algo que hoy no guardamos?
- **Qué asume hoy el sistema:** reporte en PDF y CSV; los formatos nuevos se agregan como
  exportadores sin tocar el registro.
- **Dónde cambia:** dominios `cumplimiento` e `integraciones`.
