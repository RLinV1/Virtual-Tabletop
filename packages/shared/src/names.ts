/** Comparison key for names: "raymond", "Raymond " and "RAYMOND" are one name (KAN-61, KAN-62). */
export const normalizeName = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("en-US");

/**
 * `normalizeName` without the trim, for comparing a stored (already trimmed) name with a slice of
 * text the same length: trimming the slice would let "José " match a name stored decomposed.
 */
export const foldName = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");
