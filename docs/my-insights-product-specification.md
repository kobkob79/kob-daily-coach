# “התובנות שלי” (My Insights) Product Specification

## Purpose

“התובנות שלי” is a private exercise memory area for each user, per-exercise. It stores personal equipment settings, practical notes, and sensitivities related to that specific exercise.

**Examples of Insights:**
- Seat height: 4.
- Backrest position: 2.
- "Narrow grip feels better."
- "Neck discomfort appeared previously."
- "Keep the neck neutral."
- Personal free-text note.

## Entry Point

- **User-Initiated:** The feature is opened only when the user chooses it. Do not interrupt the user after every exercise.
- **UI Element:** Display a collapsed button:
  - “התובנות שלי” when empty.
  - “התובנות שלי (3)” when three insights exist.
- **Privacy:** Do not expose insight contents in the collapsed state.

## Internal Sections

1. **“ההתאמות שלי”** (My Adjustments)
2. **“הערות ורגישויות”** (Notes and Sensitivities)

## Dynamic Fields

Preset actions depend on the exercise and equipment type.
- **Machine:** seat, backrest, handles, pin, and range.
- **Bench/free weights:** bench angle, grip type, grip width, and range.
- **Cable:** pulley height, attachment, grip, and machine distance.
- **Bodyweight:** position, support, range, and sensitivity.

Always provide a “הערה אישית” (Personal Note) option.

## Equipment Profiles

Each exercise has one default equipment profile. The user may create named profiles (e.g., "ICON", "Intel", "המכשיר השחור").
- Each profile can have separate seat, backrest, attachment, and grip settings.
- Notes and sensitivities may belong either to one specific profile or to the exercise generally.

## Update Rules

- **Equipment settings:** Keep one current value per category. A new value replaces the previous value.
- **Notes and sensitivities:** Handled as separate items. Pain/sensitivity notes remain until the user manually edits or deletes them (do not expire, resolve, or delete automatically).
- **Modification:** Every item can be edited and deleted.

## Add-Insight Flow

Use a short staged flow:
1. Select equipment profile.
2. Select a relevant preset category.
3. Enter a short value.
4. Save.

Always allow a free personal note. Do not require AI to interpret or save the information.

## Availability

The same private information is available:
- On the exercise-library page.
- During an active workout.

Editing in either location updates the same source of truth. Do not create a separate all-insights dashboard in V1.

## Open Decisions
- Whether a future central insights dashboard is needed.
- Exact UI styling.
- Medical-warning language.
