/**
 * Hebrew UI copy for the Motion Video Play/Pause control.
 *
 * Kept in a JSX-free module so it can be imported both by the component and by
 * the framework-free `node --test` suites (which cannot load `.tsx`).
 */

/** Accessible name of the control while the video is paused. */
export const MOTION_VIDEO_PLAY_LABEL = "הפעל סרטון";
/** Accessible name of the control while the video is playing. */
export const MOTION_VIDEO_PAUSE_LABEL = "השהה סרטון";
/** Accessible name of the control after a completed playback session (replay). */
export const MOTION_VIDEO_REPLAY_LABEL = "הפעל שוב";

/** Visible short text on the control. */
export const MOTION_VIDEO_PLAY_SHORT = "הפעל";
export const MOTION_VIDEO_PAUSE_SHORT = "השהה";
export const MOTION_VIDEO_REPLAY_SHORT = "הפעל שוב";

/** Screen-reader status strings, announced via an aria-live region. */
export const MOTION_VIDEO_PLAYING_STATUS = "הסרטון פועל";
export const MOTION_VIDEO_PAUSED_STATUS = "הסרטון מושהה";
/** Announced once the playback session has finished its cycle allowance. */
export const MOTION_VIDEO_COMPLETE_STATUS = "הסרטון הסתיים";
