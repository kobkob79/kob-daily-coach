import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, HeartPulse, ImageIcon, Sparkles, Users } from "lucide-react";

import { VioraLogo } from "@/components/brand/VioraLogo";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { COACH_ADVISORS, type AdvisorId, type CoachAdvisor } from "@/lib/coach-advisors";
import { cn } from "@/lib/utils";

type AdvisorStory = {
  role: string;
  themes: readonly string[];
  philosophy: readonly string[];
  tone: string;
  bio: string;
  quote: string;
};

const ADVISOR_STORIES: Record<AdvisorId, AdvisorStory> = {
  adam: {
    role: "Recovery & Healthy Lifestyle AI Advisor",
    themes: ["שינה", "התאוששות", "הרגלים", "אורח חיים"],
    philosophy: ["Safety", "Recovery", "Sustainability", "Performance"],
    tone: "רגוע, יציב, מעשי ומדויק",
    bio: "אדם מחבר בין שינה, עומס, התאוששות והרגלים יומיומיים כדי לעזור לבחור צעד בר־קיימא שמתאים ליום הנוכחי.",
    quote: "התאוששות היא לא הפסקה מההתקדמות. היא חלק ממנה.",
  },
  daniel: {
    role: "Strength & Gym AI Advisor",
    themes: ["כוח", "טכניקה", "עומס מתקדם", "ביצועים"],
    philosophy: ["Technique", "Consistency", "Progressive Overload", "Performance"],
    tone: "אנרגטי, ישיר וממוקד ביצועים",
    bio: "דניאל הופך מטרות אימון להכוונה ברורה ומעשית, עם דגש על טכניקה, עקביות והתקדמות מבוקרת.",
    quote: "כוח הוא לא מראה. הוא תהליך.",
  },
  maya: {
    role: "Movement & Sport AI Advisor",
    themes: ["תנועה", "ספורט", "אירובי", "שגרה פעילה"],
    philosophy: ["Remove Barriers", "Increase Movement", "Build Routine", "Improve Fitness"],
    tone: "דינמית, חיובית, פעילה ונגישה",
    bio: "מאיה עוזרת להפוך תנועה לחלק טבעי מהיום באמצעות הצעות נגישות שמתאימות לזמן, לאנרגיה ולסביבה.",
    quote: "תנועה נחשבת עוד לפני שהיא הופכת לאימון.",
  },
  shiran: {
    role: "Nutrition & Healthy Culinary AI Advisor",
    themes: ["תזונה", "אוכל", "הרגלים", "לייף סטייל"],
    philosophy: ["Practicality", "Sustainability", "Nutrition Quality", "Optimization"],
    tone: "מודרנית, חמה, מסוגננת ונגישה",
    bio: "שירן, בת 26, מחברת בין תזונה, קולינריה ולייף סטייל בגישה חברתית ומעשית שמתאימה לחיים האמיתיים.",
    quote: "בריא עדיין צריך להרגיש כמו החיים.",
  },
};

const BELIEFS = [
  { title: "אדם לפני אלגוריתם", body: "AI יכולה לעזור להבין ולהמליץ. האדם מחליט." },
  { title: "הכול מתחבר", body: "אימון, תזונה, תנועה והתאוששות אינם מערכות נפרדות." },
  { title: "פשוט להשתמש", body: "טכנולוגיה צריכה להפחית עומס, לא ליצור עוד אחד." },
  {
    title: "Capture once. Use everywhere.",
    body: "מידע שנוסף פעם אחת יכול לשמש את Viora בהקשרים הרלוונטיים לאורך הדרך.",
  },
] as const;

const FOUNDER_BIO = [
  "Viora התחילה משאלה די פשוטה: למה כל מה שקשור לבריאות שלנו מפוזר בין כל כך הרבה מקומות?",
  "אימון נמצא באפליקציה אחת. תזונה במקום אחר. שינה, התאוששות, מדדים, מטרות, תזכורות והיסטוריה אישית נמצאים כל אחד בעולם משלו. ובסוף, דווקא האדם שאמור להפיק מכל המידע הזה משהו שימושי נשאר לחבר לבד את הנקודות.",
  "קובי הקים את Viora מתוך רצון לבנות מערכת אחרת.",
  "מערכת שלא רק אוספת מידע, אלא מחברת אותו.",
  "מקום שבו אימון יכול להבין מה קרה בימים האחרונים, תזונה יכולה להיות חלק מהתמונה הרחבה יותר, התאוששות לא חיה בנפרד מהפעילות, והמידע שהמשתמש כבר הזין לא צריך להיאסף שוב ושוב.",
  "Capture once. Use everywhere.",
  "החזון הוא שהטכנולוגיה תעבוד מאחורי הקלעים ותפחית עומס, במקום להפוך בעצמה לעוד משימה שצריך לנהל.",
  "קובי מאמין שמערכת בריאות אישית טובה לא צריכה להגיד לאדם איך לחיות. היא צריכה לעזור לו להבין טוב יותר את עצמו, לזהות דפוסים, לקבל הקשר ולבחור את הצעד הבא בצורה חכמה יותר.",
  "Viora advises. You decide.",
  "המערכת יכולה לנתח, לחבר, להסביר ולהמליץ. ההחלטה נשארת אצל האדם.",
  "„רציתי לבנות את המערכת שהייתי רוצה להשתמש בה בעצמי.”",
  "Viora נבנית סביב הרעיון הזה: להפוך אימונים, תזונה, תנועה, התאוששות, הרגלים ומעקב אישי מחלקים נפרדים למערכת אחת שמבינה את התמונה השלמה.",
] as const;

export function AboutVioraPage() {
  const [founderExpanded, setFounderExpanded] = useState(false);
  const [selectedAdvisor, setSelectedAdvisor] = useState<CoachAdvisor | null>(null);

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Link to="/" aria-label="Viora — עמוד הבית">
          <VioraLogo className="h-8 w-auto" />
        </Link>
        <Link
          to="/auth"
          className="rounded-full border border-white/25 bg-black/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/25"
        >
          כניסה ל־Viora
        </Link>
      </header>

      <section className="relative isolate min-h-[38rem] overflow-hidden bg-[#101613] px-5 pb-12 pt-32 text-white sm:min-h-[42rem]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/.32),transparent_35%),linear-gradient(155deg,#17251e_0%,#0c1110_58%,#161816_100%)]" />
        <div className="absolute -left-24 top-40 -z-10 h-64 w-64 rounded-full border border-white/10" />
        <div className="mx-auto flex max-w-6xl flex-col justify-end gap-9 sm:min-h-[30rem] sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-primary">ABOUT VIORA</p>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
              האנשים שמאחורי Viora
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/72 sm:text-lg">
              מערכת אחת שמחברת תזונה, אימונים, תנועה, התאוששות, מעקב אישי והכוונה אישית.
            </p>
          </div>
          <div className="flex aspect-[16/9] w-full max-w-xl items-end rounded-[2rem] border border-white/12 bg-white/[0.055] p-5">
            <div>
              <Users className="mb-3 h-6 w-6 text-primary" />
              <p className="text-sm font-semibold">תמונת צוות Viora</p>
              <p className="mt-1 text-xs text-white/48">מקום שמור למדיה מאושרת</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[0.8fr_1.2fr] sm:items-start">
          <div className="aspect-[4/5] overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-primary/15 via-muted/30 to-background p-6">
            <div className="flex h-full flex-col justify-end">
              <HeartPulse className="mb-auto h-7 w-7 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Founder
              </p>
              <h2 className="mt-2 text-3xl font-black">קובי יצחקי</h2>
              <p className="mt-1 text-sm text-muted-foreground">Founder & Owner of Viora</p>
            </div>
          </div>
          <div className="sm:pt-6">
            <p className="text-lg font-semibold leading-8">{FOUNDER_BIO[0]}</p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{FOUNDER_BIO[1]}</p>
            <div
              className={cn(
                "grid transition-all",
                founderExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-4 pt-4 text-sm leading-7 text-muted-foreground">
                  {FOUNDER_BIO.slice(2).map((paragraph) => (
                    <p
                      key={paragraph}
                      className={cn(paragraph.includes("Viora") && "text-foreground")}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFounderExpanded((value) => !value)}
              className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-primary/50 text-sm font-bold text-primary"
              aria-expanded={founderExpanded}
            >
              {founderExpanded ? "סגירת הסיפור" : "הסיפור שלי"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", founderExpanded && "rotate-180")}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="border-y border-border/50 bg-muted/20 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="px-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary">VIORA ADVISORS</p>
            <h2 className="mt-2 text-3xl font-black">הכירו את צוות Viora</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              ארבע זהויות מובחנות. מערכת אחת שרואה את התמונה הרחבה.
            </p>
          </div>
          <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {COACH_ADVISORS.map((advisor) => (
              <AdvisorEditorialCard
                key={advisor.id}
                advisor={advisor}
                onOpen={() => setSelectedAdvisor(advisor)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">TEAM GALLERY</p>
          <h2 className="mt-2 text-3xl font-black">גלריית צוות Viora</h2>
          <div className="mt-7 grid min-h-64 place-items-center rounded-[2rem] border border-dashed border-border/70 bg-muted/15 px-6 text-center sm:min-h-80">
            <div className="max-w-sm">
              <ImageIcon className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-4 font-semibold">הסיפורים הוויזואליים שלנו יגיעו לכאן</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                תמונות צוות, רגעי תנועה, אימון, אוכל ולייף סטייל יתווספו לאחר אישור המדיה.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="principles" className="bg-foreground px-5 py-16 text-background sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">WHAT WE BELIEVE</p>
          <h2 className="mt-2 text-3xl font-black">במה אנחנו מאמינים</h2>
          <div className="mt-9 grid gap-px overflow-hidden rounded-[2rem] bg-background/15 sm:grid-cols-2">
            {BELIEFS.map((belief, index) => (
              <article key={belief.title} className="bg-foreground p-6 sm:p-8">
                <span className="text-xs font-semibold text-primary">0{index + 1}</span>
                <h3 className="mt-5 text-xl font-bold">{belief.title}</h3>
                <p className="mt-3 text-sm leading-6 text-background/65">{belief.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer id="ai-disclosure" className="px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-border/60 pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <VioraLogo className="h-7 w-auto" />
            <p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">
              יועצי Viora הם דמויות AI ומספקים הכוונה כללית בלבד. הם אינם אנשי מקצוע מורשים ואינם
              תחליף לייעוץ רפואי או מקצועי.
            </p>
          </div>
          <nav
            aria-label="קישורי מידע"
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground"
          >
            <a href="#principles" className="hover:text-foreground">
              עקרונות Viora
            </a>
            <a href="#ai-disclosure" className="hover:text-foreground">
              הצהרת AI
            </a>
            <Link to="/auth" className="hover:text-foreground">
              כניסה לחשבון
            </Link>
          </nav>
        </div>
      </footer>

      <AdvisorProfileSheet
        advisor={selectedAdvisor}
        onOpenChange={(open) => !open && setSelectedAdvisor(null)}
      />
    </main>
  );
}

function AdvisorEditorialCard({ advisor, onOpen }: { advisor: CoachAdvisor; onOpen: () => void }) {
  const story = ADVISOR_STORIES[advisor.id];
  return (
    <article className="w-[78vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-[1.75rem] border border-border/60 bg-background sm:w-72">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <img
          src={advisor.media.cover}
          alt={advisor.name}
          className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]"
          style={{ objectPosition: advisor.media.coverPosition }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-5 pt-16 text-white">
          <h3 className="text-2xl font-black">{advisor.name}</h3>
          <p className="mt-1 text-xs font-medium text-white/75">{story.role}</p>
        </div>
      </div>
      <div className="p-5">
        <p className="min-h-10 text-sm leading-5 text-muted-foreground">{advisor.tagline}</p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"
        >
          הכירו אותי <ArrowLeft className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function AdvisorProfileSheet({
  advisor,
  onOpenChange,
}: {
  advisor: CoachAdvisor | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!advisor) return null;
  const story = ADVISOR_STORIES[advisor.id];
  const isFemale = advisor.id === "maya" || advisor.id === "shiran";
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border-border/70 p-0 pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[28rem] sm:rounded-none sm:border-l"
      >
        <div className="relative aspect-[16/11] overflow-hidden bg-muted sm:aspect-[4/3]">
          <img
            src={advisor.media.hero}
            alt={advisor.name}
            className="h-full w-full object-cover"
            style={{ objectPosition: advisor.media.heroPosition }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/15" />
        </div>
        <div className="-mt-12 relative px-6 pb-8">
          <SheetHeader className="text-right sm:text-right">
            <div className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-background/90 px-3 py-1 text-[11px] font-bold text-primary backdrop-blur">
              <Sparkles className="h-3 w-3" /> AI Advisor של Viora
            </div>
            <SheetTitle className="text-3xl font-black">{advisor.name}</SheetTitle>
            <SheetDescription className="font-medium text-foreground/70">
              {story.role}
            </SheetDescription>
          </SheetHeader>
          <p className="mt-6 text-sm leading-7 text-muted-foreground">{story.bio}</p>
          <div className="mt-7">
            <h4 className="text-xs font-bold tracking-wide text-foreground">תחומי עניין והתמחות</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {story.themes.map((theme) => (
                <span key={theme} className="rounded-full bg-muted px-3 py-1.5 text-xs">
                  {theme}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-7">
            <h4 className="text-xs font-bold tracking-wide text-foreground">Core philosophy</h4>
            <ol className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60">
              {story.philosophy.map((item, index) => (
                <li key={item} className="bg-background p-3 text-xs">
                  <span className="ml-1 text-primary">0{index + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-7 rounded-2xl bg-muted/50 p-4">
            <p className="text-xs font-semibold">אופי</p>
            <p className="mt-1 text-sm text-muted-foreground">{story.tone}</p>
          </div>
          <blockquote className="mt-8 border-r-2 border-primary pr-4 text-lg font-semibold leading-8">
            „{story.quote}”
          </blockquote>
          <p className="mt-8 text-[11px] leading-5 text-muted-foreground">
            {advisor.name} {isFemale ? "היא" : "הוא"} דמות AI של Viora
            {isFemale ? " ומספקת" : " ומספק"} הכוונה כללית בלבד, לא ייעוץ רפואי או מקצועי.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
