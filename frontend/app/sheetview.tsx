import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions
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

const { width: SW } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Visible column indices (0-based from A): A=0, E=4, F=5, G=6, H=7, I=8, M=12, N=13, O=14
const VIS_COLS = [0, 4, 5, 6, 7, 8, 12, 13, 14];
const COL_LABELS = ['A', 'E', 'F', 'G', 'H', 'I', 'M', 'N', 'O'];

const ROWS_PER_PAGE = 24;

// Column flex weights — E gets more space for full values
const COL_FLEX = [0.7, 1.4, 1, 1, 1, 0.9, 0.9, 0.9, 0.9];
const TOTAL_FLEX = COL_FLEX.reduce((a, b) => a + b, 0);
const ROW_NUM_W = 28;
const USABLE_W = SW - ROW_NUM_W - 8; // 8px total padding

export default function SheetViewScreen() {
  const router = useRouter();
  const [stockProfile, setStockProfile] = useState<SheetProfile | null>(null);
  const [pages, setPages] = useState<string[][][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    setError(null);
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const lib: SheetProfile[] = JSON.parse(stored);
      setSheetLibrary(lib);
    }
    const lib = getSheetLibrary();
    const stock = lib.find((s) => s.sheetName.toLowerCase() === 'stock');
    if (!stock) { setLoading(false); setError('no_profile'); return; }
    setStockProfile(stock);
    const ts = await AsyncStorage.getItem('sheetview_timestamp');
    if (ts) setLastUpdated(ts);
    if (stock.data) {
      processData(stock.data, stock.range);
      setLoading(false);
    } else {
      await fetchData(stock);
    }
  };

  const fetchData = async (profile: SheetProfile) => {
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) { Alert.alert('Session Expired', 'Please login again'); router.replace('/'); return; }
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(profile.range)}&_t=${Date.now()}`
      );
      const rows: string[][] = res.data.data || [];
      updateSheetProfile(profile.id, { data: rows, rowCount: res.data.row_count, colCount: res.data.col_count, lastRefreshed: Date.now() });
      const lib = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));
      const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
    const vis = VIS_COLS.map((c) => c - offset).filter((c) => c >= 0);
    if (rows.length > 0) setHeaders(vis.map((i) => rows[0]?.[i] ?? ''));
    const data = rows.slice(1).map((r) => vis.map((i) => r?.[i] ?? ''));
    setTotalRows(data.length);
    const pgs: string[][][] = [];
    for (let i = 0; i < data.length; i += ROWS_PER_PAGE) {
      pgs.push(data.slice(i, i + ROWS_PER_PAGE));
    }
    setPages(pgs);
  };

  const handleRefresh = async () => {
    if (!stockProfile) return;
    setRefreshing(true);
    await fetchData(stockProfile);
  };

  const colW = (idx: number) => (USABLE_W * COL_FLEX[idx]) / TOTAL_FLEX;

  // ─── Error / Loading states ─────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}><ActivityIndicator size="large" color="#4285F4" /><Text style={st.centerText}>Loading STOCK data...</Text></View>
    </SafeAreaView>
  );
  if (error === 'no_profile') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <Ionicons name="document-outline" size={48} color="#5f6368" />
        <Text style={st.centerTitle}>STOCK Sheet Not Saved</Text>
        <Text style={st.centerSub}>Save the STOCK sheet from Home tab first.</Text>
        <TouchableOpacity style={st.goHomeBtn} onPress={() => router.replace('/(tabs)/home' as any)} data-testid="go-home-btn">
          <Text style={st.goHomeBtnText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
  if (error === 'fetch_failed') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <Ionicons name="cloud-offline-outline" size={48} color="#EA4335" />
        <Text style={st.centerTitle}>Failed to Load</Text>
        <TouchableOpacity style={st.retryBtn} onPress={handleRefresh} data-testid="retry-btn">
          <Ionicons name="refresh" size={18} color="#fff" /><Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} onRefresh={handleRefresh} refreshing={refreshing} />

      {lastUpdated && (
        <View style={st.tsBar}>
          <Ionicons name="time-outline" size={12} color="#9aa0a6" />
          <Text style={st.tsText}>Last updated: {lastUpdated}</Text>
          <Text style={st.tsText}> | {totalRows} rows, {pages.length} pages</Text>
        </View>
      )}

      <ScrollView style={st.scroll} showsVerticalScrollIndicator>
        {pages.map((pageData, pIdx) => {
          const startRow = pIdx * ROWS_PER_PAGE + 2; // +2: 1-indexed + header
          return (
            <View key={pIdx} style={st.pageSection}>
              {/* Page header */}
              <View style={st.pageHeader}>
                <Text style={st.pageHeaderText}>
                  Page {pIdx + 1} / {pages.length}  (Rows {startRow}–{startRow + pageData.length - 1})
                </Text>
              </View>

              {/* Column headers */}
              <View style={st.tableRow}>
                <View style={[st.cell, { width: ROW_NUM_W }]}>
                  <Text style={st.hdrText}>#</Text>
                </View>
                {headers.map((h, i) => (
                  <View key={i} style={[st.hdrCell, { width: colW(i) }]}>
                    <Text style={st.hdrText} numberOfLines={1}>{h || COL_LABELS[i]}</Text>
                  </View>
                ))}
              </View>

              {/* Data rows */}
              {pageData.map((row, rIdx) => {
                const globalRow = startRow + rIdx;
                return (
                  <View key={rIdx} style={[st.tableRow, rIdx % 2 === 0 ? st.rowEven : st.rowOdd]}>
                    <View style={[st.cell, { width: ROW_NUM_W }]}>
                      <Text style={st.rowNumText}>{globalRow}</Text>
                    </View>
                    {row.map((val, cIdx) => (
                      <View key={cIdx} style={[st.cell, { width: colW(cIdx) }]}>
                        <Text style={[st.cellText, cIdx === 1 && st.sizeText]} numberOfLines={2}>{val}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, onRefresh, refreshing }: { onBack: () => void; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={onBack} style={st.backBtn} data-testid="sheet-view-back-btn">
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={st.headerTitle}>Sheet View</Text>
      {onRefresh && (
        <TouchableOpacity style={st.refreshBtn} onPress={onRefresh} disabled={refreshing} data-testid="sheet-view-refresh-btn">
          {refreshing ? <ActivityIndicator size="small" color="#4285F4" /> : <Ionicons name="refresh" size={18} color="#4285F4" />}
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460', gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  refreshBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center',
  },
  tsBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#16213e',
  },
  tsText: { fontSize: 10, color: '#9aa0a6' },
  scroll: { flex: 1 },
  pageSection: { marginBottom: 4 },
  pageHeader: {
    backgroundColor: '#0f3460', paddingVertical: 6, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e3a5f',
  },
  pageHeaderText: { fontSize: 10, fontWeight: '700', color: '#4285F4' },
  tableRow: { flexDirection: 'row' },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.02)' },
  rowOdd: { backgroundColor: 'rgba(255,255,255,0.05)' },
  cell: {
    height: 28, justifyContent: 'center', paddingHorizontal: 2,
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 0.5, borderBottomColor: '#1e3a5f',
  },
  hdrCell: {
    height: 30, justifyContent: 'center', paddingHorizontal: 2,
    backgroundColor: '#0f3460',
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 1.5, borderBottomColor: '#4285F4',
  },
  hdrText: { fontSize: 8, fontWeight: '700', color: '#fff', textAlign: 'center' },
  rowNumText: { fontSize: 7, color: '#5f6368', textAlign: 'center' },
  cellText: { fontSize: 8, color: '#d0d0d0', textAlign: 'center' },
  sizeText: { fontWeight: '600', color: '#e8e8e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 12 },
  centerText: { fontSize: 13, color: '#9aa0a6', marginTop: 10 },
  centerSub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  goHomeBtn: { marginTop: 18, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  goHomeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  retryBtn: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
