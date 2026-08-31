import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_DELETION_CHALLENGE, accountDeletionErrorMessage } from "@/lib/account-deletion";
import { deleteMyAccountServer } from "@/lib/account-deletion.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AccountDeletionSection() {
  const queryClient = useQueryClient();
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [pending, setPending] = useState(false);

  const deleteAccount = async () => {
    if (submitting.current || challenge.trim() !== ACCOUNT_DELETION_CHALLENGE) return;
    submitting.current = true;
    setPending(true);
    try {
      const result = await deleteMyAccountServer({
        data: { requestId: requestId.current, challenge },
      });
      if (result.status === "error") {
        toast.error(accountDeletionErrorMessage(result.error.code));
        return;
      }

      queryClient.clear();
      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        window.location.replace("/auth");
      }
    } catch {
      toast.error("לא הצלחנו למחוק את החשבון. החשבון נשאר פעיל ואפשר לנסות שוב.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="account-deletion-title">
      <div>
        <h2 id="account-deletion-title" className="text-sm font-semibold text-destructive">
          מחיקת חשבון
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          מחיקת החשבון מסירה את הפרופיל, הפעילות, השיחות והקבצים האישיים שלך. הפעולה בלתי הפיכה.
        </p>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (next) {
            requestId.current = crypto.randomUUID();
            setChallenge("");
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="w-full sm:w-auto">
            <Trash2 className="ml-2 h-4 w-4" /> מחיקת החשבון שלי
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir="rtl" className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>למחוק את החשבון לצמיתות?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right leading-6">
              <span className="block">לא ניתן לשחזר את החשבון או את הנתונים לאחר המחיקה.</span>
              <span className="block">
                לאישור, הקלד/י <strong className="text-foreground">מחק</strong>.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={challenge}
            onChange={(event) => setChallenge(event.target.value)}
            disabled={pending}
            autoComplete="off"
            aria-label="הקלדת אישור למחיקת החשבון"
            placeholder="מחק"
            dir="rtl"
          />
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={pending}>ביטול</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || challenge.trim() !== ACCOUNT_DELETION_CHALLENGE}
              onClick={deleteAccount}
            >
              {pending ? "מוחק את החשבון…" : "מחיקה סופית"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
