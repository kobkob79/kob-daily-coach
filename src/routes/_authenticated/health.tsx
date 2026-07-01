import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { today } from "@/lib/date";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/health")({
  component: HealthPage,
});

const AREAS = [
  { value: "neck", label: "Neck" },
  { value: "sciatica", label: "Sciatica" },
  { value: "ac_joint", label: "AC Joint" },
  { value: "general", label: "General" },
] as const;

function HealthPage() {
  const qc = useQueryClient();
  const [area, setArea] = useState<typeof AREAS[number]["value"]>("neck");
  const [pain, setPain] = useState("3");
  const [mobility, setMobility] = useState("7");
  const [exercisesDone, setExercisesDone] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today());

  const logsQ = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("health_logs").select("*").order("date", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  const addLog = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { error } = await supabase.from("health_logs").insert({
        user_id: userRes.user.id,
        date,
        area,
        pain_level: Number(pain),
        mobility_score: Number(mobility),
        exercises_done: exercisesDone || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["health"] });
      setExercisesDone(""); setNotes("");
      toast.success("Logged");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("health_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Health tracking</h1>
        <p className="text-sm text-muted-foreground">Neck · Sciatica · AC joint · general.</p>
      </div>

      <div className="surface-card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Area</Label>
            <Select value={area} onValueChange={(v) => setArea(v as typeof area)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <SliderRow label="Pain" hint="0 none · 10 severe" value={pain} onChange={setPain} accent="destructive" />
        <SliderRow label="Mobility" hint="0 stuck · 10 full" value={mobility} onChange={setMobility} accent="success" />
        <div>
          <Label>Exercises done</Label>
          <Input placeholder="Chin tucks, McKenzie…" value={exercisesDone} onChange={(e) => setExercisesDone(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button onClick={() => addLog.mutate()} disabled={addLog.isPending} className="w-full">
          <Plus className="mr-1 h-4 w-4" /> Log check
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
        <div className="surface-card divide-y divide-border">
          {logsQ.data?.length ? logsQ.data.map((l) => (
            <div key={l.id} className="flex items-start justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium capitalize">{l.area.replace("_", " ")} <span className="text-xs text-muted-foreground">· {format(new Date(l.date), "EEE d MMM")}</span></p>
                <p className="text-xs text-muted-foreground">
                  Pain <b className="text-destructive">{l.pain_level}</b>/10 · Mobility <b className="text-success">{l.mobility_score}</b>/10
                </p>
                {l.notes && <p className="text-xs mt-1 text-muted-foreground truncate">{l.notes}</p>}
              </div>
              <button onClick={() => remove.mutate(l.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">No logs yet.</p>}
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, hint, value, onChange, accent }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; accent: "destructive" | "success";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}: <span className={accent === "destructive" ? "text-destructive font-bold" : "text-success font-bold"}>{value}</span>/10</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}
