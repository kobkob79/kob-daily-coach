import { createFileRoute, notFound } from "@tanstack/react-router";

import { PersonStoryPage } from "@/components/about/PersonStoryPage";
import { getAboutPerson } from "@/lib/about-people";

export const Route = createFileRoute("/about_/$person")({
  loader: ({ params }) => {
    const person = getAboutPerson(params.person);
    if (!person) throw notFound();
    return person;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — Viora` },
          { name: "description", content: loaderData.preview },
        ]
      : [{ title: "הסיפור לא נמצא — Viora" }],
  }),
  component: PersonRoute,
});

function PersonRoute() {
  const person = Route.useLoaderData();
  return <PersonStoryPage person={person} />;
}
