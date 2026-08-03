/**
 * Service barrel — the single import surface for data access.
 *
 *   import { profilesService, goalsService } from "@/services";
 */
export { ServiceError, requireUserId, supabase } from "./base";
export { authService } from "./auth.service";
export { profilesService } from "./profiles.service";
export { exercisesService } from "./exercises.service";
export { programsService } from "./programs.service";
export { sessionsService } from "./sessions.service";
export { measurementsService } from "./measurements.service";
export { goalsService } from "./goals.service";
export { recommendationsService } from "./recommendations.service";
export {
  mediaService,
  listMedia,
  signMedia,
  classifyMedia,
  MEDIA_PAGE_SIZE,
  SIGNED_URL_TTL,
} from "./media.service";
export type { MediaItem, MediaKind, MediaPage, ListMediaOptions } from "./media.service";
