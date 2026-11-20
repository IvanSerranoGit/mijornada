---
tipo: convenio_registro
version: 0.9
estado: borrador pendiente de revisión por abogado laboralista
variables: razon_social, rfc_patron, domicilio_patron, nombre_trabajador, curp_trabajador, puesto, centro_trabajo, metodo_marcaje, captura_foto, captura_ubicacion, fecha, version_documento, hash_documento
---

# Convenio para el registro electrónico de la jornada de trabajo

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

---

*Nota de uso interno (no se imprime): este texto es un borrador v0.9 elaborado sin revisión de abogado. Puntos que deben confirmarse con el laboralista antes del piloto: (a) si la firma electrónica simple basta para la "prueba plena" o conviene exigir firma autógrafa o NOM-151 en la primera aceptación; (b) el plazo de cinco días para reportar incidencias; (c) la redacción de la cláusula octava respecto al derecho de objeción; (d) si el convenio debe depositarse junto con el contrato individual o el reglamento interior ante el Centro de Conciliación.*
