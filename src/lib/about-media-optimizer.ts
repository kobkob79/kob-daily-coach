import {
  ABOUT_MEDIA_OPTIMIZED_TARGET_BYTES,
  validateAboutMediaFile,
  validateAboutMediaSourceFile,
} from "@/lib/about-media";

const MAX_LONG_EDGE = 2400;
const MIN_LONG_EDGE = 960;
const INITIAL_QUALITY = 0.9;
const MIN_QUALITY = 0.62;

function outputName(name: string, mime: string) {
  const base = name.replace(/\.[^.]+$/, "") || "viora-photo";
  return `${base}.${mime === "image/webp" ? "webp" : "jpg"}`;
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

export async function optimizeAboutMediaFile(file: File): Promise<File> {
  const sourceError = validateAboutMediaSourceFile(file);
  if (sourceError) throw new Error(sourceError);
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("עיבוד התמונה אינו נתמך בדפדפן הזה.");
  }

  // createImageBitmap applies EXIF orientation in current mobile browsers.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const sourceLongEdge = Math.max(bitmap.width, bitmap.height);
    let longEdge = Math.min(sourceLongEdge, MAX_LONG_EDGE);
    let quality = INITIAL_QUALITY;
    const supportsWebp = document
      .createElement("canvas")
      .toDataURL("image/webp")
      .startsWith("data:image/webp");
    const mime = supportsWebp ? "image/webp" : "image/jpeg";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = longEdge / sourceLongEdge;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: mime === "image/webp" });
      if (!context) throw new Error("לא ניתן לעבד את התמונה בדפדפן הזה.");
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasBlob(canvas, mime, quality);
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("לא ניתן לכווץ את התמונה.");
      if (blob.size <= ABOUT_MEDIA_OPTIMIZED_TARGET_BYTES) {
        const optimized = new File([blob], outputName(file.name, mime), {
          type: mime,
          lastModified: Date.now(),
        });
        const outputError = validateAboutMediaFile(optimized);
        if (outputError) throw new Error(outputError);
        return optimized;
      }
      if (quality > MIN_QUALITY) quality = Math.max(MIN_QUALITY, quality - 0.07);
      else longEdge = Math.max(MIN_LONG_EDGE, Math.round(longEdge * 0.82));
    }
    throw new Error("לא הצלחנו לכווץ את התמונה לגודל בטוח. אפשר לבחור תמונה אחרת.");
  } finally {
    bitmap.close();
  }
}
