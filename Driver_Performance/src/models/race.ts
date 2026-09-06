export type Category = "Platinum" | "Gold" | "Silver" | "Bronze" | "Unknown";
export type RaceState = "GREEN" | "SC" | "FCY/VSC" | "RED" | "UNKNOWN";
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
