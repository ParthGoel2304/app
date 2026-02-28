import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Share, ActivityIndicator, Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getSheetLibrary, SheetProfile, getColOffset } from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type Category = 'hr' | 'apollo' | 'local';

const SHEET_MAP: Record<Category, string> = {
  hr: 'HR In Demand',
  apollo: 'A In Demand',
  local: 'L In Demand',
};

const PLANT_LABELS: Record<Category, string> = {
  hr: 'HR',
  apollo: 'Apollo',
  local: 'Local',
};

interface PurchaseItem {
  idx: number;
  item: string;
  current: number;
  ideal: number;
  orderQ: number;
  plant: string;
  selected: boolean;
}

export default function PurchaseScreen() {
  const [category, setCategory] = useState<Category>('hr');
  const [loading, setLoading] = useState(false);
  const [dataCache, setDataCache] = useState<Record<Category, PurchaseItem[] | null>>({ hr: null, apollo: null, local: null });
  const [fileProfile, setFileProfile] = useState<SheetProfile | null>(null);
  const [showOnlyNeeded, setShowOnlyNeeded] = useState(false);

  useFocusEffect(useCallback(() => { findLibraryFile(); }, []));

  const findLibraryFile = async () => {
    const stored = await AsyncStorage.getItem('sheet_library');
    if (!stored) return;
    const library: SheetProfile[] = JSON.parse(stored);
    // Find the main file (F.Y. 2025-26 Final or any file with demand sheets)
    const file = library.find(s => s.sheetName.includes('In Demand')) || library[0];
    if (file) {
      setFileProfile(file);
      loadAllSheets(file);
    }
  };

  const loadAllSheets = async (profile: SheetProfile) => {
    setLoading(true);
    const sessionId = await AsyncStorage.getItem('session_id');
    if (!sessionId) { setLoading(false); return; }

    const newCache: Record<Category, PurchaseItem[] | null> = { hr: null, apollo: null, local: null };

    for (const cat of ['hr', 'apollo', 'local'] as Category[]) {
      try {
        const sheetName = SHEET_MAP[cat];
        const res = await axios.get(
          `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(sheetName)}&cell_range=A1:E200&_t=${Date.now()}`
        );
        const rows: string[][] = res.data.data || [];
        // Row 0 might be title, Row 1 = headers, Row 2+ = data
        // Find header row (contains 'Item' or similar)
        let headerIdx = 1;
        for (let i = 0; i < Math.min(3, rows.length); i++) {
          if (rows[i]?.some(c => c?.toString().toLowerCase().includes('item'))) {
            headerIdx = i; break;
          }
        }

        const items: PurchaseItem[] = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]?.toString().trim()) continue;
          items.push({
            idx: i,
            item: row[0]?.toString().trim() || '',
            current: parseFloat(row[1]?.toString() || '0') || 0,
            ideal: parseFloat(row[2]?.toString() || '0') || 0,
            orderQ: parseFloat(row[3]?.toString() || '0') || 0,
            plant: row[4]?.toString().trim() || PLANT_LABELS[cat],
            selected: false,
          });
        }
        newCache[cat] = items;
      } catch (e) {
        // Sheet might not exist, that's ok
        newCache[cat] = [];
      }
    }
    setDataCache(newCache);
    setLoading(false);
  };

  const currentItems = dataCache[category] || [];
  const displayItems = useMemo(() => {
    if (showOnlyNeeded) return currentItems.filter(i => i.current < i.ideal);
    return currentItems;
  }, [currentItems, showOnlyNeeded]);

  const selectedItems = useMemo(() => currentItems.filter(i => i.selected), [currentItems]);

  const toggleItem = (idx: number) => {
    setDataCache(prev => ({
      ...prev,
      [category]: prev[category]?.map(i => i.idx === idx ? { ...i, selected: !i.selected } : i) || null,
    }));
  };

  const updateOrderQ = (idx: number, val: string) => {
    setDataCache(prev => ({
      ...prev,
      [category]: prev[category]?.map(i => i.idx === idx ? { ...i, orderQ: parseFloat(val) || 0 } : i) || null,
    }));
  };

  // ─── Export Functions ─────────────────────────────────────────────
  const allSelected = [...(dataCache.hr || []), ...(dataCache.apollo || []), ...(dataCache.local || [])].filter(i => i.selected);

  const generateWhatsAppText = () => {
    const date = new Date().toLocaleDateString('en-IN');
    let text = `Purchase Order List\nDate: ${date}\n\n`;
    allSelected.forEach((item, i) => {
      text += `${i + 1}. ${item.item} - ${item.orderQ} - ${item.plant}\n`;
    });
    return text;
  };

  const handleWhatsApp = async () => {
    if (allSelected.length === 0) { Alert.alert('No Items', 'Select items to export'); return; }
    await Share.share({ message: generateWhatsAppText() });
  };

  const handlePDF = async () => {
    if (allSelected.length === 0) { Alert.alert('No Items', 'Select items to export'); return; }
    const date = new Date().toLocaleDateString('en-IN');
    const rows = allSelected.map((item, i) =>
      `<tr><td>${i + 1}</td><td>${item.item}</td><td>${item.orderQ}</td><td>${item.plant}</td></tr>`
    ).join('');

    const html = `
    <html><head><style>
      body { font-family: sans-serif; padding: 20px; }
      h1 { font-size: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #4285F4; color: white; }
    </style></head><body>
    <h1>Purchase Order List</h1>
    <p>Date: ${date}</p>
    <table><tr><th>#</th><th>Item</th><th>Order Q</th><th>Plant</th></tr>${rows}</table>
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web') {
        Alert.alert('PDF Ready', 'PDF generated');
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Purchase Order PDF' });
      }
    } catch (e) { Alert.alert('Error', 'Failed to generate PDF'); }
  };

  // ─── No Data State ────────────────────────────────────────────────
  if (!fileProfile && !loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Purchase</Text></View>
        <View style={s.center}>
          <Ionicons name="cart-outline" size={56} color="#5f6368" />
          <Text style={s.centerTitle}>No Library File</Text>
          <Text style={s.centerSub}>Save a file with "In Demand" sheets from the Home tab first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Purchase</Text>
        {loading && <ActivityIndicator color="#4285F4" />}
      </View>

      {/* Category Selector */}
      <View style={s.catBar}>
        {(['hr', 'apollo', 'local'] as Category[]).map(cat => (
          <TouchableOpacity key={cat} style={[s.catBtn, category === cat && s.catBtnActive]}
            onPress={() => setCategory(cat)} data-testid={`cat-${cat}`}>
            <Text style={[s.catBtnText, category === cat && s.catBtnTextActive]}>{PLANT_LABELS[cat]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Toggle */}
      <TouchableOpacity style={s.filterToggle} onPress={() => setShowOnlyNeeded(!showOnlyNeeded)}>
        <Ionicons name={showOnlyNeeded ? 'checkbox' : 'square-outline'} size={18} color="#FA7B17" />
        <Text style={s.filterToggleText}>Show only items needing order</Text>
      </TouchableOpacity>

      {/* Table */}
      <ScrollView style={s.tableScroll}>
        {/* Table Header */}
        <View style={s.tHeader}>
          <View style={[s.tCell, { width: 36 }]} />
          <Text style={[s.tHeaderText, { flex: 2 }]}>Item</Text>
          <Text style={[s.tHeaderText, { width: 55 }]}>Curr</Text>
          <Text style={[s.tHeaderText, { width: 55 }]}>Ideal</Text>
          <Text style={[s.tHeaderText, { width: 70 }]}>Order</Text>
        </View>

        {displayItems.length === 0 ? (
          <View style={s.emptyTable}>
            <Text style={s.emptyTableText}>{loading ? 'Loading...' : 'No items found'}</Text>
          </View>
        ) : displayItems.map(item => {
          const needsOrder = item.current < item.ideal;
          return (
            <View key={item.idx} style={[s.tRow, needsOrder && s.tRowAlert]}>
              <TouchableOpacity style={[s.tCell, { width: 36 }]} onPress={() => toggleItem(item.idx)}>
                <Ionicons name={item.selected ? 'checkbox' : 'square-outline'} size={20} color={item.selected ? '#4285F4' : '#5f6368'} />
              </TouchableOpacity>
              <Text style={[s.tCellText, { flex: 2 }]} numberOfLines={1}>{item.item}</Text>
              <Text style={[s.tCellText, { width: 55 }, needsOrder && { color: '#EA4335' }]}>{item.current}</Text>
              <Text style={[s.tCellText, { width: 55 }]}>{item.ideal}</Text>
              <TextInput style={s.orderInput} value={String(item.orderQ)} keyboardType="decimal-pad"
                onChangeText={(v) => updateOrderQ(item.idx, v)} data-testid={`order-${item.idx}`} />
            </View>
          );
        })}
      </ScrollView>

      {/* Selected Items Panel */}
      {allSelected.length > 0 && (
        <View style={s.selectedPanel}>
          <Text style={s.selectedTitle}>Selected ({allSelected.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allSelected.map(item => (
              <View key={`${item.plant}-${item.idx}`} style={s.selectedChip}>
                <Text style={s.selectedChipText}>{item.item}</Text>
                <Text style={s.selectedChipQ}>{item.orderQ}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Export Bar */}
      <View style={s.exportBar}>
        <TouchableOpacity style={s.exportBtn} onPress={handleWhatsApp} data-testid="export-whatsapp">
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={s.exportBtnText}>Share List</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.exportBtn, { backgroundColor: '#EA4335' }]} onPress={handlePDF} data-testid="export-pdf">
          <Ionicons name="document" size={18} color="#fff" />
          <Text style={s.exportBtnText}>Export PDF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 16 },
  centerSub: { fontSize: 13, color: '#9aa0a6', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  catBar: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#16213e' },
  catBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0f3460' },
  catBtnActive: { backgroundColor: '#4285F4' },
  catBtnText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  catBtnTextActive: { color: '#fff' },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#16213e' },
  filterToggleText: { fontSize: 13, color: '#FA7B17', fontWeight: '500' },
  tableScroll: { flex: 1 },
  tHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#0f3460', borderBottomWidth: 1, borderBottomColor: '#1a3a6e' },
  tHeaderText: { fontSize: 11, fontWeight: '700', color: '#4285F4', textTransform: 'uppercase', textAlign: 'center' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  tRowAlert: { backgroundColor: 'rgba(234,67,53,0.08)' },
  tCell: { justifyContent: 'center', alignItems: 'center' },
  tCellText: { fontSize: 13, color: '#e0e0e0', textAlign: 'center' },
  orderInput: { width: 70, backgroundColor: '#0f3460', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#1a3a6e' },
  emptyTable: { padding: 40, alignItems: 'center' },
  emptyTableText: { fontSize: 14, color: '#5f6368' },
  selectedPanel: { backgroundColor: '#16213e', padding: 12, borderTopWidth: 1, borderTopColor: '#0f3460' },
  selectedTitle: { fontSize: 12, fontWeight: '700', color: '#4285F4', marginBottom: 8 },
  selectedChip: { backgroundColor: '#0f3460', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedChipText: { fontSize: 12, color: '#e0e0e0', fontWeight: '500', maxWidth: 120 },
  selectedChipQ: { fontSize: 12, color: '#34A853', fontWeight: '700' },
  exportBar: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460' },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#34A853' },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
