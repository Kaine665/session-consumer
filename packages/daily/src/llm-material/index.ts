import type { DayDigest } from "../types.js";
import { selectFromDay, type SelectionConfig } from "./selector.js";
import { compressDay, type CompressionConfig } from "./compressor.js";
import { formatDay } from "./formatter.js";

export { DEFAULT_SUMMARIZE_PROMPT } from "./prompt.js";
export type { SelectionConfig, InfoType } from "./selector.js";
export type { CompressionConfig, CompressionStrategy } from "./compressor.js";

/** Complete material preparation options. */
export interface MaterialOptions {
  selection?: SelectionConfig;
  compression?: CompressionConfig;
}

/**
 * Prepare a full day's session data into LLM-readable text.
 * Pipeline: select → compress → format.
 *
 * Defaults: userMessages + sessionMeta, head(5) compression.
 */
export function prepareMaterial(day: DayDigest, options?: MaterialOptions): string {
  const selected = selectFromDay(day, options?.selection);
  const compressed = compressDay(selected, options?.compression);
  return formatDay(compressed);
}
