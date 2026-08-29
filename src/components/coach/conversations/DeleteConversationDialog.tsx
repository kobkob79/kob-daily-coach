import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteConversationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConversationDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: DeleteConversationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>מחיקת שיחה</DialogTitle>
          <DialogDescription>
            השיחה תוסר מרשימת השיחות ולא תהיה זמינה עוד באפליקציה.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            ביטול
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            מחיקה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
