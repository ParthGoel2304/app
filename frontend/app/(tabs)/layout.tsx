import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Modal, ActivityIndicator, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  getSheetLibrary, setSheetLibrary, updateSheetProfile,
  getColOffset, SheetProfile
} from '../../utils/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// ─── Rack entry for multiple items per rack ─────────────────────────────────
interface RackEntry {
  size: string;
  stock: number;
  rateDiff: number;
}

// ─── Visual Grid Definitions (from user screenshots) ────────────────────────
// JGT: R section (3 rows), L section (2 rows), F section (2 rows), O section (2 rows)
const JGT_SECTIONS = [
  {
    name: 'R Section',
    rows: [
      ['R1.1', 'R2.1', 'R3.1', 'R4.1', 'R5.1', 'R6.1', 'R7.1', 'Others'],
      ['R1.2', 'R2.2', 'R3.2', 'R4.2', 'R5.2', 'R6.2', 'R7.2'],
      ['R1.3', 'R2.3', 'R3.3', 'R4.3', 'R5.3', 'R6.3', 'R7.3'],
    ],
  },
  {
    name: 'L Section',
    rows: [
      ['L1.1', 'L2.1', 'Gap', 'L3.1', 'L4.1', 'L5.1', 'L6.1', 'L7.1', 'L8.1'],
      ['L1.2', 'L2.2', '', 'L3.2', 'L4.2', 'L5.2', 'L6.2', 'L7.2', 'L8.2'],
    ],
  },
  {
    name: 'F Section',
    rows: [
      ['F1.1', 'F2.1', 'F3.1', 'F4.1'],
      ['F1.2', 'F2.2', 'F3.2', 'F4.2'],
    ],
  },
  {
    name: 'O Section',
    rows: [
      ['O1.1', 'O2.1', 'O3.1', 'O4.1', 'O5.1', 'O6.1', 'Gap', 'O7.1', 'O8.1', 'O9.1', 'O10.1'],
      ['O1.2', 'O2.2', 'O3.2', 'O4.2', 'O5.2', 'O6.2', '', 'O7.2', 'O8.2', 'O9.2', 'O10.2'],
    ],
  },
];

// JGI: LA1 (12), LA2 (13), S1 row, LA3 (13), LA4+LA5, Zone Labels
const JGI_SECTIONS = [
  {
    name: '',
    rows: [
      ['LA1.1', 'LA1.2', 'LA1.3', 'LA1.4', 'LA1.5', 'LA1.6', 'LA1.7', 'LA1.8', 'LA1.9', 'LA1.10', 'LA1.11', 'LA1.12'],
      ['LA2.1', 'LA2.2', 'LA2.3', 'LA2.4', 'LA2.5', 'LA2.6', 'LA2.7', 'LA2.8', 'LA2.9', 'LA2.10', 'LA2.11', 'LA2.12', 'LA2.13'],
      ['', '', '', '', '', 'S1', '', '', '', '', '', '', ''],
      ['LA3.1', 'LA3.2', 'LA3.3', 'LA3.4', 'LA3.5', 'LA3.6', 'LA3.7', 'LA3.8', 'LA3.9', 'LA3.10', 'LA3.11', 'LA3.12', 'LA3.13'],
      ['LA4.1', 'LA4.2', 'LA4.3', '', '', '', 'LA5.1', 'LA5.2', 'LA5.3'],
    ],
  },
  {
    name: '',
    rows: [
      ['Office Side', '', '', '', '', '', '', '', '', '', '', '', 'Gate Side'],
    ],
  },
];

export default function LayoutScreen() {
  const [activeTab, setActiveTab] = useState<'jgt' | 'jgi'>('jgt');
  const [jgtProfile, setJgtProfile] = useState<SheetProfile | null>(null);
  const [jgiProfile, setJgiProfile] = useState<SheetProfile | null>(null);
  const [jgtRackMap, setJgtRackMap] = useState<Map<string, RackEntry[]>>(new Map());
  const [jgiRackMap, setJgiRackMap] = useState<Map<string, RackEntry[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [selectedRack, setSelectedRack] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<RackEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [])
  );

  const loadProfiles = async () => {
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const library: SheetProfile[] = JSON.parse(stored);
      setSheetLibrary(library);

      // Find JGT and JGI profiles by sheet name
      // Actual names: "Inventory_Chart_JGT" and "Inventory Chart_JGI"
      const jgt = library.find((s) => {
        const n = s.sheetName.toLowerCase().replace(/[\s_]+/g, '');
        return n.includes('chartjgt') || n.includes('inventory_chart_jgt');
      });
      const jgi = library.find((s) => {
        const n = s.sheetName.toLowerCase().replace(/[\s_]+/g, '');
        return n.includes('chartjgi') || n.includes('inventorychartjgi');
      });

      setJgtProfile(jgt || null);
      setJgiProfile(jgi || null);

      // Parse cached data if available
      if (jgt?.data) setJgtRackMap(parseSheetData(jgt.data, jgt.range));
      if (jgi?.data) setJgiRackMap(parseSheetData(jgi.data, jgi.range));
    }
  };

  // Parse sheet data into rack map
  // Column B = Rack ID, E = Size, I = Stock, J = Rate Diff
  const parseSheetData = (rows: string[][], range: string): Map<string, RackEntry[]> => {
    const offset = getColOffset(range);
    const colB = 1 - offset; // Rack ID
    const colE = 4 - offset; // Size
    const colI = 8 - offset; // Stock
    const colJ = 9 - offset; // Rate Diff

    const map = new Map<string, RackEntry[]>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const rackRaw = row[colB] ?? '';
      const rackID = rackRaw.toString().trim();
      if (!rackID) continue;

      const rackKey = rackID.toUpperCase();
      const size = (row[colE] ?? '').toString().trim();
      const stockStr = (row[colI] ?? '0').toString().replace(/[^\d.-]/g, '');
      const diffStr = (row[colJ] ?? '0').toString().replace(/[^\d.-]/g, '');

      const entry: RackEntry = {
        size,
        stock: parseFloat(stockStr) || 0,
        rateDiff: parseFloat(diffStr) || 0,
      };

      const existing = map.get(rackKey) || [];
      existing.push(entry);
      map.set(rackKey, existing);
    }

    return map;
  };

  const refreshData = async (type: 'jgt' | 'jgi') => {
    const profile = type === 'jgt' ? jgtProfile : jgiProfile;
    if (!profile) return;

    setLoading(true);
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        return;
      }

      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(profile.range)}&_t=${Date.now()}`
      );

      const rows: string[][] = res.data.data || [];

      updateSheetProfile(profile.id, {
        data: rows,
        rowCount: res.data.row_count,
        colCount: res.data.col_count,
        lastRefreshed: Date.now(),
      });

      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));

      const newMap = parseSheetData(rows, profile.range);
      if (type === 'jgt') {
        setJgtRackMap(newMap);
        setJgtProfile({ ...profile, data: rows });
      } else {
        setJgiRackMap(newMap);
        setJgiProfile({ ...profile, data: rows });
      }

      Alert.alert('Refreshed!', `${type.toUpperCase()} data updated`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  // ─── Rack lookup ──────────────────────────────────────────────────────────
  const getRackEntries = (rackID: string, map: Map<string, RackEntry[]>): RackEntry[] => {
    const key = rackID.replace(/\(.*\)/g, '').trim().toUpperCase();

    let result = map.get(key);
    if (result?.length) return result;

    // Fuzzy: strip trailing dots
    const key2 = key.replace(/\.$/, '');
    result = map.get(key2);
    if (result?.length) return result;

    // Iterate for edge cases with whitespace in Excel
    for (const [k, v] of map.entries()) {
      if (k.trim() === key || k.trim() === key2) return v;
    }
    return [];
  };

  const totalStock = (entries: RackEntry[]) =>
    entries.reduce((s, e) => s + e.stock, 0);

  const stockColor = (stock: number) => {
    if (stock === 0) return '#FFCDD2';
    if (stock < 1000) return '#FFE0B2';
    return '#C8E6C9';
  };

  const handleRackTap = (rackID: string) => {
    const map = activeTab === 'jgt' ? jgtRackMap : jgiRackMap;
    const entries = getRackEntries(rackID, map);
    setSelectedRack(rackID);
    setSelectedEntries(entries);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────
  const currentProfile = activeTab === 'jgt' ? jgtProfile : jgiProfile;
  const currentMap = activeTab === 'jgt' ? jgtRackMap : jgiRackMap;
  const currentSections = activeTab === 'jgt' ? JGT_SECTIONS : JGI_SECTIONS;
  const hasData = currentProfile?.data && currentMap.size > 0;

  const renderCell = (text: string, idx: number) => {
    if (!text) return <View key={idx} style={s.emptyCell} />;

    if (text === 'Gap')
      return (
        <View key={idx} style={s.gapCell}>
          <Text style={s.gapText}>Gap</Text>
        </View>
      );

    if (text === 'Office Side' || text === 'Gate Side')
      return (
        <View key={idx} style={s.labelCell}>
          <Text style={s.labelText}>{text}</Text>
        </View>
      );

    // All other text = rack ID (clickable)
    const entries = getRackEntries(text, currentMap);
    const stock = totalStock(entries);
    const bg = entries.length > 0 ? stockColor(stock) : '#E8E8E8';

    return (
      <TouchableOpacity
        key={idx}
        style={[s.rackCell, { backgroundColor: bg }]}
        onPress={() => handleRackTap(text)}
        activeOpacity={0.7}
        data-testid={`rack-cell-${text}`}
      >
        <Text style={s.rackCode}>{text}</Text>
        {entries.length > 1 && (
          <View style={s.multiDot}>
            <Text style={s.multiDotText}>{entries.length}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── No profile saved ─────────────────────────────────────────────────────
  if (!jgtProfile && !jgiProfile) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Warehouse Layout</Text>
        </View>
        <View style={s.center}>
          <Ionicons name="grid-outline" size={56} color="#5f6368" />
          <Text style={s.centerTitle}>No Layout Sheets</Text>
          <Text style={s.centerSub}>
            Save Inventory_JGT and Inventory_JGI{'\n'}
            sheets from Home tab to view layouts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Warehouse Layout</Text>
        {currentProfile && (
          <TouchableOpacity
            style={s.refreshBtn}
            onPress={() => refreshData(activeTab)}
            disabled={loading}
            data-testid="layout-refresh-btn"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <Ionicons name="refresh" size={20} color="#4285F4" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'jgt' && s.tabActive]}
          onPress={() => setActiveTab('jgt')}
          data-testid="tab-jgt"
        >
          <Text style={[s.tabText, activeTab === 'jgt' && s.tabTextActive]}>
            JGT
          </Text>
          {!jgtProfile && <Text style={s.tabMissing}>Not saved</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'jgi' && s.tabActive]}
          onPress={() => setActiveTab('jgi')}
          data-testid="tab-jgi"
        >
          <Text style={[s.tabText, activeTab === 'jgi' && s.tabTextActive]}>
            JGI
          </Text>
          {!jgiProfile && <Text style={s.tabMissing}>Not saved</Text>}
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#C8E6C9' }]} />
          <Text style={s.legendLabel}>&gt;1000kg</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#FFE0B2' }]} />
          <Text style={s.legendLabel}>Low</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#FFCDD2' }]} />
          <Text style={s.legendLabel}>Empty</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#E8E8E8' }]} />
          <Text style={s.legendLabel}>No Data</Text>
        </View>
      </View>

      {/* Content */}
      {!currentProfile ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#FA7B17" />
          <Text style={s.centerTitle}>
            {activeTab.toUpperCase()} Sheet Not Saved
          </Text>
          <Text style={s.centerSub}>
            Save Inventory_{activeTab.toUpperCase()} from Home tab.
          </Text>
        </View>
      ) : !hasData ? (
        <View style={s.center}>
          <TouchableOpacity
            style={s.loadBtn}
            onPress={() => refreshData(activeTab)}
            disabled={loading}
            data-testid="load-data-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-download" size={24} color="#fff" />
                <Text style={s.loadBtnText}>Load Data</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={s.hScroll}
        >
          <ScrollView
            showsVerticalScrollIndicator
            contentContainerStyle={s.vScroll}
          >
            <View style={s.layoutTitleBar}>
              <Text style={s.layoutTitle}>
                {activeTab === 'jgt'
                  ? 'JGT Visual Inventory Layout'
                  : 'JGI Visual Inventory Layout'}
              </Text>
            </View>

            {currentSections.map((section, sIdx) => (
              <View key={sIdx} style={s.section}>
                {section.name ? (
                  <Text style={s.sectionName}>{section.name}</Text>
                ) : null}
                {section.rows.map((row, rIdx) => (
                  <View key={rIdx} style={s.row}>
                    {row.map((cell, cIdx) => renderCell(cell, cIdx))}
                  </View>
                ))}
                {sIdx < currentSections.length - 1 && (
                  <View style={s.divider} />
                )}
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      )}

      {/* Rack Detail Modal */}
      <Modal
        visible={selectedRack !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRack(null)}
      >
        <TouchableOpacity
          style={s.modalBg}
          activeOpacity={1}
          onPress={() => setSelectedRack(null)}
        >
          <View style={s.modal}>
            {selectedRack && (
              <>
                <View style={s.modalHeader}>
                  <View style={s.rackBadge}>
                    <Ionicons name="location" size={16} color="#fff" />
                    <Text style={s.rackBadgeText}>{selectedRack}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRack(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>

                {selectedEntries.length === 0 ? (
                  <View style={s.emptyRack}>
                    <Ionicons
                      name="cube-outline"
                      size={40}
                      color="#9aa0a6"
                    />
                    <Text style={s.emptyRackTitle}>Empty Rack</Text>
                  </View>
                ) : selectedEntries.length === 1 ? (
                  <View style={s.singleEntry}>
                    <Row label="Size" value={selectedEntries[0].size || 'N/A'} />
                    <Row
                      label="Stock"
                      value={`${selectedEntries[0].stock.toLocaleString('en-IN')} kg`}
                      color={
                        selectedEntries[0].stock > 0 ? '#34A853' : '#EA4335'
                      }
                    />
                    <Row
                      label="Rate Diff"
                      value={`${selectedEntries[0].rateDiff >= 0 ? '+' : ''}${selectedEntries[0].rateDiff}`}
                      color={
                        selectedEntries[0].rateDiff >= 0
                          ? '#34A853'
                          : '#EA4335'
                      }
                    />
                  </View>
                ) : (
                  <ScrollView style={s.multiList}>
                    {selectedEntries.map((e, i) => (
                      <View key={i} style={s.multiItem}>
                        <View style={s.multiItemRow}>
                          <Text style={s.multiSize}>
                            {e.size || 'Unknown'}
                          </Text>
                          <Text
                            style={[
                              s.multiStock,
                              {
                                color:
                                  e.stock > 0 ? '#34A853' : '#EA4335',
                              },
                            ]}
                          >
                            {e.stock.toLocaleString('en-IN')} kg
                          </Text>
                        </View>
                        <Text
                          style={[
                            s.multiDiff,
                            {
                              color:
                                e.rateDiff >= 0 ? '#34A853' : '#EA4335',
                            },
                          ]}
                        >
                          Rate Diff: {e.rateDiff >= 0 ? '+' : ''}
                          {e.rateDiff}
                        </Text>
                      </View>
                    ))}
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Total Stock</Text>
                      <Text style={s.totalValue}>
                        {totalStock(selectedEntries).toLocaleString('en-IN')}{' '}
                        kg
                      </Text>
                    </View>
                  </ScrollView>
                )}

                <View
                  style={[
                    s.stockBar,
                    {
                      backgroundColor: stockColor(
                        totalStock(selectedEntries)
                      ),
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      totalStock(selectedEntries) > 1000
                        ? 'checkmark-circle'
                        : totalStock(selectedEntries) > 0
                          ? 'alert-circle'
                          : 'close-circle'
                    }
                    size={20}
                    color={
                      totalStock(selectedEntries) > 1000
                        ? '#34A853'
                        : totalStock(selectedEntries) > 0
                          ? '#FA7B17'
                          : '#EA4335'
                    }
                  />
                  <Text style={s.stockBarText}>
                    {totalStock(selectedEntries) > 1000
                      ? 'In Stock'
                      : totalStock(selectedEntries) > 0
                        ? 'Low Stock'
                        : 'Empty'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// Helper row component for single entry modal
function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const CW = 66; // cell width
const CH = 46; // cell height

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    marginHorizontal: 4,
    backgroundColor: '#0f3460',
  },
  tabActive: { backgroundColor: '#4285F4' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  tabTextActive: { color: '#fff' },
  tabMissing: { fontSize: 9, color: '#EA4335', marginTop: 2 },
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 14,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 10, color: '#9aa0a6' },
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
    marginTop: 16,
  },
  centerSub: {
    fontSize: 13,
    color: '#9aa0a6',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  loadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  loadBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  // Grid
  hScroll: { paddingHorizontal: 12 },
  vScroll: { paddingVertical: 12 },
  layoutTitleBar: {
    backgroundColor: '#0f3460',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  layoutTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  section: { marginBottom: 8 },
  sectionName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4285F4',
    marginBottom: 6,
    marginLeft: 4,
  },
  divider: { height: 12 },
  row: { flexDirection: 'row', marginBottom: 3 },
  emptyCell: { width: CW, height: CH, marginRight: 3 },
  gapCell: {
    width: CW,
    height: CH,
    marginRight: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gapText: { fontSize: 9, color: '#5f6368', fontStyle: 'italic' },
  labelCell: {
    minWidth: CW,
    height: CH,
    marginRight: 3,
    backgroundColor: '#F3E5F5',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  labelText: { fontSize: 9, fontWeight: '600', color: '#7B1FA2' },
  rackCell: {
    width: CW,
    height: CH,
    marginRight: 3,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  rackCode: { fontSize: 10, fontWeight: '700', color: '#202124' },
  multiDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#4285F4',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  multiDotText: { fontSize: 7, fontWeight: '700', color: '#fff' },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  rackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4285F4',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rackBadgeText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  // Empty rack
  emptyRack: { alignItems: 'center', paddingVertical: 20 },
  emptyRackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5f6368',
    marginTop: 10,
  },
  // Single entry
  singleEntry: { marginBottom: 14 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: { fontSize: 14, color: '#5f6368' },
  detailValue: { fontSize: 16, fontWeight: '700', color: '#202124' },
  // Multi entry
  multiList: { maxHeight: 200, marginBottom: 14 },
  multiItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4285F4',
  },
  multiItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  multiSize: { fontSize: 13, fontWeight: '600', color: '#202124', flex: 1 },
  multiStock: { fontSize: 15, fontWeight: '700' },
  multiDiff: { fontSize: 11, marginTop: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  totalLabel: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#4285F4' },
  // Stock indicator
  stockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  stockBarText: { fontSize: 13, fontWeight: '600', color: '#202124' },
});
