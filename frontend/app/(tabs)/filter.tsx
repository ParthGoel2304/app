import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExcelStore, getColOffset } from '../../utils/store';

// ─── Hindi number conversion ──────────────────────────────────────────────────
const H: Record<number, string> = {
  0:'शून्य',1:'एक',2:'दो',3:'तीन',4:'चार',5:'पांच',6:'छह',7:'सात',8:'आठ',9:'नौ',
  10:'दस',11:'ग्यारह',12:'बारह',13:'तेरह',14:'चौदह',15:'पंद्रह',16:'सोलह',17:'सत्रह',18:'अठारह',19:'उन्नीस',
  20:'बीस',21:'इक्कीस',22:'बाईस',23:'तेईस',24:'चौबीस',25:'पच्चीस',26:'छब्बीस',27:'सत्ताईस',28:'अट्ठाईस',29:'उनतीस',
  30:'तीस',31:'इकतीस',32:'बत्तीस',33:'तैंतीस',34:'चौंतीस',35:'पैंतीस',36:'छत्तीस',37:'सैंतीस',38:'अड़तीस',39:'उनतालीस',
  40:'चालीस',41:'इकतालीस',42:'बयालीस',43:'तैंतालीस',44:'चवालीस',45:'पैंतालीस',46:'छियालीस',47:'सैंतालीस',48:'अड़तालीस',49:'उनचास',
  50:'पचास',51:'इक्यावन',52:'बावन',53:'तिरपन',54:'चौवन',55:'पचपन',56:'छप्पन',57:'सत्तावन',58:'अट्ठावन',59:'उनसठ',
  60:'साठ',61:'इकसठ',62:'बासठ',63:'तिरसठ',64:'चौसठ',65:'पैंसठ',66:'छियासठ',67:'सड़सठ',68:'अड़सठ',69:'उनहत्तर',
  70:'सत्तर',71:'इकहत्तर',72:'बहत्तर',73:'तिहत्तर',74:'चौहत्तर',75:'पचहत्तर',76:'छिहत्तर',77:'सतहत्तर',78:'अठहत्तर',79:'उन्यासी',
  80:'अस्सी',81:'इक्यासी',82:'बयासी',83:'तिरासी',84:'चौरासी',85:'पचासी',86:'छियासी',87:'सत्तासी',88:'अट्ठासी',89:'नवासी',
  90:'नब्बे',91:'इक्यानवे',92:'बानवे',93:'तिरानवे',94:'चौरानवे',95:'पचानवे',96:'छियानवे',97:'सत्तानवे',98:'अट्ठानवे',99:'निन्यानवे'
};

function numToHindi(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  if (H[abs]) return (neg ? 'माइनस ' : '') + H[abs];
  if (abs >= 100 && abs < 10000) {
    const h = Math.floor(abs / 100);
    const r = abs % 100;
    return (neg ? 'माइनस ' : '') + (H[h] || h) + ' सौ' + (r > 0 ? ' ' + (H[r] || r) : '');
  }
  if (abs >= 10000) {
    const t = Math.floor(abs / 1000);
    const r = abs % 1000;
    return (neg ? 'माइनस ' : '') + (H[t] || t) + ' हजार' + (r > 0 ? ' ' + numToHindi(r) : '');
  }
  return (neg ? '-' : '') + abs.toString();
}

// ─── Size matching utilities ─────────────────────────────────────────────────
interface FilterResult {
  inputSize: string;
  displaySize: string;
  sizeDiff: number;
  stock: string;
  adjustedRate: number;
  rowIndex: number;
}

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[×X×]/gi, 'x');
}

function stripBrackets(s: string): string {
  return s.replace(/\([^)]*\)/g, '').trim();
}

function parseDims(s: string): number[] {
  return normalizeStr(stripBrackets(s))
    .split('x')
    .map(d => parseFloat(d))
    .filter(d => !isNaN(d) && d > 0);
}

function dimsMatch(a: number[], b: number[], tol = 5): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const len = Math.min(a.length, b.length);
  return Array.from({ length: len }).every((_, i) => Math.abs(a[i] - b[i]) <= tol);
}

function findMatch(
  userInput: string,
  rows: string[][],
  colEIdx: number,
  colFIdx: number,
  colHIdx: number,
  colOIdx: number
): FilterResult | null {
  const normInput = normalizeStr(stripBrackets(userInput));

  // Pass 1 — exact string matching
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const colE = (row[colEIdx] || '').toString().trim();
    const colF = (row[colFIdx] || '').toString().trim();

    // 1a: strip brackets from Col E (inch format) and compare
    if (colE && normalizeStr(stripBrackets(colE)) === normInput) {
      return buildResult(row, colE, userInput, i, colHIdx, colOIdx);
    }
    // 1b: compare with full Col E (user may include bracket too)
    if (colE && normalizeStr(colE) === normInput) {
      return buildResult(row, colE, userInput, i, colHIdx, colOIdx);
    }
    // 1c: direct match on Col F (mm format)
    if (colF && normalizeStr(colF) === normInput) {
      return buildResult(row, colE || colF, userInput, i, colHIdx, colOIdx);
    }
  }

  // Pass 2 — tolerance-based dimension matching
  const inputDims = parseDims(userInput);
  if (inputDims.length >= 2) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const colE = (row[colEIdx] || '').toString().trim();
      const colF = (row[colFIdx] || '').toString().trim();
      const fDims = parseDims(colF);
      const eDims = parseDims(stripBrackets(colE));

      // 2a: user dims vs Col F dims (both treated as same unit)
      if (fDims.length >= 2 && dimsMatch(inputDims, fDims)) {
        return buildResult(row, colE || colF, userInput, i, colHIdx, colOIdx);
      }
      // 2b: user dims converted inch→mm vs Col F
      const inputMm = inputDims.map(d => d * 25.4);
      if (fDims.length >= 2 && dimsMatch(inputMm, fDims)) {
        return buildResult(row, colE || colF, userInput, i, colHIdx, colOIdx);
      }
      // 2c: user dims vs stripped Col E (inch comparison)
      if (eDims.length >= 2 && dimsMatch(inputDims, eDims)) {
        return buildResult(row, colE || colF, userInput, i, colHIdx, colOIdx);
      }
    }
  }
  return null;
}

function buildResult(
  row: string[],
  displaySize: string,
  inputSize: string,
  rowIndex: number,
  colHIdx: number,
  colOIdx: number
): FilterResult {
  const raw = (row[colHIdx] || '0').toString().replace(/[^\d.-]/g, '');
  const sizeDiff = parseFloat(raw) || 0;
  const stock = (row[colOIdx] || '0').toString();
  return { inputSize, displaySize, sizeDiff, stock, adjustedRate: 0, rowIndex };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function FilterScreen() {
  const router = useRouter();
  const [sizeInput, setSizeInput] = useState('');
  const [basicRate, setBasicRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FilterResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dataAvailable, setDataAvailable] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  const [calcWeight, setCalcWeight] = useState('');
  const [calcRate, setCalcRate] = useState('');

  // Auto-fill calc rate from basicRate
  const calcTotal = (() => {
    const w = parseFloat(calcWeight);
    const r = parseFloat(calcRate || basicRate);
    return !isNaN(w) && !isNaN(r) ? (w * r).toFixed(0) : null;
  })();
    React.useCallback(() => {
      const store = getExcelStore();
      setDataAvailable(store !== null && store.data.length > 1);
      setRowCount(store ? Math.max(0, store.data.length - 1) : 0);
    }, [])
  );

  const handleFilter = () => {
    const store = getExcelStore();
    if (!store || store.data.length === 0) {
      Alert.alert('No Data', 'Please load a file first from the Home tab');
      return;
    }
    if (!sizeInput.trim()) {
      Alert.alert('Input Required', 'Enter at least one size');
      return;
    }
    if (!basicRate || isNaN(parseFloat(basicRate))) {
      Alert.alert('Invalid Rate', 'Enter a valid basic rate');
      return;
    }

    setLoading(true);
    const rate = parseFloat(basicRate);
    const offset = getColOffset(store.cellRange);
    // Column indices adjusted for range start offset
    // E=5th col (1-indexed), F=6th, H=8th, O=15th
    const eIdx = 4 - offset;  // Col E
    const fIdx = 5 - offset;  // Col F
    const hIdx = 7 - offset;  // Col H
    const oIdx = 14 - offset; // Col O

    const sizes = sizeInput.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    const found: FilterResult[] = [];
    const notFound: string[] = [];

    sizes.forEach(sz => {
      const match = findMatch(sz, store.data, eIdx, fIdx, hIdx, oIdx);
      if (match) {
        found.push({ ...match, adjustedRate: rate + match.sizeDiff });
      } else {
        notFound.push(sz);
      }
    });

    setResults(found);
    setSelected(new Set());
    setLoading(false);

    if (notFound.length > 0) {
      Alert.alert('Not Found', `No match for:\n${notFound.join(', ')}`);
    }
  };

  const toggleSelect = (idx: number) => {
    const s = new Set(selected);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    setSelected(s);
  };

  const handleAddToParchi = async () => {
    const toAdd = results.filter((_, i) => selected.has(i));
    if (toAdd.length === 0) {
      Alert.alert('Select Items', 'Tap a result card to select it first');
      return;
    }
    try {
      const stored = await AsyncStorage.getItem('parchi_items');
      const existing = stored ? JSON.parse(stored) : [];
      const newItems = toAdd.map(r => ({
        id: Date.now() + Math.random(),
        size: r.displaySize,
        diff: r.sizeDiff,
        finalRate: r.adjustedRate,
        stock: r.stock,
      }));
      await AsyncStorage.setItem('parchi_items', JSON.stringify([...existing, ...newItems]));
      await AsyncStorage.setItem('parchi_basic_rate', basicRate);
      Alert.alert('Added!', `${toAdd.length} item(s) added to Parchi`, [
        { text: 'View Parchi', onPress: () => router.navigate('/(tabs)/parchi' as any) },
        { text: 'OK' }
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save to Parchi');
    }
  };

  const speakHindi = (result: FilterResult) => {
    const diff = result.sizeDiff;
    const diffText = numToHindi(diff);
    const stockNum = parseFloat(result.stock) || 0;
    const stockText = numToHindi(stockNum);
    const text = `${result.displaySize} डिफरेंस ${diffText}, स्टॉक ${stockText} किलो`;
    Speech.speak(text, { language: 'hi-IN', rate: 0.85 });
  };

  // No data state
  if (!dataAvailable) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Size Filter</Text>
        </View>
        <View style={styles.noDataBox}>
          <Ionicons name="document-outline" size={64} color="#d0d0d0" />
          <Text style={styles.noDataTitle}>No Data Loaded</Text>
          <Text style={styles.noDataSub}>Load a file from the Home tab to start filtering</Text>
          <TouchableOpacity
            style={styles.goHomeBtn}
            onPress={() => router.navigate('/(tabs)/home' as any)}
          >
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={styles.goHomeBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Size Filter</Text>
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{rowCount} rows</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Size Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Sizes to Search</Text>
            <Text style={styles.hint}>
              Separate by comma, newline or semicolon{' '}·{' '}e.g. 1.5X1X7, 2X1.5X8
            </Text>
            <TextInput
              style={styles.multilineInput}
              value={sizeInput}
              onChangeText={setSizeInput}
              placeholder={"1.5X1X7\n2X1.5X8, 3X2X10"}
              placeholderTextColor="#c0c0c0"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Basic Rate */}
          <View style={styles.section}>
            <Text style={styles.label}>Basic Rate (₹)</Text>
            <TextInput
              style={styles.input}
              value={basicRate}
              onChangeText={setBasicRate}
              placeholder="e.g. 1200"
              placeholderTextColor="#c0c0c0"
              keyboardType="numeric"
            />
          </View>

          {/* Quick Rate Calculator */}
          <View style={styles.calcCard}>
            <View style={styles.calcHeader}>
              <Ionicons name="calculator" size={18} color="#FA7B17" />
              <Text style={styles.calcTitle}>Quick Rate Calculator</Text>
            </View>
            <View style={styles.calcRow}>
              <View style={styles.calcInputWrap}>
                <Text style={styles.calcLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.calcInput}
                  value={calcWeight}
                  onChangeText={setCalcWeight}
                  placeholder="e.g. 500"
                  placeholderTextColor="#c0c0c0"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.calcInputWrap}>
                <Text style={styles.calcLabel}>Rate (₹/kg)</Text>
                <TextInput
                  style={styles.calcInput}
                  value={calcRate || basicRate}
                  onChangeText={setCalcRate}
                  placeholder={basicRate || 'e.g. 1200'}
                  placeholderTextColor="#c0c0c0"
                  keyboardType="numeric"
                />
              </View>
            </View>
            {calcTotal && (
              <View style={styles.calcResult}>
                <Text style={styles.calcResultLabel}>Total Amount</Text>
                <Text style={styles.calcResultValue}>
                  ₹ {parseInt(calcTotal).toLocaleString('en-IN')}
                </Text>
              </View>
            )}
          </View>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.searchBtn]}
              onPress={handleFilter}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : (<>
                    <Ionicons name="search" size={18} color="#fff" />
                    <Text style={styles.btnText}>Search</Text>
                  </>)
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.clearBtn]}
              onPress={() => { setSizeInput(''); setResults([]); setSelected(new Set()); }}
            >
              <Ionicons name="trash-outline" size={18} color="#EA4335" />
              <Text style={[styles.btnText, { color: '#EA4335' }]}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {results.length > 0 && (
            <View>
              <View style={styles.resultsBar}>
                <Text style={styles.resultsTitle}>
                  {results.length} Result{results.length !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity
                  style={styles.selAllBtn}
                  onPress={() =>
                    setSelected(
                      selected.size === results.length
                        ? new Set()
                        : new Set(results.map((_, i) => i))
                    )
                  }
                >
                  <Text style={styles.selAllText}>
                    {selected.size === results.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              {results.map((r, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.resultCard,
                    selected.has(idx) && styles.resultCardSel,
                  ]}
                  onPress={() => toggleSelect(idx)}
                  activeOpacity={0.8}
                >
                  {/* Header row */}
                  <View style={styles.cardHeader}>
                    <View style={[styles.checkbox, selected.has(idx) && styles.checkboxOn]}>
                      {selected.has(idx) && (
                        <Ionicons name="checkmark" size={11} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.cardSizeText} numberOfLines={1}>
                      {r.displaySize}
                    </Text>
                    <TouchableOpacity
                      style={styles.speakerBtn}
                      onPress={() => speakHindi(r)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="volume-medium" size={17} color="#4285F4" />
                    </TouchableOpacity>
                  </View>

                  {/* Data chips */}
                  <View style={styles.chipsRow}>
                    <View style={styles.chip}>
                      <Text style={styles.chipLabel}>Diff</Text>
                      <Text
                        style={[
                          styles.chipValue,
                          { color: r.sizeDiff >= 0 ? '#34A853' : '#EA4335' },
                        ]}
                      >
                        {r.sizeDiff >= 0 ? '+' : ''}{r.sizeDiff}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipLabel}>Stock</Text>
                      <Text style={styles.chipValue}>{r.stock} kg</Text>
                    </View>
                    <View style={[styles.chip, styles.rateChip]}>
                      <Text style={styles.chipLabel}>Rate</Text>
                      <Text style={[styles.chipValue, styles.rateText]}>
                        ₹{r.adjustedRate}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              {selected.size > 0 && (
                <TouchableOpacity style={styles.parchiBtn} onPress={handleAddToParchi}>
                  <Ionicons name="document-text" size={20} color="#fff" />
                  <Text style={styles.parchiBtnText}>
                    Add {selected.size} to Parchi
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#202124', flex: 1 },
  rowBadge: {
    backgroundColor: '#E8F0FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  rowBadgeText: { fontSize: 12, color: '#4285F4', fontWeight: '600' },
  noDataBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noDataTitle: { fontSize: 20, fontWeight: '600', color: '#202124', marginTop: 16 },
  noDataSub: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  goHomeBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, gap: 8,
  },
  goHomeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  content: { padding: 16 },
  section: { marginBottom: 16 },
  label: { fontSize: 15, fontWeight: '600', color: '#202124', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9aa0a6', marginBottom: 8 },
  multilineInput: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 14, fontSize: 15, color: '#202124',
    minHeight: 100,
  },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 14, fontSize: 15, color: '#202124',
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, gap: 8,
  },
  searchBtn: { backgroundColor: '#4285F4' },
  clearBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EA4335' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultsBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  resultsTitle: { fontSize: 16, fontWeight: '600', color: '#202124' },
  selAllBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#E8F0FE',
  },
  selAllText: { fontSize: 12, color: '#4285F4', fontWeight: '600' },
  resultCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    padding: 14, borderWidth: 2, borderColor: '#e8e8e8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  resultCardSel: { borderColor: '#4285F4', backgroundColor: '#FAFCFF' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 2, borderColor: '#d0d0d0',
    marginRight: 10, justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: '#4285F4', borderColor: '#4285F4' },
  cardSizeText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#202124', letterSpacing: 0.3 },
  speakerBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, backgroundColor: '#f8f9fa',
    borderRadius: 10, padding: 10, alignItems: 'center',
  },
  rateChip: { backgroundColor: '#E6F4EA' },
  chipLabel: { fontSize: 10, color: '#9aa0a6', fontWeight: '500', marginBottom: 3 },
  chipValue: { fontSize: 14, fontWeight: '700', color: '#202124' },
  rateText: { color: '#34A853', fontSize: 15 },
  parchiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#9C27B0', borderRadius: 14,
    paddingVertical: 16, marginTop: 8, gap: 8,
  },
  parchiBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
