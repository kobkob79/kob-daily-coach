import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);
const isJsonMode = args.includes('--json');
const filePath = args.find(arg => !arg.startsWith('--'));

export function runValidation(filePath, isJsonMode, dependencies = {}) {
    // Dependency injection for testing
    const {
        statSync = fs.statSync,
        execSyncFn = execSync,
        exitFn = process.exit,
        logFn = console.log
    } = dependencies;

    if (!filePath) {
        if (!isJsonMode) {
            logFn('Error: Missing input file path.');
            logFn('Usage: node validate-exercise-motion-video.mjs <file.mp4> [--json]');
        }
        exitFn(2);
        return; // Return added to stop execution in tests
    }

    const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MiB

    let stats;
    try {
        stats = statSync(filePath);
    } catch (e) {
        if (!isJsonMode) {
            logFn(`Error: Input file does not exist or cannot be read: ${filePath}`);
        }
        exitFn(2);
        return;
    }

    const fileSize = stats.size;
    const checks = [];
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

    // Run ffprobe
    let probeData;
    try {
        const cmd = `ffprobe -v error -print_format json -show_format -show_streams "${filePath}"`;
        const stdout = execSyncFn(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        probeData = JSON.parse(stdout);
    } catch (e) {
        if (!isJsonMode) {
            logFn('Error: Container is not readable by ffprobe, or ffprobe is not installed.');
        }
        exitFn(2);
        return;
    }

    // Basic ffprobe output validation
    if (!probeData || !probeData.format || !Array.isArray(probeData.streams)) {
        if (!isJsonMode) {
            logFn('Error: Unreadable or malformed probe output.');
        }
        exitFn(2);
        return;
    }

    // MP4 Container check
    const formatName = probeData.format.format_name || '';
    const containerCheck = {
        name: 'Container',
        detected: formatName,
        expected: 'MP4-compatible (mp4/mov/m4a/3gp/3g2/mj2)',
        passed: formatName.split(',').includes('mp4') || formatName.split(',').includes('mov') // 'mov,mp4,m4a,3gp,3g2,mj2' is common for mp4
    };
    checks.push(containerCheck);
    if (!containerCheck.passed) passed = false;


    const videoStreams = probeData.streams.filter(s => s.codec_type === 'video');
    const audioStreams = probeData.streams.filter(s => s.codec_type === 'audio');

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

        // Codec H.264
        const codecCheck = {
            name: 'Codec',
            detected: vs.codec_name,
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

        // Frame rate 30fps
        // Note: r_frame_rate is usually '30/1' or '30000/1000'
        let fps = 0;
        if (vs.r_frame_rate) {
            const parts = vs.r_frame_rate.split('/');
            if (parts.length === 2) {
                fps = parseInt(parts[0], 10) / parseInt(parts[1], 10);
            }
        }
        // Strict equality for exactly 30fps
        const fpsCheck = {
            name: 'Frame rate',
            detected: vs.r_frame_rate === '30/1' ? '30fps' : `${fps}fps`,
            expected: '30fps',
            passed: fps === 30 && (vs.r_frame_rate === '30/1' || vs.r_frame_rate === '30')
        };
        checks.push(fpsCheck);
        if (!fpsCheck.passed) passed = false;

        // Duration between 6 and 10 seconds
        let duration = parseFloat(probeData.format.duration || vs.duration || 0);
        const durationCheck = {
            name: 'Duration',
            detected: `${duration.toFixed(1)}s`,
            expected: '6.0s - 10.0s',
            passed: duration >= 6.0 && duration <= 10.0
        };
        checks.push(durationCheck);
        if (!durationCheck.passed) passed = false;

        // Aspect ratio 16:9
        let ar = vs.display_aspect_ratio;
        if (!ar && vs.width && vs.height) {
            // calculate if missing
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            const d = gcd(vs.width, vs.height);
            ar = `${vs.width/d}:${vs.height/d}`;
        }

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

    if (isJsonMode) {
        logFn(JSON.stringify({
            passed,
            checks,
            failureReasons: checks.filter(c => !c.passed).map(c => `${c.name}: detected ${c.detected} (expected ${c.expected})`)
        }, null, 2));
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

    exitFn(passed ? 0 : 1);
}

// Only execute when run directly, not when imported for tests
import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
    runValidation(filePath, isJsonMode);
}