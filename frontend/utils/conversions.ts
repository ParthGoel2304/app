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
const DENSITY = 0.00785; // kg per mm²·mm·m (steel density factor)

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
}

export function calcWeight(input: WeightInput): number {
  // Step 1: Convert dimensions to mm
  const dimFactor = input.dimUnit === 'inch' ? 25.4 : 1;
  const thickFactor = input.thicknessUnit === 'inch' ? 25.4 : 1;

  const thickness_mm = input.thickness * thickFactor;

  // Step 2: Convert length to meters
  let length_m: number;
  switch (input.lengthUnit) {
    case 'mm': length_m = input.length / 1000; break;
    case 'inch': length_m = (input.length * 25.4) / 1000; break;
    case 'feet': length_m = input.length * 0.3048; break;
    case 'm': default: length_m = input.length; break;
  }

  // Step 3: Calculate weight based on shape
  switch (input.shape) {
    case 'square': {
      const side_mm = (input.side ?? 0) * dimFactor;
      return side_mm * side_mm * thickness_mm * length_m * DENSITY;
    }
    case 'rectangle': {
      const s1_mm = (input.side1 ?? 0) * dimFactor;
      const s2_mm = (input.side2 ?? 0) * dimFactor;
      return s1_mm * s2_mm * thickness_mm * length_m * DENSITY;
    }
    case 'round': {
      const od_mm = (input.od ?? 0) * dimFactor;
      return (Math.PI * od_mm * od_mm / 4) * thickness_mm * length_m * DENSITY;
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
