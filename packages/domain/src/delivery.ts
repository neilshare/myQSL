import { z } from "zod";

export const DeliveryStatusSchema = z.enum([
  "preview", "queued", "sending", "submitted", "delivered", "retry_wait", "failed", "unknown", "skipped", "cancelled", "bounced", "complained", "suppressed"
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const DeliveryErrorCodeSchema = z.enum([
  "QRZ_SUBSCRIPTION_REQUIRED", "QRZ_NO_EMAIL", "QRZ_NOT_FOUND", "QRZ_AUTH_ERROR", "QRZ_UNAVAILABLE",
  "RECIPIENT_SUPPRESSED", "PREVIEW_EXPIRED", "DAILY_QUOTA_EXCEEDED", "DELIVERY_UNKNOWN", "DELIVERY_IN_FLIGHT"
]);
export type DeliveryErrorCode = z.infer<typeof DeliveryErrorCodeSchema>;

export const DeliveryItemSchema = z.object({
  delivery_id: z.string().min(1).max(80).nullable(),
  card_id: z.string().min(1).max(80),
  position: z.number().int().nonnegative(),
  status: DeliveryStatusSchema,
  masked_email: z.string().max(160).nullable(),
  resolved_call: z.string().max(16).nullable(),
  error_code: DeliveryErrorCodeSchema.nullable()
});
export type DeliveryItem = z.infer<typeof DeliveryItemSchema>;

export const DeliveryBatchSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["preparing", "ready", "failed", "expired"]),
  version: z.number().int().positive(),
  language: z.enum(["zh", "en"]),
  attachment_mode: z.enum(["png", "link_only"]),
  items: z.array(DeliveryItemSchema).max(50),
  created_at: z.number().int().nonnegative(),
  ready_at: z.number().int().nonnegative().nullable(),
  expires_at: z.number().int().positive().nullable()
});
export type DeliveryBatch = z.infer<typeof DeliveryBatchSchema>;
