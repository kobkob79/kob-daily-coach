import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { MediaGallery } from "@/components/media/MediaGallery";
import {
  MEDIA_INBOX_BUCKET,
  uploadMediaInboxFile,
} from "@/services/media-inbox.service";

export function MediaInboxCard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
        />
      )}
    </section>
  );
}
