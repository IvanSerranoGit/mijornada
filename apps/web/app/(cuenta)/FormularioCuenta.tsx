"use client";

import { Boton, Campo } from "@mijornada/ui";
import Link from "next/link";
import { useActionState } from "react";
import { entrar, entrarConGoogle, enviarEnlace, registrar, type AuthState } from "./actions.ts";

interface Props {
  modo: "entrar" | "registro";
  siguiente?: string | undefined;
  google: boolean;
}

const INICIAL: AuthState = {};

export function FormularioCuenta({ modo, siguiente, google }: Props) {
  const [estado, accion, enviando] = useActionState(
    modo === "entrar" ? entrar : registrar,
    INICIAL,
  );
  const [estadoEnlace, accionEnlace, enviandoEnlace] = useActionState(enviarEnlace, INICIAL);
  const error = estado.error ?? estadoEnlace.error;
  const aviso = estado.aviso ?? estadoEnlace.aviso;

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <Campo
        etiqueta="Correo"
        name="correo"
        type="email"
        autoComplete="email"
        placeholder="tu@negocio.mx"
        required
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete={modo === "entrar" ? "current-password" : "new-password"}
        nota={modo === "registro" ? "Al menos 8 caracteres." : undefined}
        minLength={8}
        required
      />

      {error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="text-pequeno text-status-good">
          {aviso}
        </p>
      ) : null}

      <Boton type="submit" tamano="l" disabled={enviando}>
        {modo === "entrar" ? "Entrar" : "Crear cuenta"}
      </Boton>

      {modo === "entrar" ? (
        <Boton
          type="submit"
          estilo="fantasma"
          formAction={accionEnlace}
          formNoValidate
          disabled={enviandoEnlace}
        >
          Enviarme un enlace para entrar sin contraseña
        </Boton>
      ) : null}

      {google ? (
        <Boton type="submit" estilo="secundario" formAction={entrarConGoogle} formNoValidate>
          Continuar con Google
        </Boton>
      ) : null}

      <p className="text-center text-pequeno text-text-secondary">
        {modo === "entrar" ? "¿Aún no tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link
          href={modo === "entrar" ? "/registro" : "/entrar"}
          className="font-medium text-text-brand"
        >
          {modo === "entrar" ? "Regístrate" : "Inicia sesión"}
        </Link>
      </p>
    </form>
  );
}
