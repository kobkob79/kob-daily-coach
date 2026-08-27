import { useQuery } from "@tanstack/react-query";

import { ABOUT_MEDIA_CACHE_MS, type AboutMediaSubject } from "@/lib/about-media";
import { getPublishedAboutMedia } from "@/lib/about-media.functions";

export function useAboutMedia(subject?: AboutMediaSubject) {
  return useQuery({
    queryKey: ["about-media", subject ?? "all"],
    queryFn: () => getPublishedAboutMedia({ data: { subject } }),
    staleTime: ABOUT_MEDIA_CACHE_MS,
    gcTime: ABOUT_MEDIA_CACHE_MS,
    refetchInterval: ABOUT_MEDIA_CACHE_MS,
    refetchOnMount: true,
    retry: 1,
  });
}
