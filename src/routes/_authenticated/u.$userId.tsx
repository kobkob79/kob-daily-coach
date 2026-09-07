/**
 * A community member's profile — the one place follow/unfollow and "send a
 * message" live, reached by tapping a name/avatar on their post. Posts
 * themselves only carry per-content actions (like); a relationship with a
 * person is a person-level action, not something repeated on every one of
 * their posts. Same reasoning as community.tsx: reads/writes go straight
 * through the Supabase client with RLS, no server function needed.
 *
 * There's no user directory, so the display name/avatar shown here come
 * from that user's own posts (already public-within-app via
 * community_posts' RLS) rather than a live `profiles` join, which is
 * owner-scoped. The `name` search param covers the one gap that leaves: a
 * user with zero posts, reached only via a link that already knew their
 * name (there's currently no such link, but the route stays ready for one).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, Heart, MessageCircle, Trash2, UserCheck, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { communityAuthorInitials } from "@/lib/community-posts";
import { getPostLikeState, summarizeLikes, type LikeRow } from "@/lib/community-likes";
import { cn } from "@/lib/utils";

// The generated Database types do not yet include `community_posts` /
// `user_follows` / `community_post_likes` (see the migrations for each), so
// these queries go through a loosely typed handle until the types are
// regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const PHOTO_BUCKET = "community-post-photos";
const PROFILE_POSTS_LIMIT = 50;

type CommunityPost = {
  id: string;
  user_id: string;
  author_display_name: string;
  body: string;
  photo_path: string | null;
  author_avatar_path: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/u/$userId")({
  validateSearch: (search: Record<string, unknown>): { name?: string } => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  component: MemberProfilePage,
});

function MemberProfilePage() {
  const { userId: profileUserId } = Route.useParams();
  const { name: fallbackName } = Route.useSearch();
  const qc = useQueryClient();

  const userQ = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const postsQ = useQuery({
    queryKey: ["community-posts", "by-user", profileUserId],
    queryFn: async () => {
      const { data, error } = await db
        .from("community_posts")
        .select("id,user_id,author_display_name,body,photo_path,author_avatar_path,created_at")
        .eq("user_id", profileUserId)
        .order("created_at", { ascending: false })
        .limit(PROFILE_POSTS_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as CommunityPost[];
    },
  });

  const posts = postsQ.data ?? [];
  const displayName = posts[0]?.author_display_name ?? fallbackName ?? "משתמש";
  const avatarPath = posts[0]?.author_avatar_path ?? null;
  const isOwnProfile = Boolean(userQ.data) && userQ.data === profileUserId;

  const followQ = useQuery({
    queryKey: ["community-follows", "one", userQ.data, profileUserId],
    queryFn: async () => {
      const { data, error } = await db
        .from("user_follows")
        .select("followed_id")
        .eq("follower_id", userQ.data)
        .eq("followed_id", profileUserId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    enabled: Boolean(userQ.data) && !isOwnProfile,
  });

  const isFollowing = followQ.data ?? false;

  const toggleFollow = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("יש להתחבר מחדש");
      if (isFollowing) {
        const { error } = await db
          .from("user_follows")
          .delete()
          .eq("follower_id", u.user.id)
          .eq("followed_id", profileUserId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("user_follows")
          .insert({ follower_id: u.user.id, followed_id: profileUserId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-follows", "one", userQ.data, profileUserId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postIds = posts.map((p) => p.id);

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
        if (storageError) console.error("community post photo cleanup failed", storageError);
      }
    },
    onSuccess: () => {
      toast.success("הפוסט נמחק");
      qc.invalidateQueries({ queryKey: ["community-posts", "by-user", profileUserId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const photoPaths = posts
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

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/community"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה לקהילה"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{displayName}</h1>
        </div>
      </div>

      <PremiumCard className="flex items-center gap-4">
        <Avatar className="h-16 w-16 shrink-0">
          {avatarPath && photoUrlsQ.data?.get(avatarPath) && (
            <AvatarImage src={photoUrlsQ.data.get(avatarPath)} alt="" />
          )}
          <AvatarFallback className="text-lg font-semibold">
            {communityAuthorInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        {!isOwnProfile && (
          <div className="flex flex-1 items-center gap-2">
            <Button
              type="button"
              variant={isFollowing ? "outline" : "default"}
              size="sm"
              onClick={() => toggleFollow.mutate()}
              disabled={toggleFollow.isPending}
              className="gap-1.5"
            >
              {isFollowing ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {isFollowing ? "עוקב" : "עקוב"}
            </Button>
            <Link
              to="/messages/$userId"
              params={{ userId: profileUserId }}
              search={{ name: displayName }}
            >
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                הודעה
              </Button>
            </Link>
          </div>
        )}
      </PremiumCard>

      <section>
        <SectionHeader
          title="פוסטים"
          subtitle={posts.length ? `${posts.length} פוסטים` : undefined}
        />
        {postsQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">טוען...</p>
        ) : posts.length === 0 ? (
          <PremiumCard className="p-0">
            <EmptyState title="עוד אין פוסטים" hint="המשתמש הזה עוד לא פרסם בקהילה." />
          </PremiumCard>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <ProfilePostCard
                key={post.id}
                post={post}
                photoUrl={post.photo_path ? photoUrlsQ.data?.get(post.photo_path) : undefined}
                isOwn={isOwnProfile}
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

function ProfilePostCard({
  post,
  photoUrl,
  isOwn,
  onDelete,
  deleting,
  likeState,
  onToggleLike,
  likeToggling,
}: {
  post: CommunityPost;
  photoUrl: string | undefined;
  isOwn: boolean;
  onDelete: () => void;
  deleting: boolean;
  likeState: ReturnType<typeof getPostLikeState>;
  onToggleLike: () => void;
  likeToggling: boolean;
}) {
  return (
    <PremiumCard className={cn("space-y-3", deleting && "opacity-50")}>
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(post.created_at), { locale: he, addSuffix: true })}
        </p>
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
