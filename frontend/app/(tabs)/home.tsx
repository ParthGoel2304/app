import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Share, Modal, TextInput, Platform, Dimensions
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getSheetLibrary, setSheetLibrary, getActiveSheetId, setActiveSheetId,
  getActiveSheet, removeSheetProfile, updateSheetProfile, SheetProfile
} from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SW } = Dimensions.get('window');

interface LowStockItem {
  item: string;
  current: number;
  minStock: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [sheetLibrary, setLocalLibrary] = useState<SheetProfile[]>([]);
  const [activeSheetId, setLocalActiveId] = useState<string | null>(null);
  const [activeSheet, setLocalActiveSheet] = useState<SheetProfile | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<SheetProfile | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [fileModifiedTime, setFileModifiedTime] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  
  // Low Stock Widget State
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [lowStockExpanded, setLowStockExpanded] = useState(false);
  const [loadingLowStock, setLoadingLowStock] = useState(false);
  
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    loadLibrary();
    loadLowStockData();
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, []));

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    autoRefreshRef.current = setInterval(() => {
      checkForUpdates();
      loadLowStockData();
    }, 60000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [activeSheet?.fileId]);

  const loadLibrary = async () => {
    const stored = await AsyncStorage.getItem('sheet_library');
    const storedActiveId = await AsyncStorage.getItem('active_sheet_id');
    if (stored) {
      const library = JSON.parse(stored);
      setSheetLibrary(library);
      setLocalLibrary(library);
    } else { setLocalLibrary(getSheetLibrary()); }
    if (storedActiveId) {
      setActiveSheetId(storedActiveId);
      setLocalActiveId(storedActiveId);
    } else { setLocalActiveId(getActiveSheetId()); }
    setLocalActiveSheet(getActiveSheet());
    const active = getActiveSheet();
    if (active?.fileId) fetchFileMetadata(active.fileId);
  };

  const fetchFileMetadata = async (fileId: string) => {
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) return;
      const res = await axios.get(`${BACKEND_URL}/api/drive/file-metadata?session_id=${sid}&file_id=${fileId}`);
      if (res.data.modified_time) setFileModifiedTime(res.data.modified_time);
    } catch {}
  };

  const checkForUpdates = async () => {
    if (!activeSheet?.fileId) return;
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) return;
      const res = await axios.get(`${BACKEND_URL}/api/drive/file-metadata?session_id=${sid}&file_id=${activeSheet.fileId}`);
      if (res.data.modified_time && res.data.modified_time !== fileModifiedTime) {
        setFileModifiedTime(res.data.modified_time);
        handleRefreshSheet(activeSheet);
      }
    } catch {}
  };

  const loadLowStockData = async () => {
    try {
      setLoadingLowStock(true);
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) return;

      // Find JGT file from Drive (file with JGT in name)
      const filesRes = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&folder_only=true`);
      const jgtFile = filesRes.data.files?.find((f: any) => f.file_name.toLowerCase().includes('jgt'));
      if (!jgtFile) return;

      // First get the list of sheets in the file
      const sheetsRes = await axios.get(
        `${BACKEND_URL}/api/drive/file/${jgtFile.file_id}/sheets?session_id=${sid}`
      );
      const sheets = sheetsRes.data.sheet_names || [];
      // Use STOCK sheet or the first available sheet
      const stockSheet = sheets.find((s: string) => s.toLowerCase().includes('stock')) || sheets[0];
      if (!stockSheet) return;

      // Fetch the sheet data - need E column (name) and P column (order quantity)
      const dataRes = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${jgtFile.file_id}&sheet_name=${encodeURIComponent(stockSheet)}&cell_range=A1:P200&_t=${Date.now()}`
      );
      const rows = dataRes.data.data || [];
      
      // Low stock items: where P column (index 15) order quantity > 1000
      // Show E column (index 4) as name, P column (index 15) as stock (kg)
      const items: LowStockItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[4]) continue; // Skip rows without stock name (E column)
        const orderQty = parseFloat(row[15]) || 0; // Column P (index 15)
        if (orderQty > 1000) {
          items.push({
            item: row[4] || `Row ${i + 1}`, // E column - Stock item name
            current: orderQty, // P column value as stock (kg)
            minStock: 1000,
          });
        }
      }
      setLowStockItems(items.slice(0, 50)); // Limit to 50 items
    } catch (err) {
      console.error('Failed to load low stock data:', err);
    } finally {
      setLoadingLowStock(false);
    }
  };

  const handleRefreshSheet = async (sheet: SheetProfile) => {
    setRefreshingId(sheet.id);
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) throw new Error('No session');
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${sheet.fileId}&sheet_name=${encodeURIComponent(sheet.sheetName)}&cell_range=${encodeURIComponent(sheet.range)}&_t=${Date.now()}`
      );
      updateSheetProfile(sheet.id, { data: res.data.data, rowCount: res.data.row_count, lastRefreshed: Date.now() });
      const lib = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));
      setLocalLibrary([...lib]);
      if (sheet.id === activeSheetId) setLocalActiveSheet(getActiveSheet());
    } catch {} finally { setRefreshingId(null); }
  };

  const handleSetActive = async (sheet: SheetProfile) => {
    setActiveSheetId(sheet.id);
    await AsyncStorage.setItem('active_sheet_id', sheet.id);
    setLocalActiveId(sheet.id);
    setLocalActiveSheet(sheet);
    fetchFileMetadata(sheet.fileId);
  };

  const handleDeleteSheet = (sheet: SheetProfile) => {
    Alert.alert('Remove', `Remove "${sheet.displayName || sheet.sheetName}" from library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        removeSheetProfile(sheet.id);
        const lib = getSheetLibrary();
        await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));
        setLocalLibrary([...lib]);
        if (sheet.id === activeSheetId) { setLocalActiveId(null); setLocalActiveSheet(null); }
        setShowOptions(false);
      }}
    ]);
  };

  const handleRename = async () => {
    if (!selectedSheet || !renameText.trim()) return;
    updateSheetProfile(selectedSheet.id, { displayName: renameText.trim() });
    const library = getSheetLibrary();
    await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
    setLocalLibrary([...library]);
    if (selectedSheet.id === activeSheetId) setLocalActiveSheet(getActiveSheet());
    setShowRenameModal(false); setShowOptions(false);
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from Google Drive?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { await AsyncStorage.clear(); router.replace('/'); }},
    ]);
  };

  const handleExportPDF = async () => {
    setShowShareMenu(false);
    Alert.alert('Coming Soon', 'PDF export feature is under development.');
  };

  const handleShareWhatsApp = async () => {
    setShowShareMenu(false);
    try {
      await Share.share({ message: 'Check out this inventory report from Smart Excel Reader!' });
    } catch {}
  };

  const handleExportTXT = async () => {
    setShowShareMenu(false);
    Alert.alert('Coming Soon', 'TXT export feature is under development.');
  };

  const getSheetLabel = (sheet: SheetProfile) => {
    const sn = sheet.sheetName.toLowerCase();
    if (sn.includes('in demand')) return { text: 'Purchase', bg: '#E6F4EA', color: '#34A853' };
    if (sn.includes('chart') || sn.includes('layout')) return { text: 'Layout', bg: '#F3E5F5', color: '#9C27B0' };
    if (sn.includes('stock') || sn.includes('jgt') || sn.includes('jgi')) return { text: 'Stock', bg: '#E8F0FE', color: '#4285F4' };
    return { text: sheet.sheetType || 'Sheet', bg: '#E8F0FE', color: '#4285F4' };
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' });
  };

  // Quick Actions
  const quickActions = [
    { label: 'Inventory', icon: 'cube', color: '#4285F4', bg: '#E8F0FE', route: '/(tabs)/inventory' },
    { label: 'Sales', icon: 'receipt', color: '#34A853', bg: '#E6F4EA', route: '/(tabs)/sales' },
    { label: 'Purchase', icon: 'cart', color: '#E65100', bg: '#FFF3E0', route: '/(tabs)/purchase' },
    { label: 'Debtors', icon: 'people', color: '#EA4335', bg: '#FCE8E6', route: '/(tabs)/debtors' },
    { label: 'Pricer', icon: 'pricetag', color: '#FBBC05', bg: '#FEF7E0', route: '/(tabs)/pricer' },
    { label: 'Calculator', icon: 'calculator', color: '#9C27B0', bg: '#F0E6FE', route: '/(tabs)/calculator' },
    { label: 'Layout', icon: 'grid', color: '#1565C0', bg: '#E3F2FD', route: '/(tabs)/warehouse' },
    { label: 'Sheet View', icon: 'eye', color: '#00897B', bg: '#E0F2F1', route: '/sheetview' },
    { label: 'Files', icon: 'folder', color: '#5D4037', bg: '#EFEBE9', route: '/files' },
  ];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Smart Excel Reader</Text>
          {fileModifiedTime && (
            <Text style={s.headerMeta}>Updated: {formatTime(fileModifiedTime)}</Text>
          )}
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity onPress={() => setShowShareMenu(true)} style={s.shareIconBtn} data-testid="share-btn">
            <Ionicons name="share-social" size={18} color="#4285F4" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={s.headerBtn}>
            <Ionicons name="log-out-outline" size={18} color="#EA4335" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Quick Actions Grid */}
        <View style={s.sectionRow}>
          <Ionicons name="flash" size={16} color="#FA7B17" />
          <Text style={s.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={s.actionGrid}>
          {quickActions.map(a => (
            <TouchableOpacity key={a.label} style={s.actionCard}
              onPress={() => router.push(a.route as any)} data-testid={`action-${a.label.toLowerCase()}`}>
              <View style={[s.actionIcon, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon as any} size={22} color={a.color} />
              </View>
              <Text style={s.actionTitle}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Saved Sheets */}
        {sheetLibrary.length > 0 && (
          <>
            <View style={[s.sectionRow, { marginTop: 20 }]}>
              <Ionicons name="library" size={16} color="#4285F4" />
              <Text style={s.sectionTitle}>Saved Sheets</Text>
              <Text style={s.sectionCount}>{sheetLibrary.length}</Text>
            </View>
            {sheetLibrary.map(sheet => {
              const label = getSheetLabel(sheet);
              const isActive = sheet.id === activeSheetId;
              return (
                <TouchableOpacity key={sheet.id} style={[s.sheetCard, isActive && s.sheetCardActive]}
                  onPress={() => handleSetActive(sheet)}
                  onLongPress={() => { setSelectedSheet(sheet); setShowOptions(true); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetName}>{sheet.displayName || sheet.sheetName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                      <View style={[s.typeBadge, { backgroundColor: label.bg }]}>
                        <Text style={[s.typeBadgeText, { color: label.color }]}>{label.text}</Text>
                      </View>
                      <Text style={s.sheetMeta}>{sheet.rowCount} rows</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={s.refreshBtn} onPress={() => handleRefreshSheet(sheet)} disabled={refreshingId === sheet.id}>
                    {refreshingId === sheet.id ? <ActivityIndicator size="small" color="#4285F4" /> : <Ionicons name="refresh" size={16} color="#4285F4" />}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Add File Button */}
        <TouchableOpacity style={s.addFileBtn} onPress={() => router.push('/files' as any)} data-testid="add-file-btn">
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={s.addFileBtnText}>Add File from Drive</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Low Stock Widget - Bottom Left */}
      {lowStockItems.length > 0 && (
        <View style={[s.lowStockWidget, lowStockExpanded && s.lowStockWidgetExpanded]}>
          <TouchableOpacity style={s.lowStockHeader} onPress={() => setLowStockExpanded(!lowStockExpanded)}>
            <View style={s.lowStockBadge}>
              <Ionicons name="warning" size={14} color="#fff" />
              <Text style={s.lowStockCount}>{lowStockItems.length}</Text>
            </View>
            {lowStockExpanded && <Text style={s.lowStockTitle}>Low Stock</Text>}
            <Ionicons name={lowStockExpanded ? 'chevron-down' : 'chevron-up'} size={14} color="#FA7B17" />
          </TouchableOpacity>
          {lowStockExpanded && (
            <ScrollView style={s.lowStockList} nestedScrollEnabled showsVerticalScrollIndicator>
              {lowStockItems.map((item, i) => (
                <View key={i} style={s.lowStockItem}>
                  <Text style={s.lowStockItemName} numberOfLines={1}>{item.item}</Text>
                  <Text style={s.lowStockItemStock}>{item.current} kg</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Share Menu Modal */}
      <Modal visible={showShareMenu} transparent animationType="fade" onRequestClose={() => setShowShareMenu(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowShareMenu(false)}>
          <View style={s.shareMenu}>
            <TouchableOpacity style={s.shareMenuItem} onPress={handleExportPDF} data-testid="export-pdf">
              <Ionicons name="document" size={20} color="#EA4335" />
              <Text style={s.shareMenuText}>Export as PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shareMenuItem} onPress={handleShareWhatsApp} data-testid="export-whatsapp">
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <Text style={s.shareMenuText}>Share via WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shareMenuItem} onPress={handleExportTXT} data-testid="export-txt">
              <Ionicons name="document-text" size={20} color="#5f6368" />
              <Text style={s.shareMenuText}>Export as TXT</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sheet Options Modal */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <View style={s.optionsMenu}>
            <Text style={s.optionsTitle}>{selectedSheet?.displayName || selectedSheet?.sheetName}</Text>
            <TouchableOpacity style={s.optionItem} onPress={() => { setRenameText(selectedSheet?.displayName || selectedSheet?.sheetName || ''); setShowRenameModal(true); }}>
              <Ionicons name="pencil" size={18} color="#4285F4" />
              <Text style={s.optionText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.optionItem} onPress={() => selectedSheet && handleDeleteSheet(selectedSheet)}>
              <Ionicons name="trash" size={18} color="#EA4335" />
              <Text style={[s.optionText, { color: '#EA4335' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <View style={s.modalBg}>
          <View style={s.renameModal}>
            <Text style={s.renameTitle}>Rename Sheet</Text>
            <TextInput style={s.renameInput} value={renameText} onChangeText={setRenameText} placeholder="Enter new name" placeholderTextColor="#5f6368" autoFocus />
            <View style={s.renameBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleRename}>
                <Text style={s.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerMeta: { fontSize: 11, color: '#9aa0a6', marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  shareIconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center',
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  sectionCount: { fontSize: 12, color: '#4285F4', fontWeight: '600', marginLeft: 'auto' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: (SW - 32 - 30) / 4, alignItems: 'center', paddingVertical: 12,
    backgroundColor: '#16213e', borderRadius: 12,
  },
  actionIcon: {
    width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  actionTitle: { fontSize: 10, fontWeight: '600', color: '#e0e0e0', textAlign: 'center' },
  sheetCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#16213e',
    borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'transparent',
  },
  sheetCardActive: { borderColor: '#4285F4' },
  sheetName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
  sheetMeta: { fontSize: 10, color: '#9aa0a6' },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center',
  },
  addFileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4285F4', paddingVertical: 14, borderRadius: 12, marginTop: 16,
  },
  addFileBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Low Stock Widget
  lowStockWidget: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: '#2d1f10', borderRadius: 12, borderWidth: 1, borderColor: '#FA7B17',
    minWidth: 50, overflow: 'hidden',
  },
  lowStockWidgetExpanded: { width: 200, maxHeight: 250 },
  lowStockHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 8, gap: 6,
  },
  lowStockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FA7B17', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  lowStockCount: { fontSize: 11, fontWeight: '700', color: '#fff' },
  lowStockTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FA7B17' },
  lowStockList: { maxHeight: 180, paddingHorizontal: 8, paddingBottom: 8 },
  lowStockItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#3d2f20',
  },
  lowStockItemName: { flex: 1, fontSize: 11, color: '#e0e0e0' },
  lowStockItemStock: { fontSize: 11, fontWeight: '600', color: '#EA4335', marginLeft: 8 },
  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  shareMenu: { backgroundColor: '#16213e', borderRadius: 16, padding: 8, width: 220 },
  shareMenuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  shareMenuText: { fontSize: 14, color: '#fff' },
  optionsMenu: { backgroundColor: '#16213e', borderRadius: 16, padding: 16, width: 250 },
  optionsTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16, textAlign: 'center' },
  optionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  optionText: { fontSize: 14, color: '#fff' },
  renameModal: { backgroundColor: '#16213e', borderRadius: 16, padding: 20, width: 300 },
  renameTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  renameInput: {
    backgroundColor: '#0f3460', borderRadius: 10, padding: 14, fontSize: 14, color: '#fff',
    borderWidth: 1, borderColor: '#4285F4',
  },
  renameBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#5f6368', borderRadius: 10 },
  cancelBtnText: { fontSize: 14, color: '#9aa0a6', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#4285F4', borderRadius: 10 },
  saveBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
