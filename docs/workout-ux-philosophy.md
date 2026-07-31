# Viora Workout UX Philosophy

## Purpose

This document is the official design standard for every workout-related feature in Viora. It exists to keep the workout experience consistent, focused, and respectful of the user while they are training.

All future workout features, screens, components, AI behaviors, and notifications must be evaluated against this document before implementation.

---

## Objective

Create a single source of truth for workout UX decisions so that:

- The product does not gradually introduce complexity or inconsistency.
- Every new feature has a clear justification.
- The user's workout remains the center of attention.
- The AI coach behaves like a thoughtful personal trainer, not an intrusive app.

---

## Core Principles

### 1. The workout always has priority over the application.

The app exists to support the workout, not the other way around. If a UI element, animation, or flow competes with the workout, the workout wins.

### 2. User interaction during a workout must be minimized.

Every tap, swipe, and decision during a session costs focus. Prefer smart defaults, auto-advance, voice, and passive capture over manual input.

### 3. The AI should observe silently during the workout.

The AI collects context while the user trains. It does not offer suggestions, corrections, or commentary unless the user explicitly asks or there is a safety concern.

### 4. AI analysis should primarily occur after the workout.

Insight, coaching, pattern detection, and recommendations belong in the Coach Debrief or post-session summary, not during the active set.

### 5. Real-time notifications must be rare, valuable and non-intrusive.

A notification during a workout is an interruption. Only send one when it is genuinely useful — for example, rest timer completion, safety alert, or a milestone the user explicitly enabled.

### 6. Every interruption requires a clear user benefit.

If the app interrupts the user, the benefit must be obvious: safety, time saved, form correction, or motivation. "Engagement" is not a benefit.

### 7. Exercise substitutions are temporary until explicitly approved.

If the user swaps an exercise, treat it as a one-time substitution. Do not rewrite the template or plan unless the user confirms the change.

### 8. Every workout continues the user's personal journey.

Load prior performance, celebrate progress, and surface personal records in context. The workout should feel like a continuation, not a fresh start every time.

### 9. Coaching should feel natural and conversational.

AI messages should read like something a calm, knowledgeable trainer would say. Avoid robotic lists, excessive metrics, and generic motivation.

### 10. The application should reduce cognitive load rather than increase it.

If a feature forces the user to think harder, remember more, or parse dense information, it fails. Clarity and calm come first.

---

## Design Rules

Before adding any new workout feature, ask:

- **Does this interrupt the workout?**
- **Can this wait until the Coach Debrief?**
- **Does this reduce or increase cognitive load?**
- **Would a real personal trainer behave this way?**

If the answer to any of these questions is negative, the feature must be redesigned. A feature that interrupts without clear benefit, adds decisions during a set, or behaves unlike a real trainer does not meet the Viora workout standard.

---

## Acceptance Criteria

A workout feature is considered complete only when:

1. The Workout UX Philosophy is documented and accessible to the team.
2. Future workout development references these principles in design and code review.
3. New workout features are evaluated against these standards before implementation.
4. The feature does not violate any of the ten core principles.
5. The feature passes the four design-rule questions without requiring exceptions.

---

## How to Use This Document

- **Design phase:** Review the principles and rules before sketching a new workout flow.
- **Code review:** Verify that the change respects silent AI observation, minimal interaction, and post-workout analysis.
- **Product decisions:** Use the four questions to resolve debates about notifications, substitutions, debrief content, and real-time coaching.

---

## Status

- **Version:** 1.0
- **Effective date:** 2026-07-31
- **Owner:** Viora Product & Engineering
- **Review cycle:** Each major workout sprint
