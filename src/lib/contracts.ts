import { z } from "zod";

export const vehicleSchema = z.object({
  speedKph: z.number().min(0).max(130),
  batteryPercent: z.number().min(0).max(100),
  cabinTemperature: z.number().min(16).max(28),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const analysisInputSchema = z.object({
  image: z
    .string()
    .min(16)
    .max(1_500_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  capturedAt: z.string().datetime(),
  videoTime: z.number().nonnegative(),
  question: z.string().trim().min(1).max(800),
  mode: z.enum(["ask", "observe"]),
  vehicle: vehicleSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .max(6)
    .default([]),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;

// Validate the Python service boundary before its state is applied in the UI.
export const analysisResultSchema = z.object({
  output: z.object({
    answer: z.string().min(1).max(12000),
    observations: z.array(z.string().max(12000)).max(5),
    uncertainty: z.string().max(1000),
  }),
  vehicle: vehicleSchema,
  toolExecutions: z.array(
    z.object({
      name: z.enum([
        "inspect_frame",
        "read_vehicle_status",
        "set_cabin_temperature",
      ]),
      arguments: z.record(z.string(), z.unknown()),
      result: z.record(z.string(), z.unknown()),
      status: z.enum(["completed", "blocked"]),
      durationMs: z.number().nonnegative(),
    }),
  ),
  capturedAt: z.string().datetime(),
  videoTime: z.number().nonnegative(),
  model: z.string(),
  framework: z.string(),
  metrics: z.object({
    totalMs: z.number().nonnegative(),
    modelMs: z.number().nonnegative(),
    modelCalls: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
  }),
  trace: z.array(
    z.object({
      step: z.string(),
      detail: z.string(),
      durationMs: z.number().nonnegative(),
    }),
  ),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type ModelStatus = {
  ready: boolean;
  model: string;
  message: string;
  framework?: string;
};
