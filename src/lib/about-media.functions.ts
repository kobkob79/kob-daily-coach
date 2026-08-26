import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import {
  ABOUT_MEDIA_BUCKET,
  ABOUT_MEDIA_MAX_BYTES,
  ABOUT_MEDIA_MIME_TYPES,
  ABOUT_MEDIA_SUBJECTS,
  getAboutMediaLimit,
  type AboutMediaRecord,
  type AboutMediaSubject,
} from "@/lib/about-media";

type AdminInput = Record<string, unknown>;
const dataUrlPattern = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function subjectOf(value: unknown): AboutMediaSubject {
  if (!ABOUT_MEDIA_SUBJECTS.includes(value as AboutMediaSubject))
    throw new Error("INVALID_SUBJECT");
  return value as AboutMediaSubject;
}

function text(value: unknown, max = 180): string | null {
  const result = String(value ?? "").trim();
  if (result.length > max) throw new Error("TEXT_TOO_LONG");
  return result || null;
}

function extensionFor(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function listSubject(client: SupabaseClient, subject: AboutMediaSubject) {
  const { data, error } = await client
    .from("about_media")
    .select("*")
    .eq("subject", subject)
    .order("sort_order");
  if (error) throw new Error("ABOUT_MEDIA_READ_FAILED");
  return data as AboutMediaRecord[];
}

export const getAdminAboutMedia = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const client = await adminClient();
    const { data, error } = await client
      .from("about_media")
      .select("*")
      .order("subject")
      .order("sort_order");
    if (error) throw new Error("ABOUT_MEDIA_READ_FAILED");
    return data as AboutMediaRecord[];
  });

export const uploadAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data, context }) => {
    const subject = subjectOf(data.subject);
    const match = String(data.dataUrl ?? "").match(dataUrlPattern);
    if (!match || !ABOUT_MEDIA_MIME_TYPES.includes(match[1] as never))
      throw new Error("INVALID_IMAGE_TYPE");
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (bytes.byteLength > ABOUT_MEDIA_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");

    const client = await adminClient();
    const current = await listSubject(client, subject);
    if (current.filter((item) => item.is_active).length >= getAboutMediaLimit(subject))
      throw new Error("ABOUT_MEDIA_LIMIT_EXCEEDED");
    const path = `${subject}/${crypto.randomUUID()}.${extensionFor(match[1])}`;
    const { error: uploadError } = await client.storage
      .from(ABOUT_MEDIA_BUCKET)
      .upload(path, bytes, { contentType: match[1], upsert: false });
    if (uploadError) throw new Error("ABOUT_MEDIA_UPLOAD_FAILED");

    const isPrimary = current.every((item) => !item.is_active);
    const { data: inserted, error } = await client
      .from("about_media")
      .insert({
        subject,
        storage_bucket: ABOUT_MEDIA_BUCKET,
        storage_path: path,
        caption: text(data.caption),
        alt_text: text(data.altText),
        sort_order: current.length,
        is_primary: isPrimary,
        created_by: String(context.userId),
      })
      .select("*")
      .single();
    if (error) {
      await client.storage.from(ABOUT_MEDIA_BUCKET).remove([path]);
      throw new Error("ABOUT_MEDIA_METADATA_FAILED");
    }
    return inserted as AboutMediaRecord;
  });

export const updateAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data }) => {
    const client = await adminClient();
    const { error } = await client
      .from("about_media")
      .update({ caption: text(data.caption), alt_text: text(data.altText) })
      .eq("id", String(data.id));
    if (error) throw new Error("ABOUT_MEDIA_UPDATE_FAILED");
    return { ok: true as const };
  });

export const setPrimaryAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data }) => {
    const client = await adminClient();
    const { error } = await client.rpc("set_about_media_primary", { p_media_id: String(data.id) });
    if (error) throw new Error("ABOUT_MEDIA_PRIMARY_FAILED");
    return { ok: true as const };
  });

export const reorderAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data }) => {
    const subject = subjectOf(data.subject);
    const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
    const client = await adminClient();
    const { error } = await client.rpc("reorder_about_media", { p_subject: subject, p_ids: ids });
    if (error) throw new Error("ABOUT_MEDIA_REORDER_FAILED");
    return { ok: true as const };
  });

export const deleteAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data }) => {
    const client = await adminClient();
    const { data: record, error: readError } = await client
      .from("about_media")
      .select("*")
      .eq("id", String(data.id))
      .single();
    if (readError || !record) throw new Error("ABOUT_MEDIA_NOT_FOUND");
    const { error: storageError } = await client.storage
      .from(ABOUT_MEDIA_BUCKET)
      .remove([record.storage_path]);
    if (storageError) throw new Error("ABOUT_MEDIA_DELETE_FAILED");
    const { error: deleteError } = await client.from("about_media").delete().eq("id", record.id);
    if (deleteError) throw new Error("ABOUT_MEDIA_METADATA_DELETE_FAILED");
    const remaining = await listSubject(client, record.subject as AboutMediaSubject);
    for (const [sortOrder, item] of remaining.entries())
      await client.from("about_media").update({ sort_order: sortOrder }).eq("id", item.id);
    if (record.is_primary && remaining[0])
      await client.rpc("set_about_media_primary", { p_media_id: remaining[0].id });
    return { ok: true as const };
  });

export const replaceAboutMedia = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((raw: unknown) => raw as AdminInput)
  .handler(async ({ data }) => {
    const match = String(data.dataUrl ?? "").match(dataUrlPattern);
    if (!match || !ABOUT_MEDIA_MIME_TYPES.includes(match[1] as never))
      throw new Error("INVALID_IMAGE_TYPE");
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (bytes.byteLength > ABOUT_MEDIA_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");
    const client = await adminClient();
    const { data: old, error: readError } = await client
      .from("about_media")
      .select("*")
      .eq("id", String(data.id))
      .single();
    if (readError || !old) throw new Error("ABOUT_MEDIA_NOT_FOUND");
    const newPath = `${old.subject}/${crypto.randomUUID()}.${extensionFor(match[1])}`;
    const { error: uploadError } = await client.storage
      .from(ABOUT_MEDIA_BUCKET)
      .upload(newPath, bytes, { contentType: match[1], upsert: false });
    if (uploadError) throw new Error("ABOUT_MEDIA_UPLOAD_FAILED");
    const { error: updateError } = await client
      .from("about_media")
      .update({ storage_path: newPath })
      .eq("id", old.id);
    if (updateError) {
      await client.storage.from(ABOUT_MEDIA_BUCKET).remove([newPath]);
      throw new Error("ABOUT_MEDIA_METADATA_FAILED");
    }
    const { error: removeError } = await client.storage
      .from(ABOUT_MEDIA_BUCKET)
      .remove([old.storage_path]);
    if (removeError)
      console.warn("[Viora About Media] old object cleanup failed", {
        event: "about_media_old_object_cleanup_failed",
      });
    return { ok: true as const };
  });
