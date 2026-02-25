import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

interface FilterResult {
  size: string;
  sizeDiff: string;
  stock: string;
  adjustedRate: number;
  rowIndex: number;
}

export default function FilterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [sizeInput, setSizeInput] = useState('');
  const [basicRate, setBasicRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FilterResult[]>([]);

  // Parse size input: support comma, newline, semicolon
  const parseSizes = (input: string): string[] => {
    return input
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Normalize size: remove spaces, lowercase, replace × with x
  const normalizeSize = (size: string): { b: number; h: number; w: number; t?: number; unit: string } | null => {
    try {
      const normalized = size.toLowerCase().replace(/\s/g, '').replace(/×/g, 'x');
      
      // Extract thickness if in brackets
      let thickness: number | undefined;
      let mainPart = normalized;
      const thicknessMatch = normalized.match(/\(([0-9.]+)(mm|inch)?\)/);
      if (thicknessMatch) {
        thickness = parseFloat(thicknessMatch[1]);
        mainPart = normalized.replace(/\([^)]+\)/, '');
      }
      
      // Parse dimensions: bxhxw or bxh
      const parts = mainPart.split('x').map(p => parseFloat(p)).filter(n => !isNaN(n));
      if (parts.length < 2) return null;
      
      // Detect unit (mm or inch)
      const unit = normalized.includes('mm') ? 'mm' : 'inch';
      
      return {
        b: parts[0],
        h: parts[1],
        w: parts[2] || 0,
        t: thickness,
        unit
      };
    } catch {
      return null;
    }
  };

  // Convert to mm
  const convertToMm = (size: { b: number; h: number; w: number; t?: number; unit: string }): { b: number; h: number; w: number; t?: number } => {
    const factor = size.unit === 'inch' ? 25.4 : 1;
    return {
      b: Math.round(size.b * factor),
      h: Math.round(size.h * factor),
      w: Math.round(size.w * factor),
      t: size.t ? Math.round(size.t * factor) : undefined
    };
  };

  // Match with tolerance (±5mm per dimension)
  const matchSize = (target: any, candidate: any, tolerance = 5): boolean => {
    const checkDim = (t: number, c: number) => Math.abs(t - c) <= tolerance;
    return checkDim(target.b, candidate.b) && checkDim(target.h, candidate.h) && 
           (target.w === 0 || candidate.w === 0 || checkDim(target.w, candidate.w));
  };

  // Handle filter with REAL Excel data
  const handleFilter = () => {
    if (!sizeInput.trim()) {
      Alert.alert('Error', 'Please enter at least one size');
      return;
    }
    if (!basicRate || parseFloat(basicRate) <= 0) {
      Alert.alert('Error', 'Please enter a valid basic rate');
      return;
    }

    setLoading(true);
    
    try {
      // Get Excel data from params
      const excelData = params.data ? JSON.parse(params.data as string) : [];
      if (excelData.length === 0) {
        Alert.alert('Error', 'No Excel data available');
        setLoading(false);
        return;
      }

      // Parse input sizes
      const sizes = parseSizes(sizeInput);
      const results: FilterResult[] = [];

      // For each entered size, search in Excel
      sizes.forEach(sizeStr => {
        const normalized = normalizeSize(sizeStr);
        if (!normalized) return;

        const targetMm = convertToMm(normalized);

        // Search through Excel rows (skip header row 0)
        for (let i = 1; i < excelData.length; i++) {
          const row = excelData[i];
          
          // Column E (index 4) = inch, Column F (index 5) = mm
          const colE = (row[4] || '').toString().trim();
          const colF = (row[5] || '').toString().trim();
          
          // Try matching with column F (mm) first
          if (colF) {
            const candidateF = normalizeSize(colF);
            if (candidateF) {
              const candidateMm = convertToMm(candidateF);
              if (matchSize(targetMm, candidateMm)) {
                // Match found! Extract data
                const sizeDiff = (row[7] || '0').toString(); // Column H (index 7)
                const stock = (row[14] || '0').toString(); // Column O (index 14)
                
                results.push({
                  size: colF,
                  sizeDiff: sizeDiff,
                  stock: stock,
                  adjustedRate: parseFloat(basicRate) + parseFloat(sizeDiff || '0'),
                  rowIndex: i + 1
                });
                return; // Found match, move to next size
              }
            }
          }

          // Try matching with column E (inch)
          if (colE) {
            const candidateE = normalizeSize(colE);
            if (candidateE) {
              const candidateMm = convertToMm(candidateE);
              if (matchSize(targetMm, candidateMm)) {
                // Match found! Extract data
                const sizeDiff = (row[7] || '0').toString(); // Column H (index 7)
                const stock = (row[14] || '0').toString(); // Column O (index 14)
                
                results.push({
                  size: colE,
                  sizeDiff: sizeDiff,
                  stock: stock,
                  adjustedRate: parseFloat(basicRate) + parseFloat(sizeDiff || '0'),
                  rowIndex: i + 1
                });
                return; // Found match, move to next size
              }
            }
          }
        }
      });

      if (results.length === 0) {
        Alert.alert('No Matches', 'No matching sizes found in the Excel sheet');
      }

      setResults(results);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to process data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Hindi audio for size
  const speakHindi = (result: FilterResult) => {
    const text = `${result.size} का साइज डिफरेंस है ${convertToHindi(result.sizeDiff)} और स्टॉक है ${convertToHindi(result.stock)} किलो के पास`;
    Speech.speak(text, { language: 'hi' });
  };

  // Convert number to Hindi
  const convertToHindi = (num: string): string => {
    const n = parseInt(num);
    if (n % 100 === 0 && n >= 100) {
      const hundreds = n / 100;
      const hindiNumbers: { [key: number]: string } = {
        1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पांच',
        6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ', 10: 'दस',
        11: 'ग्यारह', 12: 'बारह', 13: 'तेरह', 14: 'चौदह', 15: 'पंद्रह',
        16: 'सोलह', 17: 'सत्रह', 18: 'अठारह', 19: 'उन्नीस', 20: 'बीस',
        21: 'इक्कीस'
      };
      return (hindiNumbers[hundreds] || hundreds.toString()) + ' सौ';
    }
    return num; // Fallback to number
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#202124" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Size Filter</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.inputSection}>
          <Text style={styles.label}>Enter Sizes</Text>
          <Text style={styles.hint}>Format: 50x40x6 or 50x40 (2.5mm){'\n'}Separate by comma, newline, or semicolon</Text>
          <TextInput
            style={styles.multilineInput}
            value={sizeInput}
            onChangeText={setSizeInput}
            placeholder="50x40x6, 60x50x8&#10;70x60x10"
            placeholderTextColor="#9aa0a6"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.label}>Basic Rate (₹)</Text>
          <TextInput
            style={styles.input}
            value={basicRate}
            onChangeText={setBasicRate}
            placeholder="Enter basic rate"
            placeholderTextColor="#9aa0a6"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.filterButton]}
            onPress={handleFilter}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="funnel" size={20} color="#fff" />
                <Text style={styles.buttonText}>Filter</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={() => {
              setSizeInput('');
              setBasicRate('');
              setResults([]);
            }}
          >
            <Ionicons name="close-circle" size={20} color="#EA4335" />
            <Text style={[styles.buttonText, { color: '#EA4335' }]}>Clear</Text>
          </TouchableOpacity>
        </View>

        {results.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>Filter Results ({results.length})</Text>
            
            {results.map((result, idx) => (
              <View key={idx} style={styles.resultCard}>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Size:</Text>
                  <Text style={styles.resultValue}>{result.size}</Text>
                </View>
                
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Size Diff:</Text>
                  <Text style={styles.resultValue}>₹{result.sizeDiff}</Text>
                </View>
                
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Stock:</Text>
                  <Text style={styles.resultValue}>{result.stock} kg</Text>
                </View>
                
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Adjusted Rate:</Text>
                  <Text style={[styles.resultValue, styles.rateHighlight]}>
                    ₹{result.adjustedRate}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.audioButton}
                  onPress={() => speakHindi(result)}
                >
                  <Ionicons name="volume-high" size={24} color="#4285F4" />
                  <Text style={styles.audioButtonText}>Speak in Hindi</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.createParchiButton}
              onPress={() => Alert.alert('Coming Soon', 'Parchi creation will be added next!')}
            >
              <Ionicons name="document-text" size={20} color="#fff" />
              <Text style={styles.buttonText}>Create Parchi</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#5f6368',
    marginBottom: 8,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#202124',
  },
  multilineInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#202124',
    minHeight: 120,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  filterButton: {
    backgroundColor: '#4285F4',
  },
  clearButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EA4335',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsSection: {
    marginTop: 8,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: '#5f6368',
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  rateHighlight: {
    color: '#34A853',
    fontSize: 16,
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F0FE',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  audioButtonText: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600',
  },
  createParchiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
});
