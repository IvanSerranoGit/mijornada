import { listCentros, listEquipo, ROLES } from "@mijornada/api";
import { Chip, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "../../../lib/supabase/server.ts";
import { InvitarUsuario } from "./Invitar.tsx";

export const metadata: Metadata = { title: "Equipo · Mi Jornada" };
export const dynamic = "force-dynamic";

// Quién administra la cuenta: dueño, administradores y supervisores, y sus invitaciones.
export default async function EquipoPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel/equipo");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") redirect("/panel");

  const [equipo, centros] = await Promise.all([listEquipo(ctx), listCentros(ctx)]);

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-1 font-bold">Equipo</h1>
        <p className="text-text-secondary">
          Las personas que administran tu registro de jornada. Quienes marcan se dan de alta en
          Inicio.
        </p>
      </section>

      <Tarjeta>
        <ul className="divide-y divide-border-default">
          {equipo.map((usuario) => (
            <li
              key={usuario.id}
              className="flex flex-wrap items-center justify-between gap-(--espacio-xs) py-(--espacio-sm)"
            >
              <div>
                <p className="font-medium">{usuario.nombre ?? usuario.correo}</p>
                <p className="text-pequeno text-text-secondary">
                  {usuario.correo}
                  {usuario.centro_id
                    ? ` · ${centros.find((c) => c.id === usuario.centro_id)?.nombre ?? ""}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-(--espacio-2xs)">
                <Chip tono="neutro">{ROLES[usuario.rol] ?? usuario.rol}</Chip>
                {usuario.invitacion_pendiente ? (
                  <Chip tono="alerta">Invitación pendiente</Chip>
                ) : null}
                {usuario.activo ? null : <Chip tono="critico">Sin acceso</Chip>}
              </div>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <div>
          <h2 className="font-titulo text-titulo-3 font-bold">Invitar por correo</h2>
          <p className="text-pequeno text-text-secondary">
            Le llega un enlace para crear su contraseña. Vence en 7 días.
          </p>
        </div>
        <InvitarUsuario
          centros={centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
          puedeInvitarAdministradores={ctx.sesion.rol === "dueno"}
        />
      </Tarjeta>
    </>
  );
}
