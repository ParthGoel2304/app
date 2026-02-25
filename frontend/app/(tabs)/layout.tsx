import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Modal, ActivityIndicator, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExcelStore, getColOffset } from '../../utils/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LAYOUT_FILE_NAME = 'MS_Inventory_System_FINAL';

interface RackItem {
  rackCode: string;
  size: string;
  row: number;
  col: number;
  isEmpty: boolean;
  isLabel: boolean;
}

interface StockDetail {
  size: string;
  altName: string;
  sizeDiff: number;
  jgtStock: string;
  jgiStock: string;
  totalStock: string;
}

// Parse rack code pattern (e.g., "R1.2", "L3.1", "LA2.4")
const isRackCode = (text: string): boolean => {
  return /^[A-Z]+\d+\.\d+$/i.test(text.trim());
};

// Check if it's a zone label
const isZoneLabel = (text: string): boolean => {
  const labels = ['office', 'gate', 'side', 'wall', 'door', 'entry', 'exit'];
  const lower = text.toLowerCase();
  return labels.some(l => lower.includes(l));
};

export default function LayoutScreen() {
  const [layoutType, setLayoutType] = useState<'jgt' | 'jgi'>('jgt');
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutData, setLayoutData] = useState<RackItem[][]>([]);
  const [selectedRack, setSelectedRack] = useState<RackItem | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasLayoutFile, setHasLayoutFile] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    try {
      const sid = await AsyncStorage.getItem('sessionId');
      setSessionId(sid);
      if (sid) {
        checkLayoutFile(sid);
      }
    } catch {}
  };

  const checkLayoutFile = async (sid: string) => {
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${backendUrl}/api/drive/files?session_id=${sid}`);
      const files = await res.json();
      
      const layoutFile = files.find((f: any) => 
        f.name.toLowerCase().includes('inventory') && 
        f.name.toLowerCase().includes('system')
      );
      
      setHasLayoutFile(!!layoutFile);
      if (layoutFile) {
        await AsyncStorage.setItem('layout_file_id', layoutFile.id);
        await AsyncStorage.setItem('layout_file_name', layoutFile.name);
      }
    } catch (err) {
      setHasLayoutFile(false);
      setErrorMsg('Failed to check for layout file');
    }
  };

  const loadLayout = async (type: 'jgt' | 'jgi') => {
    if (!sessionId) {
      Alert.alert('Error', 'No session. Please login first.');
      return;
    }

    setLayoutLoading(true);
    setLayoutType(type);
    setLayoutData([]);
    setErrorMsg('');

    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const fileId = await AsyncStorage.getItem('layout_file_id');
      
      if (!fileId) {
        throw new Error('Layout file not found in Drive');
      }

      const sheetName = type === 'jgt' ? 'Inventory_Chart_JGT' : 'Inventory_Chart_JGI';
      
      // Load layout sheet data
      const res = await fetch(
        `${backendUrl}/api/excel/read?session_id=${sessionId}&file_id=${fileId}&sheet_name=${sheetName}&cell_range=A1:J50`
      );
      
      if (!res.ok) {
        throw new Error(`Failed to load ${sheetName}`);
      }

      const data = await res.json();
      const rows: string[][] = data.rows || [];

      // Parse layout into rack grid
      const parsed = parseLayoutData(rows);
      setLayoutData(parsed);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load layout');
      Alert.alert('Error', err.message || 'Failed to load layout');
    } finally {
      setLayoutLoading(false);
    }
  };

  const parseLayoutData = (rows: string[][]): RackItem[][] => {
    const grid: RackItem[][] = [];
    
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const gridRow: RackItem[] = [];
      
      for (let c = 0; c < Math.min(row.length, 10); c++) {
        const cellText = (row[c] || '').toString().trim();
        
        // Get size from column E (index 4) if this is a rack row
        const sizeCol = row[4] || '';
        
        gridRow.push({
          rackCode: cellText,
          size: sizeCol.toString().trim(),
          row: r,
          col: c,
          isEmpty: !cellText,
          isLabel: isZoneLabel(cellText),
        });
      }
      
      if (gridRow.some(cell => !cell.isEmpty)) {
        grid.push(gridRow);
      }
    }
    
    return grid;
  };

  const handleRackPress = async (rack: RackItem) => {
    if (rack.isEmpty || rack.isLabel) return;
    if (!isRackCode(rack.rackCode)) return;

    setSelectedRack(rack);
    
    // Find stock from loaded stock data
    const store = getExcelStore();
    if (!store || !rack.size) {
      setStockDetail(null);
      return;
    }

    const offset = getColOffset(store.cellRange);
    const eIdx = 4 - offset;
    const fIdx = 5 - offset;
    const hIdx = 7 - offset;
    const mIdx = 12 - offset;
    const nIdx = 13 - offset;
    const oIdx = 14 - offset;

    const normalizedSize = rack.size.toLowerCase().replace(/\s+/g, '');
    
    for (let i = 1; i < store.data.length; i++) {
      const row = store.data[i];
      if (!row) continue;
      
      const size = (row[eIdx] || '').toString().trim();
      const normSize = size.toLowerCase().replace(/\s+/g, '');
      
      if (normSize === normalizedSize || normSize.includes(normalizedSize) || normalizedSize.includes(normSize.substring(0, 5))) {
        setStockDetail({
          size,
          altName: (row[fIdx] || '').toString().trim(),
          sizeDiff: parseFloat((row[hIdx] || '0').toString().replace(/[^\d.-]/g, '')) || 0,
          jgtStock: (row[mIdx] || '0').toString(),
          jgiStock: (row[nIdx] || '0').toString(),
          totalStock: (row[oIdx] || '0').toString(),
        });
        return;
      }
    }
    
    setStockDetail(null);
  };

  const getStockColor = (totalStock?: string) => {
    if (!totalStock) return '#E8E8E8'; // No data
    const val = parseFloat(totalStock) || 0;
    if (val === 0) return '#FFCDD2'; // Red - empty
    if (val < 500) return '#FFE0B2'; // Orange - low
    return '#C8E6C9'; // Green - available
  };

  const getRackStyle = (rack: RackItem) => {
    if (rack.isEmpty) return styles.emptyCell;
    if (rack.isLabel) return styles.labelCell;
    if (!isRackCode(rack.rackCode)) return styles.emptyCell;
    return styles.rackCell;
  };

  // Not logged in
  if (!sessionId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Warehouse Layout</Text>
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="log-in-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>Login Required</Text>
          <Text style={styles.emptySub}>Connect to Google Drive to view layout</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Warehouse Layout</Text>
        <TouchableOpacity style={styles.infoBtn}>
          <Ionicons name="information-circle-outline" size={22} color="#5f6368" />
        </TouchableOpacity>
      </View>

      {/* Layout Type Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, layoutType === 'jgt' && styles.tabActive]}
          onPress={() => loadLayout('jgt')}
        >
          <Text style={[styles.tabText, layoutType === 'jgt' && styles.tabTextActive]}>
            JGT Layout
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, layoutType === 'jgi' && styles.tabActive]}
          onPress={() => loadLayout('jgi')}
        >
          <Text style={[styles.tabText, layoutType === 'jgi' && styles.tabTextActive]}>
            JGI Layout
          </Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#C8E6C9' }]} />
          <Text style={styles.legendText}>In Stock</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FFE0B2' }]} />
          <Text style={styles.legendText}>Low</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FFCDD2' }]} />
          <Text style={styles.legendText}>Empty</Text>
        </View>
      </View>

      {layoutLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading {layoutType.toUpperCase()} layout...</Text>
        </View>
      ) : layoutData.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="grid-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>No Layout Loaded</Text>
          <Text style={styles.emptySub}>
            {hasLayoutFile === false
              ? `"${LAYOUT_FILE_NAME}" not found in Drive`
              : 'Tap JGT or JGI to load layout'}
          </Text>
          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <ScrollView contentContainerStyle={styles.gridContainer}>
            {layoutData.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.gridRow}>
                {row.map((cell, colIdx) => (
                  <TouchableOpacity
                    key={`${rowIdx}-${colIdx}`}
                    style={[
                      styles.gridCell,
                      getRackStyle(cell),
                      isRackCode(cell.rackCode) && { backgroundColor: getStockColor(stockDetail?.totalStock) },
                    ]}
                    onPress={() => handleRackPress(cell)}
                    disabled={cell.isEmpty || cell.isLabel}
                  >
                    {cell.isLabel ? (
                      <Text style={styles.labelText} numberOfLines={1}>
                        {cell.rackCode}
                      </Text>
                    ) : isRackCode(cell.rackCode) ? (
                      <>
                        <Text style={styles.rackCode}>{cell.rackCode}</Text>
                        {cell.size && (
                          <Text style={styles.rackSize} numberOfLines={1}>
                            {cell.size}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.cellText}>{cell.rackCode}</Text>
                    )}
                  </TouchableOpacity>
                ))}
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedRack(null)}
        >
          <View style={styles.detailModal}>
            {selectedRack && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.rackBadge}>
                    <Text style={styles.rackBadgeText}>{selectedRack.rackCode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRack(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>

                {stockDetail ? (
                  <>
                    <Text style={styles.modalSize}>{stockDetail.size}</Text>
                    {stockDetail.altName && (
                      <Text style={styles.modalAlt}>{stockDetail.altName}</Text>
                    )}

                    <View style={styles.modalGrid}>
                      <View style={styles.modalGridItem}>
                        <Text style={styles.modalGridLabel}>Size Diff</Text>
                        <Text style={[styles.modalGridValue, { color: stockDetail.sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
                          {stockDetail.sizeDiff >= 0 ? '+' : ''}{stockDetail.sizeDiff}
                        </Text>
                      </View>
                      <View style={styles.modalGridItem}>
                        <Text style={styles.modalGridLabel}>JGT Stock</Text>
                        <Text style={styles.modalGridValue}>{stockDetail.jgtStock} kg</Text>
                      </View>
                      <View style={styles.modalGridItem}>
                        <Text style={styles.modalGridLabel}>JGI Stock</Text>
                        <Text style={styles.modalGridValue}>{stockDetail.jgiStock} kg</Text>
                      </View>
                      <View style={[styles.modalGridItem, styles.modalGridTotal]}>
                        <Text style={styles.modalGridLabel}>Total Stock</Text>
                        <Text style={[styles.modalGridValue, styles.totalValue]}>
                          {parseFloat(stockDetail.totalStock).toLocaleString('en-IN')} kg
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.noStockBox}>
                    <Ionicons name="alert-circle-outline" size={40} color="#FA7B17" />
                    <Text style={styles.noStockText}>
                      Stock data not found for size: {selectedRack.size || 'Unknown'}
                    </Text>
                    <Text style={styles.noStockHint}>
                      Ensure stock master is loaded and size names match
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const CELL_SIZE = 80;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#202124' },
  infoBtn: { padding: 4 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, marginHorizontal: 4,
  },
  tabActive: { backgroundColor: '#4285F4' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#5f6368' },
  tabTextActive: { color: '#fff' },
  legend: {
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: 10, gap: 20, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 11, color: '#5f6368' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#5f6368', marginTop: 12 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#202124', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginTop: 8 },
  errorText: { fontSize: 12, color: '#EA4335', marginTop: 8 },
  gridContainer: { padding: 12 },
  gridRow: { flexDirection: 'row', marginBottom: 4 },
  gridCell: {
    width: CELL_SIZE, height: CELL_SIZE, marginRight: 4,
    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    padding: 4,
  },
  emptyCell: { backgroundColor: 'transparent' },
  labelCell: { backgroundColor: '#F3E5F5' },
  rackCell: { backgroundColor: '#E8E8E8', borderWidth: 1, borderColor: '#BDBDBD' },
  cellText: { fontSize: 9, color: '#9aa0a6', textAlign: 'center' },
  labelText: { fontSize: 9, fontWeight: '600', color: '#7B1FA2', textAlign: 'center' },
  rackCode: { fontSize: 11, fontWeight: '700', color: '#202124' },
  rackSize: { fontSize: 8, color: '#5f6368', marginTop: 2, textAlign: 'center' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  detailModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  rackBadge: {
    backgroundColor: '#4285F4', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  rackBadgeText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalSize: { fontSize: 22, fontWeight: '700', color: '#202124' },
  modalAlt: { fontSize: 14, color: '#9aa0a6', marginTop: 4, marginBottom: 16 },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  modalGridItem: {
    width: '47%', backgroundColor: '#f8f9fa', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  modalGridTotal: { width: '100%', backgroundColor: '#E8F0FE' },
  modalGridLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '500' },
  modalGridValue: { fontSize: 18, fontWeight: '700', color: '#202124', marginTop: 4 },
  totalValue: { fontSize: 24, color: '#4285F4' },
  noStockBox: { alignItems: 'center', paddingVertical: 20 },
  noStockText: { fontSize: 14, color: '#FA7B17', textAlign: 'center', marginTop: 12 },
  noStockHint: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 8 },
});
