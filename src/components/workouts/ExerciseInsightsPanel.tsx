import { useEffect, useId, useState } from "react";
import { LockKeyhole, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EXERCISE_INSIGHT_CATEGORIES,
  EXERCISE_INSIGHT_CATEGORY_LABELS,
  EXERCISE_INSIGHT_MAX_LENGTH,
  validateExerciseInsightText,
  type ExerciseInsight,
  type ExerciseInsightCategory,
} from "@/lib/exercise-insights";

interface ExerciseInsightsPanelProps {
  exerciseName: string;
  insights: readonly ExerciseInsight[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: { category: ExerciseInsightCategory; text: string }) => void;
  onEdit: (insight: ExerciseInsight) => void;
  onDelete: (insightId: string) => void;
}

interface EditorState {
  id: string | null;
  category: ExerciseInsightCategory;
  text: string;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  category: "machine_setup",
  text: "",
};

export function ExerciseInsightsPanel({
  exerciseName,
  insights,
  open,
  onOpenChange,
  onAdd,
  onEdit,
  onDelete,
}: ExerciseInsightsPanelProps) {
  const editorLabelId = useId();
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditor(EMPTY_EDITOR);
      setError(null);
    }
  }, [open]);

  const submit = () => {
    const result = validateExerciseInsightText(editor.text);
    if (!result.valid) {
      setError(result.error);
      return;
    }

    if (editor.id) {
      onEdit({ id: editor.id, category: editor.category, text: result.value });
    } else {
      onAdd({ category: editor.category, text: result.value });
    }
    setEditor(EMPTY_EDITOR);
    setError(null);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="h-12 w-full rounded-2xl">
          <LockKeyhole className="ml-2 h-4 w-4" aria-hidden />
          התובנות שלי
        </Button>
      </DrawerTrigger>
      <DrawerContent
        dir="rtl"
        className="max-h-[92dvh] rounded-t-3xl border-border/60 outline-none"
      >
        <div className="mx-auto flex w-full max-w-lg min-h-0 flex-1 flex-col">
          <DrawerHeader className="shrink-0 text-right">
            <DrawerTitle className="text-xl">התובנות שלי · {exerciseName}</DrawerTitle>
            <DrawerDescription className="flex items-center justify-start gap-1.5">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
              רק אני רואה את המידע הזה
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
              תצוגת פיתוח — המידע אינו נשמר עדיין
            </div>

            <section aria-label="תובנות שמורות" className="space-y-2">
              {insights.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center">
                  <p className="font-medium">עדיין אין תובנות לתרגיל הזה</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    אפשר להוסיף התאמה, משקל או דגש שחשוב לזכור בפעם הבאה.
                  </p>
                </div>
              ) : (
                insights.map((insight) => (
                  <article
                    key={insight.id}
                    className="rounded-2xl border border-border/60 bg-card/60 p-3"
                  >
                    <p className="text-xs font-semibold text-primary">
                      {EXERCISE_INSIGHT_CATEGORY_LABELS[insight.category]}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {insight.text}
                    </p>
                    <div className="mt-2 flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        aria-label={`עריכת התובנה: ${insight.text}`}
                        onClick={() => {
                          setEditor(insight);
                          setError(null);
                        }}
                      >
                        <Pencil className="ml-1 h-4 w-4" aria-hidden /> עריכה
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 text-destructive hover:text-destructive"
                        aria-label={`מחיקת התובנה: ${insight.text}`}
                        onClick={() => {
                          onDelete(insight.id);
                          if (editor.id === insight.id) setEditor(EMPTY_EDITOR);
                        }}
                      >
                        <Trash2 className="ml-1 h-4 w-4" aria-hidden /> מחיקה
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </section>

            <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/15 p-3">
              <div>
                <Label htmlFor={`${editorLabelId}-category`}>קטגוריה</Label>
                <Select
                  value={editor.category}
                  onValueChange={(value: ExerciseInsightCategory) =>
                    setEditor((current) => ({ ...current, category: value }))
                  }
                >
                  <SelectTrigger id={`${editorLabelId}-category`} className="mt-1 h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {EXERCISE_INSIGHT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {EXERCISE_INSIGHT_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${editorLabelId}-text`}>מה חשוב לזכור?</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {editor.text.length}/{EXERCISE_INSIGHT_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  id={`${editorLabelId}-text`}
                  value={editor.text}
                  maxLength={EXERCISE_INSIGHT_MAX_LENGTH}
                  rows={3}
                  className="mt-1 min-h-24 resize-none"
                  placeholder="לדוגמה: גובה כיסא: 4"
                  aria-invalid={!!error}
                  aria-describedby={error ? `${editorLabelId}-error` : undefined}
                  onChange={(event) => {
                    setEditor((current) => ({ ...current, text: event.target.value }));
                    setError(null);
                  }}
                />
                {error && (
                  <p
                    id={`${editorLabelId}-error`}
                    role="alert"
                    className="mt-1 text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" className="min-h-11 flex-1" onClick={submit}>
                  {editor.id ? (
                    <Pencil className="ml-1 h-4 w-4" />
                  ) : (
                    <Plus className="ml-1 h-4 w-4" />
                  )}
                  {editor.id ? "שמירת שינוי" : "הוספת תובנה"}
                </Button>
                {editor.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setEditor(EMPTY_EDITOR);
                      setError(null);
                    }}
                  >
                    ביטול
                  </Button>
                )}
              </div>
            </section>
          </div>

          <DrawerFooter className="shrink-0 border-t border-border/60 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                סגירה
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
