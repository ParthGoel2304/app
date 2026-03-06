import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SW } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const COL_W = 85;
const ROW_NUM_W = 32;

// Sales FY 25-26 file config
const SALES_FILE_NAME = 'Sales FY 25-26';
const SALES_SHEET_NAME = 'Sales';

export default function SalesTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salesData, setSalesData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState<{ name: string; modified: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    setError(null);
    
    // Check for cached data first
    const cached = await AsyncStorage.getItem('sales_data_cache');
    const cachedTs = await AsyncStorage.getItem('sales_data_timestamp');
    if (cached) {
      const parsed = JSON.parse(cached);
      processData(parsed.data);
      setFileInfo(parsed.fileInfo);
      if (cachedTs) setLastUpdated(cachedTs);
      setLoading(false);
      // Refresh in background
      fetchSalesData(true);
    } else {
      await fetchSalesData(false);
    }
  };

  const fetchSalesData = async (silent: boolean) => {
    try {
      if (!silent) setLoading(true);
      
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) {
        setError('session_expired');
        setLoading(false);
        return;
      }

      // First, find the Sales FY 25-26 file
      const filesRes = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&folder_only=false`);
      const allFiles = filesRes.data.files || [];
      
      // Find the sales file (match partial name)
      const salesFile = allFiles.find((f: any) => 
        f.file_name.toLowerCase().includes('sales') && 
        f.file_name.toLowerCase().includes('25-26')
      );
      
      if (!salesFile) {
        setError('file_not_found');
        setLoading(false);
        return;
      }

      setFileInfo({
        name: salesFile.file_name,
        modified: new Date(salesFile.modified_time).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        })
      });

      // Fetch the Sales sheet data
      const dataRes = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${salesFile.file_id}&sheet_name=${encodeURIComponent(SALES_SHEET_NAME)}&cell_range=A1:Z500&_t=${Date.now()}`
      );
      
      const rows: string[][] = dataRes.data.data || [];
      processData(rows);

      // Cache the data
      const now = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      await AsyncStorage.setItem('sales_data_cache', JSON.stringify({
        data: rows,
        fileInfo: { name: salesFile.file_name, modified: now }
      }));
      await AsyncStorage.setItem('sales_data_timestamp', now);
      setLastUpdated(now);

    } catch (err: any) {
      console.error('Failed to fetch sales data:', err);
      if (!silent) {
        setError('fetch_failed');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processData = (rows: string[][]) => {
    if (rows.length > 0) {
      setHeaders(rows[0] || []);
      setSalesData(rows.slice(1));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSalesData(false);
  };

  // ─── Error / Loading states ─────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={st.centerText}>Loading Sales Data...</Text>
      </View>
    </SafeAreaView>
  );

  if (error === 'session_expired') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <Ionicons name="log-out-outline" size={48} color="#EA4335" />
        <Text style={st.centerTitle}>Session Expired</Text>
        <Text style={st.centerSub}>Please login again to view sales data.</Text>
      </View>
    </SafeAreaView>
  );

  if (error === 'file_not_found') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <Ionicons name="document-outline" size={48} color="#FA7B17" />
        <Text style={st.centerTitle}>Sales File Not Found</Text>
        <Text style={st.centerSub}>Could not find "Sales FY 25-26" file in your Drive.</Text>
        <Text style={st.centerHint}>Make sure the file exists and contains a sheet named "Sales".</Text>
        <TouchableOpacity style={st.retryBtn} onPress={() => fetchSalesData(false)} data-testid="retry-btn">
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (error === 'fetch_failed') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <Ionicons name="cloud-offline-outline" size={48} color="#EA4335" />
        <Text style={st.centerTitle}>Failed to Load</Text>
        <TouchableOpacity style={st.retryBtn} onPress={() => fetchSalesData(false)} data-testid="retry-btn">
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />

      {/* File Info Bar */}
      {fileInfo && (
        <View style={st.fileBar}>
          <Ionicons name="document-text" size={14} color="#4285F4" />
          <Text style={st.fileName} numberOfLines={1}>{fileInfo.name}</Text>
          <View style={st.fileDivider} />
          <Ionicons name="time-outline" size={12} color="#9aa0a6" />
          <Text style={st.fileTs}>{fileInfo.modified}</Text>
        </View>
      )}

      {/* Stats Row */}
      <View style={st.statsRow}>
        <View style={st.statCard}>
          <Text style={st.statValue}>{salesData.length}</Text>
          <Text style={st.statLabel}>Records</Text>
        </View>
        <View style={st.statCard}>
          <Text style={st.statValue}>{headers.length}</Text>
          <Text style={st.statLabel}>Columns</Text>
        </View>
        <TouchableOpacity style={[st.statCard, st.refreshCard]} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#34A853" />
          ) : (
            <Ionicons name="refresh" size={20} color="#34A853" />
          )}
          <Text style={st.statLabel}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {lastUpdated && (
        <View style={st.tsBar}>
          <Text style={st.tsText}>Last updated: {lastUpdated}</Text>
        </View>
      )}

      {/* Data Table */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={st.hScroll}
      >
        <ScrollView
          showsVerticalScrollIndicator
          contentContainerStyle={st.vScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4285F4" />
          }
        >
          {/* Headers */}
          <View style={st.tableRow}>
            <View style={[st.cell, st.rowNumCell]}>
              <Text style={st.hdrText}>#</Text>
            </View>
            {headers.map((h, i) => (
              <View key={i} style={[st.hdrCell, { width: COL_W }]}>
                <Text style={st.hdrText} numberOfLines={2}>{h}</Text>
              </View>
            ))}
          </View>

          {/* Data Rows */}
          {salesData.map((row, rIdx) => (
            <View key={rIdx} style={[st.tableRow, rIdx % 2 === 0 ? st.rowEven : st.rowOdd]}>
              <View style={[st.cell, st.rowNumCell]}>
                <Text style={st.rowNumText}>{rIdx + 2}</Text>
              </View>
              {row.map((val, cIdx) => (
                <View key={cIdx} style={[st.cell, { width: COL_W }]}>
                  <Text style={st.cellText} numberOfLines={2}>{val || ''}</Text>
                </View>
              ))}
            </View>
          ))}

          {salesData.length === 0 && (
            <View style={st.emptyRow}>
              <Text style={st.emptyText}>No sales data found</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={st.header}>
      <Ionicons name="trending-up" size={24} color="#34A853" />
      <Text style={st.headerTitle}>Annual Sales (FY 25-26)</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  fileBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#1a2744',
  },
  fileName: { flex: 1, fontSize: 12, fontWeight: '600', color: '#fff' },
  fileDivider: { width: 1, height: 12, backgroundColor: '#0f3460', marginHorizontal: 4 },
  fileTs: { fontSize: 10, color: '#9aa0a6' },
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#16213e',
  },
  statCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0f3460', borderRadius: 10, paddingVertical: 10,
  },
  refreshCard: { backgroundColor: '#1b4332' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 10, color: '#9aa0a6', marginTop: 2 },
  tsBar: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  tsText: { fontSize: 10, color: '#5f6368' },
  hScroll: { paddingBottom: 8 },
  vScroll: { paddingVertical: 4 },
  tableRow: { flexDirection: 'row' },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.02)' },
  rowOdd: { backgroundColor: 'rgba(255,255,255,0.05)' },
  cell: {
    height: 36, justifyContent: 'center', paddingHorizontal: 6,
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 0.5, borderBottomColor: '#1e3a5f',
  },
  rowNumCell: { width: ROW_NUM_W, backgroundColor: 'rgba(15,52,96,0.5)' },
  hdrCell: {
    height: 40, justifyContent: 'center', paddingHorizontal: 6,
    backgroundColor: '#0f3460',
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 1.5, borderBottomColor: '#34A853',
  },
  hdrText: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  rowNumText: { fontSize: 9, color: '#5f6368', textAlign: 'center' },
  cellText: { fontSize: 10, color: '#d0d0d0', textAlign: 'center' },
  emptyRow: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#5f6368' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 12 },
  centerText: { fontSize: 13, color: '#9aa0a6', marginTop: 10 },
  centerSub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  centerHint: { fontSize: 11, color: '#5f6368', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  retryBtn: {
    marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
