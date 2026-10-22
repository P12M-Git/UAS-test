export type Category = "Platinum" | "Gold" | "Silver" | "Bronze" | "Unknown";
export type RaceState = "GREEN" | "SC" | "FCY/VSC" | "RED" | "UNKNOWN";
export interface SectorGap {
  /** 0 = lap start, 1 = S1, 2 = S2, 3 = finish line. */
  sector: number;
  elapsed: number | null;
  gapAhead: number | null;
  carAhead: string | null;
  carAheadLap: number | null;
  lapDifference: number | null;
  complete: boolean;
}
export interface Lap {
  id: string;
  event: string;
  session: string;
  sourceFile: string;
  lapNumber: number;
  carNumber: string;
  driver: string;
  team: string;
  category: Category;
  className: string;
  proAm: boolean;
  lapTime: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  elapsed: number | null;
  elapsedReliable?: boolean;
  position: number | null;
  classPosition: number | null;
  gapLeader: number | null;
  gapAhead: number | null;
  gapBehind: number | null;
  carAhead: string | null;
  carBehind: string | null;
  pitIn: boolean;
  pitOut: boolean;
  valid: boolean;
  raceState: RaceState;
  green: boolean;
  clean: boolean;
  cleanAir: boolean | null;
  trafficCount: number;
  sectorGaps?: SectorGap[];
  trafficCars?: string[];
  sectorPasses?: string[];
  cleanAirReason?: "not-clean" | "sector-gap" | "sector-pass" | "missing-sector-timing" | "clear";
  overtakes: string[];
  stintId?: string;
  tyreSet?: string;
  tyreAge?: number;
  sourceRaceState?: string;
  tyreChange?: boolean;
  pitDuration?: number;
  refuelLitres?: number;
  refuelSeconds?: number;
  stopNote?: string;
  reportedPosition?: number;
}
export interface ParseDiagnostics {
  sourceFile: string;
  rowsParsed: number;
  rowsRejected: number;
  missingLapTimes: number;
  missingDrivers: number;
  duplicateLaps: number;
  incompleteCars: number;
  unknownRaceControl: number;
  excludedCleanLaps: number;
}
export interface RaceDataset {
  laps: Lap[];
  diagnostics: ParseDiagnostics[];
}
