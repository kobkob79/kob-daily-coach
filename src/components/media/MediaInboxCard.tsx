import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { MediaGallery } from "@/components/media/MediaGallery";
import { ExerciseAssignSheet } from "@/components/media/ExerciseAssignSheet";
import type { MediaItem } from "@/services/media.service";
import {
  MEDIA_INBOX_BUCKET,
  uploadMediaInboxFile,
} from "@/services/media-inbox.service";

export function MediaInboxCard() {
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /**
   * Root cause of the "inbox looks empty until you upload" bug: the user id was
   * only resolved inside `upload()`, so the gallery (which is keyed by the
   * user's folder prefix) never mounted on first visit. Resolve it on mount.
   */
  const userQ = useQuery({
    queryKey: ["media-inbox-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const userId = userQ.data ?? null;

  useEffect(() => {
    if (userQ.isError) toast.error("לא הצלחנו לזהות את המשתמש");
  }, [userQ.isError]);

  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      if (!userId) return;
      await uploadMediaInboxFile(file);
      await qc.invalidateQueries({
        queryKey: ["media-tree", MEDIA_INBOX_BUCKET, userId],
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
          accept="image/*,video/*"
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

      {userQ.isPending && (
        <PremiumCard className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </PremiumCard>
      )}

      {userId && (
        <MediaGallery
          title="התמונות שהעליתי"
          bucket={MEDIA_INBOX_BUCKET}
          prefix={userId}
          columns={2}
          onSelectItem={setSelectedItem}
        />
      )}

      <ExerciseAssignSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  );
}
