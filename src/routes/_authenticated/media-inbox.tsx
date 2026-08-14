import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2 } from "lucide-react";

import { DevConsoleShell } from "@/components/dev/DevConsoleShell";
import { MediaGallery } from "@/components/media/MediaGallery";
import { Button } from "@/components/ui/button";
import { PremiumCard } from "@/components/ui-kit/Section";
import { supabase } from "@/integrations/supabase/client";
import {
  MEDIA_INBOX_BUCKET,
  uploadMediaInboxFile,
} from "@/services/media-inbox.service";

export const Route = createFileRoute("/_authenticated/media-inbox")({
  component: MediaInboxPage,
});

function MediaInboxPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  async function handleFile(file?: File) {
    if (!file || uploading) return;

    setUploading(true);
    try {
      await uploadMediaInboxFile(file);
      await queryClient.invalidateQueries({
        queryKey: ["media-tree", MEDIA_INBOX_BUCKET],
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  return (
    <DevConsoleShell
      title="Viora Media Inbox"
      subtitle="העלה תמונות מהטלפון והן יופיעו כאן מיד."
    >
      <PremiumCard>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="ml-2 h-4 w-4" />
            )}
            העלה תמונה
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="ml-2 h-4 w-4" />
            צלם עכשיו
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </PremiumCard>

      {userId && (
        <MediaGallery
          title="התמונות שלי"
          bucket={MEDIA_INBOX_BUCKET}
          prefix={userId}
          columns={2}
        />
      )}
    </DevConsoleShell>
  );
}
