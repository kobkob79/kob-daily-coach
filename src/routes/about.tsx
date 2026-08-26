import { createFileRoute } from "@tanstack/react-router";

import { AboutVioraPage } from "@/components/about/AboutVioraPage";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "על Viora — האנשים, היועצים והחזון" },
      {
        name: "description",
        content:
          "הכירו את Viora, את המייסד קובי יצחקי ואת ארבעת היועצים שמחברים תזונה, אימונים, תנועה והתאוששות.",
      },
    ],
  }),
  component: AboutVioraPage,
});
