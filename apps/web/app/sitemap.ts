import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/supabase/env.ts";

// Solo las páginas públicas pensadas para buscadores.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/registro`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/terminos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
