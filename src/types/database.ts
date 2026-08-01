/**
 * Central database type helpers.
 * Single source of truth for row / insert / update shapes across the app.
 */
import type { Database } from "@/integrations/supabase/types";

export type { Database };

export type PublicSchema = Database["public"];
export type TableName = keyof PublicSchema["Tables"];

export type Row<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type Insert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type Update<T extends TableName> = PublicSchema["Tables"][T]["Update"];
export type Enum<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
