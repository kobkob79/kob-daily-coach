/**
 * Nutrition hub — "ארוחות" and "שתייה" together under one bottom-nav tab.
 * Each tab renders the real, already-working page component directly (no
 * duplicated logic) — this file is just the tabbed shell around them.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MealsPage } from "./meals";
import { HydrationPage } from "./hydration";

type NutritionTab = "meals" | "hydration";

export const Route = createFileRoute("/_authenticated/nutrition")({
  validateSearch: (s: Record<string, unknown>): { tab: NutritionTab } => ({
    tab: s.tab === "hydration" ? "hydration" : "meals",
  }),
  component: NutritionHubPage,
});

function NutritionHubPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div dir="rtl" className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as NutritionTab } })}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="meals">ארוחות</TabsTrigger>
          <TabsTrigger value="hydration">שתייה</TabsTrigger>
        </TabsList>
        <TabsContent value="meals" className="mt-4">
          <MealsPage />
        </TabsContent>
        <TabsContent value="hydration" className="mt-4">
          <HydrationPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
