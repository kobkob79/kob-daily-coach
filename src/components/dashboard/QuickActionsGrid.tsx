/**
 * Quick Actions — large rounded shortcuts to the main modules.
 */
import { Link } from "@tanstack/react-router";
import { Dumbbell, CalendarDays, TrendingUp, Utensils } from "lucide-react";

const ACTIONS = [
  { to: "/workouts", label: "אימונים", icon: Dumbbell, tint: "bg-primary/12 text-primary" },
  { to: "/workouts/program", label: "מתכנן", icon: CalendarDays, tint: "bg-accent/20 text-accent" },
  { to: "/progress", label: "התקדמות", icon: TrendingUp, tint: "bg-sky-500/15 text-sky-300" },
  { to: "/nutrition", label: "תזונה", icon: Utensils, tint: "bg-orange-500/15 text-orange-300" },
] as const;

export function QuickActionsGrid() {
  return (
    <section className="animate-stagger">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold tracking-tight">פעולות מהירות</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="block">
            <div className="glass-tile flex items-center gap-3 p-4 transition-all duration-300 active:scale-[0.98]">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${a.tint}`}>
                <a.icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <span className="text-[14px] font-semibold">{a.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
