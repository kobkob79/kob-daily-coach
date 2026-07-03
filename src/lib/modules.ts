/**
 * Module registry — declares present + upcoming product surfaces so the shell,
 * navigation, and dashboard can render coming-soon states without hardcoding
 * feature flags in every screen.
 *
 * Adding a new module later = flip `status` to "live" and (optionally) point
 * `route` at the new file-based route.
 */
import type { LucideIcon } from "lucide-react";
import {
  Dumbbell,
  Apple,
  HeartPulse,
  CalendarClock,
  LineChart,
  FolderHeart,
  Camera,
  History,
  Sparkles,
  LayoutDashboard,
  Droplet,
} from "lucide-react";

export type ModuleStatus = "live" | "beta" | "coming-soon";

export interface AppModule {
  id: string;
  labelKey: string; // i18n key
  route?: string;
  icon: LucideIcon;
  status: ModuleStatus;
  description?: string;
}

export const MODULES: AppModule[] = [
  { id: "home", labelKey: "nav.home", route: "/dashboard", icon: LayoutDashboard, status: "live" },
  { id: "workouts", labelKey: "nav.train", route: "/workouts", icon: Dumbbell, status: "live" },
  { id: "meals", labelKey: "nav.meals", route: "/meals", icon: Apple, status: "live" },
  { id: "hydration", labelKey: "nav.hydration", route: "/hydration", icon: Droplet, status: "live" },
  { id: "health", labelKey: "nav.health", route: "/health", icon: HeartPulse, status: "live" },
  { id: "shift", labelKey: "nav.shift", route: "/shift", icon: CalendarClock, status: "live" },
  { id: "progress", labelKey: "nav.trend", route: "/progress", icon: LineChart, status: "live" },

  // Prepared surfaces — no routes yet, exposed via the registry so future work
  // wires them into the shell without touching call sites.
  { id: "workout-engine", labelKey: "module.workoutEngine", icon: Dumbbell, status: "coming-soon" },
  { id: "medical-vault", labelKey: "module.medicalVault", icon: FolderHeart, status: "coming-soon" },
  { id: "progress-photos", labelKey: "module.progressPhotos", icon: Camera, status: "coming-soon" },
  { id: "timeline", labelKey: "module.timeline", icon: History, status: "coming-soon" },
  { id: "ai-companion", labelKey: "module.aiCompanion", icon: Sparkles, status: "coming-soon" },
];

export const liveModules = () => MODULES.filter((m) => m.status === "live");
export const upcomingModules = () => MODULES.filter((m) => m.status !== "live");
