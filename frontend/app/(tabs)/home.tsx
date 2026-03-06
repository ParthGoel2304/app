import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Share, Modal, TextInput, Platform
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

interface ReorderItem {
  item: string;
  current: number;
  minStock: number;
  targetStock: number;
  suggestedOrder: number;
  plant: string;
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

  // New state for upgrades
  const [fileModifiedTime, setFileModifiedTime] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);
  const [reorderItems, setReorderItems] = useState<ReorderItem[]>([]);
  const [loadingReorder, setLoadingReorder] = useState(false);
  const [subTab, setSubTab] = useState<'inventory' | 'sales'>('inventory');
  const [salesData, setSalesData] = useState<string[][] | null>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastModifiedRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadLibrary();
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, []));

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (activeSheet?.fileId) {
      autoRefreshRef.current = setInterval(() => checkForUpdates(), 60000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [activeSheet?.fileId]);

  // Load reorder data when library is available
  useEffect(() => {
    if (sheetLibrary.length > 0) loadReorderData();
  }, [sheetLibrary]);

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
    // Fetch file metadata for active sheet
    const active = getActiveSheet();
    if (active?.fileId) fetchFileMetadata(active.fileId);
  };

  const fetchFileMetadata = async (fileId: string) => {
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) return;
      const res = await axios.get(`${BACKEND_URL}/api/drive/file-metadata?session_id=${sid}&file_id=${fileId}`);
      const mt = res.data.modified_time;
      if (mt) {
        setFileModifiedTime(mt);
        lastModifiedRef.current = mt;
      }
    } catch {}
  };

  const checkForUpdates = async () => {
    if (!activeSheet?.fileId) return;
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) return;
      const res = await axios.get(`${BACKEND_URL}/api/drive/file-metadata?session_id=${sid}&file_id=${activeSheet.fileId}`);
      const newMT = res.data.modified_time;
      if (newMT && lastModifiedRef.current && newMT !== lastModifiedRef.current) {
        lastModifiedRef.current = newMT;
        setFileModifiedTime(newMT);
        await handleRefreshSheet(activeSheet);
      }
    } catch {}
  };

  // ─── Reorder Suggestions (from In Demand sheets) ───────────────────
  const loadReorderData = async () => {
    const sid = await AsyncStorage.getItem('session_id');
    if (!sid) return;
    setLoadingReorder(true);
    const items: ReorderItem[] = [];
    const sheetConfigs = [
      { sheet: 'HR In Demand', plant: 'HR' },
      { sheet: 'A In Demand', plant: 'Apollo' },
      { sheet: 'L In Demand', plant: 'Local' },
    ];
    // Find a file that has In Demand sheets
    const demandFile = sheetLibrary.find(s => s.sheetName.includes('In Demand'));
    if (!demandFile) { setLoadingReorder(false); return; }

    for (const cfg of sheetConfigs) {
      try {
        const res = await axios.get(
          `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${demandFile.fileId}&sheet_name=${encodeURIComponent(cfg.sheet)}&cell_range=A1:E200&_t=${Date.now()}`
        );
        const rows: string[][] = res.data.data || [];
        let headerIdx = 1;
        for (let i = 0; i < Math.min(3, rows.length); i++) {
          if (rows[i]?.some(c => c?.toString().toLowerCase().includes('item'))) { headerIdx = i; break; }
        }
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]?.toString().trim()) continue;
          const current = parseFloat(row[1]?.toString() || '0') || 0;
          const minStock = parseFloat(row[2]?.toString() || '0') || 0;
          const targetStock = minStock * 2;
          const suggestedOrder = Math.max(0, targetStock - current);
          items.push({
            item: row[0]?.toString().trim(),
            current,
            minStock,
            targetStock,
            suggestedOrder,
            plant: row[4]?.toString().trim() || cfg.plant,
          });
        }
      } catch {}
    }
    setReorderItems(items);
    setLoadingReorder(false);
  };

  const lowStockItems = useMemo(() => reorderItems.filter(i => i.current < i.minStock), [reorderItems]);
  const orderItems = useMemo(() => reorderItems.filter(i => i.suggestedOrder > 0), [reorderItems]);

  // ─── Sales Data ───────────────────────────────────────────────────
  const loadSalesData = async () => {
    setLoadingSales(true);
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) { setLoadingSales(false); return; }
      // Find "Sales FY 25-26" file in Drive
      const filesRes = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&_t=${Date.now()}`);
      const files = filesRes.data.files || [];
      const salesFile = files.find((f: any) => f.file_name.toLowerCase().includes('sales'));
      if (!salesFile) { Alert.alert('Not Found', 'Sales file not found in Drive'); setLoadingSales(false); return; }
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${salesFile.file_id}&sheet_name=Sales&cell_range=A1:Z200&_t=${Date.now()}`
      );
      setSalesData(res.data.data || []);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to load sales data');
    } finally { setLoadingSales(false); }
  };

  // ─── Export Functions ─────────────────────────────────────────────
  const generateOrderText = () => {
    const date = new Date().toLocaleDateString('en-IN');
    let text = `ORDER LIST\nDate: ${date}\n\n`;
    orderItems.forEach((item, i) => {
      text += `${item.item} - ${item.suggestedOrder} - ${item.plant}\n`;
    });
    return text;
  };

  const handleExportPDF = async () => {
    setShowShareMenu(false);
    if (orderItems.length === 0) { Alert.alert('No Orders', 'No items need reordering'); return; }
    const date = new Date().toLocaleDateString('en-IN');
    const rows = orderItems.map((item, i) =>
      `<tr><td>${i + 1}</td><td>${item.item}</td><td>${item.current}</td><td>${item.minStock}</td><td style="font-weight:bold;color:#EA4335">${item.suggestedOrder}</td><td>${item.plant}</td></tr>`
    ).join('');
    const html = `<html><head><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:18px;color:#202124}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #e0e0e0;padding:6px 8px;font-size:12px;text-align:left}
      th{background:#4285F4;color:#fff}
      .low{background:#FFF3E0}
    </style></head><body>
    <h1>Smart Excel Reader - Order List</h1>
    <p>Date: ${date}</p>
    <table><tr><th>#</th><th>Item</th><th>Current</th><th>Min</th><th>Order Qty</th><th>Plant</th></tr>${rows}</table>
    <p style="margin-top:12px;font-size:10px;color:#9aa0a6">Generated by Smart Excel Reader</p>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Order List PDF' });
    } catch { Alert.alert('Error', 'Failed to generate PDF'); }
  };

  const handleShareWhatsApp = async () => {
    setShowShareMenu(false);
    if (orderItems.length === 0) { Alert.alert('No Orders', 'No items need reordering'); return; }
    await Share.share({ message: generateOrderText() });
  };

  const handleExportTXT = async () => {
    setShowShareMenu(false);
    if (orderItems.length === 0) { Alert.alert('No Orders', 'No items need reordering'); return; }
    const text = generateOrderText();
    try {
      // Create a file and share it
      const html = `<html><body><pre>${text}</pre></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { dialogTitle: 'Order List' });
    } catch { await Share.share({ message: text }); }
  };

  // ─── Sheet helpers ────────────────────────────────────────────────
  const handleSetActive = async (sheet: SheetProfile) => {
    setActiveSheetId(sheet.id); setLocalActiveId(sheet.id); setLocalActiveSheet(sheet);
    await AsyncStorage.setItem('active_sheet_id', sheet.id);
    if (sheet.fileId) fetchFileMetadata(sheet.fileId);
  };

  const handleRefreshSheet = async (sheet: SheetProfile) => {
    setRefreshingId(sheet.id);
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) { router.replace('/'); return; }
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${sheet.fileId}&sheet_name=${encodeURIComponent(sheet.sheetName)}&cell_range=${encodeURIComponent(sheet.range)}`
      );
      updateSheetProfile(sheet.id, { data: res.data.data, rowCount: res.data.row_count, colCount: res.data.col_count, lastRefreshed: Date.now() });
      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
      setLocalLibrary([...library]);
      if (sheet.id === activeSheetId) setLocalActiveSheet(getActiveSheet());
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to refresh');
    } finally { setRefreshingId(null); }
  };

  const handleDeleteSheet = (sheet: SheetProfile) => {
    Alert.alert('Delete Sheet', `Remove "${sheet.displayName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        removeSheetProfile(sheet.id);
        const library = getSheetLibrary();
        await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
        setLocalLibrary([...library]);
        if (sheet.id === activeSheetId) { setLocalActiveId(null); setLocalActiveSheet(null); await AsyncStorage.removeItem('active_sheet_id'); }
        setShowOptions(false);
      }},
    ]);
  };

  const handleRenameSheet = async () => {
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

  const getSheetLabel = (sheet: SheetProfile) => {
    const sn = sheet.sheetName.toLowerCase();
    if (sn.includes('in demand')) return { text: 'Purchase', bg: '#E6F4EA', color: '#34A853' };
    if (sn.includes('chart') || sn.includes('layout')) return { text: 'Layout', bg: '#F3E5F5', color: '#9C27B0' };
    if (sn.includes('stock')) return { text: 'Stock', bg: '#E8F0FE', color: '#4285F4' };
    return { text: sheet.sheetType || 'Sheet', bg: '#E8F0FE', color: '#4285F4' };
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' });
  };

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            {activeSheet ? activeSheet.fileName : 'Smart Excel Reader'}
          </Text>
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

      {/* Sub-tabs */}
      <View style={s.subTabBar}>
        <TouchableOpacity style={[s.subTab, subTab === 'inventory' && s.subTabActive]}
          onPress={() => setSubTab('inventory')} data-testid="subtab-inventory">
          <Text style={[s.subTabText, subTab === 'inventory' && s.subTabTextActive]}>Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.subTab, subTab === 'sales' && s.subTabActive]}
          onPress={() => { setSubTab('sales'); if (!salesData) loadSalesData(); }} data-testid="subtab-sales">
          <Text style={[s.subTabText, subTab === 'sales' && s.subTabTextActive]}>Annual Sales</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {subTab === 'inventory' ? (
          <>
            {/* Reorder Suggestion Table */}
            {orderItems.length > 0 && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Ionicons name="cart" size={16} color="#FA7B17" />
                  <Text style={s.cardTitle}>Reorder Suggestions</Text>
                  <Text style={s.cardCount}>{orderItems.length}</Text>
                </View>
                <View style={s.miniTableHead}>
                  <Text style={[s.miniTH, { flex: 2 }]}>Item</Text>
                  <Text style={[s.miniTH, { width: 45 }]}>Curr</Text>
                  <Text style={[s.miniTH, { width: 40 }]}>Min</Text>
                  <Text style={[s.miniTH, { width: 50 }]}>Order</Text>
                </View>
                {orderItems.slice(0, 10).map((item, i) => (
                  <View key={i} style={s.miniTableRow}>
                    <Text style={[s.miniTD, { flex: 2 }]} numberOfLines={1}>{item.item}</Text>
                    <Text style={[s.miniTD, { width: 45, color: item.current < item.minStock ? '#EA4335' : '#e0e0e0' }]}>{item.current}</Text>
                    <Text style={[s.miniTD, { width: 40 }]}>{item.minStock}</Text>
                    <Text style={[s.miniTD, { width: 50, color: '#FA7B17', fontWeight: '700' }]}>{item.suggestedOrder}</Text>
                  </View>
                ))}
                {orderItems.length > 10 && <Text style={s.moreText}>+{orderItems.length - 10} more items</Text>}
              </View>
            )}
            {loadingReorder && <ActivityIndicator color="#4285F4" style={{ marginVertical: 12 }} />}

            {/* Add File */}
            <TouchableOpacity style={s.addFileBtn} onPress={() => router.push('/files' as any)}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={s.addFileBtnText}>Add File from Drive</Text>
            </TouchableOpacity>

            {/* Saved Sheets */}
            <View style={s.sectionRow}>
              <Ionicons name="library" size={16} color="#5f6368" />
              <Text style={s.sectionTitle}>Saved Sheets</Text>
              <View style={s.countBadge}><Text style={s.countBadgeText}>{sheetLibrary.length}</Text></View>
            </View>

            {sheetLibrary.length === 0 ? (
              <View style={s.emptyBox}><Text style={s.emptyText}>No saved sheets yet</Text></View>
            ) : sheetLibrary.map(sheet => {
              const isActive = sheet.id === activeSheetId;
              const label = getSheetLabel(sheet);
              return (
                <TouchableOpacity key={sheet.id} style={[s.sheetCard, isActive && s.sheetCardActive]}
                  onPress={() => handleSetActive(sheet)} onLongPress={() => { setSelectedSheet(sheet); setShowOptions(true); }}>
                  <Ionicons name={isActive ? 'checkmark-circle' : 'document'} size={18} color={isActive ? '#34A853' : '#5f6368'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.sheetName, isActive && { color: '#34A853' }]} numberOfLines={1}>{sheet.displayName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
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

            {/* Quick Actions */}
            <View style={[s.sectionRow, { marginTop: 16 }]}>
              <Ionicons name="flash" size={16} color="#FA7B17" />
              <Text style={s.sectionTitle}>Quick Actions</Text>
            </View>
            <View style={s.actionGrid}>
              {[
                { label: 'Purchase', icon: 'cart', color: '#34A853', bg: '#E6F4EA', route: '/(tabs)/purchase' },
                { label: 'Calculator', icon: 'calculator', color: '#4285F4', bg: '#E8F0FE', route: '/(tabs)/calculator' },
                { label: 'Layout', icon: 'grid', color: '#E65100', bg: '#FFF3E0', route: '/(tabs)/warehouse' },
                { label: 'Filter', icon: 'funnel', color: '#FA7B17', bg: '#FEF0E6', route: '/(tabs)/filter' },
                { label: 'Parchi', icon: 'document-text', color: '#9C27B0', bg: '#F0E6FE', route: '/(tabs)/parchi' },
                { label: 'Sheet View', icon: 'eye', color: '#1565C0', bg: '#E3F2FD', route: '/sheetview' },
              ].map(a => (
                <TouchableOpacity key={a.label} style={s.actionCard}
                  onPress={() => a.route.startsWith('/sheet') ? router.push(a.route as any) : router.navigate(a.route as any)}>
                  <View style={[s.actionIcon, { backgroundColor: a.bg }]}>
                    <Ionicons name={a.icon as any} size={22} color={a.color} />
                  </View>
                  <Text style={s.actionTitle}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          /* Annual Sales Tab */
          <>
            {loadingSales ? (
              <View style={s.centerBox}><ActivityIndicator size="large" color="#4285F4" /><Text style={s.loadingText}>Loading Sales Data...</Text></View>
            ) : salesData && salesData.length > 0 ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>Sales Data</Text>
                {/* Header row */}
                <View style={s.miniTableHead}>
                  {salesData[0].slice(0, 5).map((h, i) => (
                    <Text key={i} style={[s.miniTH, i === 0 ? { flex: 2 } : { flex: 1 }]}>{h || `Col ${i + 1}`}</Text>
                  ))}
                </View>
                {salesData.slice(1, 50).map((row, i) => (
                  <View key={i} style={s.miniTableRow}>
                    {row.slice(0, 5).map((cell, j) => (
                      <Text key={j} style={[s.miniTD, j === 0 ? { flex: 2 } : { flex: 1 }]} numberOfLines={1}>{cell || ''}</Text>
                    ))}
                  </View>
                ))}
                {salesData.length > 51 && <Text style={s.moreText}>+{salesData.length - 51} more rows</Text>}
              </View>
            ) : (
              <View style={s.centerBox}>
                <Ionicons name="bar-chart-outline" size={48} color="#5f6368" />
                <Text style={s.emptyText}>No sales data available</Text>
                <TouchableOpacity style={s.loadSalesBtn} onPress={loadSalesData}>
                  <Text style={s.loadSalesBtnText}>Load Sales Data</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Low Stock Alert Panel */}
      {lowStockItems.length > 0 && subTab === 'inventory' && (
        <View style={s.alertPanel}>
          <TouchableOpacity style={s.alertHeader} onPress={() => setLowStockCollapsed(!lowStockCollapsed)}>
            <Ionicons name="warning" size={16} color="#FA7B17" />
            <Text style={s.alertTitle}>Low Stock ({lowStockItems.length})</Text>
            <Ionicons name={lowStockCollapsed ? 'chevron-up' : 'chevron-down'} size={16} color="#9aa0a6" />
          </TouchableOpacity>
          {!lowStockCollapsed && (
            <ScrollView style={s.alertBody} nestedScrollEnabled>
              {lowStockItems.slice(0, 8).map((item, i) => (
                <Text key={i} style={s.alertItem}>{item.item} ({item.current} left)</Text>
              ))}
              {lowStockItems.length > 8 && <Text style={s.alertMore}>+{lowStockItems.length - 8} more</Text>}
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
              <Ionicons name="logo-whatsapp" size={20} color="#34A853" />
              <Text style={s.shareMenuText}>Share via WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shareMenuItem} onPress={handleExportTXT} data-testid="export-txt">
              <Ionicons name="create" size={20} color="#4285F4" />
              <Text style={s.shareMenuText}>Export as TXT</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sheet Options Modal */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <View style={s.optionsModal}>
            {selectedSheet && (<>
              <Text style={s.optionsTitle} numberOfLines={1}>{selectedSheet.displayName}</Text>
              <TouchableOpacity style={s.optionItem} onPress={() => { handleSetActive(selectedSheet); setShowOptions(false); }}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#34A853" /><Text style={s.optionText}>Set Active</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.optionItem} onPress={() => { handleRefreshSheet(selectedSheet); setShowOptions(false); }}>
                <Ionicons name="refresh" size={20} color="#4285F4" /><Text style={s.optionText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.optionItem} onPress={() => { setRenameText(selectedSheet.displayName); setShowRenameModal(true); }}>
                <Ionicons name="pencil" size={20} color="#FA7B17" /><Text style={s.optionText}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.optionItem} onPress={() => handleDeleteSheet(selectedSheet)}>
                <Ionicons name="trash-outline" size={20} color="#EA4335" /><Text style={[s.optionText, { color: '#EA4335' }]}>Delete</Text>
              </TouchableOpacity>
            </>)}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <View style={s.modalBg}>
          <View style={s.renameModal}>
            <Text style={s.renameTitle}>Rename Sheet</Text>
            <TextInput style={s.renameInput} value={renameText} onChangeText={setRenameText} autoFocus />
            <View style={s.renameBtns}>
              <TouchableOpacity style={s.renameCancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={s.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.renameSaveBtn} onPress={handleRenameSheet}>
                <Text style={s.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerMeta: { fontSize: 11, color: '#4285F4', marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 6 },
  shareIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  headerBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  // Sub tabs
  subTabBar: { flexDirection: 'row', backgroundColor: '#16213e', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#0f3460' },
  subTabActive: { backgroundColor: '#4285F4' },
  subTabText: { fontSize: 13, fontWeight: '600', color: '#9aa0a6' },
  subTabTextActive: { color: '#fff' },
  content: { padding: 12, paddingBottom: 100 },
  // Cards
  card: { backgroundColor: '#16213e', borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  cardCount: { fontSize: 11, fontWeight: '700', color: '#FA7B17', backgroundColor: '#0f3460', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  miniTableHead: { flexDirection: 'row', backgroundColor: '#0f3460', borderRadius: 6, padding: 6, marginBottom: 2 },
  miniTH: { fontSize: 10, fontWeight: '700', color: '#4285F4', textAlign: 'center' },
  miniTableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  miniTD: { fontSize: 11, color: '#e0e0e0', textAlign: 'center' },
  moreText: { fontSize: 11, color: '#9aa0a6', textAlign: 'center', paddingTop: 6 },
  // Add file
  addFileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4285F4', paddingVertical: 12, borderRadius: 10, marginBottom: 14 },
  addFileBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Section
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#e0e0e0', flex: 1 },
  countBadge: { backgroundColor: '#0f3460', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countBadgeText: { fontSize: 11, color: '#4285F4', fontWeight: '600' },
  // Sheet cards
  sheetCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#0f3460' },
  sheetCardActive: { borderColor: '#34A853' },
  sheetName: { fontSize: 13, fontWeight: '600', color: '#e0e0e0' },
  sheetMeta: { fontSize: 10, color: '#5f6368' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '700' },
  refreshBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  // Actions
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCard: { flexBasis: '30%', flexGrow: 1, maxWidth: '48%', backgroundColor: '#16213e', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#0f3460' },
  actionIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  actionTitle: { fontSize: 11, fontWeight: '600', color: '#e0e0e0' },
  // Empty
  emptyBox: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#5f6368', marginTop: 8 },
  centerBox: { padding: 40, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#4285F4', marginTop: 10 },
  loadSalesBtn: { marginTop: 16, backgroundColor: '#4285F4', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  loadSalesBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Low Stock Alert
  alertPanel: { position: 'absolute', bottom: 70, left: 8, right: 200, backgroundColor: '#16213e', borderRadius: 12, borderWidth: 1, borderColor: '#FA7B17', maxWidth: 220 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  alertTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: '#FA7B17' },
  alertBody: { maxHeight: 120, paddingHorizontal: 10, paddingBottom: 8 },
  alertItem: { fontSize: 11, color: '#e0e0e0', paddingVertical: 2 },
  alertMore: { fontSize: 10, color: '#9aa0a6', paddingTop: 4 },
  // Share menu
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  shareMenu: { backgroundColor: '#16213e', borderRadius: 16, padding: 8, width: 220, position: 'absolute', top: 60, right: 16 },
  shareMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8 },
  shareMenuText: { fontSize: 14, color: '#e0e0e0', fontWeight: '500' },
  // Options modal
  optionsModal: { backgroundColor: '#16213e', borderRadius: 16, padding: 16, width: '90%', maxWidth: 300 },
  optionsTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  optionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  optionText: { fontSize: 14, color: '#e0e0e0', fontWeight: '500' },
  // Rename
  renameModal: { backgroundColor: '#16213e', borderRadius: 16, padding: 20, width: '90%', maxWidth: 300 },
  renameTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  renameInput: { backgroundColor: '#0f3460', borderRadius: 10, padding: 12, fontSize: 15, color: '#fff', marginBottom: 14 },
  renameBtns: { flexDirection: 'row', gap: 10 },
  renameCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#5f6368', borderRadius: 10 },
  renameCancelText: { fontSize: 14, color: '#9aa0a6', fontWeight: '600' },
  renameSaveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#4285F4', borderRadius: 10 },
  renameSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
