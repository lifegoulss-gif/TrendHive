import { z } from "zod";

// ==================== Organization ====================
export const OrganizationSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1),
  slug: z.string(),
  displayName: z.string().optional(),
  avatar: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

// ==================== User & Auth ====================
export const RoleSchema = z.enum(["OWNER", "MANAGER", "EMPLOYEE"]);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z.object({
  id: z.string().cuid(),
  clerkId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  orgId: z.string().cuid(),
  role: RoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// ==================== WhatsApp Session ====================
export const SessionStatusSchema = z.enum([
  "CONNECTING",
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const WhatsAppSessionSchema = z.object({
  id: z.string().cuid(),
  orgId: z.string().cuid(),
  phoneNumber: z.string().regex(/^\+\d{1,15}$/).optional().nullable(),
  name: z.string().optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  status: SessionStatusSchema,
  lastConnectedAt: z.date().optional().nullable(),
  lastErrorAt: z.date().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WhatsAppSession = z.infer<typeof WhatsAppSessionSchema>;

// ==================== Messages ====================
export const MessageDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

export const MediaTypeSchema = z.enum([
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "DOCUMENT",
]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MessageSchema = z.object({
  id: z.string().cuid(),
  orgId: z.string().cuid(),
  sessionId: z.string().cuid(),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  direction: MessageDirectionSchema,
  mediaUrl: z.string().url().optional().nullable(),
  mediaType: MediaTypeSchema.optional().nullable(),
  aiProcessed: z.boolean().default(false),
  wamId: z.string().optional().nullable(),
  timestamp: z.date(),
  isQuoted: z.boolean().default(false),
  quotedMsgId: z.string().optional().nullable(),
  createdAt: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;

// For incoming messages from queue
export const InboundMessageEventSchema = z.object({
  sessionId: z.string().cuid(),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  timestamp: z.date(),
  wamId: z.string().optional(),
});

export type InboundMessageEvent = z.infer<typeof InboundMessageEventSchema>;

// ==================== AI Todos ====================
export const PrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const TodoSchema = z.object({
  id: z.string().cuid(),
  orgId: z.string().cuid(),
  messageId: z.string().cuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  priority: PrioritySchema,
  completed: z.boolean().default(false),
  completedAt: z.date().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Extracted from AI
export const ExtractedTodoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.date().optional(),
  priority: PrioritySchema.optional().default("NORMAL"),
});

export type ExtractedTodo = z.infer<typeof ExtractedTodoSchema>;

// ==================== Billing ====================
export const SubscriptionStatusSchema = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "PAUSED",
]);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().cuid(),
  orgId: z.string().cuid(),
  stripeCustomerId: z.string(),
  status: SubscriptionStatusSchema,
  messageLimit: z.number().int().positive(),
  messageUsage: z.number().int().nonnegative(),
  currentPeriodStart: z.date().optional().nullable(),
  currentPeriodEnd: z.date().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

// ==================== API Response Types ====================
export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Export all types for convenience
export * from "zod";
