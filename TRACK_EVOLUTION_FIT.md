# Track evolution fit

Race Analysis → Track evolution fit compares each lap with its contemporaneous
class, using race-elapsed time (not the driver's stint lap). LMP2 and Pro-Am
share a class reference. Events and sessions are kept separate.

1. Reuse `buildStints().clean`: valid timed laps, no in/out laps or neutralisation,
   then exclude >120% of that stint's eligible mean. No change to this existing
   cleaning method. Missing elapsed times cannot enter the time-window analysis.
2. Apply the optional percentage cutoff relative to the fastest eligible lap
   in each event/session/class, for both analysed laps and reference laps.
3. For each lap crossing, take the centred window ±150 seconds. Compute each
   OTHER driver's median in that window, then the median of those medians.
   Every rival has equal weight regardless of its number of observations.
   Require at least three distinct rivals; otherwise delta is unavailable.
4. Internal delta = observed lap time − reference. The plot shows NORMALISED
   LAP TIMES, not deltas: add a fixed event/class baseline, calculated as the
   median of each driver's eligible whole-event median. Plot m:ss.000 against
   race elapsed minutes, with one-second Y ticks. A trailing mean of three
   consecutive normalised laps resets at gaps/stint boundaries. Dashed lines
   fit normalised time directly against elapsed minutes within each stint
   (s/min); per-lap raw/relative DEG remains separately available in the tables.
5. Summary includes median normalised lap time, standard deviation, MAD and
   first/last-third median normalised times. Race thirds use total event
   duration, not each driver's run.
   Unavailable samples display a dash, not zero.

Class/car/FIA/driver display selections hide traces, not peers from the reference.
Focus is highlighted in purple. Tables report the number used and the number
missing adequate rivals. Driver-summary raw and relative DEG use identical
matched laps and average valid stint slopes equally. The expandable stint table
also preserves raw DEG over all eligible timed laps for comparison.

This is descriptive normalisation of observed field pace, not a causal estimate
of track grip. It does not remove fuel load, tyre age, traffic or changes in the
composition of the peer group. The centred window uses future observations and
is intended for post-race analysis. No interpolation across unsupported windows.
