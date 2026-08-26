import { Link } from "@tanstack/react-router";
import { ArrowLeft, HeartPulse } from "lucide-react";
import { VioraLogo } from "@/components/brand/VioraLogo";
import { ABOUT_PEOPLE, type AboutPerson } from "@/lib/about-people";

const BELIEFS = [
  { title: "אדם לפני אלגוריתם", body: "המערכת יכולה לעזור להבין ולהמליץ. האדם מחליט." },
  { title: "הכול מתחבר", body: "אימון, תזונה, תנועה והתאוששות אינם מערכות נפרדות." },
  { title: "פשוט להשתמש", body: "טכנולוגיה צריכה להפחית עומס, לא ליצור עוד אחד." },
  {
    title: "Capture once. Use everywhere.",
    body: "מידע שנוסף פעם אחת יכול לשרת את ההקשרים הרלוונטיים לאורך הדרך.",
  },
] as const;

export function AboutVioraPage() {
  const founder = ABOUT_PEOPLE[0];
  const advisors = ABOUT_PEOPLE.slice(1);
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Link to="/" aria-label="Viora — עמוד הבית">
          <VioraLogo className="h-8 w-8 rounded-xl" />
        </Link>
        <Link
          to="/auth"
          className="rounded-full border border-white/25 bg-black/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm"
        >
          כניסה ל־Viora
        </Link>
      </header>
      <section className="relative isolate min-h-[34rem] overflow-hidden bg-[#101613] px-5 pb-12 pt-32 text-white sm:min-h-[40rem]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/.32),transparent_35%),linear-gradient(155deg,#17251e_0%,#0c1110_58%,#161816_100%)]" />
        <div className="absolute -left-24 top-40 -z-10 h-64 w-64 rounded-full border border-white/10" />
        <div className="mx-auto flex min-h-[24rem] max-w-6xl items-end">
          <div className="max-w-xl">
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-primary">ABOUT VIORA</p>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
              האנשים שמאחורי Viora
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/72 sm:text-lg">
              מערכת אחת שמחברת תזונה, אימונים, תנועה, התאוששות, מעקב אישי והכוונה אישית.
            </p>
          </div>
        </div>
      </section>
      <section className="px-5 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[0.8fr_1.2fr] sm:items-center">
          <div className="aspect-[4/5] overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-primary/15 via-muted/30 to-background p-6">
            <div className="flex h-full flex-col justify-end">
              <HeartPulse className="mb-auto h-7 w-7 text-primary" />
              <p className="text-xs font-semibold tracking-[0.18em] text-primary">FOUNDER</p>
              <h2 className="mt-2 text-3xl font-black">{founder.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{founder.role}</p>
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold leading-8">{founder.lead}</p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{founder.preview}</p>
            <StoryLink person={founder} />
          </div>
        </div>
      </section>
      <section className="border-y border-border/50 bg-muted/20 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="px-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary">VIORA ADVISORS</p>
            <h2 className="mt-2 text-3xl font-black">הכירו את צוות Viora</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              ארבע גישות מובחנות. מערכת אחת שרואה את התמונה הרחבה.
            </p>
          </div>
          <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {advisors.map((person) => (
              <PersonCard key={person.slug} person={person} />
            ))}
          </div>
        </div>
      </section>
      <section className="px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">TEAM GALLERY</p>
          <h2 className="mt-2 text-3xl font-black">גלריית צוות Viora</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
            הגלריה תיפתח כאשר יהיו זמינים נכסי צוות מאושרים. עד אז אנחנו שומרים את הבמה לסיפורים
            אמיתיים בלבד.
          </p>
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
      <footer className="px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-border/60 pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <VioraLogo className="h-7 w-7 rounded-lg" />
            <p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">
              Viora מספקת הכוונה כללית ומידע אישי בהקשר רחב. ההחלטה נשארת תמיד אצל האדם.
            </p>
          </div>
          <nav
            aria-label="קישורי מידע"
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground"
          >
            <a href="#principles" className="hover:text-foreground">
              עקרונות Viora
            </a>
            <Link to="/auth" className="hover:text-foreground">
              כניסה לחשבון
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function StoryLink({ person }: { person: AboutPerson }) {
  return (
    <Link
      to="/about/$person"
      params={{ person: person.slug }}
      className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-primary/50 text-sm font-bold text-primary"
    >
      הסיפור המלא <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

function PersonCard({ person }: { person: AboutPerson }) {
  const cover = person.image?.replace("-hero", "-cover");
  return (
    <article className="w-[78vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-[1.75rem] border border-border/60 bg-background sm:w-72">
      {cover && (
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          <img
            src={cover}
            alt={person.name}
            className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]"
            style={{ objectPosition: person.imagePosition }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-5 pt-16 text-white">
            <h3 className="text-2xl font-black">{person.name}</h3>
            <p className="mt-1 text-xs font-medium text-white/75">{person.role}</p>
          </div>
        </div>
      )}
      <div className="p-5">
        {!cover && (
          <>
            <h3 className="text-2xl font-black">{person.name}</h3>
            <p className="mt-1 text-xs font-medium text-primary">{person.role}</p>
          </>
        )}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{person.preview}</p>
        <StoryLink person={person} />
      </div>
    </article>
  );
}
