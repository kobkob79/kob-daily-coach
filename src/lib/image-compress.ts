/**
 * Mobile-safe image downscaling.
 *
 * A modern phone camera produces 12MP+ JPEGs. Keeping the original File, an
 * object URL, a decoded bitmap and a base64 data URL of the same photo alive at
 * once is what causes "לא ניתן להשלים את הפעולה הקודמת עקב מחסור בזיכרון" and
 * the subsequent page reload. So we immediately replace the camera file with a
 * single small JPEG and release every temporary bitmap/URL.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const AVATAR_SIZE = 512;

async function decode(
  file: File,
): Promise<{ width: number; height: number; draw: CanvasImageSource; close: () => void }> {
  // createImageBitmap decodes off the main thread and can be released explicitly.
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return { width: bmp.width, height: bmp.height, draw: bmp, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: img,
      close: () => {
        img.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Returns a downscaled JPEG File. On any failure the original file is returned
 * unchanged so capture never breaks because of compression.
 */
export async function compressImageFile(file: File, maxEdge = MAX_EDGE): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  let src: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    src = await decode(file);
    const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
    // Already small enough and already JPEG → no re-encode, no extra copy.
    if (scale === 1 && file.size < 1_200_000) return file;

    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(src.draw, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", QUALITY),
    );
    // Free the canvas backing store as early as possible.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    src?.close();
  }
}

/** Produces a small, consistently cropped avatar without an interactive cropper. */
export async function processAvatarImage(file: File): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("Avatar processing requires a browser environment");
  }

  let src: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    src = await decode(file);
    const cropSize = Math.min(src.width, src.height);
    const sourceX = Math.max(0, (src.width - cropSize) / 2);
    const sourceY = Math.max(0, (src.height - cropSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Avatar image processing is unavailable");

    ctx.drawImage(src.draw, sourceX, sourceY, cropSize, cropSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", QUALITY),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("Avatar image processing failed");

    return new File([blob], "avatar.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    src?.close();
  }
}
