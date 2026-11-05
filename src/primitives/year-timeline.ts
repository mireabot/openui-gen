import { z } from "zod";

/** A year-grouped card rail. Empty stats omit the optional statistics section. */
export const YearTimelineItemSchema = z.object({
  id: z.string(), name: z.string(), year: z.string(), dates: z.string(),
  location: z.string(), logo: z.string(), color: z.string(),
  marker: z.enum(["none", "currency"]),
  stats: z.array(z.object({ label: z.string(), value: z.string() })).max(3),
});

export const YearTimelineItemsSchema = z.array(YearTimelineItemSchema).max(40);
export type YearTimelineItem = z.infer<typeof YearTimelineItemSchema>;
