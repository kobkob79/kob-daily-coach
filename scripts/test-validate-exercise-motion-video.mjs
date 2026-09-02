import assert from 'node:assert/strict';
import { runValidation } from './validate-exercise-motion-video.mjs';

const mockStat = (size) => () => ({ size });

const baseFfprobeOutput = {
    format: {
        format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '8.1'
    },
    streams: [
        {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1280,
            height: 720,
            r_frame_rate: '30/1',
            duration: '8.1',
            display_aspect_ratio: '16:9'
        }
    ]
};

const mockExecSync = (outputJson) => () => JSON.stringify(outputJson);

function createMockDeps(size, ffprobeOutput) {
    let exitCode = null;
    let logs = [];
    return {
        deps: {
            statSync: mockStat(size),
            execSyncFn: mockExecSync(ffprobeOutput),
            exitFn: (code) => { exitCode = code; },
            logFn: (msg) => logs.push(msg)
        },
        getExitCode: () => exitCode,
        getLogs: () => logs
    };
}

const VALID_SIZE = 1024 * 1024; // 1 MiB

// 1. Fully conforming video
let { deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput);
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 0);
assert.ok(getLogs().some(l => l.includes('VIORA MOTION VIDEO: PASS')));

// 2. Wrong codec
let wrongCodecOutput = structuredClone(baseFfprobeOutput);
wrongCodecOutput.streams[0].codec_name = 'hevc';
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, wrongCodecOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Codec         hevc — expected h264')));
assert.ok(getLogs().some(l => l.includes('VIORA MOTION VIDEO: FAIL')));

// 3. Wrong resolution
let wrongResOutput = structuredClone(baseFfprobeOutput);
wrongResOutput.streams[0].width = 1920;
wrongResOutput.streams[0].height = 1080;
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, wrongResOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Resolution    1920x1080 — expected 1280x720')));

// 4. 29.97fps rejection
let wrongFpsOutput = structuredClone(baseFfprobeOutput);
wrongFpsOutput.streams[0].r_frame_rate = '30000/1001';
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, wrongFpsOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Frame rate    29.97002997002997fps — expected 30fps')));

// 5. Audio-stream rejection
let audioOutput = structuredClone(baseFfprobeOutput);
audioOutput.streams.push({ codec_type: 'audio' });
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, audioOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Audio         audio stream detected — expected no audio stream')));

// 6. Too short
let shortOutput = structuredClone(baseFfprobeOutput);
shortOutput.format.duration = '5.9';
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, shortOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Duration      5.9s — expected 6.0s - 10.0s')));

// 7. Too long
let longOutput = structuredClone(baseFfprobeOutput);
longOutput.format.duration = '10.1';
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, longOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Duration      10.1s — expected 6.0s - 10.0s')));

// 8. File above 3 MiB
({ deps, getExitCode, getLogs } = createMockDeps(4 * 1024 * 1024, baseFfprobeOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  File Size     4.00 MiB — expected Max 3.00 MiB')));

// 9. Missing video stream
let noVideoOutput = structuredClone(baseFfprobeOutput);
noVideoOutput.streams = [];
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, noVideoOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 1);
assert.ok(getLogs().some(l => l.includes('FAIL  Video Stream Count  0 — expected 1')));

// 10. Malformed ffprobe output
let malformedOutput = { foo: 'bar' };
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, malformedOutput));
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 2);
assert.ok(getLogs().some(l => l.includes('Error: Unreadable or malformed probe output.')));

// 11. Missing file path (usage error)
let { deps: usageDeps, getExitCode: usageCode, getLogs: usageLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput);
runValidation(undefined, false, usageDeps);
assert.equal(usageCode(), 2);
assert.ok(usageLogs().some(l => l.includes('Error: Missing input file path.')));

// 12. Json mode tests
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 0);
let jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, true);
assert.equal(jsonOutput.checks.length > 0, true);
assert.equal(jsonOutput.failureReasons.length, 0);

({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, wrongCodecOutput));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 1);
jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.ok(jsonOutput.failureReasons.some(r => r.includes('Codec')));

console.log('validate-exercise-motion-video: PASS (all tests passed)');