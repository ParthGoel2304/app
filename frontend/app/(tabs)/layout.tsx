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
  getSheetLibrary, getLayoutSheets, setSheetLibrary,
  SheetProfile, updateSheetProfile
} from '../../utils/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RackData {
  rackCode: string;
  size: string;
  stock: number;
  sizeDiff: number;
}

// Support multiple items per rack (for duplicates)
interface RackEntry {
  size: string;
  stock: number;
  sizeDiff: number;
}

// JGT Visual Layout Structure
const JGT_LAYOUT = {
  title: 'JGT Visual Inventory Layout',
  sections: [
    { name: 'R Section', rows: [
      ['R1.1', 'R2.1', 'R3.1', 'R4.1', 'R5.1', 'R6.1', 'R7.1', 'Others'],
      ['R1.2', 'R2.2', 'R3.2', 'R4.2', 'R5.2', 'R6.2', 'R7.2', ''],
      ['R1.3', 'R2.3', 'R3.3', 'R4.3', 'R5.3', 'R6.3', 'R7.3', ''],
    ]},
    { name: 'L Section', rows: [
      ['L1.1', 'L2.1', 'Gap', 'L3.1', 'L4.1', 'L5.1', 'L6.1', 'L7.1', 'L8.1'],
      ['L1.2', 'L2.2', '', 'L3.2', 'L4.2', 'L5.2', 'L6.2', 'L7.2', 'L8.2'],
    ]},
    { name: 'F Section', rows: [
      ['F1.1', 'F2.1', 'F3.1', 'F4.1'],
      ['F1.2', 'F2.2', 'F3.2', 'F4.2'],
    ]},
    { name: 'O Section', rows: [
      ['O1.1', 'O2.1', 'O3.1', 'O4.1', 'O5.1', 'O6.1', 'Gap', 'O7.1', 'O8.1', 'O9.1', 'O10.1'],
      ['O1.2', 'O2.2', 'O3.2', 'O4.2', 'O5.2', 'O6.2', '', 'O7.2', 'O8.2', 'O9.2', 'O10.2'],
    ]}
  ]
};

// JGI Visual Layout Structure
const JGI_LAYOUT = {
  title: 'JGI Visual Inventory Layout',
  sections: [
    { name: 'LA Section', rows: [
      ['LA1.1', 'LA1.2', 'LA1.3', 'LA1.4', 'LA1.5', 'LA1.6', 'LA1.7', 'LA1.8', 'LA1.9', 'LA1.10', 'LA1.11', 'LA1.12'],
      ['LA2.1(D)', 'LA2.2', 'LA2.3', 'LA2.4', 'LA2.5', 'LA2.6', 'LA2.7', 'LA2.8', 'LA2.9', 'LA2.10(D)', 'LA2.11(gu)', 'LA2.12(D)', 'LA2.13'],
      ['', '', '', '', '', '3X1.5X20(S1)', '', '', '', '', '', '', ''],
      ['LA3.1(D)', 'LA3.2', 'LA3.3', 'LA3.4(D2)', 'LA3.5', 'LA3.6', 'LA3.7', 'LA3.8', 'LA3.9', 'LA3.10', 'LA3.11', 'LA3.12', 'LA3.13'],
      ['LA4.1D', 'LA4.2', 'LA4.3S', '', '', '', 'LA5.1(D)', 'LA5.2', 'LA5.3', '', '', '', ''],
    ]},
    { name: 'Zone Labels', rows: [
      ['Office Side', '', '', '', '', '', '', '', '', '', '', 'Gate Side'],
    ]}
  ]
};

export default function LayoutScreen() {
  // Sheet library state
  const [layoutSheets, setLayoutSheets] = useState<SheetProfile[]>([]);
  const [allSheets, setAllSheets] = useState<SheetProfile[]>([]);
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  
  // Selected sheet & layout
  const [selectedSheet, setSelectedSheet] = useState<SheetProfile | null>(null);
  const [layoutType, setLayoutType] = useState<'jgt' | 'jgi' | null>(null);
  
  // Layout data - now supports multiple entries per rack
  const [loading, setLoading] = useState(false);
  const [rackDataMap, setRackDataMap] = useState<Map<string, RackEntry[]>>(new Map());
  const [selectedRackCode, setSelectedRackCode] = useState<string | null>(null);
  const [selectedRackEntries, setSelectedRackEntries] = useState<RackEntry[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSheetLibrary();
    }, [])
  );

  const loadSheetLibrary = async () => {
    // Load from AsyncStorage
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const library = JSON.parse(stored);
      setSheetLibrary(library);
    }
    
    // Get all sheets and layout sheets
    const all = getSheetLibrary();
    const layouts = getLayoutSheets();
    
    setAllSheets(all);
    setLayoutSheets(layouts);
    
    // Auto-select if only one layout sheet
    if (layouts.length === 1) {
      setSelectedSheet(layouts[0]);
      // If it has cached data, use it
      if (layouts[0].data) {
        parseLayoutData(layouts[0].data);
        setDataLoaded(true);
      }
    }
  };

  const selectSheet = (sheet: SheetProfile) => {
    setSelectedSheet(sheet);
    setShowSheetPicker(false);
    setDataLoaded(false);
    setLayoutType(null);
    setRackDataMap(new Map());
    
    // If sheet has cached data, use it
    if (sheet.data) {
      parseLayoutData(sheet.data);
    }
  };

  const parseLayoutData = (rows: string[][]) => {
    // Parse data into rack map - supports multiple entries per rack
    // Column B (index 1): Rack_Location
    // Column E (index 4): Size
    // Column I (index 8): Current Stock
    // Column J (index 9): Size Diff
    const newMap = new Map<string, RackEntry[]>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 10) continue;

      const rackCode = (row[1] || '').toString().trim().toUpperCase();
      const size = (row[4] || '').toString().trim();
      const stockStr = (row[8] || '0').toString().replace(/[^\d.-]/g, '');
      const diffStr = (row[9] || '0').toString().replace(/[^\d.-]/g, '');

      if (rackCode) {
        const entry: RackEntry = {
          size,
          stock: parseFloat(stockStr) || 0,
          sizeDiff: parseFloat(diffStr) || 0,
        };
        
        // Add to existing entries or create new array
        const existing = newMap.get(rackCode) || [];
        existing.push(entry);
        newMap.set(rackCode, existing);
      }
    }

    setRackDataMap(newMap);
  };

  const loadLayoutData = async (type: 'jgt' | 'jgi') => {
    if (!selectedSheet) {
      Alert.alert('Error', 'No sheet selected');
      return;
    }

    setLoading(true);
    setLayoutType(type);

    try {
      // If we already have cached data, just use it
      if (selectedSheet.data) {
        parseLayoutData(selectedSheet.data);
        setDataLoaded(true);
        return;
      }

      // Otherwise, fetch from Drive
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        return;
      }

      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${selectedSheet.fileId}&sheet_name=${encodeURIComponent(selectedSheet.sheetName)}&cell_range=${encodeURIComponent(selectedSheet.range)}`
      );

      const rows: string[][] = res.data.data || [];
      
      // Update cached data
      updateSheetProfile(selectedSheet.id, {
        data: rows,
        rowCount: res.data.row_count,
        colCount: res.data.col_count,
        lastRefreshed: Date.now(),
      });
      
      // Persist
      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
      
      parseLayoutData(rows);
      setDataLoaded(true);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to load layout data');
    } finally {
      setLoading(false);
    }
  };

  const refreshLayoutData = async () => {
    if (!selectedSheet) return;
    
    setLoading(true);
    
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        return;
      }

      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${selectedSheet.fileId}&sheet_name=${encodeURIComponent(selectedSheet.sheetName)}&cell_range=${encodeURIComponent(selectedSheet.range)}`
      );

      const rows: string[][] = res.data.data || [];
      
      // Update cached data
      updateSheetProfile(selectedSheet.id, {
        data: rows,
        rowCount: res.data.row_count,
        colCount: res.data.col_count,
        lastRefreshed: Date.now(),
      });
      
      // Persist
      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
      setLayoutSheets(getLayoutSheets());
      
      parseLayoutData(rows);
      Alert.alert('Refreshed!', 'Layout data updated from Google Drive');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  const getRackInfo = (rackCode: string): RackEntry[] => {
    // Clean the rack code: remove parentheses content, trim, uppercase
    const cleanCode = rackCode.replace(/\(.*\)/g, '').trim().toUpperCase();
    
    // Direct match first
    let result = rackDataMap.get(cleanCode);
    if (result && result.length > 0) return result;
    
    // Try without trailing dots/spaces
    const cleanCode2 = cleanCode.replace(/\.$/, '');
    result = rackDataMap.get(cleanCode2);
    if (result && result.length > 0) return result;
    
    // Try fuzzy match - iterate and find similar
    for (const [key, value] of rackDataMap.entries()) {
      const cleanKey = key.replace(/\(.*\)/g, '').replace(/\.$/, '').trim().toUpperCase();
      if (cleanKey === cleanCode || cleanKey === cleanCode2) {
        return value;
      }
    }
    
    return [];
  };

  const getTotalStock = (entries: RackEntry[]): number => {
    return entries.reduce((sum, e) => sum + e.stock, 0);
  };

  const getStockColor = (stock: number): string => {
    if (stock === 0) return '#FFCDD2';
    if (stock < 1000) return '#FFE0B2';
    return '#C8E6C9';
  };

  const isRackCode = (text: string): boolean => {
    if (!text || text === 'Gap' || text === 'Others') return false;
    return /^[A-Z]+\d+\.?\d*/.test(text.replace(/\(.*\)/g, '').trim());
  };

  const isLabel = (text: string): boolean => {
    // Only filter actual zone labels, NOT rack IDs like "Others" or "S1"
    // "Others" and "S1" are valid rack IDs for overflow zones
    const labels = ['office side', 'gate side'];
    return labels.some(l => text.toLowerCase() === l.toLowerCase());
  };

  const handleRackPress = (rackCode: string) => {
    const entries = getRackInfo(rackCode);
    setSelectedRackCode(rackCode);
    setSelectedRackEntries(entries);
  };

  const currentLayout = layoutType === 'jgi' ? JGI_LAYOUT : JGT_LAYOUT;

  const renderRackCell = (cellText: string, colIndex: number) => {
    if (!cellText) return <View key={colIndex} style={styles.emptyCell} />;

    if (cellText === 'Gap') {
      return <View key={colIndex} style={styles.gapCell}><Text style={styles.gapText}>Gap</Text></View>;
    }

    if (isLabel(cellText) && !isRackCode(cellText)) {
      return <View key={colIndex} style={styles.labelCell}><Text style={styles.labelText}>{cellText}</Text></View>;
    }

    // Treat all other cells as potential rack IDs (including "Others", "S1", etc.)
    const entries = getRackInfo(cellText);
    const totalStock = getTotalStock(entries);
    const bgColor = entries.length > 0 ? getStockColor(totalStock) : '#E8E8E8';
    const hasMultiple = entries.length > 1;

    return (
      <TouchableOpacity
        key={colIndex}
        style={[styles.rackCell, { backgroundColor: bgColor }]}
        onPress={() => handleRackPress(cellText)}
        activeOpacity={0.7}
      >
        <Text style={styles.rackCode}>{cellText}</Text>
        {hasMultiple && (
          <View style={styles.multiIndicator}>
            <Text style={styles.multiIndicatorText}>{entries.length}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // No sheets in library
  if (allSheets.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><Text style={styles.headerTitle}>Warehouse Layout</Text></View>
        <View style={styles.centerBox}>
          <Ionicons name="folder-open-outline" size={64} color="#5f6368" />
          <Text style={styles.centerTitle}>No Sheets Saved</Text>
          <Text style={styles.centerSub}>
            Save Excel sheets from the Home tab first.{'\n'}
            Layout sheets will appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // No layout sheets found
  if (layoutSheets.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><Text style={styles.headerTitle}>Warehouse Layout</Text></View>
        <View style={styles.centerBox}>
          <Ionicons name="grid-outline" size={64} color="#5f6368" />
          <Text style={styles.centerTitle}>No Layout Sheets</Text>
          <Text style={styles.centerSub}>
            Save an Inventory_Chart sheet from{'\n'}
            MS_Inventory_System file to view layouts.
          </Text>
          <View style={styles.savedSheetsList}>
            <Text style={styles.savedSheetsTitle}>Your Saved Sheets:</Text>
            {allSheets.map((s, i) => (
              <View key={i} style={styles.savedSheetItem}>
                <Ionicons name="document" size={16} color="#FA7B17" />
                <Text style={styles.savedSheetText}>{s.displayName}</Text>
                <Text style={styles.savedSheetType}>{s.sheetType}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Warehouse Layout</Text>
        {layoutSheets.length > 1 && (
          <TouchableOpacity style={styles.switchBtn} onPress={() => setShowSheetPicker(true)}>
            <Ionicons name="swap-horizontal" size={20} color="#4285F4" />
          </TouchableOpacity>
        )}
        {selectedSheet && dataLoaded && (
          <TouchableOpacity style={styles.refreshBtn} onPress={refreshLayoutData} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <Ionicons name="refresh" size={20} color="#4285F4" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Selected Sheet Info */}
      {selectedSheet && (
        <View style={styles.sheetBar}>
          <Ionicons name="document" size={18} color="#34A853" />
          <Text style={styles.sheetBarText} numberOfLines={1}>{selectedSheet.displayName}</Text>
          <View style={styles.layoutBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#34A853" />
            <Text style={styles.layoutBadgeText}>Layout</Text>
          </View>
        </View>
      )}

      {/* No sheet selected - show list */}
      {!selectedSheet && (
        <View style={styles.sheetListContainer}>
          <Text style={styles.selectTitle}>Select Layout Sheet:</Text>
          {layoutSheets.map((sheet, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.sheetOption}
              onPress={() => selectSheet(sheet)}
            >
              <Ionicons name="grid" size={24} color="#9C27B0" />
              <View style={styles.sheetOptionInfo}>
                <Text style={styles.sheetOptionName}>{sheet.displayName}</Text>
                <Text style={styles.sheetOptionMeta}>
                  {sheet.rowCount} rows • {sheet.range}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9aa0a6" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Sheet selected but no layout type chosen */}
      {selectedSheet && !dataLoaded && !loading && (
        <View style={styles.centerBox}>
          <Text style={styles.selectLayoutTitle}>Select Layout Type</Text>
          <View style={styles.layoutBtns}>
            <TouchableOpacity style={styles.layoutTypeBtn} onPress={() => loadLayoutData('jgt')}>
              <Ionicons name="grid" size={32} color="#4285F4" />
              <Text style={styles.layoutTypeBtnText}>JGT Layout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.layoutTypeBtn} onPress={() => loadLayoutData('jgi')}>
              <Ionicons name="grid" size={32} color="#9C27B0" />
              <Text style={styles.layoutTypeBtnText}>JGI Layout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.centerSub}>Loading layout...</Text>
        </View>
      )}

      {/* Layout loaded */}
      {dataLoaded && !loading && (
        <>
          {/* Layout Type Tabs */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, layoutType === 'jgt' && styles.tabActive]}
              onPress={() => setLayoutType('jgt')}
            >
              <Text style={[styles.tabText, layoutType === 'jgt' && styles.tabTextActive]}>JGT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, layoutType === 'jgi' && styles.tabActive]}
              onPress={() => setLayoutType('jgi')}
            >
              <Text style={[styles.tabText, layoutType === 'jgi' && styles.tabTextActive]}>JGI</Text>
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#C8E6C9' }]} />
              <Text style={styles.legendText}>&gt;1000kg</Text>
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

          {/* Grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.horizontalScroll}>
            <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.verticalScroll}>
              <View style={styles.layoutTitleBar}>
                <Text style={styles.layoutTitle}>{currentLayout.title}</Text>
              </View>
              {currentLayout.sections.map((section, sIdx) => (
                <View key={sIdx} style={styles.section}>
                  {section.name !== 'Zone Labels' && <Text style={styles.sectionName}>{section.name}</Text>}
                  {section.rows.map((row, rIdx) => (
                    <View key={rIdx} style={styles.row}>
                      {row.map((cell, cIdx) => renderRackCell(cell, cIdx))}
                    </View>
                  ))}
                  {sIdx < currentLayout.sections.length - 1 && <View style={styles.sectionDivider} />}
                </View>
              ))}
            </ScrollView>
          </ScrollView>
        </>
      )}

      {/* Sheet Picker Modal */}
      <Modal visible={showSheetPicker} transparent animationType="slide" onRequestClose={() => setShowSheetPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Layout Sheet</Text>
              <TouchableOpacity onPress={() => setShowSheetPicker(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            {layoutSheets.map((sheet, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.sheetPickerItem, selectedSheet?.id === sheet.id && styles.sheetPickerItemActive]}
                onPress={() => selectSheet(sheet)}
              >
                <Ionicons name="grid" size={24} color="#9C27B0" />
                <Text style={styles.sheetPickerText}>{sheet.displayName}</Text>
                {selectedSheet?.id === sheet.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#4285F4" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Rack Detail Modal - supports multiple entries */}
      <Modal visible={selectedRackCode !== null} transparent animationType="fade" onRequestClose={() => setSelectedRackCode(null)}>
        <TouchableOpacity style={styles.rackModalOverlay} activeOpacity={1} onPress={() => setSelectedRackCode(null)}>
          <View style={styles.rackModal}>
            {selectedRackCode && (
              <>
                <View style={styles.rackModalHeader}>
                  <View style={styles.rackBadge}>
                    <Ionicons name="location" size={16} color="#fff" />
                    <Text style={styles.rackBadgeText}>{selectedRackCode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRackCode(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>
                
                {selectedRackEntries.length === 0 ? (
                  <View style={styles.emptyRackContent}>
                    <Ionicons name="cube-outline" size={40} color="#9aa0a6" />
                    <Text style={styles.emptyRackText}>Empty Rack</Text>
                    <Text style={styles.emptyRackSub}>No items stored</Text>
                  </View>
                ) : selectedRackEntries.length === 1 ? (
                  // Single entry - show detailed view
                  <View style={styles.rackContent}>
                    <View style={styles.rackRow}>
                      <Text style={styles.rackLabel}>Size</Text>
                      <Text style={styles.rackValue}>{selectedRackEntries[0].size || 'N/A'}</Text>
                    </View>
                    <View style={styles.rackRow}>
                      <Text style={styles.rackLabel}>Size Diff</Text>
                      <Text style={[styles.rackValue, { color: selectedRackEntries[0].sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
                        {selectedRackEntries[0].sizeDiff >= 0 ? '+' : ''}{selectedRackEntries[0].sizeDiff}
                      </Text>
                    </View>
                    <View style={styles.rackRow}>
                      <Text style={styles.rackLabel}>Stock</Text>
                      <Text style={[styles.rackValue, styles.stockVal, { color: selectedRackEntries[0].stock > 0 ? '#34A853' : '#EA4335' }]}>
                        {selectedRackEntries[0].stock.toLocaleString('en-IN')} kg
                      </Text>
                    </View>
                  </View>
                ) : (
                  // Multiple entries - show list
                  <ScrollView style={styles.multiEntryList} showsVerticalScrollIndicator>
                    {selectedRackEntries.map((entry, idx) => (
                      <View key={idx} style={styles.entryItem}>
                        <View style={styles.entryHeader}>
                          <Text style={styles.entrySize}>{entry.size || 'Unknown Size'}</Text>
                          <Text style={[styles.entryStock, { color: entry.stock > 0 ? '#34A853' : '#EA4335' }]}>
                            {entry.stock.toLocaleString('en-IN')} kg
                          </Text>
                        </View>
                        <Text style={[styles.entryDiff, { color: entry.sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
                          Diff: {entry.sizeDiff >= 0 ? '+' : ''}{entry.sizeDiff}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Total Stock</Text>
                      <Text style={styles.totalValue}>
                        {getTotalStock(selectedRackEntries).toLocaleString('en-IN')} kg
                      </Text>
                    </View>
                  </ScrollView>
                )}
                
                <View style={[styles.stockIndicator, { backgroundColor: getStockColor(getTotalStock(selectedRackEntries)) }]}>
                  <Ionicons 
                    name={getTotalStock(selectedRackEntries) > 1000 ? 'checkmark-circle' : getTotalStock(selectedRackEntries) > 0 ? 'alert-circle' : 'close-circle'} 
                    size={20} 
                    color={getTotalStock(selectedRackEntries) > 1000 ? '#34A853' : getTotalStock(selectedRackEntries) > 0 ? '#FA7B17' : '#EA4335'} 
                  />
                  <Text style={styles.stockIndicatorText}>
                    {getTotalStock(selectedRackEntries) > 1000 ? 'In Stock' : getTotalStock(selectedRackEntries) > 0 ? 'Low Stock' : 'Empty'}
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

const CELL_WIDTH = 68;
const CELL_HEIGHT = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, gap: 12,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', flex: 1 },
  switchBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  refreshBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  sheetBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0f3460', paddingHorizontal: 16, paddingVertical: 10,
  },
  sheetBarText: { flex: 1, fontSize: 13, color: '#fff', fontWeight: '500' },
  layoutBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E6F4EA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  layoutBadgeText: { fontSize: 11, color: '#34A853', fontWeight: '600' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 16 },
  centerSub: { fontSize: 14, color: '#9aa0a6', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  savedSheetsList: { marginTop: 24, backgroundColor: '#0f3460', borderRadius: 12, padding: 16, width: '100%' },
  savedSheetsTitle: { fontSize: 12, color: '#9aa0a6', marginBottom: 10 },
  savedSheetItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  savedSheetText: { flex: 1, fontSize: 13, color: '#fff' },
  savedSheetType: { fontSize: 10, color: '#FA7B17', backgroundColor: '#FEF0E6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sheetListContainer: { padding: 20 },
  selectTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 16 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0f3460', borderRadius: 14, padding: 16, marginBottom: 10,
  },
  sheetOptionInfo: { flex: 1 },
  sheetOptionName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetOptionMeta: { fontSize: 11, color: '#9aa0a6', marginTop: 4 },
  selectLayoutTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 24 },
  layoutBtns: { flexDirection: 'row', gap: 16 },
  layoutTypeBtn: {
    backgroundColor: '#0f3460', borderRadius: 16, padding: 24, alignItems: 'center', width: 130,
  },
  layoutTypeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 12 },
  tabBar: { flexDirection: 'row', backgroundColor: '#16213e', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, marginHorizontal: 4, backgroundColor: '#0f3460' },
  tabActive: { backgroundColor: '#4285F4' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  tabTextActive: { color: '#fff' },
  legend: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 16, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#9aa0a6' },
  horizontalScroll: { paddingHorizontal: 12 },
  verticalScroll: { paddingVertical: 12 },
  layoutTitleBar: { backgroundColor: '#0f3460', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, marginBottom: 16, alignSelf: 'flex-start' },
  layoutTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  section: { marginBottom: 16 },
  sectionName: { fontSize: 12, fontWeight: '600', color: '#4285F4', marginBottom: 8, marginLeft: 4 },
  sectionDivider: { height: 16 },
  row: { flexDirection: 'row', marginBottom: 4 },
  emptyCell: { width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4 },
  gapCell: { width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4, justifyContent: 'center', alignItems: 'center' },
  gapText: { fontSize: 10, color: '#5f6368', fontStyle: 'italic' },
  labelCell: { minWidth: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4, backgroundColor: '#F3E5F5', borderRadius: 6, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  labelText: { fontSize: 10, fontWeight: '600', color: '#7B1FA2', textAlign: 'center' },
  rackCell: { width: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  rackCode: { fontSize: 11, fontWeight: '700', color: '#202124' },
  rackSize: { fontSize: 8, color: '#5f6368', marginTop: 2, textAlign: 'center' },
  otherCell: { minWidth: CELL_WIDTH, height: CELL_HEIGHT, marginRight: 4, backgroundColor: '#E8E8E8', borderRadius: 6, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  otherText: { fontSize: 9, color: '#5f6368', textAlign: 'center' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#202124' },
  sheetPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#f8f9fa' },
  sheetPickerItemActive: { backgroundColor: '#E8F0FE', borderWidth: 2, borderColor: '#4285F4' },
  sheetPickerText: { flex: 1, fontSize: 15, color: '#202124' },
  // Rack modal
  rackModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  rackModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 },
  rackModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rackBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4285F4', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  rackBadgeText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  rackContent: { marginBottom: 16 },
  rackRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rackLabel: { fontSize: 14, color: '#5f6368' },
  rackValue: { fontSize: 16, fontWeight: '700', color: '#202124' },
  stockVal: { fontSize: 20 },
  stockIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 8 },
  stockIndicatorText: { fontSize: 14, fontWeight: '600', color: '#202124' },
});
