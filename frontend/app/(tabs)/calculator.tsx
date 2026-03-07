import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Share, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  calcWeight, convertLength, shortItemName,
  LENGTH_UNITS, NB_OD_TABLE, NB_VALUES,
  nbToOD, odToNearestNB, Shape
} from '../../utils/conversions';

type DimUnit = 'mm' | 'inch';
type LenUnit = 'mm' | 'inch' | 'm' | 'feet';
type Section = 'weight' | 'length';

export default function CalculatorScreen() {
  const [section, setSection] = useState<Section>('weight');

  // ─── Weight Calculator State ──────────────────────────────────────
  const [shape, setShape] = useState<Shape | null>(null);
  const [dimUnit, setDimUnit] = useState<DimUnit | null>(null);
  const [thicknessUnit, setThicknessUnit] = useState<DimUnit>('mm');
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);
  const [side, setSide] = useState('');
  const [side1, setSide1] = useState('');
  const [side2, setSide2] = useState('');
  const [od, setOd] = useState('');
  const [thickness, setThickness] = useState('');
  const [length, setLength] = useState('');
  const [lengthUnit, setLengthUnit] = useState<LenUnit>('m');
  const [result, setResult] = useState<number | null>(null);

  // ─── Length Converter State ───────────────────────────────────────
  const [fromUnit, setFromUnit] = useState('mm');
  const [toUnit, setToUnit] = useState('inch');
  const [fromValue, setFromValue] = useState('');
  const [convertedValue, setConvertedValue] = useState<string | null>(null);
  const [nbInfo, setNbInfo] = useState<string | null>(null);

  // ─── Weight Calculator Logic ──────────────────────────────────────
  const resetWeight = () => {
    setShape(null); setDimUnit(null); setThicknessUnit('mm');
    setUnitsConfirmed(false); setSide(''); setSide1(''); setSide2('');
    setOd(''); setThickness(''); setLength(''); setResult(null);
  };

  const confirmUnits = () => {
    if (!dimUnit) { Alert.alert('Select Units', 'Please select dimension unit first'); return; }
    setUnitsConfirmed(true);
  };

  const calculate = () => {
    if (!shape || !dimUnit) return;
    const t = parseFloat(thickness);
    const l = parseFloat(length);
    if (isNaN(t) || isNaN(l) || t <= 0 || l <= 0) {
      Alert.alert('Invalid', 'Enter valid thickness and length'); return;
    }

    const input: any = {
      shape, dimUnit, thicknessUnit, thickness: t, length: l, lengthUnit,
    };

    if (shape === 'square') {
      const s = parseFloat(side);
      if (isNaN(s) || s <= 0) { Alert.alert('Invalid', 'Enter valid side'); return; }
      input.side = s;
    } else if (shape === 'rectangle') {
      const s1 = parseFloat(side1), s2 = parseFloat(side2);
      if (isNaN(s1) || isNaN(s2) || s1 <= 0 || s2 <= 0) { Alert.alert('Invalid', 'Enter valid sides'); return; }
      input.side1 = s1; input.side2 = s2;
    } else {
      const o = parseFloat(od);
      if (isNaN(o) || o <= 0) { Alert.alert('Invalid', 'Enter valid OD'); return; }
      input.od = o;
    }

    const weightResult = calcWeight(input);
    if (weightResult.valid) {
      setResult(weightResult.weight);
    } else {
      Alert.alert('Error', weightResult.error || 'Invalid input');
    }
  };

  // ─── Length Converter Logic ───────────────────────────────────────
  const doConvert = () => {
    const val = parseFloat(fromValue);
    if (isNaN(val)) { setConvertedValue(null); return; }

    const converted = convertLength(val, fromUnit as any, toUnit as any);
    if (isNaN(converted) || converted === undefined) {
      setConvertedValue(null);
      return;
    }
    setConvertedValue(converted.toFixed(4));

    // Extra NB/OD info
    if (fromUnit === 'nb') {
      const odVal = nbToOD(val);
      setNbInfo(odVal ? `NB ${val} = OD ${odVal} mm` : `NB ${val} not in standard table`);
    } else if (toUnit === 'nb' || fromUnit === 'od') {
      const mm = fromUnit === 'od' ? val : convertLength(val, fromUnit as any, 'mm');
      const nearest = odToNearestNB(mm);
      setNbInfo(nearest ? `Nearest NB: ${nearest.nb} (OD ${nearest.od} mm, diff ${nearest.diff.toFixed(2)} mm)` : null);
    } else {
      setNbInfo(null);
    }
  };

  const shareResult = async () => {
    if (result === null) return;
    const text = `Weight: ${result.toFixed(3)} kg\nShape: ${shape}\nDim Unit: ${dimUnit}\nThickness Unit: ${thicknessUnit}`;
    await Share.share({ message: text });
  };

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Calculator</Text>
      </View>

      {/* Section Toggle */}
      <View style={s.sectionToggle}>
        <TouchableOpacity style={[s.toggleBtn, section === 'weight' && s.toggleActive]}
          onPress={() => setSection('weight')} data-testid="calc-weight-tab">
          <Ionicons name="barbell" size={16} color={section === 'weight' ? '#fff' : '#9aa0a6'} />
          <Text style={[s.toggleText, section === 'weight' && s.toggleTextActive]}>Weight</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleBtn, section === 'length' && s.toggleActive]}
          onPress={() => setSection('length')} data-testid="calc-length-tab">
          <Ionicons name="resize" size={16} color={section === 'length' ? '#fff' : '#9aa0a6'} />
          <Text style={[s.toggleText, section === 'length' && s.toggleTextActive]}>Length / NB-OD</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {section === 'weight' ? (
          <>
            {/* Step 1: Shape Selection */}
            {!shape ? (
              <View style={s.card}>
                <Text style={s.stepLabel}>Step 1: Select Shape</Text>
                {(['square', 'rectangle', 'round'] as Shape[]).map(sh => (
                  <TouchableOpacity key={sh} style={s.shapeBtn} onPress={() => setShape(sh)} data-testid={`shape-${sh}`}>
                    <Ionicons name={sh === 'round' ? 'ellipse-outline' : 'square-outline'} size={24} color="#4285F4" />
                    <Text style={s.shapeBtnText}>{sh.charAt(0).toUpperCase() + sh.slice(1)}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#9aa0a6" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : !unitsConfirmed ? (
              /* Step 2: Unit Selection */
              <View style={s.card}>
                <View style={s.stepRow}>
                  <Text style={s.stepLabel}>Step 2: Select Units ({shape})</Text>
                  <TouchableOpacity onPress={resetWeight}><Ionicons name="arrow-back" size={20} color="#9aa0a6" /></TouchableOpacity>
                </View>

                <Text style={s.unitGroupLabel}>Dimension Unit (Side / OD)</Text>
                <View style={s.unitRow}>
                  {(['mm', 'inch'] as DimUnit[]).map(u => (
                    <TouchableOpacity key={u} style={[s.unitBtn, dimUnit === u && s.unitBtnActive]}
                      onPress={() => setDimUnit(u)} data-testid={`dim-unit-${u}`}>
                      <Text style={[s.unitBtnText, dimUnit === u && s.unitBtnTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.unitGroupLabel}>Thickness Unit</Text>
                <View style={s.unitRow}>
                  {(['mm', 'inch'] as DimUnit[]).map(u => (
                    <TouchableOpacity key={u} style={[s.unitBtn, thicknessUnit === u && s.unitBtnActive]}
                      onPress={() => setThicknessUnit(u)} data-testid={`thick-unit-${u}`}>
                      <Text style={[s.unitBtnText, thicknessUnit === u && s.unitBtnTextActive]}>
                        {u}{u === 'mm' ? ' (Default)' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={s.confirmBtn} onPress={confirmUnits} data-testid="confirm-units-btn">
                  <Text style={s.confirmBtnText}>Confirm Units</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Step 3: Dimensions Input + Result */
              <View style={s.card}>
                <View style={s.stepRow}>
                  <Text style={s.stepLabel}>Step 3: Enter Dimensions</Text>
                  <TouchableOpacity onPress={() => setUnitsConfirmed(false)}>
                    <Ionicons name="arrow-back" size={20} color="#9aa0a6" />
                  </TouchableOpacity>
                </View>

                {shape === 'square' && (
                  <InputField label={`Side (${dimUnit})`} value={side} onChangeText={setSide} testId="input-side" />
                )}
                {shape === 'rectangle' && (
                  <>
                    <InputField label={`Side 1 (${dimUnit})`} value={side1} onChangeText={setSide1} testId="input-side1" />
                    <InputField label={`Side 2 (${dimUnit})`} value={side2} onChangeText={setSide2} testId="input-side2" />
                  </>
                )}
                {shape === 'round' && (
                  <InputField label={`OD (${dimUnit})`} value={od} onChangeText={setOd} testId="input-od" />
                )}

                <InputField label={`Thickness (${thicknessUnit})`} value={thickness} onChangeText={setThickness} testId="input-thickness" />

                <View style={s.lengthRow}>
                  <View style={{ flex: 1 }}>
                    <InputField label="Length" value={length} onChangeText={setLength} testId="input-length" />
                  </View>
                  <View style={s.lengthUnitPicker}>
                    {(['mm', 'inch', 'm', 'feet'] as LenUnit[]).map(u => (
                      <TouchableOpacity key={u} style={[s.smallUnitBtn, lengthUnit === u && s.smallUnitBtnActive]}
                        onPress={() => setLengthUnit(u)}>
                        <Text style={[s.smallUnitText, lengthUnit === u && s.smallUnitTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={s.calcBtn} onPress={calculate} data-testid="calculate-btn">
                  <Ionicons name="calculator" size={20} color="#fff" />
                  <Text style={s.calcBtnText}>Calculate Weight</Text>
                </TouchableOpacity>

                {result !== null && (
                  <View style={s.resultBox}>
                    <Text style={s.resultLabel}>Weight</Text>
                    <Text style={s.resultValue} data-testid="weight-result">{result.toFixed(3)} kg</Text>
                    <TouchableOpacity style={s.shareBtn} onPress={shareResult}>
                      <Ionicons name="share-outline" size={16} color="#4285F4" />
                      <Text style={s.shareBtnText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity style={s.resetBtn} onPress={resetWeight}>
                  <Text style={s.resetBtnText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* ─── LENGTH / NB-OD CONVERTER ─────────────────────────── */
          <>
            <View style={s.card}>
              <Text style={s.stepLabel}>Length Converter</Text>

              <Text style={s.unitGroupLabel}>From</Text>
              <View style={s.unitGrid}>
                {LENGTH_UNITS.map(u => (
                  <TouchableOpacity key={u.key} style={[s.gridUnitBtn, fromUnit === u.key && s.gridUnitBtnActive]}
                    onPress={() => { setFromUnit(u.key); setConvertedValue(null); setNbInfo(null); }}>
                    <Text style={[s.gridUnitText, fromUnit === u.key && s.gridUnitTextActive]}>{u.label}</Text>
                    <Text style={s.gridUnitHint}>{u.hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <InputField label={`Value (${fromUnit})`} value={fromValue} onChangeText={(t) => { setFromValue(t); setConvertedValue(null); }} testId="length-from-input" />

              <Text style={s.unitGroupLabel}>To</Text>
              <View style={s.unitGrid}>
                {LENGTH_UNITS.map(u => (
                  <TouchableOpacity key={u.key} style={[s.gridUnitBtn, toUnit === u.key && s.gridUnitBtnActive]}
                    onPress={() => { setToUnit(u.key); setConvertedValue(null); setNbInfo(null); }}>
                    <Text style={[s.gridUnitText, toUnit === u.key && s.gridUnitTextActive]}>{u.label}</Text>
                    <Text style={s.gridUnitHint}>{u.hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.calcBtn} onPress={doConvert} data-testid="convert-length-btn">
                <Ionicons name="swap-horizontal" size={20} color="#fff" />
                <Text style={s.calcBtnText}>Convert</Text>
              </TouchableOpacity>

              {convertedValue !== null && (
                <View style={s.resultBox}>
                  <Text style={s.resultLabel}>{fromValue} {fromUnit} =</Text>
                  <Text style={s.resultValue} data-testid="length-result">{convertedValue} {toUnit}</Text>
                  {nbInfo && <Text style={s.nbInfoText}>{nbInfo}</Text>}
                </View>
              )}
            </View>

            {/* NB-OD Reference Table */}
            <View style={s.card}>
              <Text style={s.stepLabel}>NB / OD Reference Table</Text>
              <View style={s.tableHeader}>
                <Text style={s.tableHeaderCell}>NB</Text>
                <Text style={s.tableHeaderCell}>OD (mm)</Text>
              </View>
              {NB_VALUES.map(nb => (
                <View key={nb} style={s.tableRow}>
                  <Text style={s.tableCell}>{nb}</Text>
                  <Text style={s.tableCell}>{NB_OD_TABLE[nb]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InputField({ label, value, onChangeText, testId }: { label: string; value: string; onChangeText: (t: string) => void; testId: string }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChangeText}
        keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#5f6368" data-testid={testId} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  sectionToggle: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#16213e' },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0f3460' },
  toggleActive: { backgroundColor: '#4285F4' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#9aa0a6' },
  toggleTextActive: { color: '#fff' },
  scroll: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#16213e', borderRadius: 16, padding: 18, marginBottom: 14 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  stepLabel: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14 },
  shapeBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 14, backgroundColor: '#0f3460', borderRadius: 12, marginBottom: 8 },
  shapeBtnText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#e0e0e0' },
  unitGroupLabel: { fontSize: 12, fontWeight: '600', color: '#9aa0a6', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  unitRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  unitBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0f3460', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  unitBtnActive: { borderColor: '#4285F4', backgroundColor: '#1a2f5e' },
  unitBtnText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  unitBtnTextActive: { color: '#4285F4' },
  confirmBtn: { backgroundColor: '#4285F4', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#9aa0a6', marginBottom: 6 },
  input: { backgroundColor: '#0f3460', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#1a3a6e' },
  lengthRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  lengthUnitPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: 120, justifyContent: 'flex-end', paddingBottom: 12 },
  smallUnitBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#0f3460' },
  smallUnitBtnActive: { backgroundColor: '#4285F4' },
  smallUnitText: { fontSize: 11, fontWeight: '600', color: '#9aa0a6' },
  smallUnitTextActive: { color: '#fff' },
  calcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#34A853', paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  calcBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resultBox: { backgroundColor: '#0f3460', borderRadius: 12, padding: 16, marginTop: 14, alignItems: 'center', borderWidth: 1, borderColor: '#34A853' },
  resultLabel: { fontSize: 12, color: '#9aa0a6', marginBottom: 4 },
  resultValue: { fontSize: 28, fontWeight: '800', color: '#34A853' },
  nbInfoText: { fontSize: 12, color: '#4285F4', marginTop: 8, textAlign: 'center' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  shareBtnText: { fontSize: 13, color: '#4285F4', fontWeight: '600' },
  resetBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 10 },
  resetBtnText: { fontSize: 14, color: '#EA4335', fontWeight: '600' },
  // Length converter
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  gridUnitBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0f3460', borderWidth: 2, borderColor: 'transparent', alignItems: 'center', minWidth: 70 },
  gridUnitBtnActive: { borderColor: '#4285F4', backgroundColor: '#1a2f5e' },
  gridUnitText: { fontSize: 14, fontWeight: '700', color: '#9aa0a6' },
  gridUnitTextActive: { color: '#4285F4' },
  gridUnitHint: { fontSize: 9, color: '#5f6368', marginTop: 2 },
  // NB table
  tableHeader: { flexDirection: 'row', backgroundColor: '#0f3460', borderRadius: 8, padding: 10, marginBottom: 4 },
  tableHeaderCell: { flex: 1, fontSize: 13, fontWeight: '700', color: '#4285F4', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  tableCell: { flex: 1, fontSize: 14, color: '#e0e0e0', textAlign: 'center' },
});
