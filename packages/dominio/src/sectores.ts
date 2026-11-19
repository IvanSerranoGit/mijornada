// Sectores y jurisdicción laboral. La LFT (art. 527) reserva a la autoridad federal
// ciertas ramas industriales; el resto corresponde a la autoridad local. Aquí solo
// se sugiere: el dueño puede cambiarla en el alta.

export type Jurisdiccion = "federal" | "local";

export interface Sector {
  nombre: string;
  jurisdiccion: Jurisdiccion;
}

export const SECTORES: readonly Sector[] = [
  { nombre: "Comercio y tiendas", jurisdiccion: "local" },
  { nombre: "Restaurantes y alimentos preparados", jurisdiccion: "local" },
  { nombre: "Servicios profesionales", jurisdiccion: "local" },
  { nombre: "Salud y consultorios", jurisdiccion: "local" },
  { nombre: "Educación", jurisdiccion: "local" },
  { nombre: "Construcción", jurisdiccion: "local" },
  { nombre: "Transporte y logística", jurisdiccion: "local" },
  { nombre: "Hospedaje y turismo", jurisdiccion: "local" },
  { nombre: "Talleres y manufactura ligera", jurisdiccion: "local" },
  { nombre: "Agricultura y ganadería", jurisdiccion: "local" },
  { nombre: "Otro", jurisdiccion: "local" },
  { nombre: "Minería", jurisdiccion: "federal" },
  { nombre: "Petróleo e hidrocarburos", jurisdiccion: "federal" },
  { nombre: "Petroquímica", jurisdiccion: "federal" },
  { nombre: "Metalurgia y siderurgia", jurisdiccion: "federal" },
  { nombre: "Automotriz y autopartes", jurisdiccion: "federal" },
  { nombre: "Banca y crédito", jurisdiccion: "federal" },
  { nombre: "Textil", jurisdiccion: "federal" },
  { nombre: "Cemento y cal", jurisdiccion: "federal" },
  { nombre: "Energía eléctrica", jurisdiccion: "federal" },
  { nombre: "Química y farmacéutica", jurisdiccion: "federal" },
  { nombre: "Celulosa y papel", jurisdiccion: "federal" },
  { nombre: "Alimentos empacados o enlatados", jurisdiccion: "federal" },
  { nombre: "Bebidas envasadas", jurisdiccion: "federal" },
  { nombre: "Azúcar", jurisdiccion: "federal" },
  { nombre: "Hule", jurisdiccion: "federal" },
  { nombre: "Vidrio", jurisdiccion: "federal" },
  { nombre: "Tabaco", jurisdiccion: "federal" },
  { nombre: "Madera básica", jurisdiccion: "federal" },
  { nombre: "Ferrocarriles", jurisdiccion: "federal" },
  { nombre: "Cinematografía", jurisdiccion: "federal" },
];

/** Jurisdicción sugerida para un sector; local si el sector no está en la lista. */
export function suggestJurisdiccion(sector: string | null | undefined): Jurisdiccion {
  return SECTORES.find((s) => s.nombre === sector)?.jurisdiccion ?? "local";
}

/** Zonas horarias de México (IANA) para elegir la del centro de trabajo. */
export const ZONAS_HORARIAS_MX: readonly { zona: string; nombre: string }[] = [
  { zona: "America/Mexico_City", nombre: "Centro (Ciudad de México, Guadalajara, Monterrey)" },
  { zona: "America/Cancun", nombre: "Sureste (Quintana Roo)" },
  { zona: "America/Chihuahua", nombre: "Chihuahua" },
  { zona: "America/Ciudad_Juarez", nombre: "Frontera norte (Ciudad Juárez)" },
  { zona: "America/Matamoros", nombre: "Frontera noreste (Matamoros, Nuevo Laredo)" },
  { zona: "America/Mazatlan", nombre: "Pacífico (Sinaloa, Nayarit, Baja California Sur)" },
  { zona: "America/Hermosillo", nombre: "Sonora" },
  { zona: "America/Tijuana", nombre: "Noroeste (Baja California)" },
];
