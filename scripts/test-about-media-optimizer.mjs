import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true },
});
const originalDocument = globalThis.document;
const originalBitmap = globalThis.createImageBitmap;
try {
  let encodedBytes = 7 * 1024 * 1024;
  globalThis.createImageBitmap = async () => ({ width: 4032, height: 3024, close() {} });
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => "data:image/webp;base64,",
      toBlob: (callback) => {
        const size = encodedBytes;
        encodedBytes = Math.max(4 * 1024 * 1024, encodedBytes - 1024 * 1024);
        callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
      },
    }),
  };
  const { optimizeAboutMediaFile } = await server.ssrLoadModule(
    "/src/lib/about-media-optimizer.ts",
  );
  const source = new File([new Uint8Array(8 * 1024 * 1024)], "phone.jpg", { type: "image/jpeg" });
  const optimized = await optimizeAboutMediaFile(source);
  assert.equal(optimized.type, "image/webp");
  assert.ok(optimized.size <= 5.5 * 1024 * 1024);
  assert.ok(optimized.size < source.size);
  await assert.rejects(
    optimizeAboutMediaFile(new File(["svg"], "bad.svg", { type: "image/svg+xml" })),
    /JPEG/,
  );
  await assert.rejects(
    optimizeAboutMediaFile(new File([], "empty.png", { type: "image/png" })),
    /ריק/,
  );
  console.log(
    JSON.stringify({
      oversized_source_optimized: "PASS",
      webp_output: "PASS",
      target_size: "PASS",
      invalid_mime: "PASS",
      empty_file: "PASS",
    }),
  );
} finally {
  globalThis.document = originalDocument;
  globalThis.createImageBitmap = originalBitmap;
  await server.close();
}
