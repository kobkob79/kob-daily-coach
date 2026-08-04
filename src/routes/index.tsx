import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LandingPage } from "@/components/landing/LandingPage";
import { landingContent } from "@/lib/landing-content";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Viora — המאמן האישי שחושב איתך" },
      { name: "description", content: landingContent.subheadline },
      { property: "og:title", content: "Viora — המאמן האישי שחושב איתך" },
      { property: "og:description", content: landingContent.subheadline },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) router.navigate({ to: "/dashboard", replace: true });
      else setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!checked) return <div className="min-h-[100dvh] bg-background" />;
  return <LandingPage />;
}
