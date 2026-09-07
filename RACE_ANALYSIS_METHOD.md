# Race Analysis

The Y-axis is fixed to the whole event/class eligible sample, rounded outwards to integer seconds. Driver, car, FIA, tyre, display and percentage filters do not rescale it. Grid labels use full minute:second.millisecond times at one-second increments.

Tyre comparison assumes a full tank at every stop as specified by the user. Its selector compares new-tyre first stints, second-use stints, etc., independently of set IDs. The default comparison axis aligns laps within each full-tank stint. All eligible laps in each matched stint are shown. A driver-label change without a stop does not advance tyre-use count. Tyre age and elapsed race times remain visible.

Driver Performance supports a purple focus driver and a parallel-only filter. Parallel means positive overlap of timed lap intervals in the selected event; pit-out intervals are not used to infer overlap. This is timing-line evidence, not exact pit-exit telemetry. Ranking metrics still describe each displayed driver's whole event sample.

Stints use supplied STINT_ID when available; otherwise pit-out / previous pit-in boundaries and driver changes start a segment. Lap Time DEG is ordinary least-squares lap time against race lap number, in seconds per lap. Exclude in/out laps, invalid timings and non-green race-control states. Using remaining laps, compute the stint mean once and exclude timings strictly above 120% of it. Fits need two distinct lap numbers. Positive slope means increasing lap time. Driver Performance shows the unweighted mean of available stint slopes; Race Analysis shows the individual slopes and sample counts. This is observed lap-time degradation, not isolated tyre degradation corrected for fuel.

Race Analysis has race traces, optional fits, fits-only, strategy timing bars and a stint table. Optional percentage cutoff is measured against the fastest eligible lap in the visible cohort, after stint cleaning; displayed fits and table statistics use that same filtered sample. The x-axis can use race lap, elapsed minutes or supplied tyre lap age.

Tyre comparison reads dissertation processed_timing_database.csv (comma-separated, including quoted fields). It preserves STINT_ID, TYRE_SET_NUMBER and TYRE_SET_LAP_NUMBER, explicit in/out flags and elapsed times. Per Main_Parser_V2.py, sets continue across stops until TYRE_CHANGE creates a new set; supplied set numbers remain authoritative. Compare ordinal stint on a set within a car class, optionally requiring overlap in race time. Missing tyre annotations remain unknown; raw timing files cannot establish tyre changes. Set IDs are local to each car, not globally comparable IDs. Equal ordinal tyre usage does not establish equal fuel, exact tyre age, compound or track conditions.

To use existing tyre annotations, select the dissertation Database/Processed/processed_timing_database.csv through ADD SESSIONS. Events remain selectable individually. The dissertation database is read-only and is not modified by this app.
