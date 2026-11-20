import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/supabase/env.ts";

// Se indexa lo público; el producto (panel, PWA, API, enlaces con token) no.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/panel",
        "/app",
        "/api",
        "/onboarding",
        "/inspector",
        "/verificar",
        "/invitacion",
        "/aviso",
        "/reportes",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
