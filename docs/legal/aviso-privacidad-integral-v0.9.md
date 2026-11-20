---
tipo: aviso_privacidad
version: 0.9
estado: borrador pendiente de revisión por abogado (LFPDPPP, DOF 20-mar-2025)
variables: razon_social, rfc_patron, domicilio_patron, correo_privacidad, telefono_privacidad, captura_foto, captura_ubicacion, fecha_actualizacion
---

# Aviso de privacidad integral para personas trabajadoras — registro de jornada

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

---

*Nota de uso interno (no se imprime): confirmar con el abogado (a) el nombre exacto y vigente de la autoridad de datos personales en el sector privado tras la extinción del INAI; (b) si la fotografía en el momento del marcaje requiere consentimiento expreso aunque no se use para biometría; (c) el plazo de respuesta ARCO vigente bajo la ley de 2025; (d) el contrato de encargo entre cada empresa cliente e Inzotec, que debe existir como anexo de los términos de servicio.*
