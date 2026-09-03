import { z } from "zod";

const Call = z
  .string()
  .trim()
  .min(3)
  .max(16)
  .regex(/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/i);

export const StationInputSchema = z.object({
  callsign: Call,
  station_callsign: Call.nullable().default(null),
  operator_callsign: Call.nullable().default(null),
  grid_square: z.string().trim().max(8).nullable().default(null),
  qth: z.string().trim().max(160).nullable().default(null),
  rig: z.string().trim().max(120).nullable().default(null),
  antenna: z.string().trim().max(160).nullable().default(null),
  power_w: z.number().int().nonnegative().max(100_000).nullable().default(null),
  is_default: z.boolean().default(false)
});

export type StationInput = z.input<typeof StationInputSchema>;
export type Station = z.output<typeof StationInputSchema>;

export function normalizeStation(input: StationInput): Station {
  const station = StationInputSchema.parse(input);
  return {
    ...station,
    callsign: station.callsign.trim().toUpperCase(),
    station_callsign: station.station_callsign?.trim().toUpperCase() ?? null,
    operator_callsign: station.operator_callsign?.trim().toUpperCase() ?? null
  };
}
