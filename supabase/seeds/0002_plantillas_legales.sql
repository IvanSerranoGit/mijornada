-- GENERADO por packages/db/src/seed-legal.ts a partir de docs/legal. No editar a mano:
-- cambia el archivo de docs/legal y ejecuta `pnpm db:seed:legal`.
-- Idempotente: una plantilla ya cargada se actualiza con el texto del archivo.
insert into cumplimiento.plantilla (tipo, version, contenido_md, resumen_md) values
  ('convenio_registro', '0.9', $plantilla$# Convenio para el registro electrónico de la jornada de trabajo

Que celebran, por una parte, **{{razon_social}}**, con RFC {{rfc_patron}} y domicilio en {{domicilio_patron}}, en adelante "la Empresa", y por la otra **{{nombre_trabajador}}**, con CURP {{curp_trabajador}}, quien presta sus servicios como {{puesto}} en el centro de trabajo {{centro_trabajo}}, en adelante "la Persona Trabajadora", al tenor de las siguientes declaraciones y cláusulas.

## Declaraciones

1. La Empresa está obligada, conforme al artículo 132, fracción XXXIV, de la Ley Federal del Trabajo, a llevar un registro electrónico de la jornada de cada persona trabajadora, con el horario de inicio y de finalización, y a proporcionarlo a la autoridad laboral cuando se le requiera.
2. Dicho artículo establece que el contenido del registro hará prueba plena cuando se acredite que fue acordado entre la persona trabajadora y el patrón. Este convenio tiene por objeto dejar constancia de ese acuerdo.
3. La Empresa utiliza para ese fin el sistema **Mi Jornada**, operado por Innovación en Soluciones Tecnológicas y Creativas Inzotec, S.A.S. de C.V., en calidad de encargado del tratamiento de los datos personales, bajo las instrucciones de la Empresa.
4. La Persona Trabajadora ha sido informada del funcionamiento del sistema, ha recibido el aviso de privacidad correspondiente y conoce el procedimiento para consultar sus registros y reportar errores.

## Cláusulas

**Primera. Objeto.** Las partes acuerdan que la jornada de trabajo de la Persona Trabajadora se registrará por medios electrónicos a través del sistema Mi Jornada, y que dicho registro constituye el control de asistencia y de jornada a que se refieren los artículos 784 y 804 de la Ley Federal del Trabajo.

**Segunda. Método de registro.** La Persona Trabajadora registrará el inicio y la finalización de su jornada, así como sus pausas cuando aplique, mediante {{metodo_marcaje}}. El registro deberá realizarse personalmente; queda prohibido registrar a nombre de otra persona o permitir que otra persona registre en su nombre.

**Tercera. Información que se captura.** En cada registro el sistema guarda: la identificación de la Persona Trabajadora, el tipo de registro (entrada, salida, inicio o fin de pausa), la fecha y hora asignadas por el servidor del sistema y la fecha y hora del dispositivo, el medio utilizado y un identificador del dispositivo{{#captura_ubicacion}}, la ubicación geográfica aproximada únicamente en el instante del registro{{/captura_ubicacion}}{{#captura_foto}} y una fotografía tomada en el momento del registro{{/captura_foto}}. El sistema no realiza seguimiento continuo de ubicación ni captura datos biométricos.

**Cuarta. Integridad del registro.** Cada registro queda encadenado criptográficamente al anterior y sellado diariamente, de modo que ningún registro puede modificarse ni eliminarse una vez creado. Cualquier corrección se documenta como un registro adicional que conserva el original, el motivo, la persona que lo autorizó y la fecha y hora de la autorización.

**Quinta. Consulta de los registros.** La Persona Trabajadora podrá consultar en cualquier momento, desde la aplicación, sus propios registros, las horas acumuladas en la semana y el estado de las correcciones. La Empresa le entregará, a solicitud, un reporte de sus registros por el periodo que indique.

**Sexta. Incidencias y correcciones.** Cuando la Persona Trabajadora omita un registro o considere que uno es incorrecto, deberá reportarlo mediante el procedimiento de incidencias de la aplicación, indicando la fecha, la hora que corresponde y el motivo, dentro de los cinco días hábiles siguientes. La Empresa resolverá la incidencia y la resolución quedará registrada. Cuando la corrección la inicie la Empresa, la Persona Trabajadora podrá manifestar su conformidad o inconformidad desde la aplicación, y ambas quedarán asentadas en el registro.

**Séptima. Marcas sin conexión.** Si al momento del registro el dispositivo no tiene conexión, el registro se guarda en el dispositivo con la hora de éste y se transmite al servidor al recuperarse la conexión, indicándose en el registro esa circunstancia. La Persona Trabajadora procurará que la transmisión ocurra el mismo día.

**Octava. Valor probatorio.** Las partes acuerdan que el contenido del registro electrónico llevado conforme a este convenio hace prueba plena de los horarios de inicio y finalización de la jornada, en términos del artículo 132, fracción XXXIV, de la Ley Federal del Trabajo, sin perjuicio del derecho de la Persona Trabajadora a objetar registros específicos mediante el procedimiento de incidencias.

**Novena. Conservación.** La Empresa conservará los registros durante la relación de trabajo y, como mínimo, un año después de su terminación, conforme al artículo 804 de la Ley Federal del Trabajo, y podrá conservarlos por un plazo mayor cuando otra disposición legal lo exija.

**Décima. Datos personales.** El tratamiento de los datos personales derivados del registro se rige por el aviso de privacidad de la Empresa, que la Persona Trabajadora declara haber recibido. La Persona Trabajadora podrá ejercer sus derechos de acceso, rectificación, cancelación y oposición conforme a dicho aviso.

**Décima primera. Vigencia y modificaciones.** Este convenio surte efectos a partir de su aceptación y permanece vigente mientras subsista la relación de trabajo. Cualquier cambio en el método de registro o en la información capturada se documentará en una nueva versión de este convenio, que se pondrá a disposición de la Persona Trabajadora para su aceptación.

**Décima segunda. Aceptación.** La Persona Trabajadora acepta este convenio mediante firma electrónica simple en la aplicación, consistente en la captura de su nombre completo junto con la fecha y hora del servidor, la dirección IP y el identificador del dispositivo, o bien mediante firma autógrafa en el ejemplar impreso que la Empresa conservará digitalizado. En ambos casos el sistema conserva la versión y la huella digital (hash) de este documento.

Versión del documento: {{version_documento}} · Hash: {{hash_documento}} · Fecha de aceptación: {{fecha}}
$plantilla$, null),
  ('aviso_privacidad', '0.9', $plantilla$# Aviso de privacidad integral para personas trabajadoras — registro de jornada

## 1. Responsable

**{{razon_social}}**, con RFC {{rfc_patron}} y domicilio en {{domicilio_patron}}, es responsable del tratamiento de sus datos personales en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Para cualquier asunto relacionado con este aviso puede escribir a {{correo_privacidad}} o llamar al {{telefono_privacidad}}.

El sistema Mi Jornada es operado por Innovación en Soluciones Tecnológicas y Creativas Inzotec, S.A.S. de C.V., que actúa como **encargado** del tratamiento: trata los datos únicamente por cuenta y bajo las instrucciones del responsable, con obligaciones de confidencialidad y seguridad establecidas por contrato, y no los utiliza para fines propios.

## 2. Datos personales que se tratan

Para cumplir la obligación legal de registrar su jornada, tratamos los siguientes datos:

- **Identificación y laborales:** nombre completo, puesto, centro de trabajo, horario asignado, fecha de ingreso y, cuando usted o la empresa los proporcionen, CURP y número de seguridad social. Estos dos últimos se almacenan cifrados.
- **Registro de jornada:** fecha y hora de cada entrada, salida y pausa; medio utilizado para registrar; identificador del dispositivo; indicador de si el registro se transmitió con retraso por falta de conexión.
{{#captura_ubicacion}}- **Ubicación:** coordenadas geográficas aproximadas y su precisión, capturadas únicamente en el instante de cada registro. No se realiza seguimiento continuo ni en segundo plano.{{/captura_ubicacion}}
{{#captura_foto}}- **Imagen:** una fotografía tomada en el momento del registro para verificar que lo realizó usted. La fotografía no se utiliza para reconocimiento facial ni se extraen de ella datos biométricos; se conserva 90 días y después se elimina, quedando únicamente su huella digital (hash) como constancia de integridad.{{/captura_foto}}
- **Datos de la aceptación de documentos:** nombre capturado, fecha y hora, dirección IP y tipo de dispositivo con que aceptó este aviso y el convenio de registro.
- **Incidencias:** fecha, hora declarada, motivo y resolución de las correcciones que usted o la empresa soliciten.

**No tratamos datos personales sensibles** ni datos biométricos para el registro de jornada.

## 3. Finalidades

**Finalidades primarias (necesarias; no requieren su consentimiento por derivar de una obligación legal y de la relación de trabajo):**

1. Registrar el inicio y la finalización de su jornada conforme al artículo 132, fracción XXXIV, de la Ley Federal del Trabajo.
2. Calcular horas ordinarias y extraordinarias, descansos y cumplimiento de los límites legales de jornada.
3. Generar los reportes que la autoridad laboral requiera y acreditar la jornada en caso de controversia.
4. Verificar que el registro lo realizó usted{{#captura_ubicacion}} y que se hizo en el centro de trabajo{{/captura_ubicacion}}.
5. Atender y resolver incidencias y correcciones.
6. Conservar los registros por el plazo que la ley exige.

**Finalidades secundarias (no necesarias; puede oponerse a ellas sin que afecte su relación de trabajo):**

- Enviarle avisos informativos sobre su acumulado de horas o recordatorios de registro.

Si no desea que sus datos se traten para la finalidad secundaria, indíquelo en {{correo_privacidad}} o desde la configuración de la aplicación.

## 4. Transferencias

Sus datos no se venden ni se comparten con terceros para fines comerciales. Podrán comunicarse, sin requerir su consentimiento conforme al artículo 37 de la Ley, en los siguientes casos:

- A la **Secretaría del Trabajo y Previsión Social** o a las autoridades laborales estatales, cuando lo requieran en ejercicio de sus facultades de inspección.
- A **autoridades jurisdiccionales**, cuando sea necesario para acreditar la jornada en un procedimiento.
- A **proveedores de infraestructura** que actúan como encargados del encargado (alojamiento de base de datos y archivos, envío de correo), ubicados en Estados Unidos, bajo cláusulas de confidencialidad y seguridad. La lista actualizada de estos proveedores puede solicitarse en {{correo_privacidad}}.

## 5. Derechos ARCO y limitación del uso

Usted puede acceder a sus datos, rectificarlos cuando sean inexactos, cancelarlos cuando ya no sean necesarios para las finalidades legales, y oponerse a su tratamiento para finalidades secundarias. Para ello:

1. Consulte y descargue sus registros directamente desde la aplicación, en la sección "Mis registros".
2. Para rectificar un registro de jornada, utilice el procedimiento de incidencias de la aplicación; la rectificación queda documentada sin borrar el registro original, porque la ley obliga a conservarlo.
3. Para cualquier otra solicitud, escriba a {{correo_privacidad}} indicando su nombre, el derecho que desea ejercer y una descripción clara. Responderemos en un plazo máximo de 20 días hábiles.

Tome en cuenta que los registros de jornada, por tratarse de una obligación legal, no pueden cancelarse mientras subsista la relación de trabajo ni durante el plazo de conservación posterior; sí pueden cancelarse sus datos de contacto y las fotografías.

## 6. Medidas de seguridad

Los datos se transmiten y almacenan cifrados; cada registro queda encadenado criptográficamente y sellado diariamente para impedir alteraciones; el acceso está limitado por roles; las fotografías se almacenan en un repositorio privado con enlaces de corta duración y se eliminan a los 90 días; CURP y número de seguridad social se almacenan cifrados con una llave propia de la empresa.

## 7. Cambios al aviso

Cualquier cambio a este aviso se le notificará a través de la aplicación antes de que surta efectos, y se le pedirá aceptar la nueva versión. Las versiones anteriores se conservan con su fecha de vigencia.

## 8. Autoridad

Si considera que su derecho a la protección de datos personales ha sido vulnerado, puede acudir a la autoridad competente en la materia (Secretaría Anticorrupción y Buen Gobierno, a través de su unidad de datos personales en el sector privado).

Última actualización: {{fecha_actualizacion}} · Versión 0.9
$plantilla$, $plantilla$**{{razon_social}}** usará tu nombre, puesto, horario y la hora de cada entrada y salida{{#captura_ubicacion}}, tu ubicación solo en el momento de marcar{{/captura_ubicacion}}{{#captura_foto}} y una foto al marcar{{/captura_foto}} para llevar el registro de jornada que exige la Ley Federal del Trabajo, calcular tus horas y entregar reportes a la autoridad laboral si los pide.

No se usan datos biométricos ni se rastrea tu ubicación fuera del momento de marcar.{{#captura_foto}} Las fotos se borran a los 90 días.{{/captura_foto}} Puedes ver y descargar tus registros en la app cuando quieras.

Aviso de privacidad completo: {{url_aviso_integral}}
$plantilla$)
on conflict (tipo, version) do update
set contenido_md = excluded.contenido_md, resumen_md = excluded.resumen_md;
