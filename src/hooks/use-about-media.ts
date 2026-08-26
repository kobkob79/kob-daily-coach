import { useQuery } from "@tanstack/react-query";

import { fetchPublishedAboutMedia, type AboutMediaSubject } from "@/lib/about-media";

export function useAboutMedia(subject?: AboutMediaSubject) {
  return useQuery({
    queryKey: ["about-media", subject ?? "all"],
    queryFn: () => fetchPublishedAboutMedia(subject),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
