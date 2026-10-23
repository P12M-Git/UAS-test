import type { RaceDataset } from "./models/race";

/** Keep sector-derived results; discard the per-checkpoint working audit. */
export function compactRace(dataset: RaceDataset): RaceDataset {
  for (const lap of dataset.laps) {
    delete lap.sectorGaps;
    delete lap.trafficCars;
    delete lap.sectorPasses;
  }
  return dataset;
}
