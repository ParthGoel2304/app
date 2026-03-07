import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PricerItem {
  item: string;
  sizeDifference: number;
  stock: number;
  totalRate: number;
  lastRate: number;
}

export default function PricerTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [basicRate, setBasicRate] = useState<string>('60000');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; modified: string } | null>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    setError(null);
    
    // Check for cached data
    const cached = await AsyncStorage.getItem('pricer_data_cache');
    const cachedRate = await AsyncStorage.getItem('pricer_basic_rate');
    if (cachedRate) setBasicRate(cachedRate);
    
    if (cached) {
      const parsed = JSON.parse(cached);
      setRawData(parsed.data || []);
      setFileInfo(parsed.fileInfo);
      setLoading(false);
      // Refresh in background
      fetchPricerData(true);
    } else {
      await fetchPricerData(false);
    }
  };

  const fetchPricerData = async (silent: boolean) => {
    try {
      if (!silent) setLoading(true);
      
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) {
        setError('session_expired');
        setLoading(false);
        return;
      }

      // Find the file containing JGT sheet (from office folder)
      const filesRes = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&folder_only=true`);
      const allFiles = filesRes.data.files || [];
      
      // Find file with JGT in name
      const jgtFile = allFiles.find((f: any) => 
        f.file_name.toLowerCase().includes('jgt')
      );
      
      if (!jgtFile) {
        setError('file_not_found');
        setLoading(false);
        return;
      }

      setFileInfo({
        name: jgtFile.file_name,
        modified: new Date(jgtFile.modified_time).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        })
      });

      // First get the list of sheets in the file
      const sheetsRes = await axios.get(
        `${BACKEND_URL}/api/drive/file/${jgtFile.file_id}/sheets?session_id=${sid}`
      );
      const sheets = sheetsRes.data.sheets || [];
      // Use STOCK sheet or the first available sheet
      const stockSheet = sheets.find((s: string) => s.toLowerCase().includes('stock')) || sheets[0];
      if (!stockSheet) {
        setError('file_not_found');
        setLoading(false);
        return;
      }

      // Fetch the sheet data - we need columns A (Item), I (Size Difference), O (Stock)
      const dataRes = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${jgtFile.file_id}&sheet_name=${encodeURIComponent(stockSheet)}&cell_range=A1:O200&_t=${Date.now()}`
      );
      
      const rows: any[] = dataRes.data.data || [];
      setRawData(rows.slice(1)); // Skip header row

      // Cache the data
      await AsyncStorage.setItem('pricer_data_cache', JSON.stringify({
        data: rows.slice(1),
        fileInfo: { name: jgtFile.file_name, modified: new Date().toISOString() }
      }));

    } catch (err: any) {
      console.error('Failed to fetch pricer data:', err);
      if (!silent) {
        setError('fetch_failed');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPricerData(false);
  };

  // Save basic rate when changed
  const handleBasicRateChange = (value: string) => {
    setBasicRate(value);
    AsyncStorage.setItem('pricer_basic_rate', value);
  };

  // Calculate pricer data based on basic rate
  // Column mapping: A=0, I=8 (Size Difference), O=14 (Stock)
  const pricerData = useMemo((): PricerItem[] => {
    const rate = parseFloat(basicRate) || 0;
    
    return rawData
      .filter((row: any) => {
        // Skip if Size Difference (column I, index 8) is blank
        const sizeDiff = row[8];
        return sizeDiff !== undefined && sizeDiff !== null && sizeDiff !== '';
      })
      .map((row: any) => {
        const item = row[0] || ''; // Column A
        const sizeDifference = parseFloat(row[8]) || 0; // Column I
        const stock = parseFloat(row[14]) || 0; // Column O
        
        // Total Rate = Basic Rate + (Size Difference / 1000)
        const totalRate = rate + (sizeDifference / 1000);
        
        // Last Rate = Total Rate - 1.5
        const lastRate = totalRate - 1.5;
        
        return {
          item,
          sizeDifference,
          stock,
          totalRate: Math.round(totalRate * 100) / 100,
          lastRate: Math.round(lastRate * 100) / 100,
        };
      });
  }, [rawData, basicRate]);

  // Filter by search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return pricerData;
    const q = searchQuery.toLowerCase().trim();
    return pricerData.filter(item => 
      item.item.toLowerCase().includes(q)
    );
  }, [pricerData, searchQuery]);

  // ─── Error / Loading states ─────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={st.centerText}>Loading Pricer Data...</Text>
      </View>
    </SafeAreaView>
  );

  if (error === 'session_expired') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <Ionicons name="log-out-outline" size={48} color="#EA4335" />
        <Text style={st.centerTitle}>Session Expired</Text>
        <Text style={st.centerSub}>Please login again.</Text>
      </View>
    </SafeAreaView>
  );

  if (error === 'file_not_found') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />
      <View style={st.center}>
        <Ionicons name="document-outline" size={48} color="#FA7B17" />
        <Text style={st.centerTitle}>JGT File Not Found</Text>
        <Text style={st.centerSub}>Could not find a file with "JGT" in its name.</Text>
        <TouchableOpacity style={st.retryBtn} onPress={() => fetchPricerData(false)} data-testid="retry-btn">
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
        <TouchableOpacity style={st.retryBtn} onPress={() => fetchPricerData(false)} data-testid="retry-btn">
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header />

      {/* Basic Rate Input */}
      <View style={st.rateInputBox}>
        <Text style={st.rateLabel}>Basic Rate (₹)</Text>
        <TextInput
          style={st.rateInput}
          value={basicRate}
          onChangeText={handleBasicRateChange}
          keyboardType="numeric"
          placeholder="60000"
          placeholderTextColor="#5f6368"
          data-testid="basic-rate-input"
        />
      </View>

      {/* Search Bar */}
      <View style={st.searchBar}>
        <Ionicons name="search" size={16} color="#9aa0a6" />
        <TextInput
          style={st.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search item..."
          placeholderTextColor="#5f6368"
          data-testid="pricer-search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#9aa0a6" />
          </TouchableOpacity>
        )}
        <View style={st.searchDivider} />
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={st.refreshBtn}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#34A853" />
          ) : (
            <Ionicons name="refresh" size={18} color="#34A853" />
          )}
        </TouchableOpacity>
      </View>

      {/* File Info */}
      {fileInfo && (
        <View style={st.fileBar}>
          <Ionicons name="document-text" size={14} color="#4285F4" />
          <Text style={st.fileName} numberOfLines={1}>{fileInfo.name}</Text>
          <Text style={st.fileCount}>{filteredData.length} items</Text>
        </View>
      )}

      {/* Data Table */}
      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={st.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4285F4" />
        }
      >
        {/* Table Header */}
        <View style={st.tableHeader}>
          <Text style={[st.headerCell, { flex: 2 }]}>Item</Text>
          <Text style={[st.headerCell, { flex: 1 }]}>Size Diff</Text>
          <Text style={[st.headerCell, { flex: 1 }]}>Stock (kg)</Text>
          <Text style={[st.headerCell, { flex: 1 }]}>Total Rate</Text>
          <Text style={[st.headerCell, { flex: 1 }]}>Last Rate</Text>
        </View>

        {/* Table Rows */}
        {filteredData.map((item, idx) => (
          <View key={idx} style={[st.tableRow, idx % 2 === 0 ? st.rowEven : st.rowOdd]}>
            <Text style={[st.cell, { flex: 2 }]} numberOfLines={2}>{item.item}</Text>
            <Text style={[st.cell, { flex: 1 }]}>{item.sizeDifference}</Text>
            <Text style={[st.cell, { flex: 1 }, item.stock <= 0 && st.stockEmpty]}>
              {item.stock > 0 ? item.stock.toFixed(1) : '-'}
            </Text>
            <Text style={[st.cell, { flex: 1 }, st.rateCell]}>{item.totalRate.toFixed(2)}</Text>
            <Text style={[st.cell, { flex: 1 }, st.lastRateCell]}>{item.lastRate.toFixed(2)}</Text>
          </View>
        ))}

        {filteredData.length === 0 && (
          <View style={st.emptyRow}>
            <Text style={st.emptyText}>
              {searchQuery ? `No results for "${searchQuery}"` : 'No pricer data available'}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={st.header}>
      <Text style={st.headerIcon}>₹</Text>
      <Text style={st.headerTitle}>Pricer</Text>
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
  headerIcon: { fontSize: 24, fontWeight: '700', color: '#FBBC05' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  rateInputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1a2744', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  rateLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  rateInput: {
    flex: 1, backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16,
    color: '#fff', fontWeight: '700', textAlign: 'right',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  searchInput: {
    flex: 1, backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#fff',
  },
  searchDivider: { width: 1, height: 20, backgroundColor: '#0f3460' },
  refreshBtn: { padding: 6 },
  fileBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: '#16213e',
  },
  fileName: { flex: 1, fontSize: 11, color: '#9aa0a6' },
  fileCount: { fontSize: 11, color: '#4285F4', fontWeight: '600' },
  scrollContent: { paddingVertical: 4 },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10,
    backgroundColor: '#0f3460', borderBottomWidth: 1.5, borderBottomColor: '#FBBC05',
  },
  headerCell: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10 },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.02)' },
  rowOdd: { backgroundColor: 'rgba(255,255,255,0.05)' },
  cell: { fontSize: 11, color: '#d0d0d0', textAlign: 'center' },
  stockEmpty: { color: '#5f6368' },
  rateCell: { color: '#34A853', fontWeight: '600' },
  lastRateCell: { color: '#FBBC05', fontWeight: '600' },
  emptyRow: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#5f6368' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 12 },
  centerText: { fontSize: 13, color: '#9aa0a6', marginTop: 10 },
  centerSub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  retryBtn: {
    marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
