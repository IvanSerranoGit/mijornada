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

- **Estado:** Respondida provisionalmente (19-nov-2026, decisión del producto; falta la opinión del
  abogado)
- **Pregunta:** Si un trabajador olvidó marcar o marcó mal y se aprueba una corrección días
  después, ¿qué hora vale para el cálculo: la que declara la corrección o la del momento en que se
  registró? ¿Debe constar la conformidad del trabajador con la hora corregida?
- **Qué asume hoy el sistema:**
  - Vale la **hora declarada** (`jornada.evento.ts_declarado`): la hora en que se afirma que
    ocurrió la entrada o la salida. La hora en que se registró la corrección queda aparte
    (`ts_servidor`). La marca original nunca se modifica.
  - El reporte debe mostrar siempre las dos horas, el motivo y quién aprobó.
  - **Conformidad del trabajador:** si la corrección la pide el propio trabajador, nace con su
    conformidad; si la abre el patrón, queda "sin conformidad del trabajador" hasta que él la
    acepte desde su celular (`cumplimiento.incidencia.aceptada_por`, `aceptada_en`).
  - La hora declarada entra al hash encadenado (versión 2), así que tampoco se puede alterar sin
    rastro.
- **Qué cambiaría si el abogado dice otra cosa:**
  - Si la hora que vale es la del registro: `jornada.hora_efectiva` deja de usar `ts_declarado`
    (una función) y se recalculan los días con `jornada.recalcular_rango`. No se pierde nada: las
    dos horas están guardadas.
  - Si la conformidad debe ser obligatoria para aprobar: `cumplimiento.resolver_incidencia`
    rechazaría las incidencias sin `aceptada_en`.
  - Si se requiere firma y no un clic: se agrega el método de aceptación, como en los
    consentimientos.
- **Dónde está:** migración `20261119000022_hora_declarada.sql`.

### 10. Marcas que llegan tarde por falta de internet

- **Estado:** Abierta
- **Pregunta:** Cuando el dispositivo no tenía red, la marca se guarda con la hora del dispositivo
  y se envía después. ¿Es aceptable usar la hora del dispositivo para el cálculo si la marca llega
  dentro de 24 horas? ¿Y si llega después?
- **Qué asume hoy el sistema:** guarda las dos horas (dispositivo y servidor) y para calcular el
  día laboral usa la del dispositivo cuando existe, sin importar cuánto tarde en llegar. Lo que
  llega más de 24 h después se acepta y queda marcado como "sincronización tardía".
- **Dónde cambia:** la función `jornada.hora_efectiva` (qué hora cuenta) y el trigger
  `jornada.encadenar_evento` (umbral de 24 h).

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

## Acceso y evidencia (sprint 2)

### 16. PIN de 4 dígitos como identificación del trabajador

- **Estado:** Abierta
- **Pregunta:** El trabajador se identifica con un PIN de 4 dígitos (en el kiosco) o con correo y
  PIN (en su celular). ¿Es suficiente para atribuirle una marca ante una inspección o un juicio, o
  conviene exigir algo más (foto obligatoria, contraseña propia)?
- **Qué asume hoy el sistema:** el PIN basta; la foto es opcional por centro y se bloquea 15
  minutos tras 5 intentos fallidos.
- **Dónde cambia:** configuración por centro (`foto_en_kiosco`, `foto_en_telefono`).

### 17. Marcas fuera de la geocerca

- **Estado:** Abierta
- **Pregunta:** Si un trabajador marca desde su celular fuera del radio del centro de trabajo, la
  marca se registra y queda anotada como "fuera de geocerca". ¿Esa anotación puede usarse en su
  contra, o debe informarse expresamente en el aviso de privacidad y en el convenio?
- **Qué asume hoy el sistema:** nunca bloquea la marca; solo la anota.
- **Dónde cambia:** textos de consentimiento (sprint 3) y `jornada.evento.fuera_de_geocerca`.

## Documentos, consentimiento y cobro (sprint 3)

### 18. Firma electrónica simple y "prueba plena"

- **Estado:** Abierta
- **Pregunta:** El trabajador acepta el convenio de registro tecleando su nombre completo en la
  aplicación; se guardan hora del servidor, IP, navegador, versión y huella del documento. ¿Basta
  para que el registro "haga prueba plena" (art. 132 fr. XXXIV), o conviene exigir firma autógrafa
  o constancia NOM-151 en la primera aceptación?
- **Qué asume hoy el sistema:** la firma simple cuenta como aceptación; la autógrafa escaneada se
  puede agregar y ambas se conservan.
- **Dónde cambia:** `cumplimiento.consentimiento` (métodos) y `docs/documentos-y-consentimiento.md`.

### 19. Aceptación en el kiosco

- **Estado:** Abierta
- **Pregunta:** En el kiosco la persona ve el aviso de privacidad simplificado y toca "Acepto y
  marco" con su PIN. ¿Esa aceptación puede cubrir también el convenio de registro, que no se le
  muestra completo ahí?
- **Qué asume hoy el sistema:** el clic del kiosco cubre solo el aviso de privacidad; el convenio
  queda pendiente hasta que lo firme en su celular o en papel.
- **Dónde cambia:** `cumplimiento.kiosco_aceptar`.

### 20. Trabajador que no acepta

- **Estado:** Abierta
- **Pregunta:** Si una persona no acepta el convenio, el sistema la deja seguir marcando (la
  obligación de registrar es del patrón) y la muestra como "consentimiento pendiente". ¿Qué valor
  probatorio tiene ese registro y qué debe hacer el patrón?
- **Qué asume hoy el sistema:** nunca bloquea el marcaje; el reporte de inspección indica el
  consentimiento pendiente y el patrón recibe recordatorios a los 3 y 7 días.
- **Dónde cambia:** flujo de consentimiento de la PWA y el kiosco.

### 21. Inconformidad del trabajador con una corrección

- **Estado:** Abierta
- **Pregunta:** Cuando el patrón corrige una marca y el trabajador manifiesta su inconformidad con
  un comentario, la corrección se mantiene y ambas posturas quedan en el registro. ¿Es el
  tratamiento correcto, o la corrección sin conformidad no debería contar para el cálculo de horas?
- **Qué asume hoy el sistema:** la corrección aprobada cuenta; el reporte la marca "con
  inconformidad del trabajador" y transcribe su comentario.
- **Dónde cambia:** `cumplimiento.responder_incidencia` y `jornada.recalcular_dia`.

### 22. Reporte y acceso del inspector

- **Estado:** Abierta
- **Pregunta:** ¿El contenido y el orden del reporte para inspección (registro diario, correcciones,
  horas extra contra topes, consentimientos, acta de integridad) cubren lo que pide la autoridad?
  ¿Es aceptable darle al inspector un enlace temporal de consulta en vez de (o además de) el PDF?
- **Qué asume hoy el sistema:** PDF y CSV con huellas, enlace de 72 horas revocable y página
  pública de verificación sin datos personales.
- **Dónde cambia:** `docs/reportes.md`.

### 23. Términos de servicio y contrato de encargo

- **Estado:** Abierta
- **Pregunta:** ¿La sección 7 de los términos de servicio basta como contrato de encargo entre el
  cliente (responsable) e Inzotec (encargado) conforme a la LFPDPPP vigente, o debe ser un anexo
  firmado aparte? Revisar también límite de responsabilidad, jurisdicción y reembolsos.
- **Qué asume hoy el sistema:** se aceptan al crear la cuenta; versión 0.9 con leyenda de
  preliminar.
- **Dónde cambia:** `docs/legal/terminos-servicio-mijornada-v0.9.md` y
  `docs/legal/aviso-privacidad-mijornada-v0.9.md`.

### 24. Bloqueo por falta de pago

- **Estado:** Abierta
- **Pregunta:** Con la prueba vencida o 7 días después de un cobro fallido, la administración queda
  en solo lectura, pero el personal sigue marcando y el patrón sigue generando reportes. ¿Hay algún
  riesgo en restringir la administración de un registro que la ley obliga a llevar?
- **Qué asume hoy el sistema:** nunca interrumpe el registro ni oculta datos.
- **Dónde cambia:** `docs/planes-y-cobro.md` y `calculo.regla` (`dias_gracia_pago`).
