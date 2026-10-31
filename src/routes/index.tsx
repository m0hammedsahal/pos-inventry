import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/pos" });
  },
  head: () => ({
    meta: [
      { title: "Malba Ree — POS & Inventory" },
      {
        name: "description",
        content: "GST billing, menu, kitchen stock, staff and reports for your cafe.",
      },
      { property: "og:title", content: "Malba Ree — POS & Inventory" },
      {
        property: "og:description",
        content: "GST billing, menu, kitchen stock, staff and reports for your cafe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
