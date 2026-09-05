import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';

const execFileAsync = promisify(execFile);

// Ensure we have required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Missing required environment variables.");
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Usage:");
  console.error("  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-video-codecs.mjs");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET_NAME = 'exercise-assets';
const PREFIX = 'exercises';

async function listAllFiles(bucket, prefix) {
  let allFiles = [];

  async function listRecursively(currentPath) {
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.storage.from(bucket).list(currentPath, {
        limit: limit,
        offset: offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) {
        throw new Error(`Failed to list files at ${currentPath}: ${error.message}`);
      }

      if (data.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of data) {
        const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
        // If it doesn't have an ID, it's typically a "folder" in Supabase Storage list output
        if (!item.id) {
          await listRecursively(fullPath);
        } else {
          allFiles.push({ ...item, path: fullPath });
        }
      }

      if (data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  }

  await listRecursively(prefix);
  return allFiles;
}

async function probeVideo(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    return stdout.trim();
  } catch (err) {
    console.error(`Error probing file ${filePath}:`, err.message);
    return null;
  }
}

async function downloadFile(bucket, filePath, destPath) {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) {
    throw new Error(`Failed to download ${filePath}: ${error.message}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

async function uploadFile(bucket, filePath, srcPath, contentType) {
  const fileBuffer = await fs.readFile(srcPath);
  const { data, error } = await supabase.storage.from(bucket).upload(filePath, fileBuffer, {
    contentType: contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload ${filePath}: ${error.message}`);
  }
  return data;
}

async function reencodeVideo(inputPath, outputPath) {
  console.log(`Re-encoding ${path.basename(inputPath)} to H.264/AAC MP4...`);
  await execFileAsync('ffmpeg', [
    '-y',                 // Overwrite output
    '-i', inputPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath
  ]);
}

async function run() {
  console.log('Fetching list of files...');
  let files;
  try {
    files = await listAllFiles(BUCKET_NAME, PREFIX);
  } catch (error) {
    console.error('Error fetching files:', error.message);
    process.exit(1);
  }

  const videoExtensions = ['.mp4', '.webm', '.mov', '.m4v'];
  const videoFiles = files.filter(f => {
    const ext = path.extname(f.name).toLowerCase();
    return videoExtensions.includes(ext);
  });

  console.log(`Found ${videoFiles.length} video files under '${PREFIX}/'.`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'viora-video-fix-'));
  console.log(`Created temporary directory: ${tmpDir}`);

  const report = [];

  for (const file of videoFiles) {
    console.log(`\nProcessing: ${file.path}`);
    const localFilePath = path.join(tmpDir, file.name);

    try {
      await downloadFile(BUCKET_NAME, file.path, localFilePath);

      const codec = await probeVideo(localFilePath);
      console.log(`Detected video codec: ${codec}`);

      const stat = await fs.stat(localFilePath);
      const oldSize = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';

      // H.264, VP8, VP9 are safely web-playable
      const isPlayable = codec === 'h264' || codec === 'vp8' || codec === 'vp9';

      if (!isPlayable) {
        console.log(`Codec '${codec}' is non-compliant. Re-encoding...`);
        const newFileName = path.parse(file.name).name + '-reencoded.mp4';
        const newLocalPath = path.join(tmpDir, newFileName);

        await reencodeVideo(localFilePath, newLocalPath);

        // Ensure new file exists and probes clean
        const newCodec = await probeVideo(newLocalPath);
        if (newCodec !== 'h264') {
            throw new Error(`Re-encoding failed to produce H.264 (got ${newCodec}).`);
        }

        const newStat = await fs.stat(newLocalPath);
        const newSize = (newStat.size / (1024 * 1024)).toFixed(2) + ' MB';

        // We replace the original file (or change extension if necessary)
        const parsedPath = path.parse(file.path);
        const targetUploadPath = path.posix.join(parsedPath.dir, parsedPath.name + '.mp4');

        console.log(`Uploading re-encoded file to ${targetUploadPath}...`);
        await uploadFile(BUCKET_NAME, targetUploadPath, newLocalPath, 'video/mp4');

        // If the original extension was not .mp4, delete the old file to avoid duplicates
        if (file.path !== targetUploadPath) {
             console.log(`Deleting original file ${file.path}...`);
             const { error: delError } = await supabase.storage.from(BUCKET_NAME).remove([file.path]);
             if (delError) {
                 console.error(`Failed to delete old file ${file.path}:`, delError);
             }
        }

        report.push({
          file: file.path,
          oldCodec: codec,
          newCodec: newCodec,
          oldSize,
          newSize
        });

        console.log(`Successfully updated ${file.path}.`);
      } else {
        console.log(`File is already web-playable (codec: ${codec}). Skipping.`);
      }

    } catch (err) {
      console.error(`Error processing ${file.path}:`, err);
    }
  }

  // Cleanup tmp dir
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log('\n--- Summary Report ---');
  if (report.length === 0) {
    console.log('No files needed re-encoding.');
  } else {
    console.log('| File Path | Old Codec | New Codec | Old Size | New Size |');
    console.log('|-----------|-----------|-----------|----------|----------|');
    for (const r of report) {
      console.log(`| ${r.file} | ${r.oldCodec} | ${r.newCodec} | ${r.oldSize} | ${r.newSize} |`);
    }
  }
}

run();