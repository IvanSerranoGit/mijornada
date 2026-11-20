# Usuarios y roles

| Rol           | Qué puede hacer                                                              | Cómo entra          |
| ------------- | ---------------------------------------------------------------------------- | ------------------- |
| Dueño         | Todo, incluido contratar el plan e invitar administradores                   | Correo y contraseña |
| Administrador | Administra personas, centros, documentos, incidencias y reportes; no el plan | Correo y contraseña |
| Supervisor    | Ve y resuelve lo de su centro                                                | Correo y contraseña |
| Empleado      | Marca, acepta documentos, reporta y responde incidencias                     | Correo y PIN        |
| Kiosco        | Marca por las personas de su centro                                          | Token de la tablet  |
| Inspector     | Ve un solo reporte durante 72 horas                                          | Enlace temporal     |

## Invitar administradores y supervisores

Panel → Equipo, o `POST /api/v1/usuarios` (`correo`, `nombre`, `rol`, y `centro_id` para el
supervisor). Solo el dueño invita administradores; un administrador puede invitar
supervisores.

1. El servidor crea la cuenta de Auth (o reutiliza la que exista con ese correo; un correo
   que ya tiene acceso a Mi Jornada se rechaza) y da de alta el `tenants.usuario` con la
   sesión de quien invita, así que aplica RLS.
2. Genera un enlace de un solo uso, vigente 7 días (`tenants.invitacion_usuario` guarda
   solo el hash) y lo envía por correo. Si el correo no sale, el panel muestra el enlace
   para compartirlo a mano.
3. La persona abre `/invitacion-usuario/<token>`, crea su contraseña (mínimo 10
   caracteres) y entra al panel con su rol.

`GET /api/v1/equipo` lista dueño, administradores y supervisores con su correo y si su
invitación sigue pendiente (`tenants.usuarios_del_tenant`).

En solo lectura (prueba vencida o pago fallido) no se puede invitar.

Pruebas: `packages/api/test/usuarios.test.ts`.
