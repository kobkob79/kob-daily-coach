/**
 * Vision Capture domain — declares the six supported capture types and the
 * structured fields each type expects to extract via AI in the future.
 * UI stays type-agnostic: it reads FIELDS_BY_TYPE to render the right form.
 *
 * The AI worker (added in a future sprint) will populate the `extracted`
 * JSON on the `vision_captures` row; today the user can also fill/edit it
 * manually so the data starts flowing before the vision model is wired.
 */
import {
  Utensils,
  Barcode,
  FileText,
  FlaskConical,
  Pill,
  Camera,
  type LucideIcon,
} from "lucide-react";

export type CaptureType =
  | "meal"
  | "food_label"
  | "medical_document"
  | "blood_test"
  | "medication"
  | "body_progress";

export type CaptureStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "skipped";

export interface FieldDef {
  key: string;
  labelKey: string;
  type: "text" | "number" | "date" | "textarea";
}

export interface CaptureTypeDef {
  key: CaptureType;
  labelKey: string;
  hintKey: string;
  icon: LucideIcon;
  fields: FieldDef[];
  /** Hint shown to the browser input to prefer the rear camera. */
  cameraFacing: "environment" | "user";
}

export const CAPTURE_TYPES: CaptureTypeDef[] = [
  {
    key: "meal",
    labelKey: "capture.type.meal",
    hintKey: "capture.type.meal.hint",
    icon: Utensils,
    cameraFacing: "environment",
    fields: [
      { key: "dish", labelKey: "capture.field.dish", type: "text" },
      { key: "ingredients", labelKey: "capture.field.ingredients", type: "textarea" },
      { key: "calories", labelKey: "capture.field.calories", type: "number" },
      { key: "protein_g", labelKey: "capture.field.protein", type: "number" },
      { key: "carbs_g", labelKey: "capture.field.carbs", type: "number" },
      { key: "fat_g", labelKey: "capture.field.fat", type: "number" },
      { key: "fiber_g", labelKey: "capture.field.fiber", type: "number" },
    ],
  },
  {
    key: "food_label",
    labelKey: "capture.type.food_label",
    hintKey: "capture.type.food_label.hint",
    icon: Barcode,
    cameraFacing: "environment",
    fields: [
      { key: "product", labelKey: "capture.field.product", type: "text" },
      { key: "barcode", labelKey: "capture.field.barcode", type: "text" },
      { key: "serving_size", labelKey: "capture.field.servingSize", type: "text" },
      { key: "calories", labelKey: "capture.field.calories", type: "number" },
      { key: "protein_g", labelKey: "capture.field.protein", type: "number" },
    ],
  },
  {
    key: "medical_document",
    labelKey: "capture.type.medical_document",
    hintKey: "capture.type.medical_document.hint",
    icon: FileText,
    cameraFacing: "environment",
    fields: [
      { key: "doc_type", labelKey: "capture.field.docType", type: "text" },
      { key: "doctor", labelKey: "capture.field.doctor", type: "text" },
      { key: "doc_date", labelKey: "capture.field.docDate", type: "date" },
      { key: "summary", labelKey: "capture.field.summary", type: "textarea" },
    ],
  },
  {
    key: "blood_test",
    labelKey: "capture.type.blood_test",
    hintKey: "capture.type.blood_test.hint",
    icon: FlaskConical,
    cameraFacing: "environment",
    fields: [
      { key: "lab", labelKey: "capture.field.lab", type: "text" },
      { key: "test_date", labelKey: "capture.field.testDate", type: "date" },
      { key: "marker", labelKey: "capture.field.marker", type: "text" },
      { key: "value", labelKey: "capture.field.value", type: "text" },
      { key: "summary", labelKey: "capture.field.summary", type: "textarea" },
    ],
  },
  {
    key: "medication",
    labelKey: "capture.type.medication",
    hintKey: "capture.type.medication.hint",
    icon: Pill,
    cameraFacing: "environment",
    fields: [
      { key: "med_name", labelKey: "capture.field.medName", type: "text" },
      { key: "dose", labelKey: "capture.field.dose", type: "text" },
      { key: "schedule", labelKey: "capture.field.schedule", type: "text" },
    ],
  },
  {
    key: "body_progress",
    labelKey: "capture.type.body_progress",
    hintKey: "capture.type.body_progress.hint",
    icon: Camera,
    cameraFacing: "user",
    fields: [
      { key: "body_view", labelKey: "capture.field.bodyView", type: "text" },
      { key: "weight_kg", labelKey: "capture.field.bodyWeight", type: "number" },
    ],
  },
];

export const CAPTURE_TYPE_BY_KEY: Record<CaptureType, CaptureTypeDef> =
  Object.fromEntries(CAPTURE_TYPES.map((c) => [c.key, c])) as Record<
    CaptureType,
    CaptureTypeDef
  >;

export const CAPTURE_BUCKET = "vision-captures";
