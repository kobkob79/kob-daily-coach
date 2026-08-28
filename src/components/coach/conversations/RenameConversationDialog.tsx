import { type FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RenameConversationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onRename: (newTitle: string) => Promise<void>;
}

export function RenameConversationDialog({
  isOpen,
  onOpenChange,
  currentTitle,
  onRename,
}: RenameConversationDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
    }
  }, [isOpen, currentTitle]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle === currentTitle) {
      onOpenChange(false);
      return;
    }

    setIsLoading(true);
    try {
      await onRename(cleanTitle);
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>שינוי שם השיחה</DialogTitle>
          <DialogDescription>בחרו שם חדש לשיחה זו שיופיע ברשימת השיחות.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="שם השיחה"
            autoFocus
            disabled={isLoading}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              שמירה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
