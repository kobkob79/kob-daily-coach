/**
 * Registry of Viora's internal Developer Console modules.
 *
 * Adding a future internal tool = one entry here + one route file under
 * `src/routes/_authenticated/dev.*`. Nothing else in the console needs to
 * change: the launcher grid and the module switcher both render this array.
 */
import {
  Activity,
  Beaker,
  Bot,
  Database,
  Dumbbell,
  FolderTree,
  Images,
  Megaphone,
  ShieldCheck,
  Video,
  type LucideIcon,
} from "lucide-react";

export type DevModuleStatus = "ready" | "planned";

export interface DevModule {
  id: string;
  /** Hebrew title shown in the console. */
  title: string;
  description: string;
  icon: LucideIcon;
  /** Route path; only meaningful for `ready` modules. */
  to?: string;
  status: DevModuleStatus;
}

export const DEV_MODULES: readonly DevModule[] = [
  {
    id: "character-assets",
    title: "נכסי דמויות",
    description: "עיון בנכסי הדמויות מהאחסון לפי דמות וקטגוריה",
    icon: Images,
    to: "/dev/characters",
    status: "ready",
  },
  {
    id: "exercise-assets",
    title: "נכסי תרגילים",
    description: "מדיה של תרגילים ותנועות",
    icon: Dumbbell,
    status: "planned",
  },
  {
    id: "marketing-assets",
    title: "נכסי שיווק",
    description: "באנרים, קמפיינים וחומרי שיווק",
    icon: Megaphone,
    status: "planned",
  },
  {
    id: "video-assets",
    title: "נכסי וידאו",
    description: "קליפים, אינטרו וסרטוני הדרכה",
    icon: Video,
    status: "planned",
  },
  {
    id: "prompt-playground",
    title: "מעבדת פרומפטים",
    description: "בדיקת פרומפטים של המאמן החכם",
    icon: Beaker,
    status: "planned",
  },
  {
    id: "storage-explorer",
    title: "סייר אחסון",
    description: "עיון בכל הדליים והתיקיות באחסון",
    icon: FolderTree,
    status: "planned",
  },
  {
    id: "qa-dashboard",
    title: "לוח QA",
    description: "איפוסים, סימולציות ונתוני דמו",
    icon: ShieldCheck,
    status: "planned",
  },
  {
    id: "ai-playground",
    title: "מעבדת AI",
    description: "הרצת מודלים ובדיקת תשובות",
    icon: Bot,
    status: "planned",
  },
  {
    id: "database-explorer",
    title: "סייר נתונים",
    description: "עיון בטבלאות ובנתוני המשתמש",
    icon: Database,
    status: "planned",
  },
  {
    id: "system-health",
    title: "בריאות המערכת",
    description: "סטטוס שירותים, שגיאות וזמני תגובה",
    icon: Activity,
    status: "planned",
  },
];

/**
 * Build-time gate. In a production build this is false, so the console
 * renders a neutral "unavailable" screen and its heavy modules are never
 * imported. `VITE_ENABLE_DEV_CONSOLE=true` re-opens it for preview testing.
 */
export function isDevConsoleEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env['VITE_ENABLE_DEV_CONSOLE'] === "true"
  );
}

export const DEV_CONSOLE_TITLE = "קונסולת מפתחים";
