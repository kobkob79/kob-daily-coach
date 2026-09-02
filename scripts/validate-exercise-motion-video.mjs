import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Parse command line arguments
const args = process.argv.slice(2);
const isJsonMode = args.includes('--json');
const filePath = args.find(arg => !arg.startsWith('--'));

export function runValidation(filePath, isJsonMode, dependencies = {}) {
    // Dependency injection for testing
    const {
        statSync = fs.statSync,
        execFileSyncFn = execFileSync,
        exitFn = process.exit,
        logFn = console.log
    } = dependencies;

    const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MiB

    // Initialize the default structure for JSON output
    let detectedMeta = {
        fileSizeBytes: null,
        container: null,
        videoStreamCount: null,
        codec: null,
        width: null,
        height: null,
        frameRate: null,
        durationSeconds: null,
        aspectRatio: null,
        audioStreamCount: null
    };

    let checks = [];

    // Helper for structured exiting
    function finish(exitCode, errorObj = null) {
        const passed = exitCode === 0;
        if (isJsonMode) {
            const out = {
                passed,
                exitCode,
                checks,
                detected: detectedMeta,
                failureReasons: checks.filter(c => !c.passed).map(c => `${c.name}: detected ${c.detected} (expected ${c.expected})`)
            };
            if (errorObj) {
                out.error = { code: errorObj.code, message: errorObj.message };
            }
            logFn(JSON.stringify(out, null, 2));
        } else {
            if (errorObj) {
                logFn(`Error: ${errorObj.message}`);
                if (!filePath) logFn('Usage: node validate-exercise-motion-video.mjs <file.mp4> [--json]');
            } else {
                checks.forEach(c => {
                    const status = c.passed ? 'PASS' : 'FAIL';
                    const namePadded = c.name.padEnd(12, ' ');
                    if (c.passed) {
                        logFn(`${status}  ${namePadded}  ${c.detected}`);
                    } else {
                        logFn(`${status}  ${namePadded}  ${c.detected} — expected ${c.expected}`);
                    }
                });
                logFn('');
                logFn(`VIORA MOTION VIDEO: ${passed ? 'PASS' : 'FAIL'}`);
            }
        }
        exitFn(exitCode);
    }

    if (!filePath) {
        finish(2, { code: 'MISSING_INPUT_FILE', message: 'Missing input file path.' });
        return;
    }

    let stats;
    try {
        stats = statSync(filePath);
    } catch (e) {
        finish(2, { code: 'INPUT_FILE_UNREADABLE', message: `Input file does not exist or cannot be read: ${filePath}` });
        return;
    }

    const fileSize = stats.size;
    detectedMeta.fileSizeBytes = fileSize;
    let passed = true;

    // 1. File/container checks
    const sizeCheck = {
        name: 'File Size',
        detected: `${(fileSize / (1024 * 1024)).toFixed(2)} MiB`,
        expected: 'Max 3.00 MiB',
        passed: fileSize <= MAX_FILE_SIZE_BYTES
    };
    checks.push(sizeCheck);
    if (!sizeCheck.passed) passed = false;

    // A. execFileSync failure
    let stdout;
    try {
        const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
        stdout = execFileSyncFn('ffprobe', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
        finish(2, { code: 'FFPROBE_UNAVAILABLE_OR_UNREADABLE', message: 'Container is not readable by ffprobe, or ffprobe is not installed.' });
        return;
    }

    // B. JSON.parse failure
    let probeData;
    try {
        probeData = JSON.parse(stdout);
    } catch (e) {
        finish(2, { code: 'MALFORMED_FFPROBE_JSON', message: 'ffprobe emitted unparseable JSON.' });
        return;
    }

    // C. Parsed JSON with missing required shape
    if (!probeData || typeof probeData !== 'object' || !probeData.format || !Array.isArray(probeData.streams)) {
        finish(2, { code: 'INVALID_FFPROBE_SHAPE', message: 'Unreadable or missing format/streams in probe output.' });
        return;
    }

    // MP4 Container check
    const formatName = probeData.format.format_name || '';
    detectedMeta.container = formatName;
    const containerCheck = {
        name: 'Container',
        detected: formatName,
        expected: 'MP4-compatible (mp4/mov/m4a/3gp/3g2/mj2)',
        passed: formatName.split(',').includes('mp4') || formatName.split(',').includes('mov')
    };
    checks.push(containerCheck);
    if (!containerCheck.passed) passed = false;

    const videoStreams = probeData.streams.filter(s => s.codec_type === 'video');
    const audioStreams = probeData.streams.filter(s => s.codec_type === 'audio');

    detectedMeta.videoStreamCount = videoStreams.length;
    detectedMeta.audioStreamCount = audioStreams.length;

    // Exactly one video stream
    const videoStreamCountCheck = {
        name: 'Video Stream Count',
        detected: videoStreams.length.toString(),
        expected: '1',
        passed: videoStreams.length === 1
    };
    checks.push(videoStreamCountCheck);
    if (!videoStreamCountCheck.passed) passed = false;

    if (videoStreams.length > 0) {
        const vs = videoStreams[0];

        detectedMeta.codec = vs.codec_name || null;
        detectedMeta.width = vs.width || null;
        detectedMeta.height = vs.height || null;
        detectedMeta.frameRate = vs.r_frame_rate || null;

        let duration = parseFloat(probeData.format.duration || vs.duration || 0);
        detectedMeta.durationSeconds = duration;

        let ar = vs.display_aspect_ratio || null;
        if (!ar && vs.width && vs.height) {
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            const d = gcd(vs.width, vs.height);
            ar = `${vs.width/d}:${vs.height/d}`;
        }
        detectedMeta.aspectRatio = ar;

        // Codec H.264
        const codecCheck = {
            name: 'Codec',
            detected: vs.codec_name || 'unknown',
            expected: 'h264',
            passed: vs.codec_name === 'h264'
        };
        checks.push(codecCheck);
        if (!codecCheck.passed) passed = false;

        // Resolution 1280x720
        const resDetected = `${vs.width}x${vs.height}`;
        const resCheck = {
            name: 'Resolution',
            detected: resDetected,
            expected: '1280x720',
            passed: resDetected === '1280x720'
        };
        checks.push(resCheck);
        if (!resCheck.passed) passed = false;

        // Frame rate exact 30fps rational parser (strict Regex)
        let fpsPassed = false;
        if (vs.r_frame_rate && typeof vs.r_frame_rate === 'string' && /^\d+(?:\/\d+)?$/.test(vs.r_frame_rate)) {
            const parts = vs.r_frame_rate.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0], 10);
                const den = parseInt(parts[1], 10);
                if (den > 0 && num === 30 * den) {
                    fpsPassed = true;
                }
            } else if (parts.length === 1) {
                const val = parseInt(parts[0], 10);
                if (val === 30) {
                    fpsPassed = true;
                }
            }
        }

        const fpsCheck = {
            name: 'Frame rate',
            detected: vs.r_frame_rate || 'missing',
            expected: '30fps',
            passed: fpsPassed
        };
        checks.push(fpsCheck);
        if (!fpsCheck.passed) passed = false;

        // Duration between 6 and 10 seconds
        const durationCheck = {
            name: 'Duration',
            detected: `${duration.toFixed(1)}s`,
            expected: '6.0s - 10.0s',
            passed: duration >= 6.0 && duration <= 10.0
        };
        checks.push(durationCheck);
        if (!durationCheck.passed) passed = false;

        // Aspect ratio 16:9
        const arCheck = {
            name: 'Aspect ratio',
            detected: ar || 'unknown',
            expected: '16:9',
            passed: ar === '16:9'
        };
        checks.push(arCheck);
        if (!arCheck.passed) passed = false;
    }

    // Audio stream - NO audio
    const audioCheck = {
        name: 'Audio',
        detected: audioStreams.length > 0 ? 'audio stream detected' : 'no audio stream',
        expected: 'no audio stream',
        passed: audioStreams.length === 0
    };
    checks.push(audioCheck);
    if (!audioCheck.passed) passed = false;

    finish(passed ? 0 : 1);
}

// Only execute when run directly, not when imported for tests
import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
    runValidation(filePath, isJsonMode);
}