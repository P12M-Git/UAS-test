# RaceCraft Driver Performance Analysis — Methodology

Application version **1.0.0** · Documentation version **1.0.0** · 4 September 2026  
Parser basis: `Main_Parser_V2.py` from the local U.RAICE dissertation workspace; no Git commit was available.

## 1. Application overview

RaceCraft turns one or more Al Kamel race timing CSVs into an auditable driver-performance report. Files are parsed in the browser and are not uploaded. Multiple files may be loaded, but exactly one event is selected and analysed at a time. The workflow is CSV ingestion → event selection → canonical laps → classification → timing-line race order → driver/category metrics → interactive views and CSV export.

## 2. Data parsing and U.RAICE relationship

`src/parser/uraice_adapter.ts` adapts U.RAICE `parse_timing_file()` and subsequent lap-type logic. It trims semicolon headers; requires `NUMBER` and `LAP_NUMBER`; prefers `S1_SECONDS + S2_SECONDS + S3_SECONDS` for lap time; falls back to `LAP_TIME`; preserves raw team/class/driver; uses supplied `ELAPSED` or reconstructs it per car; ranks cars by elapsed at each completed lap; and derives gaps by adjacent timing-line order.

| Raw field           | Internal field |   Units | Meaning                                               |
| ------------------- | -------------- | ------: | ----------------------------------------------------- |
| NUMBER              | carNumber      |       — | Competition number                                    |
| LAP_NUMBER          | lapNumber      |     lap | Completed race lap                                    |
| LAP_TIME / sectors  | lapTime        |       s | Sector sum preferred                                  |
| S1/2/3_SECONDS      | s1/s2/s3       |       s | Sector time                                           |
| ELAPSED             | elapsed        |       s | Race elapsed at line                                  |
| DRIVER_NAME         | driver         |       — | Driver on lap                                         |
| TEAM                | team           |       — | Entrant                                               |
| CLASS               | className      |       — | Sporting class                                        |
| Driver category TSV | category       |       — | FIA grade resolved from canonical and alternate names |
| PIT_TIME            | pitOut         | boolean | U.RAICE pit/out-lap proxy                             |
| FLAG_AT_FL          | raceState      |       — | GF/SF/RF/FCY/VSC                                      |

Malformed lap numbers are rejected. Missing times remain null and invalid. Duplicate car/event/lap keys, missing drivers and incomplete cars are reported. No value is invented for absent driver category.

## 3–4. Lap classification and filtering

Implementation: `src/parser/uraice_adapter.ts -> parseTimingCsv()`.

- Total lap: every accepted completed-lap row for a driver/car.
- Green lap: `GF`, plus race lap 1 as in U.RAICE. `SF` after lap 1 is SC; RF is red. A non-pit lap at least 1.20× the same-lap field median is an FCY/VSC proxy.
- Pit-out: `PIT_TIME` present or source pit-crossing marker true.
- Pit-in: lap immediately before a derived pit-out.
- Valid: positive, finite lap time.
- Clean: green AND not race lap 1 AND not pit-in/out AND valid.
- Clean air: eligible clean lap whose timing-line gap to the immediately preceding car is greater than 2.0 s.
- Traffic: eligible clean lap whose gap ahead is at most 2.0 s.

Filtering order is raw → valid green → remove lap 1 → remove pit-in → remove pit-out → clean. Traffic is deliberately retained because a clean lap describes analytical usability, not an absence of traffic.

## 5–9. Pace, dispersion and Z-score

Implementation: `src/analysis/driver_metrics.ts`.

Best lap is `min(clean lap time)`. If at least 20 clean laps exist, Best N is the fastest 20; with 10–19 it is the fastest 10; below 10 it uses all and raises LOW N. Manual Best 10, Best 20/fallback, and All clean modes are available. Average all clean is the arithmetic mean of every clean lap.

Population standard deviation is used (`ddof=0`): `sqrt(sum((xi-mean)^2)/N)`. MAD is raw `median(|xi - median(x)|)` and is not scaled. Both are calculated for Best N and all clean laps.

For each clean lap, the reference population is clean green-flag laps from **other drivers in the same event and class**. `performance_z = (reference_mean - lap_time) / reference_std`; positive is faster. Best-N and All-clean Z are the means of the respective lap-level scores. A missing or zero-width reference returns no score.

## 10–11. Clean air and traffic

Implementation: `reconstructOrder()` and `driverMetrics()`. At each completed lap all classes are sorted by elapsed time. The adjacent car ahead defines the timing-line gap, including slower-class and lapped cars. Clean Air % = clean-air laps / eligible clean laps × 100. Example: 18 clear crossings from 24 clean laps = 75%. This is an approximation: traffic elsewhere during the lap can be missed.

## 12–14. Overtakes and traffic performance

Implementation: `src/parser/uraice_adapter.ts -> reconstructOrder()`.

AN OVERTAKE INCLUDES PASSING A LAPPED CAR. For three consecutive valid green observations of the analysed car, the algorithm finds the next finish-line crossing of every other car after each of the first two boundaries. A pass is stored on the third observation when the other car crossed before the analysed car at the previous boundary but crosses after it at the current boundary. This crossing-sequence inversion works independently of class and completed-lap offset, so it includes lapped cars without treating a normal line-crossing phase as a new lap gained. Both observations must be green, non-pit, present and less than 300 s apart.

```text
for each driver and three consecutive green crossings:
  for each other car:
    previous_other = first other-car crossing after boundary 1
    current_other = first other-car crossing after boundary 2
    if previous_other crossed before driver boundary 2
       and current_other crosses after driver boundary 3
       and both cars are circulating without pit transitions:
         store one pass on boundary-3 lap
```

LMP2 and LMP2 Pro/Am share one LMP2 analysis group; Pro/Am entries retain a visible marker. With only lap-line observations, two swaps between crossings are invisible, retirement can resemble disappearance (therefore missing pairs are rejected), and exact pass location is unknown.

Traffic Performance groups clean laps by stored pass count: 0, 1, 2, 3, 4, 5+. It reports raw points, mean, median, min, max, population SD and N. A mean difference between groups is an observed association, not a causal overtake cost; fuel, tyres and evolution are uncontrolled.

## 15–18. Category benchmarks and colours

Implementation: `src/analysis/category_metrics.ts`. Each driver's metric is calculated first, then driver metrics are averaged within category—laps are never pooled for Best-N pace. Outputs are driver count, clean-lap count, average selected Best N, all-clean mean, fastest lap, mean driver SD/MAD, and mean/median Z. Colours are centralised in `src/config.ts`: Platinum grey, Gold gold, Silver light grey, Bronze brown-orange, Unknown slate.

## 19–22. UI interpretation

The ranking shows identity, car/team/class, selected/clean lap counts, best, Best-N average, all-clean average, SD, raw MAD, Clean Air %, reconstructed passes and performance Z. Every pace strip in a class uses the same scale: class-fastest clean lap to class-fastest + 6.0 s. This makes row-to-row distributions directly comparable.

Column headers show the active sort direction. Right-clicking a supported numeric cell establishes that driver as the reference and displays every driver's signed delta in that column. Driver Focus compares the selected driver's Best-N pace, fastest lap and MAD against Gold/Silver LMP2 driver-level benchmarks and summarises clean-lap pace with zero versus one-or-more reconstructed passes.

Lap Analysis plots lap number versus lap time with clean-air, traffic, pit and caution states, followed by timing sectors, position, adjacent gaps, state and pass count. Traffic Performance shows distributions by pass count. Category Benchmarks contains the driver-first aggregations above.

## 23. Data quality

The diagnostics page reports parsed/rejected rows, missing times/drivers, duplicate keys, cars with fewer than 80% of the maximum car lap count, unknown race-control states and laps excluded from clean analysis. Every retained pass is inspectable and exportable with the validation reason.

## 24–25. Assumptions and limitations

- Timing-line gap approximates whole-lap traffic exposure.
- 2.0 s defines clean air unless configuration changes.
- Lap 1 and pit transitions are excluded.
- `SF` means Safety Car after the opening lap; slow-lap inference uses U.RAICE's 1.20 factor.
- Fuel, tyre age, track evolution and weather are not corrected.
- Position is comparable-lap timing-line order, not an official classification feed.
- Exact overtake timing and transient mid-lap passes cannot be reconstructed.
- Missing categories remain Unknown; PDF report content is not silently joined by name.
- Small samples weaken inference. Metrics are descriptive, not causal.

## 26. Configuration

| Parameter                   | Default | Effect                                   |
| --------------------------- | ------: | ---------------------------------------- |
| CLEAN_AIR_THRESHOLD_SECONDS |     2.0 | Gap above which a clean lap is clear air |
| TOP_LAPS_DEFAULT            |      20 | Primary fastest-lap sample               |
| TOP_LAPS_FALLBACK           |      10 | Sample for 10–19 clean laps              |
| MINIMUM_SAMPLE_WARNING      |      10 | LOW N threshold                          |
| VSC_FCY_LAP_TIME_FACTOR     |    1.20 | Slow-lap caution proxy                   |

## 27–28. Formula and worked examples

Mean `Σxi/N`; population SD `sqrt(Σ(xi-μ)²/N)`; median is the ordered midpoint; MAD `median(|xi-median(x)|)`; Clean Air % `clear/clean × 100`; conventional Z `(x-μ)/σ`; performance Z `(μ-x)/σ`; category pace `Σ(driver Best-N means)/driver count`.

Examples: 23 clean laps select fastest 20; 14 select fastest 10; 7 select all and LOW N. For `[90,91,92]`, mean=91, population SD≈0.816 and MAD=1. If reference μ=92, σ=1.5 and lap=90.5, performance Z=+1.0. Gold driver means 90 and 92 produce category mean 91. If car A is behind B at lap 12 and ahead at lap 13 with both circulating and no pit transition, one pass is stored on lap 13.

## 29–31. Traceability, versioning and maintenance

Parsing/classification/order/overtakes: `src/parser/uraice_adapter.ts`. Pace, selection, SD, MAD and Z: `src/analysis/driver_metrics.ts`. Category aggregation: `src/analysis/category_metrics.ts`. Constants: `src/config.ts`. UI/export: `app/page.tsx`. Synthetic verification: `tests/analysis.test.ts`. Any formula, threshold, filter or pass-rule change must update this document in the same change.
