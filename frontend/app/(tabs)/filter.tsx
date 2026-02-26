import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  FlatList, Modal
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import axios from 'axios';
import { getExcelStore, getColOffset } from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

// Reverse mapping: Hindi word → number
const HINDI_TO_NUM: Record<string, number> = {};
Object.entries(H).forEach(([num, hindi]) => {
  HINDI_TO_NUM[hindi] = parseInt(num);
});
// Add common variations
HINDI_TO_NUM['पाँच'] = 5;
HINDI_TO_NUM['पांच'] = 5;

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

// Convert Hindi speech to size format
function hindiToSize(hindiText: string): string {
  // Split by spaces and common separators
  const words = hindiText.toLowerCase().trim().split(/[\s,]+/);
  const numbers: number[] = [];
  
  for (const word of words) {
    // Check if it's a Hindi number word
    if (HINDI_TO_NUM[word] !== undefined) {
      numbers.push(HINDI_TO_NUM[word]);
    }
    // Check if it's already a digit
    else if (/^\d+$/.test(word)) {
      numbers.push(parseInt(word));
    }
    // Skip "by", "x", "into" etc
    else if (['by', 'x', 'into', 'बाय', 'गुणा', 'में'].includes(word)) {
      continue;
    }
  }
  
  // Join numbers with X
  if (numbers.length >= 2) {
    return numbers.join('X');
  }
  // If no numbers found, return original (might be a direct size input)
  return hindiText.replace(/\s+/g, '').toUpperCase();
}

// ─── Category shortcuts ──────────────────────────────────────────────────────
const CATEGORY_SHORTCUTS: Record<string, { start: number; end: number; label: string }> = {
  'local': { start: 3, end: 73, label: 'Local Items' },
  'l': { start: 3, end: 73, label: 'Local Items' },
  'hr': { start: 74, end: 109, label: 'HR Coil Items' },
  'coil': { start: 74, end: 109, label: 'HR Coil Items' },
  'hr coil': { start: 74, end: 109, label: 'HR Coil Items' },
  'h.r.': { start: 74, end: 109, label: 'HR Coil Items' },
  'apollo': { start: 110, end: 147, label: 'Apollo Items' },
  'a': { start: 110, end: 147, label: 'Apollo Items' },
};

// Special item keywords
const SPECIAL_KEYWORDS = ['sdf', 'ddf', 't-9', 'rt-14', 'ms angle', 't9', 'rt14'];

// ─── Size matching utilities ─────────────────────────────────────────────────
interface FilterResult {
  inputSize: string;
  displaySize: string;
  altName: string;
  sizeDiff: number;
  stock: string;
  adjustedRate: number;
  rowIndex: number;
}

interface SuggestionItem {
  size: string;
  altName: string;
  sizeDiff: number;
  stock: string;
  rowIndex: number;
  matchType: 'exact' | 'partial' | 'alt' | 'special' | 'category';
}

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[×X×\*]/gi, 'x');
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

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Voice search state
  const [isListening, setIsListening] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceText, setVoiceText] = useState('');

  // Quick calculator
  const [calcWeight, setCalcWeight] = useState('');
  const [calcRate, setCalcRate] = useState('');

  const calcTotal = (() => {
    const w = parseFloat(calcWeight);
    const r = parseFloat(calcRate || basicRate);
    return !isNaN(w) && !isNaN(r) ? (w * r).toFixed(0) : null;
  })();

  useFocusEffect(
    React.useCallback(() => {
      const store = getExcelStore();
      setDataAvailable(store !== null && store.data.length > 1);
      setRowCount(store ? Math.max(0, store.data.length - 1) : 0);
    }, [])
  );

  // Auto-suggestion logic
  useEffect(() => {
    if (!sizeInput.trim() || sizeInput.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const store = getExcelStore();
    if (!store || store.data.length < 2) return;

    const offset = getColOffset(store.cellRange);
    const eIdx = 4 - offset;  // Col E - Size
    const fIdx = 5 - offset;  // Col F - Alt name
    const hIdx = 7 - offset;  // Col H - Size diff
    const oIdx = 14 - offset; // Col O - Stock

    const query = normalizeStr(sizeInput);
    const found: SuggestionItem[] = [];

    // Check for category shortcut
    const categoryMatch = CATEGORY_SHORTCUTS[query];
    if (categoryMatch) {
      // Return items from category range
      for (let i = categoryMatch.start; i <= Math.min(categoryMatch.end, store.data.length - 1); i++) {
        const row = store.data[i];
        if (!row) continue;
        const size = (row[eIdx] || '').toString().trim();
        const altName = (row[fIdx] || '').toString().trim();
        const diffRaw = (row[hIdx] || '0').toString().replace(/[^\d.-]/g, '');
        const sizeDiff = parseFloat(diffRaw) || 0;
        const stock = (row[oIdx] || '0').toString();
        
        if (size) {
          found.push({ size, altName, sizeDiff, stock, rowIndex: i, matchType: 'category' });
        }
        if (found.length >= 15) break;
      }
    } else {
      // Regular search
      for (let i = 1; i < store.data.length; i++) {
        const row = store.data[i];
        if (!row) continue;
        
        const size = (row[eIdx] || '').toString().trim();
        const altName = (row[fIdx] || '').toString().trim();
        const diffRaw = (row[hIdx] || '0').toString().replace(/[^\d.-]/g, '');
        const sizeDiff = parseFloat(diffRaw) || 0;
        const stock = (row[oIdx] || '0').toString();
        
        if (!size) continue;

        const normSize = normalizeStr(stripBrackets(size));
        const normAlt = normalizeStr(altName);

        // Exact match
        if (normSize === query || normAlt === query) {
          found.unshift({ size, altName, sizeDiff, stock, rowIndex: i, matchType: 'exact' });
        }
        // Partial match in size
        else if (normSize.includes(query) || query.includes(normSize.substring(0, 3))) {
          found.push({ size, altName, sizeDiff, stock, rowIndex: i, matchType: 'partial' });
        }
        // Partial match in alt name
        else if (normAlt.includes(query)) {
          found.push({ size, altName, sizeDiff, stock, rowIndex: i, matchType: 'alt' });
        }
        // Special keyword match
        else if (SPECIAL_KEYWORDS.some(kw => normSize.includes(kw) && query.includes(kw.replace('-', '')))) {
          found.push({ size, altName, sizeDiff, stock, rowIndex: i, matchType: 'special' });
        }

        if (found.length >= 15) break;
      }
    }

    // Sort: exact > partial > alt > special > category
    const priority = { exact: 0, partial: 1, alt: 2, special: 3, category: 4 };
    found.sort((a, b) => priority[a.matchType] - priority[b.matchType]);

    setSuggestions(found.slice(0, 15));
    setShowSuggestions(found.length > 0);
  }, [sizeInput]);

  const selectSuggestion = (item: SuggestionItem) => {
    setSizeInput(item.size);
    setShowSuggestions(false);
  };

  // Voice search handler (simulated - will use device speech)
  const startVoiceSearch = () => {
    setVoiceModalVisible(true);
    setVoiceText('');
    // Note: expo-speech-recognition requires native build
    // For now, show modal where user can type Hindi or use device keyboard voice
    Alert.alert(
      'Voice Search',
      'Tap the microphone on your keyboard to speak in Hindi.\n\nExample: "बहत्तर बहत्तर पच्चीस" → 72X72X25',
      [{ text: 'OK' }]
    );
  };

  const processVoiceInput = () => {
    if (voiceText.trim()) {
      const converted = hindiToSize(voiceText);
      setSizeInput(converted);
      setVoiceModalVisible(false);
    }
  };

  const findMatches = (
    query: string,
    rows: string[][],
    eIdx: number,
    fIdx: number,
    hIdx: number,
    oIdx: number
  ): FilterResult[] => {
    const results: FilterResult[] = [];
    const normQuery = normalizeStr(stripBrackets(query));
    const queryDims = parseDims(query);

    // Check category shortcut first
    const categoryMatch = CATEGORY_SHORTCUTS[normQuery];
    if (categoryMatch) {
      for (let i = categoryMatch.start; i <= Math.min(categoryMatch.end, rows.length - 1); i++) {
        const row = rows[i];
        if (!row) continue;
        const size = (row[eIdx] || '').toString().trim();
        if (!size) continue;
        
        const altName = (row[fIdx] || '').toString().trim();
        const diffRaw = (row[hIdx] || '0').toString().replace(/[^\d.-]/g, '');
        const sizeDiff = parseFloat(diffRaw) || 0;
        const stock = (row[oIdx] || '0').toString();
        
        results.push({
          inputSize: query,
          displaySize: size,
          altName,
          sizeDiff,
          stock,
          adjustedRate: 0,
          rowIndex: i,
        });
      }
      return results;
    }

    // Regular search
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      
      const colE = (row[eIdx] || '').toString().trim();
      const colF = (row[fIdx] || '').toString().trim();
      
      if (!colE) continue;

      const normE = normalizeStr(stripBrackets(colE));
      const normF = normalizeStr(colF);
      
      let matched = false;
      
      // Exact match
      if (normE === normQuery || normalizeStr(colE) === normQuery || normF === normQuery) {
        matched = true;
      }
      // Contains match
      else if (normE.includes(normQuery) || normF.includes(normQuery)) {
        matched = true;
      }
      // Dimension tolerance match
      else if (queryDims.length >= 2) {
        const eDims = parseDims(stripBrackets(colE));
        const fDims = parseDims(colF);
        if (dimsMatch(queryDims, eDims) || dimsMatch(queryDims, fDims)) {
          matched = true;
        }
        // Inch to mm conversion
        const queryMm = queryDims.map(d => d * 25.4);
        if (dimsMatch(queryMm, fDims)) {
          matched = true;
        }
      }

      if (matched) {
        const altName = colF;
        const diffRaw = (row[hIdx] || '0').toString().replace(/[^\d.-]/g, '');
        const sizeDiff = parseFloat(diffRaw) || 0;
        const stock = (row[oIdx] || '0').toString();
        
        results.push({
          inputSize: query,
          displaySize: colE,
          altName,
          sizeDiff,
          stock,
          adjustedRate: 0,
          rowIndex: i,
        });
      }
    }
    
    return results;
  };

  const handleFilter = () => {
    const store = getExcelStore();
    if (!store || store.data.length === 0) {
      Alert.alert('No Data', 'Please load a file first from the Home tab');
      return;
    }
    if (!sizeInput.trim()) {
      Alert.alert('Input Required', 'Enter at least one size or category');
      return;
    }
    if (!basicRate || isNaN(parseFloat(basicRate))) {
      Alert.alert('Invalid Rate', 'Enter a valid basic rate');
      return;
    }

    setLoading(true);
    setShowSuggestions(false);
    
    const rate = parseFloat(basicRate);
    const offset = getColOffset(store.cellRange);
    const eIdx = 4 - offset;
    const fIdx = 5 - offset;
    const hIdx = 7 - offset;
    const oIdx = 14 - offset;

    const queries = sizeInput.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    const allResults: FilterResult[] = [];
    const notFound: string[] = [];

    queries.forEach(q => {
      const matches = findMatches(q, store.data, eIdx, fIdx, hIdx, oIdx);
      if (matches.length > 0) {
        matches.forEach(m => {
          // Formula: Final Rate = Basic Rate + (Size Diff / 1000)
          const finalRate = rate + (m.sizeDiff / 1000);
          allResults.push({ ...m, adjustedRate: parseFloat(finalRate.toFixed(2)) });
        });
      } else {
        notFound.push(q);
      }
    });

    // Remove duplicates by rowIndex
    const unique = allResults.filter((item, idx, arr) => 
      arr.findIndex(x => x.rowIndex === item.rowIndex) === idx
    );

    setResults(unique);
    setSelected(new Set());
    setLoading(false);

    if (notFound.length > 0 && queries.length > 1) {
      Alert.alert('Not Found', `No match for:\n${notFound.join(', ')}`);
    } else if (unique.length === 0) {
      Alert.alert('No Results', `No items found for "${sizeInput}"`);
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
        pcs: 0,
        weight: 0,
        rate: r.adjustedRate,
        diff: r.sizeDiff,
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
          <Text style={styles.headerTitle}>Smart Filter</Text>
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
        <Text style={styles.headerTitle}>Smart Filter</Text>
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{rowCount} rows</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Search Input with Voice */}
          <View style={styles.section}>
            <Text style={styles.label}>Search Size / Category</Text>
            <Text style={styles.hint}>
              Type size (72X72X25) or category (Local, HR, Apollo)
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={sizeInput}
                onChangeText={setSizeInput}
                placeholder="1.5X1X7 or Local or HR"
                placeholderTextColor="#c0c0c0"
                autoCapitalize="characters"
              />
              <TouchableOpacity style={styles.voiceBtn} onPress={startVoiceSearch}>
                <Ionicons name="mic" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Auto-suggestions - INLINE with max height */}
            {showSuggestions && suggestions.length > 0 && (
              <ScrollView 
                style={styles.suggestionsBox}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <Text style={styles.suggestionsTitle}>
                  {suggestions[0].matchType === 'category' ? 'Category Items' : 'Suggestions'}
                </Text>
                {suggestions.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionItem}
                    onPress={() => selectSuggestion(item)}
                  >
                    <View style={styles.suggestionLeft}>
                      <Text style={styles.suggestionSize}>{item.size}</Text>
                      {item.altName && (
                        <Text style={styles.suggestionAlt}>{item.altName}</Text>
                      )}
                    </View>
                    <View style={styles.suggestionRight}>
                      <Text style={styles.suggestionDiff}>
                        {item.sizeDiff >= 0 ? '+' : ''}{item.sizeDiff}
                      </Text>
                      <Text style={styles.suggestionStock}>{item.stock} kg</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Category Shortcuts */}
          <View style={styles.shortcutsRow}>
            {['Local', 'HR', 'Apollo'].map(cat => (
              <TouchableOpacity
                key={cat}
                style={styles.shortcutBtn}
                onPress={() => setSizeInput(cat)}
              >
                <Text style={styles.shortcutText}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Basic Rate */}
          <View style={styles.section}>
            <Text style={styles.label}>Basic Rate (₹)</Text>
            <TextInput
              style={styles.input}
              value={basicRate}
              onChangeText={setBasicRate}
              placeholder="e.g. 46.5"
              placeholderTextColor="#c0c0c0"
              keyboardType="numeric"
            />
          </View>

          {/* Quick Rate Calculator */}
          <View style={styles.calcCard}>
            <View style={styles.calcHeader}>
              <Ionicons name="calculator" size={18} color="#FA7B17" />
              <Text style={styles.calcTitle}>Quick Calculator</Text>
            </View>
            <View style={styles.calcRow}>
              <View style={styles.calcInputWrap}>
                <Text style={styles.calcLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.calcInput}
                  value={calcWeight}
                  onChangeText={setCalcWeight}
                  placeholder="500"
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
                  placeholder={basicRate || '46.5'}
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
              onPress={() => { setSizeInput(''); setResults([]); setSelected(new Set()); setShowSuggestions(false); }}
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
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardSizeText} numberOfLines={1}>
                        {r.displaySize}
                      </Text>
                      {r.altName && (
                        <Text style={styles.cardAltText} numberOfLines={1}>
                          {r.altName}
                        </Text>
                      )}
                    </View>
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

      {/* Voice Input Modal */}
      <Modal
        visible={voiceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.voiceModal}>
            <Text style={styles.voiceModalTitle}>Voice Search (Hindi)</Text>
            <Text style={styles.voiceModalHint}>
              Use your keyboard's voice input or type Hindi numbers
            </Text>
            <TextInput
              style={styles.voiceInput}
              value={voiceText}
              onChangeText={setVoiceText}
              placeholder="बहत्तर बहत्तर पच्चीस"
              placeholderTextColor="#c0c0c0"
              multiline
            />
            <View style={styles.voiceModalBtns}>
              <TouchableOpacity
                style={styles.voiceCancelBtn}
                onPress={() => setVoiceModalVisible(false)}
              >
                <Text style={styles.voiceCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.voiceConfirmBtn}
                onPress={processVoiceInput}
              >
                <Text style={styles.voiceConfirmText}>Convert & Search</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 14, fontSize: 15, color: '#202124',
  },
  voiceBtn: {
    width: 50, backgroundColor: '#4285F4', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 14, fontSize: 15, color: '#202124',
  },
  shortcutsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  shortcutBtn: {
    flex: 1, backgroundColor: '#E8F0FE', paddingVertical: 10, borderRadius: 10,
    alignItems: 'center',
  },
  shortcutText: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  suggestionsBox: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, marginTop: 8, marginBottom: 8,
    maxHeight: 220,  // Show 4-5 items max
  },
  suggestionsTitle: {
    fontSize: 12, fontWeight: '600', color: '#9aa0a6',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  suggestionLeft: { flex: 1 },
  suggestionSize: { fontSize: 14, fontWeight: '600', color: '#202124' },
  suggestionAlt: { fontSize: 11, color: '#9aa0a6', marginTop: 2 },
  suggestionRight: { alignItems: 'flex-end' },
  suggestionDiff: { fontSize: 12, fontWeight: '600', color: '#34A853' },
  suggestionStock: { fontSize: 11, color: '#5f6368' },
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
  cardTitleWrap: { flex: 1 },
  cardSizeText: { fontSize: 15, fontWeight: '700', color: '#202124', letterSpacing: 0.3 },
  cardAltText: { fontSize: 11, color: '#9aa0a6', marginTop: 2 },
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
  // Quick Rate Calculator
  calcCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#FEE0B0',
    shadowColor: '#FA7B17', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  calcHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  calcTitle: { fontSize: 14, fontWeight: '700', color: '#FA7B17' },
  calcRow: { flexDirection: 'row', gap: 10 },
  calcInputWrap: { flex: 1 },
  calcLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '500', marginBottom: 5 },
  calcInput: {
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 10, fontSize: 15, color: '#202124',
  },
  calcResult: {
    marginTop: 12, backgroundColor: '#FEF0E6', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  calcResultLabel: { fontSize: 13, color: '#FA7B17', fontWeight: '600' },
  calcResultValue: { fontSize: 22, fontWeight: '800', color: '#FA7B17' },
  // Voice Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  voiceModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24,
  },
  voiceModalTitle: { fontSize: 20, fontWeight: '700', color: '#202124', marginBottom: 8 },
  voiceModalHint: { fontSize: 13, color: '#5f6368', marginBottom: 16 },
  voiceInput: {
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 16, fontSize: 18, color: '#202124',
    minHeight: 80, textAlignVertical: 'top',
  },
  voiceModalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  voiceCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center',
  },
  voiceCancelText: { fontSize: 15, fontWeight: '600', color: '#5f6368' },
  voiceConfirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#4285F4', alignItems: 'center',
  },
  voiceConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
