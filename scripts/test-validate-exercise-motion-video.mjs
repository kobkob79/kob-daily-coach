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

let capturedExecArgs = null;
const mockExecFileSync = (outputJson) => (cmd, args) => {
    capturedExecArgs = { cmd, args };
    if (outputJson === 'throw') {
        throw new Error('mock error');
    }
    return JSON.stringify(outputJson);
};

function createMockDeps(size, ffprobeOutput) {
    let exitCode = null;
    let logs = [];
    capturedExecArgs = null;
    return {
        deps: {
            statSync: mockStat(size),
            execFileSyncFn: mockExecFileSync(ffprobeOutput),
            exitFn: (code) => { exitCode = code; },
            logFn: (msg) => logs.push(msg)
        },
        getExitCode: () => exitCode,
        getLogs: () => logs,
        getExecArgs: () => capturedExecArgs
    };
}

const VALID_SIZE = 1024 * 1024; // 1 MiB

// 1. Fully conforming video (Human output)
let { deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput);
runValidation('test.mp4', false, deps);
assert.equal(getExitCode(), 0);
assert.ok(getLogs().some(l => l.includes('VIORA MOTION VIDEO: PASS')));

// 2. ExecFileSync security & args check (Hostile filename passed safely)
let hostileName = 'test ; rm -rf /; ".mp4';
let getExecArgs;
({ deps, getExitCode, getLogs, getExecArgs } = createMockDeps(VALID_SIZE, baseFfprobeOutput));
runValidation(hostileName, false, deps);
assert.equal(getExitCode(), 0);
let execArgs = getExecArgs();
assert.equal(execArgs.cmd, 'ffprobe');
assert.deepEqual(execArgs.args, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', hostileName]);

// 3. Rational framerate tests
const testFps = (fpsString, shouldPass) => {
    let fpsOutput = structuredClone(baseFfprobeOutput);
    if (fpsString === null) {
        delete fpsOutput.streams[0].r_frame_rate;
    } else {
        fpsOutput.streams[0].r_frame_rate = fpsString;
    }
    let localDeps = createMockDeps(VALID_SIZE, fpsOutput);
    runValidation('test.mp4', false, localDeps.deps);
    assert.equal(localDeps.getExitCode(), shouldPass ? 0 : 1, `Failed testing fps string: ${fpsString}`);
};

testFps('30/1', true);
testFps('60/2', true);
testFps('30000/1000', true);
testFps('30', true);
testFps('30000/1001', false);
testFps('29.97', false);
testFps('30/0', false); // Zero denominator
testFps('bad/string', false);
testFps(null, false); // Missing frame rate

// 4. JSON Mode: Fully conforming (Checks detected metadata)
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 0);
assert.equal(getLogs().length, 1); // Only one JSON document
let jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, true);
assert.equal(jsonOutput.exitCode, 0);
assert.equal(jsonOutput.detected.fileSizeBytes, VALID_SIZE);
assert.equal(jsonOutput.detected.container, 'mov,mp4,m4a,3gp,3g2,mj2');
assert.equal(jsonOutput.detected.videoStreamCount, 1);
assert.equal(jsonOutput.detected.codec, 'h264');
assert.equal(jsonOutput.detected.width, 1280);
assert.equal(jsonOutput.detected.height, 720);
assert.equal(jsonOutput.detected.frameRate, '30/1');
assert.equal(jsonOutput.detected.durationSeconds, 8.1);
assert.equal(jsonOutput.detected.aspectRatio, '16:9');
assert.equal(jsonOutput.detected.audioStreamCount, 0);

// 5. JSON Mode: Missing input path
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, baseFfprobeOutput));
runValidation(undefined, true, deps);
assert.equal(getExitCode(), 2);
assert.equal(getLogs().length, 1);
jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.equal(jsonOutput.exitCode, 2);
assert.equal(jsonOutput.error, 'Missing input file path.');

// 6. JSON Mode: Missing/unavailable ffprobe
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, 'throw'));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 2);
assert.equal(getLogs().length, 1);
jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.equal(jsonOutput.exitCode, 2);
assert.equal(jsonOutput.error, 'Container is not readable by ffprobe, or ffprobe is not installed.');

// 7. JSON Mode: Unreadable input file
let failingStatDeps = createMockDeps(VALID_SIZE, baseFfprobeOutput);
failingStatDeps.deps.statSync = () => { throw new Error('not found'); };
runValidation('test.mp4', true, failingStatDeps.deps);
assert.equal(failingStatDeps.getExitCode(), 2);
assert.equal(failingStatDeps.getLogs().length, 1);
jsonOutput = JSON.parse(failingStatDeps.getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.equal(jsonOutput.exitCode, 2);
assert.equal(jsonOutput.error.includes('Input file does not exist'), true);

// 8. JSON Mode: Malformed ffprobe JSON
let malformedOutput = { foo: 'bar' };
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, malformedOutput));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 2);
assert.equal(getLogs().length, 1);
jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.equal(jsonOutput.exitCode, 2);
assert.equal(jsonOutput.error, 'Unreadable or malformed probe output.');

// 9. JSON Mode: Validation failure
let wrongCodecOutput = structuredClone(baseFfprobeOutput);
wrongCodecOutput.streams[0].codec_name = 'hevc';
({ deps, getExitCode, getLogs } = createMockDeps(VALID_SIZE, wrongCodecOutput));
runValidation('test.mp4', true, deps);
assert.equal(getExitCode(), 1);
assert.equal(getLogs().length, 1);
jsonOutput = JSON.parse(getLogs()[0]);
assert.equal(jsonOutput.passed, false);
assert.equal(jsonOutput.exitCode, 1);
assert.equal(jsonOutput.detected.codec, 'hevc');
assert.ok(jsonOutput.failureReasons.some(r => r.includes('Codec')));
assert.equal(jsonOutput.error, undefined); // Should not have infrastructure error

console.log('validate-exercise-motion-video: PASS (all tests passed)');
