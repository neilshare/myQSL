import { normalizeStation, StationInputSchema, type StationInput } from "@myqsl/domain";
import { StationRepository, type StationRow } from "./repository";

export class StationService {
  constructor(private readonly repository: StationRepository, private readonly now: () => number = Date.now) {}

  async create(input: StationInput): Promise<StationRow> {
    const station = normalizeStation(StationInputSchema.parse(input));
    const timestamp = this.now();
    return this.repository.create({ ...station, created_at: timestamp, updated_at: timestamp });
  }

  async update(id: number, version: number, input: StationInput): Promise<StationRow | null> {
    const station = normalizeStation(StationInputSchema.parse(input));
    return this.repository.updateIfVersion(id, version, station, this.now());
  }

  list(): Promise<StationRow[]> {
    return this.repository.list();
  }
}
