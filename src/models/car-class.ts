/** Vehicle class for pace references; FIA driver ratings and Pro-Am labels are separate. */
export function carClassKey(value: string): string {
  const key = value.trim().toUpperCase().replace(/[\s_/-]+/g, "");
  if (key.startsWith("LMP2")) return "LMP2";
  if (key.startsWith("LMP3")) return "LMP3";
  if (key.startsWith("LMGT3") || key.startsWith("GT3") || key.startsWith("GTD")) return "LMGT3";
  return key;
}
