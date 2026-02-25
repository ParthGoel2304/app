import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Modal, ActivityIndicator, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface RackData {
  rackCode: string;
  size: string;
  stock: number;
  sizeDiff: number;
}

interface RackDetailModalProps {
  rack: RackData | null;
  onClose: () => void;
}

// JGT Visual Layout Structure (matching image 3)
const JGT_LAYOUT = {
  title: 'JGT Visual Inventory Layout',
  sections: [
    {
      name: 'R Section',
      rows: [
        ['R1.1', 'R2.1', 'R3.1', 'R4.1', 'R5.1', 'R6.1', 'R7.1', 'Others'],
        ['R1.2', 'R2.2', 'R3.2', 'R4.2', 'R5.2', 'R6.2', 'R7.2', ''],
        ['R1.3', 'R2.3', 'R3.3', 'R4.3', 'R5.3', 'R6.3', 'R7.3', ''],
      ]
    },
    {
      name: 'L Section',
      rows: [
        ['L1.1', 'L2.1', 'Gap', 'L3.1', 'L4.1', 'L5.1', 'L6.1', 'L7.1', 'L8.1'],
        ['L1.2', 'L2.2', '', 'L3.2', 'L4.2', 'L5.2', 'L6.2', 'L7.2', 'L8.2'],
      ]
    },
    {
      name: 'F Section',
      rows: [
        ['F1.1', 'F2.1', 'F3.1', 'F4.1'],
        ['F1.2', 'F2.2', 'F3.2', 'F4.2'],
      ]
    },
    {
      name: 'O Section',
      rows: [
        ['O1.1', 'O2.1', 'O3.1', 'O4.1', 'O5.1', 'O6.1', 'Gap', 'O7.1', 'O8.1', 'O9.1', 'O10.1'],
        ['O1.2', 'O2.2', 'O3.2', 'O4.2', 'O5.2', 'O6.2', '', 'O7.2', 'O8.2', 'O9.2', 'O10.2'],
      ]
    }
  ]
};

// JGI Visual Layout Structure (matching image 4)
const JGI_LAYOUT = {
  title: 'JGI Visual Inventory Layout',
  sections: [
    {
      name: 'LA Section',
      rows: [
        ['LA1.1', 'LA1.2', 'LA1.3', 'LA1.4', 'LA1.5', 'LA1.6', 'LA1.7', 'LA1.8', 'LA1.9', 'LA1.10', 'LA1.11', 'LA1.12'],
        ['LA2.1(D)', 'LA2.2', 'LA2.3', 'LA2.4', 'LA2.5', 'LA2.6', 'LA2.7', 'LA2.8', 'LA2.9', 'LA2.10(D)', 'LA2.11(gu)', 'LA2.12(D)', 'LA2.13'],
        ['', '', '', '', '', '3X1.5X20(S1)', '', '', '', '', '', '', ''],
        ['LA3.1(D)', 'LA3.2', 'LA3.3', 'LA3.4(D2)', 'LA3.5', 'LA3.6', 'LA3.7', 'LA3.8', 'LA3.9', 'LA3.10', 'LA3.11', 'LA3.12', 'LA3.13'],
        ['LA4.1D', 'LA4.2', 'LA4.3S', '', '', '', 'LA5.1(D)', 'LA5.2', 'LA5.3', '', '', '', ''],
      ]
    },
    {
      name: 'Zone Labels',
      rows: [
        ['Office Side', '', '', '', '', '', '', '', '', '', '', 'Gate Side'],
      ]
    }
  ]
};

export default function LayoutScreen() {
  const [layoutType, setLayoutType] = useState<'jgt' | 'jgi'>('jgt');
  const [loading, setLoading] = useState(false);
  const [rackDataMap, setRackDataMap] = useState<Map<string, RackData>>(new Map());
  const [selectedRack, setSelectedRack] = useState<RackData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    const sid = await AsyncStorage.getItem('sessionId');
    setSessionId(sid);
  };

  const loadLayoutData = async (type: 'jgt' | 'jgi') => {
    if (!sessionId) {
      Alert.alert('Error', 'Please login first');
      return;
    }

    setLoading(true);
    setLayoutType(type);
    setRackDataMap(new Map());

    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      
      // First, find the MS_Inventory_System_FINAL file
      const filesRes = await fetch(`${backendUrl}/api/drive/files?session_id=${sessionId}`);
      const files = await filesRes.json();
      
      const layoutFile = files.find((f: any) => 
        f.name.toLowerCase().includes('inventory') && 
        f.name.toLowerCase().includes('system') &&
        f.name.toLowerCase().includes('final')
      );

      if (!layoutFile) {
        Alert.alert('File Not Found', 'MS_Inventory_System_FINAL not found in Google Drive');
        setLoading(false);
        return;
      }

      // Load the correct inventory chart sheet
      const sheetName = type === 'jgt' ? 'Inventory_Chart_JGT' : 'Inventory_Chart_JGI';
      
      const dataRes = await fetch(
        `${backendUrl}/api/excel/read?session_id=${sessionId}&file_id=${layoutFile.id}&sheet_name=${sheetName}&cell_range=A1:K200`
      );

      if (!dataRes.ok) {
        throw new Error(`Failed to load ${sheetName}`);
      }

      const data = await dataRes.json();
      const rows: string[][] = data.rows || [];

      // Parse data into rack map
      // Column B (index 1): Rack_Location
      // Column E (index 4): Size
      // Column I (index 8): Current Stock
      // Column J (index 9): Size Diff
      const newMap = new Map<string, RackData>();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 10) continue;

        const rackCode = (row[1] || '').toString().trim();
        const size = (row[4] || '').toString().trim();
        const stockStr = (row[8] || '0').toString().replace(/[^\d.-]/g, '');
        const diffStr = (row[9] || '0').toString().replace(/[^\d.-]/g, '');

        if (rackCode) {
          newMap.set(rackCode.toUpperCase(), {
            rackCode,
            size,
            stock: parseFloat(stockStr) || 0,
            sizeDiff: parseFloat(diffStr) || 0,
          });
        }
      }

      setRackDataMap(newMap);
      setDataLoaded(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load layout data');
    } finally {
      setLoading(false);
    }
  };

  const getRackInfo = (rackCode: string): RackData | null => {
    // Clean the rack code for lookup
    const cleanCode = rackCode.replace(/\(.*\)/g, '').trim().toUpperCase();
    return rackDataMap.get(cleanCode) || null;
  };

  const getStockColor = (stock: number): string => {
    if (stock === 0) return '#FFCDD2'; // Red - empty
    if (stock < 1000) return '#FFE0B2'; // Orange - low
    return '#C8E6C9'; // Green - good
  };

  const isRackCode = (text: string): boolean => {
    if (!text || text === 'Gap' || text === 'Others') return false;
    // Match patterns like R1.1, LA1.2, O10.2, etc.
    return /^[A-Z]+\d+\.?\d*/.test(text.replace(/\(.*\)/g, '').trim());
  };

  const isLabel = (text: string): boolean => {
    const labels = ['office side', 'gate side', 'gap', 'others', '3x1.5x20'];
    return labels.some(l => text.toLowerCase().includes(l.toLowerCase()));
  };

  const handleRackPress = (rackCode: string) => {
    const rackInfo = getRackInfo(rackCode);
    if (rackInfo) {
      setSelectedRack(rackInfo);
    } else {
      // Show empty rack info
      setSelectedRack({
        rackCode,
        size: 'No data',
        stock: 0,
        sizeDiff: 0,
      });
    }
  };

  const currentLayout = layoutType === 'jgt' ? JGT_LAYOUT : JGI_LAYOUT;

  const renderRackCell = (cellText: string, colIndex: number) => {
    if (!cellText) {
      return <View key={colIndex} style={styles.emptyCell} />;
    }

    if (cellText === 'Gap') {
      return (
        <View key={colIndex} style={styles.gapCell}>
          <Text style={styles.gapText}>Gap</Text>
        </View>
      );
    }

    if (isLabel(cellText) && !isRackCode(cellText)) {
      return (
        <View key={colIndex} style={styles.labelCell}>
          <Text style={styles.labelText}>{cellText}</Text>
        </View>
      );
    }

    if (isRackCode(cellText)) {
      const rackInfo = getRackInfo(cellText);
      const bgColor = rackInfo ? getStockColor(rackInfo.stock) : '#E8E8E8';

      return (
        <TouchableOpacity
          key={colIndex}
          style={[styles.rackCell, { backgroundColor: bgColor }]}
          onPress={() => handleRackPress(cellText)}
          activeOpacity={0.7}
        >
          <Text style={styles.rackCode}>{cellText}</Text>
          {rackInfo && rackInfo.size && (
            <Text style={styles.rackSize} numberOfLines={1}>
              {rackInfo.size.length > 12 ? rackInfo.size.substring(0, 10) + '..' : rackInfo.size}
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    // Unknown text
    return (
      <View key={colIndex} style={styles.otherCell}>
        <Text style={styles.otherText}>{cellText}</Text>
      </View>
    );
  };

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Warehouse Layout</Text>
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="log-in-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>Login Required</Text>
          <Text style={styles.emptySub}>Connect to Google Drive first</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Warehouse Layout</Text>
      </View>

      {/* Layout Type Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, layoutType === 'jgt' && dataLoaded && styles.tabActive]}
          onPress={() => loadLayoutData('jgt')}
        >
          <Text style={[styles.tabText, layoutType === 'jgt' && dataLoaded && styles.tabTextActive]}>
            JGT Layout
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, layoutType === 'jgi' && dataLoaded && styles.tabActive]}
          onPress={() => loadLayoutData('jgi')}
        >
          <Text style={[styles.tabText, layoutType === 'jgi' && dataLoaded && styles.tabTextActive]}>
            JGI Layout
          </Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#C8E6C9' }]} />
          <Text style={styles.legendText}>Stock &gt; 1000kg</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FFE0B2' }]} />
          <Text style={styles.legendText}>Low Stock</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FFCDD2' }]} />
          <Text style={styles.legendText}>Empty</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading {layoutType.toUpperCase()} layout...</Text>
        </View>
      ) : !dataLoaded ? (
        <View style={styles.emptyBox}>
          <Ionicons name="grid-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>Select Layout</Text>
          <Text style={styles.emptySub}>Tap JGT or JGI to load warehouse layout</Text>
        </View>
      ) : (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.horizontalScroll}
        >
          <ScrollView 
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.verticalScroll}
          >
            {/* Layout Title */}
            <View style={styles.layoutTitleBar}>
              <Text style={styles.layoutTitle}>{currentLayout.title}</Text>
            </View>

            {/* Sections */}
            {currentLayout.sections.map((section, sIdx) => (
              <View key={sIdx} style={styles.section}>
                {section.name !== 'Zone Labels' && (
                  <Text style={styles.sectionName}>{section.name}</Text>
                )}
                {section.rows.map((row, rIdx) => (
                  <View key={rIdx} style={styles.row}>
                    {row.map((cell, cIdx) => renderRackCell(cell, cIdx))}
                  </View>
                ))}
                {sIdx < currentLayout.sections.length - 1 && (
                  <View style={styles.sectionDivider} />
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedRack(null)}
        >
          <View style={styles.detailModal}>
            {selectedRack && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.rackBadge}>
                    <Ionicons name="location" size={16} color="#fff" />
                    <Text style={styles.rackBadgeText}>{selectedRack.rackCode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRack(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalContent}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Size</Text>
                    <Text style={styles.modalValue}>{selectedRack.size || 'N/A'}</Text>
                  </View>
                  
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Size Diff</Text>
                    <Text style={[
                      styles.modalValue,
                      { color: selectedRack.sizeDiff >= 0 ? '#34A853' : '#EA4335' }
                    ]}>
                      {selectedRack.sizeDiff >= 0 ? '+' : ''}{selectedRack.sizeDiff}
                    </Text>
                  </View>
                  
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Current Stock</Text>
                    <Text style={[
                      styles.modalValue,
                      styles.stockValue,
                      { color: selectedRack.stock > 0 ? '#34A853' : '#EA4335' }
                    ]}>
                      {selectedRack.stock.toLocaleString('en-IN')} kg
                    </Text>
                  </View>
                </View>

                <View style={[
                  styles.stockIndicator,
                  { backgroundColor: getStockColor(selectedRack.stock) }
                ]}>
                  <Ionicons 
                    name={selectedRack.stock > 1000 ? 'checkmark-circle' : selectedRack.stock > 0 ? 'alert-circle' : 'close-circle'} 
                    size={20} 
                    color={selectedRack.stock > 1000 ? '#34A853' : selectedRack.stock > 0 ? '#FA7B17' : '#EA4335'} 
                  />
                  <Text style={styles.stockIndicatorText}>
                    {selectedRack.stock > 1000 ? 'In Stock' : selectedRack.stock > 0 ? 'Low Stock' : 'Empty'}
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

const CELL_WIDTH = 70;
const CELL_HEIGHT = 50;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#16213e', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, marginHorizontal: 4, backgroundColor: '#0f3460',
  },
  tabActive: { backgroundColor: '#4285F4' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  tabTextActive: { color: '#fff' },
  legend: {
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: 10, gap: 16, backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#9aa0a6' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#9aa0a6', marginTop: 12 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#9aa0a6', textAlign: 'center', marginTop: 8 },
  horizontalScroll: { paddingHorizontal: 12 },
  verticalScroll: { paddingVertical: 12 },
  layoutTitleBar: {
    backgroundColor: '#0f3460', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 8, marginBottom: 16, alignSelf: 'flex-start',
  },
  layoutTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  section: { marginBottom: 16 },
  sectionName: {
    fontSize: 12, fontWeight: '600', color: '#4285F4',
    marginBottom: 8, marginLeft: 4,
  },
  sectionDivider: { height: 16 },
  row: { flexDirection: 'row', marginBottom: 4 },
  emptyCell: { width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4 },
  gapCell: {
    width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4,
    backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center',
  },
  gapText: { fontSize: 10, color: '#5f6368', fontStyle: 'italic' },
  labelCell: {
    minWidth: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4,
    backgroundColor: '#F3E5F5', borderRadius: 6,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8,
  },
  labelText: { fontSize: 10, fontWeight: '600', color: '#7B1FA2', textAlign: 'center' },
  rackCell: {
    width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4,
    borderRadius: 6, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  rackCode: { fontSize: 11, fontWeight: '700', color: '#202124' },
  rackSize: { fontSize: 8, color: '#5f6368', marginTop: 2, textAlign: 'center' },
  otherCell: {
    minWidth: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4,
    backgroundColor: '#E8E8E8', borderRadius: 6,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  otherText: { fontSize: 9, color: '#5f6368', textAlign: 'center' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  detailModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  rackBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#4285F4', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
  },
  rackBadgeText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalContent: { marginBottom: 16 },
  modalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalLabel: { fontSize: 14, color: '#5f6368' },
  modalValue: { fontSize: 16, fontWeight: '700', color: '#202124' },
  stockValue: { fontSize: 20 },
  stockIndicator: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 8,
  },
  stockIndicatorText: { fontSize: 14, fontWeight: '600', color: '#202124' },
});
