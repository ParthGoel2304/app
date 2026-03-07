// Central Conversion Engine — shared across Calculator, Filter, Layout
// ALL conversions go through mm as base unit

// ─── NB ↔ OD Pipe Standard Table ────────────────────────────────────
export const NB_OD_TABLE: Record<number, number> = {
  15: 21.34,
  20: 26.67,
  25: 33.40,
  32: 42.16,
  40: 48.26,
  50: 60.33,
  65: 73.03,
  80: 88.90,
  100: 114.30,
  125: 139.70,
  150: 168.30,
};

export const NB_VALUES = Object.keys(NB_OD_TABLE).map(Number);

export function nbToOD(nb: number): number | null {
  return NB_OD_TABLE[nb] ?? null;
}

export function odToNearestNB(od_mm: number): { nb: number; od: number; diff: number } | null {
  let closest: { nb: number; od: number; diff: number } | null = null;
  for (const [nb, tableOD] of Object.entries(NB_OD_TABLE)) {
    const diff = Math.abs(od_mm - tableOD);
    if (!closest || diff < closest.diff) {
      closest = { nb: Number(nb), od: tableOD, diff };
    }
  }
  return closest;
}

// ─── Length Unit Conversions (base = mm) ─────────────────────────────
type LengthUnit = 'mm' | 'cm' | 'm' | 'inch' | 'feet' | 'nb' | 'od';

const MM_FACTORS: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
  feet: 304.8,
};

export function toMM(value: number, unit: LengthUnit): number {
  if (unit === 'nb') {
    const od = nbToOD(value);
    return od ?? value; // fallback to value if NB not in table
  }
  if (unit === 'od') return value; // OD is already in mm
  return value * (MM_FACTORS[unit] ?? 1);
}

export function fromMM(valueMM: number, unit: LengthUnit): number {
  if (unit === 'nb') {
    const nearest = odToNearestNB(valueMM);
    return nearest?.nb ?? valueMM;
  }
  if (unit === 'od') return valueMM;
  return valueMM / (MM_FACTORS[unit] ?? 1);
}

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  const mm = toMM(value, from);
  return fromMM(mm, to);
}

export const LENGTH_UNITS: { key: LengthUnit; label: string; hint: string }[] = [
  { key: 'mm', label: 'mm', hint: 'Millimetre' },
  { key: 'cm', label: 'cm', hint: 'Centimetre' },
  { key: 'm', label: 'm', hint: 'Metre' },
  { key: 'inch', label: 'inch', hint: 'Inch' },
  { key: 'feet', label: 'feet', hint: 'Feet' },
  { key: 'nb', label: 'NB', hint: 'Nominal Bore (Pipe)' },
  { key: 'od', label: 'OD', hint: 'Outer Diameter (mm)' },
];

// ─── Weight Calculator ──────────────────────────────────────────────
// STEEL WEIGHT FORMULAS - User-specified
// Input: Side/OD in INCHES, Thickness in MM, Length in FEET
// Output: Weight in kg
//
// Square:    W = (Side − Thickness) × Thickness × 0.00957 × Length
// Rectangle: W = ((S1 + S2) − 2 × Thickness) × Thickness × 0.004785 × Length
// Round OD:  W = (OD − Thickness) × Thickness × 0.007516 × Length
// Round NB:  W = ((NB − Thickness) × 0.88261) × Thickness × 0.007516 × Length

export type Shape = 'square' | 'rectangle' | 'round';

export interface WeightInput {
  shape: Shape;
  dimUnit: 'mm' | 'inch';
  thicknessUnit: 'mm' | 'inch';
  side?: number;      // square
  side1?: number;     // rectangle
  side2?: number;     // rectangle
  od?: number;        // round
  thickness: number;
  length: number;
  lengthUnit: 'mm' | 'inch' | 'm' | 'feet';
  // For round pipe NB mode
  useNB?: boolean;
}

export function calcWeight(input: WeightInput): number {
  // Step 1: Convert dimension inputs to INCHES for calculation
  // Side/OD should be in inches, Thickness should stay in MM for the formula
  const dimToInch = input.dimUnit === 'mm' ? (1 / 25.4) : 1;
  
  // Thickness MUST be in MM for the formula (convert if in inches)
  const thickToMM = input.thicknessUnit === 'inch' ? 25.4 : 1;
  const thickness_mm = input.thickness * thickToMM;

  // Step 2: Convert length to FEET
  let length_ft: number;
  switch (input.lengthUnit) {
    case 'mm': length_ft = input.length / 304.8; break;
    case 'inch': length_ft = input.length / 12; break;
    case 'm': length_ft = input.length * 3.28084; break;
    case 'feet': default: length_ft = input.length; break;
  }

  // Step 3: Calculate weight using formulas (side/OD in inch, thickness in mm, length in feet)
  switch (input.shape) {
    case 'square': {
      // W = (Side − Thickness) × Thickness × 0.00957 × Length
      // Side in inches, Thickness in mm
      const side_inch = (input.side ?? 0) * dimToInch;
      return (side_inch - thickness_mm) * thickness_mm * 0.00957 * length_ft;
    }
    case 'rectangle': {
      // W = ((S1 + S2) − 2 × Thickness) × Thickness × 0.004785 × Length
      const s1_inch = (input.side1 ?? 0) * dimToInch;
      const s2_inch = (input.side2 ?? 0) * dimToInch;
      return ((s1_inch + s2_inch) - 2 * thickness_mm) * thickness_mm * 0.004785 * length_ft;
    }
    case 'round': {
      const od_inch = (input.od ?? 0) * dimToInch;
      if (input.useNB) {
        // NB Mode: W = ((NB − Thickness) × 0.88261) × Thickness × 0.007516 × Length
        return ((od_inch - thickness_mm) * 0.88261) * thickness_mm * 0.007516 * length_ft;
      } else {
        // OD Mode: W = (OD − Thickness) × Thickness × 0.007516 × Length
        return (od_inch - thickness_mm) * thickness_mm * 0.007516 * length_ft;
      }
    }
  }
}

// ─── Short Item Name Generator ──────────────────────────────────────
export function shortItemName(fullName: string): string {
  if (!fullName || fullName.trim().length === 0) return '';

  const name = fullName.trim();

  // Extract thickness pattern like "2.5mm", "3MM", "40NB"
  const thicknessMatch = name.match(/(\d+\.?\d*)\s*(mm|MM|nb|NB|inch|in)/i);
  const thicknessStr = thicknessMatch
    ? `(${thicknessMatch[1]}${thicknessMatch[2].toUpperCase()})`
    : '';

  // Remove the thickness part and numbers for abbreviation
  const cleanName = name
    .replace(/(\d+\.?\d*)\s*(mm|MM|nb|NB|inch|in)/gi, '')
    .replace(/\d+\.?\d*/g, '')
    .replace(/[×xX]/g, '')
    .trim();

  // Take first letter of each word, max 4 chars
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  const abbrev = words
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 4);

  return abbrev + thicknessStr;
}
