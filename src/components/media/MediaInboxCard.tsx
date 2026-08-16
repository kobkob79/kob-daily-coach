import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import type { MediaItem } from "@/services/media.service";
import { MediaGallery } from "@/components/media/MediaGallery";
import { ExercisePicker } from "@/components/workouts/ExercisePicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MEDIA_INBOX_BUCKET,
  uploadMediaInboxFile,
} from "@/services/media-inbox.service";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
export function MediaInboxCard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [assignmentRole, setAssignmentRole] = useState<
   "thumbnail" | "main" | "demo" | null >(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  async function ensureUser() {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    setUserId(id);
    return id;
  }

  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const id = userId ?? (await ensureUser());
      if (!id) return;
      await uploadMediaInboxFile(file);
      await qc.invalidateQueries({
        queryKey: ["media-tree", MEDIA_INBOX_BUCKET, id],
      });
          } catch (error) {
      toast.error(error instanceof Error ? error.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Media Inbox"
        subtitle="העלה תמונות מהטלפון ישירות ל-Viora"
      />

      <PremiumCard className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => galleryRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="ml-2 h-4 w-4" />
            )}
            גלריה
          </Button>

          <Button
            variant="outline"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="ml-2 h-4 w-4" />
            מצלמה
          </Button>
        </div>

        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </PremiumCard>

      {userId && (
        <MediaGallery
          title="התמונות שהעליתי"
          bucket={MEDIA_INBOX_BUCKET}
          prefix={userId}
          columns={2}
          onSelectItem={(item) => setSelectedItem(item)}
        />
      )}
      <Sheet
  open={!!selectedItem}
  onOpenChange={(open) => {
    if (!open) setSelectedItem(null);
  }}
>
  <SheetContent side="bottom" dir="rtl">
    <SheetHeader>
      <SheetTitle>מה לעשות עם המדיה?</SheetTitle>
    </SheetHeader>
<div className="mt-4 grid gap-3">
  {selectedItem?.kind === "image" && (
    <>
      <Button
       onClick={() => { 
        setAssignmentRole("thumbnail");
        setPickerOpen(true);
      }}
      >
        שייך כתמונה ממוזערת
      </Button>

       <Button
        onClick={() => {
          setAssignmentRole("main");
          setPickerOpen(true);
        }}
      >
        הגדר כתמונה ראשית לתרגיל
      </Button>
    </>
  )}
 {selectedItem?.kind === "video" && (
    <Button
      onClick={() => {
        setAssignmentRole("demo");
        setPickerOpen(true);
      }}
    >
      שייך כסרטון הדגמה לתרגיל
    </Button>
  )}

</div>
  </SheetContent>
</Sheet>

<ExercisePicker
  open={pickerOpen}
  onClose={() => setPickerOpen(false)}
 onSelect={(exerciseId) => {
  setSelectedExerciseId(exerciseId);
  setPickerOpen(false);
 }}
  title="בחר תרגיל לשיוך המדיה"
/>

<AlertDialog
  open={!!selectedExerciseId}
  onOpenChange={(open) => {
    if (!open) setSelectedExerciseId(null);
  }}
>
  <AlertDialogContent dir="rtl">
    <AlertDialogHeader>
      <AlertDialogTitle>אישור שיוך מדיה</AlertDialogTitle>

      <AlertDialogDescription>
        לשייך את המדיה לתרגיל שנבחר כ־
        {assignmentRole === "thumbnail"
          ? "תמונה ממוזערת"
          : assignmentRole === "main"
            ? "תמונה ראשית"
            : "סרטון הדגמה"}
        ?
      </AlertDialogDescription>
    </AlertDialogHeader>

    <AlertDialogFooter>
      <AlertDialogCancel>ביטול</AlertDialogCancel>

      <AlertDialogAction
        onClick={() => {
          console.log("Confirmed exercise:", selectedExerciseId);
          console.log("Confirmed role:", assignmentRole);
          setSelectedExerciseId(null);
        }}
      >
        אישור
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

</section>

  );
}
