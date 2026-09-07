/**
 * Community ("הקהילה") v1 — a public-within-app feed: text/photo posts from
 * every signed-in user, newest first. No likes/comments/shared-workout
 * attachments yet - see supabase/migrations/20260906120000_community_posts.sql
 * for what's deliberately deferred and why.
 *
 * Reads/writes go straight through the Supabase client with RLS (same shape
 * as hydration.tsx/meals.tsx) - no server function needed since every rule
 * here (public read, own-row write) is expressible as a plain RLS policy.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, Heart, ImagePlus, Loader2, Send, Trash2, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  COMMUNITY_POST_MAX_BODY_LENGTH,
  communityAuthorInitials,
  validatePostDraft,
} from "@/lib/community-posts";
import {
  getPostLikeState,
  summarizeLikes,
  type LikeRow,
  type PostLikeState,
} from "@/lib/community-likes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/community")({
  component: CommunityPage,
});

// The generated Database types do not yet include `community_posts`
// (provisioned by migration 20260906120000_community_posts.sql), so these
// queries go through a loosely typed handle until the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const PHOTO_BUCKET = "community-post-photos";
const PROFILE_PHOTO_BUCKET = "profile-photos";
const FEED_LIMIT = 50;

type CommunityPost = {
  id: string;
  user_id: string;
  author_display_name: string;
  body: string;
  photo_path: string | null;
  author_avatar_path: string | null;
  created_at: string;
};

function CommunityPage() {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userQ = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const profileQ = useQuery({
    queryKey: ["profile", "community-author"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,avatar_url")
        .maybeSingle();
      return { displayName: data?.display_name ?? null, avatarPath: data?.avatar_url ?? null };
    },
  });

  const postsQ = useQuery({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const { data, error } = await db
        .from("community_posts")
        .select("id,user_id,author_display_name,body,photo_path,author_avatar_path,created_at")
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as CommunityPost[];
    },
  });

  const postIds = (postsQ.data ?? []).map((p) => p.id);

  const likesQ = useQuery({
    queryKey: ["community-post-likes", postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [] as LikeRow[];
      const { data, error } = await db
        .from("community_post_likes")
        .select("post_id,user_id")
        .in("post_id", postIds);
      if (error) throw error;
      return (data ?? []) as LikeRow[];
    },
    enabled: postIds.length > 0,
  });

  const likeSummary = summarizeLikes(likesQ.data ?? [], userQ.data ?? undefined);

  const toggleLike = useMutation({
    mutationFn: async (post: CommunityPost) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("יש להתחבר מחדש");
      const { likedByMe } = getPostLikeState(likeSummary, post.id);
      if (likedByMe) {
        const { error } = await db
          .from("community_post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", u.user.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("community_post_likes")
          .insert({ post_id: post.id, user_id: u.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-post-likes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const photoPaths = (postsQ.data ?? [])
    .flatMap((p) => [p.photo_path, p.author_avatar_path])
    .filter((p): p is string => Boolean(p));

  const photoUrlsQ = useQuery({
    queryKey: ["community-post-photo-urls", photoPaths],
    queryFn: async () => {
      if (photoPaths.length === 0) return new Map<string, string>();
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(photoPaths, 3600);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.signedUrl && !row.error) map.set(row.path ?? "", row.signedUrl);
      }
      return map;
    },
    enabled: photoPaths.length > 0,
  });

  const clearComposer = () => {
    setBody("");
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createPost = useMutation({
    mutationFn: async () => {
      const validation = validatePostDraft({ body, hasPhoto: Boolean(photoFile) });
      if (!validation.ok) throw new Error(validation.error);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("יש להתחבר מחדש");

      let photoPath: string | null = null;
      if (photoFile) {
        const dot = photoFile.name.lastIndexOf(".");
        const ext = dot > 0 ? photoFile.name.slice(dot + 1) : "jpg";
        const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photoFile, {
          contentType: photoFile.type,
          upsert: false,
        });
        if (error) throw error;
        photoPath = path;
      }

      // Snapshot the current profile photo into the already-public post-photos
      // bucket, since profile-photos itself is owner-scoped (no other user
      // could resolve a signed URL for it). Best-effort: a failed copy posts
      // without an avatar rather than blocking the whole post.
      let authorAvatarPath: string | null = null;
      const profileAvatarPath = profileQ.data?.avatarPath;
      if (profileAvatarPath) {
        try {
          const { data: avatarBlob, error: downloadError } = await supabase.storage
            .from(PROFILE_PHOTO_BUCKET)
            .download(profileAvatarPath);
          if (downloadError || !avatarBlob) throw downloadError ?? new Error("empty avatar blob");
          const dot = profileAvatarPath.lastIndexOf(".");
          const ext = dot > 0 ? profileAvatarPath.slice(dot + 1) : "jpg";
          const avatarPath = `${u.user.id}/avatar-${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(avatarPath, avatarBlob, {
              contentType: avatarBlob.type || "image/jpeg",
              upsert: false,
            });
          if (uploadError) throw uploadError;
          authorAvatarPath = avatarPath;
        } catch (avatarError) {
          console.error("community post avatar snapshot failed", avatarError);
        }
      }

      const { error } = await db.from("community_posts").insert({
        user_id: u.user.id,
        author_display_name: profileQ.data?.displayName?.trim() || "משתמש",
        body: body.trim(),
        photo_path: photoPath,
        author_avatar_path: authorAvatarPath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הפוסט פורסם");
      clearComposer();
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePost = useMutation({
    mutationFn: async (post: CommunityPost) => {
      const { error } = await db.from("community_posts").delete().eq("id", post.id);
      if (error) throw error;
      const objectsToRemove = [post.photo_path, post.author_avatar_path].filter((p): p is string =>
        Boolean(p),
      );
      if (objectsToRemove.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .remove(objectsToRemove);
        // The post row is already gone at this point; a failed photo cleanup
        // shouldn't block that or re-surface as "delete failed" to the user,
        // but it must not be silently lost either — it leaves an orphaned
        // object in the bucket that needs a look.
        if (storageError) console.error("community post photo cleanup failed", storageError);
      }
    },
    onSuccess: () => {
      toast.success("הפוסט נמחק");
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const posts = postsQ.data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="סגור"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">הקהילה</h1>
          <p className="text-xs text-muted-foreground">פיד ציבורי לשיתוף אימונים, ארוחות ורגעים</p>
        </div>
      </div>

      <PremiumCard className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="מה קורה אצלך היום?"
          className="min-h-[80px] resize-none text-right"
          maxLength={COMMUNITY_POST_MAX_BODY_LENGTH}
        />
        {photoPreview && (
          <div className="relative inline-block">
            <img
              src={photoPreview}
              alt=""
              className="max-h-48 rounded-2xl border border-border/60 object-cover"
            />
            <button
              type="button"
              onClick={() => onPickPhoto(null)}
              className="absolute -top-2 -left-2 grid h-7 w-7 place-items-center rounded-full bg-background text-foreground shadow-soft"
              aria-label="הסר תמונה"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            תמונה
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={createPost.isPending || (!body.trim() && !photoFile)}
            onClick={() => createPost.mutate()}
          >
            {createPost.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            פרסם
          </Button>
        </div>
      </PremiumCard>

      <section>
        <SectionHeader
          title="הפיד"
          subtitle={posts.length ? `${posts.length} פוסטים` : undefined}
        />
        {postsQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">טוען...</p>
        ) : posts.length === 0 ? (
          <PremiumCard className="p-0">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="עוד אין פוסטים"
              hint="היו הראשונים לשתף משהו עם הקהילה."
            />
          </PremiumCard>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                photoUrl={post.photo_path ? photoUrlsQ.data?.get(post.photo_path) : undefined}
                avatarUrl={
                  post.author_avatar_path
                    ? photoUrlsQ.data?.get(post.author_avatar_path)
                    : undefined
                }
                isOwn={Boolean(userQ.data) && post.user_id === userQ.data}
                onDelete={() => deletePost.mutate(post)}
                deleting={deletePost.isPending && deletePost.variables?.id === post.id}
                likeState={getPostLikeState(likeSummary, post.id)}
                onToggleLike={() => toggleLike.mutate(post)}
                likeToggling={toggleLike.isPending && toggleLike.variables?.id === post.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PostCard({
  post,
  photoUrl,
  avatarUrl,
  isOwn,
  onDelete,
  deleting,
  likeState,
  onToggleLike,
  likeToggling,
}: {
  post: CommunityPost;
  photoUrl: string | undefined;
  avatarUrl: string | undefined;
  isOwn: boolean;
  onDelete: () => void;
  deleting: boolean;
  likeState: PostLikeState;
  onToggleLike: () => void;
  likeToggling: boolean;
}) {
  return (
    <PremiumCard className={cn("space-y-3", deleting && "opacity-50")}>
      <div className="flex items-start gap-3">
        <Link
          to="/u/$userId"
          params={{ userId: post.user_id }}
          className="flex min-w-0 flex-1 gap-3"
        >
          <Avatar className="h-9 w-9 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="text-xs font-semibold">
              {communityAuthorInitials(post.author_display_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{post.author_display_name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { locale: he, addSuffix: true })}
            </p>
          </div>
        </Link>
        {isOwn && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label="מחק פוסט"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {post.body && <p className="whitespace-pre-wrap text-sm">{post.body}</p>}
      {post.photo_path &&
        (photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="max-h-80 w-full rounded-2xl border border-border/60 object-cover"
          />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 text-xs text-muted-foreground">
            טוען תמונה...
          </div>
        ))}
      <div className="flex items-center gap-1 border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={onToggleLike}
          disabled={likeToggling}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-sm transition disabled:opacity-50",
            likeState.likedByMe
              ? "text-destructive"
              : "text-muted-foreground hover:text-destructive",
          )}
          aria-pressed={likeState.likedByMe}
          aria-label={likeState.likedByMe ? "בטל לייק" : "לייק"}
        >
          <Heart className={cn("h-4 w-4", likeState.likedByMe && "fill-current")} />
          {likeState.count > 0 && <span>{likeState.count}</span>}
        </button>
      </div>
    </PremiumCard>
  );
}
