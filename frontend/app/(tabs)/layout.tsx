import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Modal, ActivityIndicator, Alert, FlatList
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RackData {
  rackCode: string;
  size: string;
  stock: number;
  sizeDiff: number;
}

interface DriveFile {
  id: string;
  name: string;
}

interface SheetInfo {
  name: string;
  index: number;
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
  const router = useRouter();
  
  // States for independent file picker
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  
  // File picker modals
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  
  // Selected file & sheet
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [layoutType, setLayoutType] = useState<'jgt' | 'jgi' | null>(null);
  
  // Layout data
  const [loading, setLoading] = useState(false);
  const [rackDataMap, setRackDataMap] = useState<Map<string, RackData>>(new Map());
  const [selectedRack, setSelectedRack] = useState<RackData | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkSession();
    }, [])
  );

  // Check if session exists and try to load last file
  const checkSession = async () => {
    setChecking(true);
    try {
      const sid = await AsyncStorage.getItem('sessionId');
      setSessionId(sid);
      
      if (sid) {
        // Check if session is valid
        const res = await fetch(`${BACKEND_URL}/api/drive/status?session_id=${sid}`);
        const status = await res.json();
        
        if (!status.connected) {
          setSessionId(null);
        } else {
          // Try to load last layout file
          const lastFileId = await AsyncStorage.getItem('layout_last_file_id');
          const lastFileName = await AsyncStorage.getItem('layout_last_file_name');
          const lastLayout = await AsyncStorage.getItem('layout_last_type');
          
          if (lastFileId && lastFileName) {
            setSelectedFile({ id: lastFileId, name: lastFileName });
            if (lastLayout === 'jgt' || lastLayout === 'jgi') {
              setLayoutType(lastLayout);
              // Auto-load
              loadLayoutData(sid, lastFileId, lastLayout);
            }
          }
        }
      }
    } catch (err) {
      console.log('Session check error:', err);
    } finally {
      setChecking(false);
    }
  };

  // Open file picker - MODAL ONLY, NO NAVIGATION
  const openFilePicker = async () => {
    if (!sessionId) {
      // No session - show alert, don't redirect
      Alert.alert(
        'Connect to Google Drive',
        'Please connect to Google Drive from the Home tab first.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Open modal directly - no navigation
    setShowFilePicker(true);
    setLoadingFiles(true);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/drive/files?session_id=${sessionId}`);
      const allFiles = await res.json();
      
      // Filter for Excel files only
      const excelFiles = allFiles.filter((f: any) => 
        f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || 
        f.mimeType?.includes('spreadsheet')
      );
      setFiles(excelFiles);
    } catch (err) {
      Alert.alert('Error', 'Failed to load files from Drive');
      setShowFilePicker(false);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Select file and show sheet picker
  const selectFile = async (file: DriveFile) => {
    setSelectedFile(file);
    setShowFilePicker(false);
    setShowSheetPicker(true);
    setLoadingSheets(true);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/drive/file/${file.id}/sheets?session_id=${sessionId}`);
      const allSheets = await res.json();
      
      // Filter for inventory chart sheets only
      const inventorySheets = allSheets.filter((s: any) => 
        s.name.includes('Inventory_Chart') || 
        s.name.includes('JGT') || 
        s.name.includes('JGI')
      );
      
      setSheets(inventorySheets.length > 0 ? inventorySheets : allSheets);
      
      // Save last file
      await AsyncStorage.setItem('layout_last_file_id', file.id);
      await AsyncStorage.setItem('layout_last_file_name', file.name);
    } catch (err) {
      Alert.alert('Error', 'Failed to load sheets');
    } finally {
      setLoadingSheets(false);
    }
  };

  // Select sheet and load layout
  const selectSheet = async (sheet: SheetInfo) => {
    setShowSheetPicker(false);
    
    // Determine layout type
    let type: 'jgt' | 'jgi' = 'jgt';
    if (sheet.name.toLowerCase().includes('jgi')) {
      type = 'jgi';
    }
    
    setLayoutType(type);
    await AsyncStorage.setItem('layout_last_type', type);
    
    if (selectedFile && sessionId) {
      loadLayoutData(sessionId, selectedFile.id, type);
    }
  };

  // Load layout data
  const loadLayoutData = async (sid: string, fileId: string, type: 'jgt' | 'jgi') => {
    setLoading(true);
    setRackDataMap(new Map());
    setDataLoaded(false);

    try {
      const sheetName = type === 'jgt' ? 'Inventory_Chart_JGT' : 'Inventory_Chart_JGI';
      
      const res = await fetch(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${fileId}&sheet_name=${sheetName}&cell_range=A1:K200`
      );

      if (!res.ok) {
        throw new Error(`Failed to load ${sheetName}`);
      }

      const data = await res.json();
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
      Alert.alert('Error', err.message || 'Failed to load layout');
    } finally {
      setLoading(false);
    }
  };

  const switchLayout = (type: 'jgt' | 'jgi') => {
    if (selectedFile && sessionId) {
      setLayoutType(type);
      AsyncStorage.setItem('layout_last_type', type);
      loadLayoutData(sessionId, selectedFile.id, type);
    }
  };

  const getRackInfo = (rackCode: string): RackData | null => {
    const cleanCode = rackCode.replace(/\(.*\)/g, '').trim().toUpperCase();
    return rackDataMap.get(cleanCode) || null;
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
    const labels = ['office side', 'gate side', 'gap', 'others', '3x1.5x20'];
    return labels.some(l => text.toLowerCase().includes(l.toLowerCase()));
  };

  const handleRackPress = (rackCode: string) => {
    const rackInfo = getRackInfo(rackCode);
    setSelectedRack(rackInfo || { rackCode, size: 'No data', stock: 0, sizeDiff: 0 });
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
              {rackInfo.size.length > 10 ? rackInfo.size.substring(0, 8) + '..' : rackInfo.size}
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    return <View key={colIndex} style={styles.otherCell}><Text style={styles.otherText}>{cellText}</Text></View>;
  };

  // Checking state
  if (checking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><Text style={styles.headerTitle}>Warehouse Layout</Text></View>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.centerText}>Checking session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Warehouse Layout</Text>
        <TouchableOpacity style={styles.driveBtn} onPress={openFilePicker}>
          <Ionicons name="folder-outline" size={22} color="#4285F4" />
        </TouchableOpacity>
      </View>

      {/* No file selected - show file selector card */}
      {!selectedFile && (
        <View style={styles.centerBox}>
          <TouchableOpacity style={styles.fileCard} onPress={openFilePicker} activeOpacity={0.8}>
            <View style={styles.fileIconWrap}>
              <Ionicons name="folder" size={48} color="#4285F4" />
            </View>
            <Text style={styles.fileCardTitle}>Select File</Text>
            <Text style={styles.fileCardSub}>From Google Drive</Text>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            Select MS_Inventory_System_FINAL to view warehouse layout
          </Text>
        </View>
      )}

      {/* File selected but no layout loaded */}
      {selectedFile && !dataLoaded && !loading && (
        <View style={styles.centerBox}>
          <Text style={styles.selectedFileName}>{selectedFile.name}</Text>
          <View style={styles.layoutButtons}>
            <TouchableOpacity style={styles.layoutBtn} onPress={() => switchLayout('jgt')}>
              <Text style={styles.layoutBtnText}>Load JGT Layout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.layoutBtn} onPress={() => switchLayout('jgi')}>
              <Text style={styles.layoutBtnText}>Load JGI Layout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.centerText}>Loading layout...</Text>
        </View>
      )}

      {/* Layout loaded */}
      {dataLoaded && !loading && (
        <>
          {/* Layout Type Tabs */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, layoutType === 'jgt' && styles.tabActive]}
              onPress={() => switchLayout('jgt')}
            >
              <Text style={[styles.tabText, layoutType === 'jgt' && styles.tabTextActive]}>JGT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, layoutType === 'jgi' && styles.tabActive]}
              onPress={() => switchLayout('jgi')}
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

      {/* File Picker Modal */}
      <Modal visible={showFilePicker} transparent animationType="slide" onRequestClose={() => setShowFilePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Excel File</Text>
              <TouchableOpacity onPress={() => setShowFilePicker(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            {loadingFiles ? (
              <View style={styles.pickerLoading}><ActivityIndicator size="large" color="#4285F4" /></View>
            ) : (
              <FlatList
                data={files}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.fileItem} onPress={() => selectFile(item)}>
                    <Ionicons name="document" size={24} color="#34A853" />
                    <Text style={styles.fileItemText} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No Excel files found</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Sheet Picker Modal */}
      <Modal visible={showSheetPicker} transparent animationType="slide" onRequestClose={() => setShowSheetPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Sheet</Text>
              <TouchableOpacity onPress={() => setShowSheetPicker(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            {loadingSheets ? (
              <View style={styles.pickerLoading}><ActivityIndicator size="large" color="#4285F4" /></View>
            ) : (
              <FlatList
                data={sheets}
                keyExtractor={item => item.name}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.fileItem} onPress={() => selectSheet(item)}>
                    <Ionicons name="grid" size={24} color="#4285F4" />
                    <Text style={styles.fileItemText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No sheets found</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Rack Detail Modal */}
      <Modal visible={selectedRack !== null} transparent animationType="fade" onRequestClose={() => setSelectedRack(null)}>
        <TouchableOpacity style={styles.rackModalOverlay} activeOpacity={1} onPress={() => setSelectedRack(null)}>
          <View style={styles.rackModal}>
            {selectedRack && (
              <>
                <View style={styles.rackModalHeader}>
                  <View style={styles.rackBadge}>
                    <Ionicons name="location" size={16} color="#fff" />
                    <Text style={styles.rackBadgeText}>{selectedRack.rackCode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRack(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>
                <View style={styles.rackContent}>
                  <View style={styles.rackRow}>
                    <Text style={styles.rackLabel}>Size</Text>
                    <Text style={styles.rackValue}>{selectedRack.size || 'N/A'}</Text>
                  </View>
                  <View style={styles.rackRow}>
                    <Text style={styles.rackLabel}>Size Diff</Text>
                    <Text style={[styles.rackValue, { color: selectedRack.sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
                      {selectedRack.sizeDiff >= 0 ? '+' : ''}{selectedRack.sizeDiff}
                    </Text>
                  </View>
                  <View style={styles.rackRow}>
                    <Text style={styles.rackLabel}>Current Stock</Text>
                    <Text style={[styles.rackValue, styles.stockVal, { color: selectedRack.stock > 0 ? '#34A853' : '#EA4335' }]}>
                      {selectedRack.stock.toLocaleString('en-IN')} kg
                    </Text>
                  </View>
                </View>
                <View style={[styles.stockIndicator, { backgroundColor: getStockColor(selectedRack.stock) }]}>
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

const CELL_WIDTH = 68;
const CELL_HEIGHT = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  driveBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerText: { fontSize: 14, color: '#9aa0a6', marginTop: 12 },
  fileCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 32, alignItems: 'center', width: 200,
  },
  fileIconWrap: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  fileCardTitle: { fontSize: 18, fontWeight: '700', color: '#202124', marginBottom: 4 },
  fileCardSub: { fontSize: 13, color: '#5f6368' },
  hintText: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 24, maxWidth: 280 },
  selectedFileName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 20, textAlign: 'center' },
  layoutButtons: { flexDirection: 'row', gap: 12 },
  layoutBtn: { backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 },
  layoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
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
  pickerModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#202124' },
  pickerLoading: { padding: 40, alignItems: 'center' },
  fileItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  fileItemText: { fontSize: 15, color: '#202124', flex: 1 },
  emptyText: { padding: 40, textAlign: 'center', color: '#9aa0a6' },
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
