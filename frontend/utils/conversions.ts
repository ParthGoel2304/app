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
// STEEL WEIGHT FORMULAS - FINAL CORRECTED VERSION
// 
// Input Setup:
// - Side/OD: INCHES (user input)
// - Thickness: MM (user input) 
// - Length: FEET (user input)
//
// Internal Conversion:
// - Convert sides to MM: side_mm = side_inch * 25.4
// - Thickness stays in MM
// - Length stays in FEET
//
// Formulas (all dimensions in mm, length in feet):
// Square:    W = (side_mm - thickness_mm) * thickness_mm * 0.00957 * length_ft
// Rectangle: W = (side1_mm + side2_mm - 2*thickness_mm) * thickness_mm * 0.004785 * length_ft
// Round:     W = (side_mm - thickness_mm) * thickness_mm * 0.007516 * length_ft

export type Shape = 'square' | 'rectangle' | 'round';
export type RoundInputType = 'od' | 'nb';

export interface WeightInput {
  shape: Shape;
  // For square/rectangle: side is always in inches
  side?: number;      // square (inches)
  side1?: number;     // rectangle (inches)
  side2?: number;     // rectangle (inches)
  // For round: OD or NB value
  od?: number;        // round pipe outer diameter or NB value
  roundInputType?: RoundInputType; // 'od' or 'nb'
  // Thickness always in mm
  thickness: number;  // mm
  // Length always in feet
  length: number;     // feet
}

export interface WeightResult {
  weight: number;
  valid: boolean;
  error?: string;
}

export function calcWeight(input: WeightInput): WeightResult {
  // Validation
  if (input.thickness <= 0) {
    return { weight: 0, valid: false, error: 'Thickness must be > 0' };
  }
  if (input.length <= 0) {
    return { weight: 0, valid: false, error: 'Length must be > 0' };
  }

  const thickness_mm = input.thickness; // Already in mm
  const length_ft = input.length;       // Already in feet

  switch (input.shape) {
    case 'square': {
      // Convert side from inches to mm
      const side_mm = (input.side ?? 0) * 25.4;
      
      // Validation: Side must be > Thickness
      if (side_mm <= thickness_mm) {
        return { weight: 0, valid: false, error: 'Side must be > Thickness' };
      }
      
      // Formula: (side_mm - thickness_mm) * thickness_mm * 0.00957 * length_ft
      const weight = (side_mm - thickness_mm) * thickness_mm * 0.00957 * length_ft;
      return { weight: Math.round(weight * 1000) / 1000, valid: true };
    }
    
    case 'rectangle': {
      // Convert sides from inches to mm
      const side1_mm = (input.side1 ?? 0) * 25.4;
      const side2_mm = (input.side2 ?? 0) * 25.4;
      
      // Validation: Combined sides must handle 2x thickness
      if ((side1_mm + side2_mm) <= 2 * thickness_mm) {
        return { weight: 0, valid: false, error: 'Sides too small for thickness' };
      }
      
      // Formula: (side1_mm + side2_mm - 2*thickness_mm) * thickness_mm * 0.004785 * length_ft
      const weight = (side1_mm + side2_mm - 2 * thickness_mm) * thickness_mm * 0.004785 * length_ft;
      return { weight: Math.round(weight * 1000) / 1000, valid: true };
    }
    
    case 'round': {
      // OD or NB value - convert to mm
      let side_mm: number;
      if (input.roundInputType === 'nb') {
        // NB is a nominal size - look up OD from table or use direct conversion
        const nbValue = input.od ?? 0;
        const odFromTable = NB_OD_TABLE[nbValue];
        side_mm = odFromTable ?? (nbValue * 25.4); // fallback to inch conversion
      } else {
        // OD in inches, convert to mm
        side_mm = (input.od ?? 0) * 25.4;
      }
      
      // Validation: OD must be > Thickness
      if (side_mm <= thickness_mm) {
        return { weight: 0, valid: false, error: 'OD/NB must be > Thickness' };
      }
      
      // Formula: (side_mm - thickness_mm) * thickness_mm * 0.007516 * length_ft
      const weight = (side_mm - thickness_mm) * thickness_mm * 0.007516 * length_ft;
      return { weight: Math.round(weight * 1000) / 1000, valid: true };
    }
  }
}

// Legacy function for backward compatibility
export function calcWeightSimple(input: {
  shape: Shape;
  dimUnit?: 'mm' | 'inch';
  thicknessUnit?: 'mm' | 'inch';
  side?: number;
  side1?: number;
  side2?: number;
  od?: number;
  thickness: number;
  length: number;
  lengthUnit?: 'mm' | 'inch' | 'm' | 'feet';
  useNB?: boolean;
}): number {
  // Convert old interface to new
  const newInput: WeightInput = {
    shape: input.shape,
    side: input.side,
    side1: input.side1,
    side2: input.side2,
    od: input.od,
    roundInputType: input.useNB ? 'nb' : 'od',
    thickness: input.thicknessUnit === 'inch' ? input.thickness * 25.4 : input.thickness,
    length: input.lengthUnit === 'm' ? input.length * 3.28084 : 
            input.lengthUnit === 'mm' ? input.length / 304.8 :
            input.lengthUnit === 'inch' ? input.length / 12 : input.length,
  };
  
  const result = calcWeight(newInput);
  return result.weight;
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
