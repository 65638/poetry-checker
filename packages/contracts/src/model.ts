import { z } from "zod";

export const ModelProviderSchema = z.enum(["zhipu", "deepseek"]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
