import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getSheetLibrary, setSheetLibrary, updateSheetProfile,
  getColOffset, SheetProfile
} from '../utils/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Visible columns (0-indexed from A): A=0, E=4, F=5, G=6, H=7, I=8, M=12, N=13, O=14
const VISIBLE_COL_INDICES = [0, 4, 5, 6, 7, 8, 12, 13, 14];

// Default row splits (proportional percentages)
const DEFAULT_SPLITS = [
  { start: 0, end: 41 },   // Page 1: rows 1-42 (index 0-41)
  { start: 42, end: 73 },  // Page 2: rows 43-74
  { start: 74, end: 109 }, // Page 3: rows 75-110
  { start: 110, end: 152 }, // Page 4: rows 111-153
];

// Proportions for dynamic splits
const SPLIT_PROPORTIONS = [0.275, 0.209, 0.235, 0.281];

function computeSplits(totalRows: number) {
  if (totalRows <= 153) return DEFAULT_SPLITS;
  const splits = [];
  let cursor = 0;
  for (let i = 0; i < 4; i++) {
    const count = Math.round(totalRows * SPLIT_PROPORTIONS[i]);
    const end = Math.min(cursor + count - 1, totalRows - 1);
    splits.push({ start: cursor, end });
    cursor = end + 1;
  }
  // Ensure last split covers remaining rows
  if (splits[3]) splits[3].end = totalRows - 1;
  return splits;
}

export default function SheetViewScreen() {
  const router = useRouter();
  const pagerRef = useRef<ScrollView>(null);

  const [stockProfile, setStockProfile] = useState<SheetProfile | null>(null);
  const [filteredData, setFilteredData] = useState<string[][][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);
    setError(null);

    // Load library
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const library: SheetProfile[] = JSON.parse(stored);
      setSheetLibrary(library);
    }

    const library = getSheetLibrary();
    const stock = library.find(
      (s) => s.sheetName.toLowerCase() === 'stock'
    );

    if (!stock) {
      setLoading(false);
      setError('no_profile');
      return;
    }

    setStockProfile(stock);

    // Check cache
    const cachedTs = await AsyncStorage.getItem('sheetview_timestamp');
    if (cachedTs) setLastUpdated(cachedTs);

    if (stock.data) {
      processData(stock.data, stock.range);
      setLoading(false);
    } else {
      await fetchAndProcess(stock);
    }
  };

  const fetchAndProcess = async (profile: SheetProfile) => {
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        router.replace('/');
        return;
      }

      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(profile.range)}&_t=${Date.now()}`
      );

      const rows: string[][] = res.data.data || [];

      // Update cache
      updateSheetProfile(profile.id, {
        data: rows,
        rowCount: res.data.row_count,
        colCount: res.data.col_count,
        lastRefreshed: Date.now(),
      });

      const lib = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));

      const now = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      await AsyncStorage.setItem('sheetview_timestamp', now);
      setLastUpdated(now);

      processData(rows, profile.range);
      setStockProfile({ ...profile, data: rows });
    } catch (err: any) {
      setError('fetch_failed');
      Alert.alert('Error', err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processData = (rows: string[][], range: string) => {
    const offset = getColOffset(range);

    // Filter to visible columns
    const visibleIndices = VISIBLE_COL_INDICES.map((c) => c - offset).filter(
      (c) => c >= 0
    );

    // Extract header row
    if (rows.length > 0) {
      const headerRow = visibleIndices.map((i) => rows[0]?.[i] ?? '');
      setHeaders(headerRow);
    }

    // Data rows (skip header)
    const dataRows = rows.slice(1);
    const filtered = dataRows.map((row) =>
      visibleIndices.map((i) => row?.[i] ?? '')
    );

    // Split into pages
    const splits = computeSplits(filtered.length);
    const pages: string[][][] = splits.map((sp) =>
      filtered.slice(sp.start, sp.end + 1)
    );

    setFilteredData(pages);
  };

  const handleRefresh = async () => {
    if (!stockProfile) return;
    setRefreshing(true);
    await fetchAndProcess(stockProfile);
  };

  const goToPage = (page: number) => {
    setActivePage(page);
    pagerRef.current?.scrollTo({
      x: page * SCREEN_WIDTH,
      animated: true,
    });
  };

  const handleScroll = (e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (page !== activePage && page >= 0 && page < 4) {
      setActivePage(page);
    }
  };

  // ─── Error / Loading states ─────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={st.center}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={st.centerText}>Loading STOCK data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error === 'no_profile') {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={st.center}>
          <Ionicons name="document-outline" size={56} color="#5f6368" />
          <Text style={st.centerTitle}>STOCK Sheet Not Saved</Text>
          <Text style={st.centerSub}>
            Save the STOCK sheet from Home tab first.{'\n'}
            Then come back here.
          </Text>
          <TouchableOpacity
            style={st.goHomeBtn}
            onPress={() => router.replace('/(tabs)/home' as any)}
            data-testid="go-home-btn"
          >
            <Text style={st.goHomeBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (error === 'fetch_failed') {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={st.center}>
          <Ionicons name="cloud-offline-outline" size={56} color="#EA4335" />
          <Text style={st.centerTitle}>Failed to Load</Text>
          <TouchableOpacity
            style={st.retryBtn}
            onPress={handleRefresh}
            data-testid="retry-btn"
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={st.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header
        onBack={() => router.back()}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Timestamp */}
      {lastUpdated && (
        <View style={st.tsBar}>
          <Ionicons name="time-outline" size={14} color="#9aa0a6" />
          <Text style={st.tsText}>
            Layout last updated: {lastUpdated}
          </Text>
        </View>
      )}

      {/* Page indicator */}
      <View style={st.pageIndicator}>
        {[0, 1, 2, 3].map((i) => (
          <TouchableOpacity
            key={i}
            style={[st.pageDot, activePage === i && st.pageDotActive]}
            onPress={() => goToPage(i)}
            data-testid={`page-dot-${i}`}
          >
            <Text
              style={[
                st.pageDotText,
                activePage === i && st.pageDotTextActive,
              ]}
            >
              {i + 1}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={st.pager}
      >
        {filteredData.map((pageData, pageIdx) => (
          <View key={pageIdx} style={[st.page, { width: SCREEN_WIDTH }]}>
            <ScrollView
              maximumZoomScale={3}
              minimumZoomScale={1}
              showsVerticalScrollIndicator
              contentContainerStyle={st.pageContent}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
              >
                <View>
                  {/* Header row */}
                  <View style={st.tableRow}>
                    <View style={st.rowNumCell}>
                      <Text style={st.rowNumText}>#</Text>
                    </View>
                    {headers.map((h, i) => (
                      <View key={i} style={st.headerCell}>
                        <Text style={st.headerText} numberOfLines={2}>
                          {h}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Data rows */}
                  {pageData.map((row, rIdx) => {
                    const globalRow =
                      (pageIdx === 0
                        ? 0
                        : computeSplits(
                            filteredData.reduce(
                              (sum, p) => sum + p.length,
                              0
                            )
                          )[pageIdx]?.start || 0) +
                      rIdx +
                      2; // +2 for 1-indexed + header
                    return (
                      <View
                        key={rIdx}
                        style={[
                          st.tableRow,
                          rIdx % 2 === 0 ? st.rowEven : st.rowOdd,
                        ]}
                      >
                        <View style={st.rowNumCell}>
                          <Text style={st.rowNumText}>{globalRow}</Text>
                        </View>
                        {row.map((cell, cIdx) => (
                          <View key={cIdx} style={st.dataCell}>
                            <Text style={st.dataText} numberOfLines={2}>
                              {cell}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>

            {/* Page label */}
            <View style={st.pageLabel}>
              <Text style={st.pageLabelText}>
                Page {pageIdx + 1} of 4 ({pageData.length} rows)
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Header component ─────────────────────────────────────────────────────
function Header({
  onBack,
  onRefresh,
  refreshing,
}: {
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={onBack} style={st.backBtn} data-testid="sheet-view-back-btn">
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={st.headerTitle}>Sheet View</Text>
      {onRefresh && (
        <TouchableOpacity
          style={st.refreshBtn}
          onPress={onRefresh}
          disabled={refreshing}
          data-testid="sheet-view-refresh-btn"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <Ionicons name="refresh" size={20} color="#4285F4" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const COL_W = 90; // column width
const ROW_H = 36;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Timestamp
  tsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
  },
  tsText: { fontSize: 11, color: '#9aa0a6' },
  // Page indicator
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  pageDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f3460',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageDotActive: { backgroundColor: '#4285F4' },
  pageDotText: { fontSize: 13, fontWeight: '600', color: '#9aa0a6' },
  pageDotTextActive: { color: '#fff' },
  // Pager
  pager: { flex: 1 },
  page: { flex: 1 },
  pageContent: { paddingBottom: 40 },
  // Table
  tableRow: { flexDirection: 'row' },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.03)' },
  rowOdd: { backgroundColor: 'rgba(255,255,255,0.06)' },
  rowNumCell: {
    width: 40,
    height: ROW_H,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1e3a5f',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  rowNumText: { fontSize: 10, color: '#5f6368' },
  headerCell: {
    width: COL_W,
    height: ROW_H + 4,
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: '#0f3460',
    borderRightWidth: 1,
    borderRightColor: '#1e3a5f',
    borderBottomWidth: 2,
    borderBottomColor: '#4285F4',
  },
  headerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  dataCell: {
    width: COL_W,
    height: ROW_H,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#1e3a5f',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  dataText: { fontSize: 11, color: '#e0e0e0' },
  // Page label
  pageLabel: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pageLabelText: {
    fontSize: 11,
    color: '#5f6368',
    backgroundColor: '#16213e',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  // Center states
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 14,
  },
  centerText: { fontSize: 14, color: '#9aa0a6', marginTop: 12 },
  centerSub: {
    fontSize: 13,
    color: '#9aa0a6',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  goHomeBtn: {
    marginTop: 20,
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  goHomeBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  retryBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
