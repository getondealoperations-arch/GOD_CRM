import type { MetadataRoute } from "next";

// Makes the CRM installable ("Install app" / "Add to Home screen") and is the source for the Android app (TWA).
// It opens on the employee sign-in; someone already signed in is sent straight to "My work" by that page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GetOnDeal CRM",
    short_name: "GetOnDeal",
    description: "Leads, calls and follow-ups for the Get On Deal team",
    id: "/employee/login",
    start_url: "/employee/login",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#021d52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
