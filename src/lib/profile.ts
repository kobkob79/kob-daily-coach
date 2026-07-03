/**
 * Profile domain — the personal Digital Twin foundation.
 *
 * Everything the AI coach and modules need to personalise their behaviour
 * lives on the `profiles` row for the signed-in user, plus a per-user
 * `body_photos` gallery for long-term physique tracking. Storage buckets:
 *   • profile-photos/<user_id>/avatar.<ext>
 *   • body-photos/<user_id>/<angle>/<timestamp>.<ext>
 *
 * Kept UI-agnostic so future profiles (Ortal, Sahar, Aviv…) can be layered
 * on top without rewriting call sites — the "active profile" concept
 * currently maps 1:1 to the authenticated user id.
 */
import { supabase } from "@/integrations/supabase/client";

export const PROFILE_BUCKET = "profile-photos";
export const BODY_BUCKET = "body-photos";

export type Gender = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type WorkType = "intel_shifts" | "office" | "field" | "other";
export type ViewAngle = "front" | "back" | "left" | "right";

export interface Profile {
  id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  gender: Gender | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  protein_target_g: number | null;
  water_target_ml: number | null;
  calorie_target: number | null;
  activity_level: ActivityLevel | null;
  work_type: WorkType | null;
  personal_notes: string | null;
}

export interface BodyPhoto {
  id: string;
  user_id: string;
  image_path: string;
  view_angle: ViewAngle;
  taken_at: string;
  lighting_notes: string | null;
  distance_notes: string | null;
  general_notes: string | null;
  weight_kg: number | null;
}

export const VIEW_ANGLES: { key: ViewAngle; labelKey: string }[] = [
  { key: "front", labelKey: "profile.angle.front" },
  { key: "right", labelKey: "profile.angle.right" },
  { key: "left", labelKey: "profile.angle.left" },
  { key: "back", labelKey: "profile.angle.back" },
];

export const GENDERS: { key: Gender; labelKey: string }[] = [
  { key: "male", labelKey: "profile.gender.male" },
  { key: "female", labelKey: "profile.gender.female" },
  { key: "other", labelKey: "profile.gender.other" },
];

export const ACTIVITY_LEVELS: { key: ActivityLevel; labelKey: string }[] = [
  { key: "sedentary", labelKey: "profile.activity.sedentary" },
  { key: "light", labelKey: "profile.activity.light" },
  { key: "moderate", labelKey: "profile.activity.moderate" },
  { key: "active", labelKey: "profile.activity.active" },
  { key: "very_active", labelKey: "profile.activity.very_active" },
];

export const WORK_TYPES: { key: WorkType; labelKey: string }[] = [
  { key: "intel_shifts", labelKey: "profile.work.intel_shifts" },
  { key: "office", labelKey: "profile.work.office" },
  { key: "field", labelKey: "profile.work.field" },
  { key: "other", labelKey: "profile.work.other" },
];

export function ageFromBirthdate(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const diff = Date.now() - b.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", u.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Profile) ?? null;
}

export async function upsertProfile(patch: Partial<Profile>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: u.user.id, ...patch } as never, { onConflict: "id" });
  if (error) throw error;
}

export async function uploadAvatar(file: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${u.user.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  await upsertProfile({ avatar_url: path });
  return path;
}

export async function removeAvatar(currentPath: string | null): Promise<void> {
  if (currentPath) {
    await supabase.storage.from(PROFILE_BUCKET).remove([currentPath]);
  }
  await upsertProfile({ avatar_url: null });
}

export async function listBodyPhotos(): Promise<BodyPhoto[]> {
  const { data, error } = await supabase
    .from("body_photos" as never)
    .select("*")
    .order("taken_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BodyPhoto[];
}

export async function addBodyPhoto(input: {
  file: File;
  angle: ViewAngle;
  lighting_notes?: string;
  distance_notes?: string;
  general_notes?: string;
  weight_kg?: number | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const ext = (input.file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${u.user.id}/${input.angle}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BODY_BUCKET)
    .upload(path, input.file, { upsert: false, contentType: input.file.type || "image/jpeg" });
  if (upErr) throw upErr;
  const { error } = await supabase.from("body_photos" as never).insert({
    user_id: u.user.id,
    image_path: path,
    view_angle: input.angle,
    lighting_notes: input.lighting_notes ?? null,
    distance_notes: input.distance_notes ?? null,
    general_notes: input.general_notes ?? null,
    weight_kg: input.weight_kg ?? null,
  } as never);
  if (error) throw error;
}

export async function deleteBodyPhoto(photo: BodyPhoto): Promise<void> {
  await supabase.storage.from(BODY_BUCKET).remove([photo.image_path]);
  await supabase.from("body_photos" as never).delete().eq("id", photo.id);
}
