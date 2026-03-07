import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, Modal, TextInput, Linking, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  getSheetLibrary, setSheetLibrary, updateSheetProfile,
  getColOffset, SheetProfile
} from '../utils/store';

const { width: SW } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Default visible column indices (0-based from A)
// A=0, E=4, F=5, G=6, H=7, I=8, M=12, N=13, O=14, P=15
const DEFAULT_VIS_COLS = [0, 4, 5, 6, 7, 8, 12, 13, 14, 15];
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

// Columns to hide by default for JGT files: B=1, C=2, D=3, J=9, K=10, L=11
const JGT_HIDDEN_COLS = [1, 2, 3, 9, 10, 11];

// Default JGT Page configuration (user-editable)
// Updated print ranges as per specification
const DEFAULT_JGT_PAGES = [
  { name: 'Page 1', startRow: 1, endRow: 42, startCol: 'A', endCol: 'P' },
  { name: 'Page 2', startRow: 43, endRow: 74, startCol: 'A', endCol: 'P' },
  { name: 'Page 3', startRow: 77, endRow: 112, startCol: 'A', endCol: 'P' },
  { name: 'Page 4', startRow: 115, endRow: 153, startCol: 'A', endCol: 'P' },
];

const ROWS_PER_PAGE = 24;
const ROW_NUM_W = 28;

export default function SheetViewScreen() {
  const router = useRouter();
  const [stockProfile, setStockProfile] = useState<SheetProfile | null>(null);
  const [allData, setAllData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Row hiding state
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [showHiddenModal, setShowHiddenModal] = useState(false);

  // Column hiding state
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set(JGT_HIDDEN_COLS));
  const [showColModal, setShowColModal] = useState(false);

  // Print state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [isPrinting, setIsPrinting] = useState(false);
  const [customPages, setCustomPages] = useState(DEFAULT_JGT_PAGES);
  const [editingPage, setEditingPage] = useState<{ idx: number; name: string; startRow: string; endRow: string } | null>(null);

  // Detect if current file is JGT
  const isJGTFile = useMemo(() => {
    const name = stockProfile?.fileName?.toLowerCase() || stockProfile?.sheetName?.toLowerCase() || '';
    return name.includes('jgt');
  }, [stockProfile]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    setError(null);
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const lib: SheetProfile[] = JSON.parse(stored);
      setSheetLibrary(lib);
    }
    const lib = getSheetLibrary();
    const stock = lib.find((s) => s.sheetName.toLowerCase() === 'stock');
    if (!stock) { setLoading(false); setError('no_profile'); return; }
    setStockProfile(stock);
    
    // Load hidden columns preference
    const savedHiddenCols = await AsyncStorage.getItem('sheetview_hidden_cols');
    if (savedHiddenCols) {
      setHiddenCols(new Set(JSON.parse(savedHiddenCols)));
    }

    // Load custom print pages
    const savedPages = await AsyncStorage.getItem('sheetview_print_pages');
    if (savedPages) {
      setCustomPages(JSON.parse(savedPages));
    }
    
    const ts = await AsyncStorage.getItem('sheetview_timestamp');
    if (ts) setLastUpdated(ts);
    if (stock.data) {
      processData(stock.data, stock.range);
      setLoading(false);
    } else {
      await fetchData(stock);
    }
  };

  const fetchData = async (profile: SheetProfile) => {
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) { Alert.alert('Session Expired', 'Please login again'); router.replace('/'); return; }
      
      // Ensure range extends to at least column P for STOCK sheets
      let fetchRange = profile.range;
      const rangeMatch = fetchRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (rangeMatch) {
        const endCol = rangeMatch[3];
        // If end column is before P (A-O), extend to P
        if (endCol.length === 1 && endCol.charCodeAt(0) < 'P'.charCodeAt(0)) {
          fetchRange = `${rangeMatch[1]}${rangeMatch[2]}:P${rangeMatch[4]}`;
        }
      }
      
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(fetchRange)}&_t=${Date.now()}`
      );
      const rows: string[][] = res.data.data || [];
      updateSheetProfile(profile.id, { data: rows, rowCount: res.data.row_count, colCount: res.data.col_count, lastRefreshed: Date.now() });
      const lib = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));
      const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
      await AsyncStorage.setItem('sheetview_timestamp', now);
      setLastUpdated(now);
      processData(rows, profile.range);
      setStockProfile({ ...profile, data: rows });
    } catch (err: any) {
      setError('fetch_failed');
      Alert.alert('Error', err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processData = (rows: string[][], range: string) => {
    if (rows.length > 0) setHeaders(rows[0] || []);
    setAllData(rows);
  };

  const handleRefresh = async () => {
    if (!stockProfile) return;
    setRefreshing(true);
    await fetchData(stockProfile);
  };

  // Get visible columns (excluding hidden ones)
  const visibleCols = useMemo(() => {
    const maxCol = Math.min(15, allData[0]?.length || 15);
    return Array.from({ length: maxCol }, (_, i) => i).filter(i => !hiddenCols.has(i));
  }, [hiddenCols, allData]);

  // Get visible rows (excluding hidden ones)
  const visibleData = useMemo(() => {
    return allData.slice(1).filter((_, idx) => !hiddenRows.has(idx + 1));
  }, [allData, hiddenRows]);

  // Calculate column width dynamically
  const colWidth = useMemo(() => {
    const usableW = SW - ROW_NUM_W - 16;
    const numCols = visibleCols.length;
    return Math.max(50, usableW / numCols);
  }, [visibleCols]);

  // Toggle row visibility
  const toggleRowHidden = (rowIdx: number) => {
    setHiddenRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  };

  // Toggle column visibility
  const toggleColHidden = async (colIdx: number) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(colIdx)) next.delete(colIdx);
      else next.add(colIdx);
      // Save preference
      AsyncStorage.setItem('sheetview_hidden_cols', JSON.stringify([...next]));
      return next;
    });
  };

  // Show all hidden rows
  const showAllRows = () => {
    setHiddenRows(new Set());
    setShowHiddenModal(false);
  };

  // Toggle page selection for printing
  const togglePageSelection = (pageIdx: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageIdx)) next.delete(pageIdx);
      else next.add(pageIdx);
      return next;
    });
  };

  // Save custom pages to AsyncStorage
  const saveCustomPages = async (pages: typeof DEFAULT_JGT_PAGES) => {
    setCustomPages(pages);
    await AsyncStorage.setItem('sheetview_print_pages', JSON.stringify(pages));
  };

  // Add a new page range
  const addPageRange = () => {
    const lastPage = customPages[customPages.length - 1];
    const newPage = {
      name: `Page ${customPages.length + 1}`,
      startRow: lastPage ? lastPage.endRow + 1 : 1,
      endRow: lastPage ? lastPage.endRow + 30 : 30,
      startCol: 'A', endCol: 'O'
    };
    const updated = [...customPages, newPage];
    saveCustomPages(updated);
    setSelectedPages(prev => { const n = new Set(prev); n.add(updated.length - 1); return n; });
  };

  // Edit a page range
  const saveEditPage = () => {
    if (!editingPage) return;
    const start = parseInt(editingPage.startRow) || 1;
    const end = parseInt(editingPage.endRow) || start + 20;
    const updated = customPages.map((p, i) =>
      i === editingPage.idx ? { ...p, name: editingPage.name || `Page ${i + 1}`, startRow: start, endRow: end } : p
    );
    saveCustomPages(updated);
    setEditingPage(null);
  };

  // Remove a page range
  const removePageRange = (idx: number) => {
    if (customPages.length <= 1) { Alert.alert('Cannot Delete', 'You need at least one page range.'); return; }
    const updated = customPages.filter((_, i) => i !== idx);
    saveCustomPages(updated);
    setSelectedPages(prev => { const n = new Set(prev); n.delete(idx); return n; });
  };

  // Reset page ranges to default
  const resetPageRanges = () => {
    saveCustomPages(DEFAULT_JGT_PAGES);
    setSelectedPages(new Set([0, 1, 2, 3]));
  };

  // Generate HTML for printing
  const generatePrintHTML = useCallback(() => {
    const visColIndices = visibleCols;
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        @page { margin: 5mm; size: A4 landscape; }
        body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; padding: 5px; }
        h2 { font-size: 12px; margin: 5px 0; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: avoid; }
        th, td { border: 1px solid #333; padding: 3px 4px; text-align: center; font-size: 8px; }
        th { background: #f0f0f0; font-weight: bold; }
        .page-break { page-break-after: always; }
        .stock-low { background: #FFECB3; }
        .stock-empty { background: #FFCDD2; }
      </style>
    </head>
    <body>
    `;

    if (isJGTFile) {
      // JGT file: use predefined page ranges
      const sortedPages = [...selectedPages].sort((a, b) => a - b);
      sortedPages.forEach((pageIdx, pIdx) => {
        const pageConfig = customPages[pageIdx];
        if (!pageConfig) return;

        html += `<h2>${stockProfile?.fileName || 'Sheet'} - ${pageConfig.name}</h2>`;
        html += `<table><thead><tr><th>#</th>`;
        
        // Headers
        visColIndices.forEach(colIdx => {
          html += `<th>${headers[colIdx] || COL_LABELS[colIdx]}</th>`;
        });
        html += `</tr></thead><tbody>`;

        // Data rows for this page
        for (let r = pageConfig.startRow; r <= Math.min(pageConfig.endRow, allData.length - 1); r++) {
          if (hiddenRows.has(r)) continue;
          const row = allData[r];
          if (!row) continue;
          
          html += `<tr><td>${r}</td>`;
          visColIndices.forEach(colIdx => {
            const val = row[colIdx] || '';
            html += `<td>${val}</td>`;
          });
          html += `</tr>`;
        }
        html += `</tbody></table>`;
        
        if (pIdx < sortedPages.length - 1) html += `<div class="page-break"></div>`;
      });
    } else {
      // Regular file: paginate by ROWS_PER_PAGE
      const totalPages = Math.ceil(visibleData.length / ROWS_PER_PAGE);
      for (let p = 0; p < totalPages; p++) {
        const startIdx = p * ROWS_PER_PAGE;
        const pageRows = visibleData.slice(startIdx, startIdx + ROWS_PER_PAGE);

        html += `<h2>${stockProfile?.fileName || 'Sheet'} - Page ${p + 1}/${totalPages}</h2>`;
        html += `<table><thead><tr><th>#</th>`;
        
        visColIndices.forEach(colIdx => {
          html += `<th>${headers[colIdx] || COL_LABELS[colIdx]}</th>`;
        });
        html += `</tr></thead><tbody>`;

        pageRows.forEach((row, rIdx) => {
          const globalRow = startIdx + rIdx + 2;
          html += `<tr><td>${globalRow}</td>`;
          visColIndices.forEach(colIdx => {
            const val = row[colIdx] || '';
            html += `<td>${val}</td>`;
          });
          html += `</tr>`;
        });
        html += `</tbody></table>`;
        
        if (p < totalPages - 1) html += `<div class="page-break"></div>`;
      }
    }

    html += `</body></html>`;
    return html;
  }, [visibleCols, visibleData, allData, hiddenRows, headers, isJGTFile, selectedPages, stockProfile]);

  // Handle print action
  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const html = generatePrintHTML();
      
      if (Platform.OS === 'android') {
        // On Android, generate PDF and open with native print dialog
        const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 }); // A4 Landscape
        
        // Try to open HP Print Service or native print
        // This will open the system share dialog where user can select HP Print Service
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Print Sheet',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // iOS: use native print
        await Print.printAsync({ html });
      }
      
      setShowPrintModal(false);
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Failed to print');
    } finally {
      setIsPrinting(false);
    }
  };

  // ─── Error / Loading states ─────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}><ActivityIndicator size="large" color="#4285F4" /><Text style={st.centerText}>Loading STOCK data...</Text></View>
    </SafeAreaView>
  );
  if (error === 'no_profile') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <Ionicons name="document-outline" size={48} color="#5f6368" />
        <Text style={st.centerTitle}>STOCK Sheet Not Saved</Text>
        <Text style={st.centerSub}>Save the STOCK sheet from Home tab first.</Text>
        <TouchableOpacity style={st.goHomeBtn} onPress={() => router.replace('/(tabs)/home' as any)} data-testid="go-home-btn">
          <Text style={st.goHomeBtnText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
  if (error === 'fetch_failed') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <Ionicons name="cloud-offline-outline" size={48} color="#EA4335" />
        <Text style={st.centerTitle}>Failed to Load</Text>
        <TouchableOpacity style={st.retryBtn} onPress={handleRefresh} data-testid="retry-btn">
          <Ionicons name="refresh" size={18} color="#fff" /><Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header 
        onBack={() => router.back()} 
        onRefresh={handleRefresh} 
        refreshing={refreshing}
        onPrint={() => setShowPrintModal(true)}
        onColumns={() => setShowColModal(true)}
        hiddenRowCount={hiddenRows.size}
        onShowHidden={() => setShowHiddenModal(true)}
      />

      {lastUpdated && (
        <View style={st.tsBar}>
          <Ionicons name="time-outline" size={12} color="#9aa0a6" />
          <Text style={st.tsText}>Last updated: {lastUpdated}</Text>
          <Text style={st.tsText}> | {visibleData.length} rows, {visibleCols.length} cols</Text>
          {hiddenRows.size > 0 && (
            <Text style={st.tsHidden}> | {hiddenRows.size} hidden</Text>
          )}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={st.vScroll}>
          {/* Column headers */}
          <View style={st.tableRow}>
            <View style={[st.cell, st.rowNumCell]}><Text style={st.hdrText}>#</Text></View>
            {visibleCols.map((colIdx, i) => (
              <View key={i} style={[st.hdrCell, { width: colWidth }]}>
                <Text style={st.hdrText} numberOfLines={1}>{headers[colIdx] || COL_LABELS[colIdx]}</Text>
              </View>
            ))}
            <View style={[st.cell, { width: 40 }]}><Text style={st.hdrText}>Hide</Text></View>
          </View>

          {/* Data rows */}
          {visibleData.map((row, rIdx) => {
            // Find actual row index in original data
            let actualIdx = rIdx + 1;
            let count = 0;
            for (let i = 1; i < allData.length; i++) {
              if (!hiddenRows.has(i)) {
                if (count === rIdx) { actualIdx = i; break; }
                count++;
              }
            }
            
            return (
              <View key={rIdx} style={[st.tableRow, rIdx % 2 === 0 ? st.rowEven : st.rowOdd]}>
                <View style={[st.cell, st.rowNumCell]}>
                  <Text style={st.rowNumText}>{actualIdx + 1}</Text>
                </View>
                {visibleCols.map((colIdx, cIdx) => (
                  <View key={cIdx} style={[st.cell, { width: colWidth }]}>
                    <Text style={st.cellText} numberOfLines={2}>{row[colIdx] || ''}</Text>
                  </View>
                ))}
                <TouchableOpacity 
                  style={[st.cell, { width: 40 }]} 
                  onPress={() => toggleRowHidden(actualIdx)}
                  data-testid={`hide-row-${actualIdx}`}
                >
                  <Ionicons name="eye-off-outline" size={14} color="#9aa0a6" />
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScrollView>

      {/* Column Settings Modal */}
      <Modal visible={showColModal} transparent animationType="slide" onRequestClose={() => setShowColModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowColModal(false)}>
          <View style={st.colModal} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Column Visibility</Text>
              <TouchableOpacity onPress={() => setShowColModal(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            <Text style={st.modalHint}>Tap to show/hide columns. Hidden columns will not appear in print.</Text>
            <ScrollView style={st.colList}>
              {COL_LABELS.slice(0, Math.min(15, allData[0]?.length || 15)).map((label, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={st.colItem}
                  onPress={() => toggleColHidden(idx)}
                >
                  <Ionicons 
                    name={hiddenCols.has(idx) ? 'eye-off' : 'eye'} 
                    size={20} 
                    color={hiddenCols.has(idx) ? '#EA4335' : '#34A853'} 
                  />
                  <Text style={st.colLabel}>Column {label}</Text>
                  <Text style={st.colHeader}>{headers[idx] || '-'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={st.resetColBtn} onPress={() => {
              setHiddenCols(new Set(JGT_HIDDEN_COLS));
              AsyncStorage.setItem('sheetview_hidden_cols', JSON.stringify(JGT_HIDDEN_COLS));
            }}>
              <Text style={st.resetColBtnText}>Reset to Default (Hide B,C,D,J,K,L)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Hidden Rows Modal */}
      <Modal visible={showHiddenModal} transparent animationType="fade" onRequestClose={() => setShowHiddenModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowHiddenModal(false)}>
          <View style={st.hiddenModal} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Hidden Rows ({hiddenRows.size})</Text>
              <TouchableOpacity onPress={() => setShowHiddenModal(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            {hiddenRows.size === 0 ? (
              <Text style={st.noHiddenText}>No hidden rows</Text>
            ) : (
              <ScrollView style={st.hiddenList}>
                {[...hiddenRows].sort((a, b) => a - b).map(rowIdx => (
                  <TouchableOpacity 
                    key={rowIdx} 
                    style={st.hiddenItem}
                    onPress={() => toggleRowHidden(rowIdx)}
                  >
                    <Text style={st.hiddenItemText}>Row {rowIdx + 1}</Text>
                    <Ionicons name="eye" size={18} color="#34A853" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={st.showAllBtn} onPress={showAllRows}>
              <Text style={st.showAllBtnText}>Show All Rows</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Print Modal */}
      <Modal visible={showPrintModal} transparent animationType="slide" onRequestClose={() => setShowPrintModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowPrintModal(false)}>
          <View style={st.printModal} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Print Options</Text>
              <TouchableOpacity onPress={() => setShowPrintModal(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            
            {isJGTFile ? (
              <>
                <Text style={st.modalHint}>Select pages to print (JGT file detected). Tap edit icon to modify ranges.</Text>
                <ScrollView style={{ maxHeight: 280 }}>
                  <View style={st.pageGrid}>
                    {customPages.map((page, idx) => (
                      <View key={idx} style={[st.pageCard, selectedPages.has(idx) && st.pageCardSelected]}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => togglePageSelection(idx)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons 
                              name={selectedPages.has(idx) ? 'checkbox' : 'square-outline'} 
                              size={18} 
                              color={selectedPages.has(idx) ? '#4285F4' : '#9aa0a6'} 
                            />
                            <Text style={st.pageCardTitle}>{page.name}</Text>
                          </View>
                          <Text style={st.pageCardRange}>Rows {page.startRow}-{page.endRow}</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity onPress={() => setEditingPage({ idx, name: page.name, startRow: String(page.startRow), endRow: String(page.endRow) })} data-testid={`edit-page-${idx}`}>
                            <Ionicons name="pencil-outline" size={16} color="#FBBC05" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removePageRange(idx)} data-testid={`delete-page-${idx}`}>
                            <Ionicons name="trash-outline" size={16} color="#EA4335" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                  {/* Edit Page Inline */}
                  {editingPage && (
                    <View style={st.editPageRow}>
                      <TextInput style={[st.editInput, { flex: 2 }]} value={editingPage.name}
                        onChangeText={v => setEditingPage({ ...editingPage, name: v })} placeholder="Name" placeholderTextColor="#5f6368" />
                      <TextInput style={st.editInput} value={editingPage.startRow}
                        onChangeText={v => setEditingPage({ ...editingPage, startRow: v })} placeholder="Start" placeholderTextColor="#5f6368" keyboardType="numeric" />
                      <TextInput style={st.editInput} value={editingPage.endRow}
                        onChangeText={v => setEditingPage({ ...editingPage, endRow: v })} placeholder="End" placeholderTextColor="#5f6368" keyboardType="numeric" />
                      <TouchableOpacity onPress={saveEditPage} style={st.editSaveBtn} data-testid="save-page-edit">
                        <Ionicons name="checkmark" size={18} color="#34A853" />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={st.addPageBtn} onPress={addPageRange} data-testid="add-page-range">
                    <Ionicons name="add-circle-outline" size={16} color="#4285F4" />
                    <Text style={st.addPageBtnText}>Add Page</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.resetPageBtn} onPress={resetPageRanges} data-testid="reset-page-ranges">
                    <Ionicons name="refresh-outline" size={16} color="#9aa0a6" />
                    <Text style={st.resetPageBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={st.modalHint}>Print all visible rows ({visibleData.length} rows)</Text>
            )}

            <View style={st.printInfo}>
              <Ionicons name="information-circle" size={18} color="#4285F4" />
              <Text style={st.printInfoText}>
                Columns B, C, D, J, K, L are hidden by default. You can change this in column settings.
              </Text>
            </View>

            <TouchableOpacity 
              style={[st.printBtn, isPrinting && st.printBtnDisabled]} 
              onPress={handlePrint}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="print" size={20} color="#fff" />
                  <Text style={st.printBtnText}>Print / Share PDF</Text>
                </>
              )}
            </TouchableOpacity>
            
            <Text style={st.printNote}>
              On Android, select "HP Print Service Plugin" from the share menu to print directly.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

interface HeaderProps {
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onPrint?: () => void;
  onColumns?: () => void;
  hiddenRowCount?: number;
  onShowHidden?: () => void;
}

function Header({ onBack, onRefresh, refreshing, onPrint, onColumns, hiddenRowCount = 0, onShowHidden }: HeaderProps) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={onBack} style={st.backBtn} data-testid="sheet-view-back-btn">
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={st.headerTitle}>Sheet View</Text>
      <View style={st.headerBtns}>
        {hiddenRowCount > 0 && onShowHidden && (
          <TouchableOpacity style={st.hiddenBadgeBtn} onPress={onShowHidden} data-testid="show-hidden-btn">
            <Ionicons name="eye-off" size={14} color="#FA7B17" />
            <Text style={st.hiddenBadgeText}>{hiddenRowCount}</Text>
          </TouchableOpacity>
        )}
        {onColumns && (
          <TouchableOpacity style={st.headerIconBtn} onPress={onColumns} data-testid="columns-btn">
            <Ionicons name="options" size={18} color="#9C27B0" />
          </TouchableOpacity>
        )}
        {onPrint && (
          <TouchableOpacity style={st.headerIconBtn} onPress={onPrint} data-testid="print-btn">
            <Ionicons name="print" size={18} color="#34A853" />
          </TouchableOpacity>
        )}
        {onRefresh && (
          <TouchableOpacity style={st.refreshBtn} onPress={onRefresh} disabled={refreshing} data-testid="sheet-view-refresh-btn">
            {refreshing ? <ActivityIndicator size="small" color="#4285F4" /> : <Ionicons name="refresh" size={18} color="#4285F4" />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460', gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center',
  },
  hiddenBadgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FEF0E6',
  },
  hiddenBadgeText: { fontSize: 12, fontWeight: '700', color: '#FA7B17' },
  refreshBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center',
  },
  tsBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#16213e',
  },
  tsText: { fontSize: 10, color: '#9aa0a6' },
  tsHidden: { fontSize: 10, color: '#FA7B17', fontWeight: '600' },
  vScroll: { paddingVertical: 4 },
  tableRow: { flexDirection: 'row' },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.02)' },
  rowOdd: { backgroundColor: 'rgba(255,255,255,0.05)' },
  cell: {
    height: 32, justifyContent: 'center', paddingHorizontal: 4,
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 0.5, borderBottomColor: '#1e3a5f',
  },
  rowNumCell: { width: ROW_NUM_W, backgroundColor: 'rgba(15,52,96,0.5)' },
  hdrCell: {
    height: 34, justifyContent: 'center', paddingHorizontal: 4,
    backgroundColor: '#0f3460',
    borderRightWidth: 0.5, borderRightColor: '#1e3a5f',
    borderBottomWidth: 1.5, borderBottomColor: '#4285F4',
  },
  hdrText: { fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'center' },
  rowNumText: { fontSize: 8, color: '#5f6368', textAlign: 'center' },
  cellText: { fontSize: 9, color: '#d0d0d0', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 12 },
  centerText: { fontSize: 13, color: '#9aa0a6', marginTop: 10 },
  centerSub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  goHomeBtn: { marginTop: 18, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  goHomeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  retryBtn: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  colModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  hiddenModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '50%' },
  printModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#202124' },
  modalHint: { fontSize: 12, color: '#5f6368', marginBottom: 12 },
  colList: { maxHeight: 300 },
  colItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12 },
  colLabel: { fontSize: 14, fontWeight: '600', color: '#202124', width: 80 },
  colHeader: { flex: 1, fontSize: 12, color: '#5f6368' },
  resetColBtn: { marginTop: 12, backgroundColor: '#E8F0FE', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  resetColBtnText: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  hiddenList: { maxHeight: 200 },
  hiddenItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  hiddenItemText: { fontSize: 14, color: '#202124' },
  noHiddenText: { fontSize: 14, color: '#5f6368', textAlign: 'center', paddingVertical: 20 },
  showAllBtn: { marginTop: 12, backgroundColor: '#34A853', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  showAllBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Print modal
  pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  pageCard: { width: '47%', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageCardSelected: { borderColor: '#4285F4', backgroundColor: '#E8F0FE' },
  pageCardTitle: { fontSize: 13, fontWeight: '700', color: '#202124' },
  pageCardRange: { fontSize: 11, color: '#5f6368', marginTop: 2 },
  editPageRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center', padding: 8, backgroundColor: '#f0f4ff', borderRadius: 8 },
  editInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#202124' },
  editSaveBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E6F4EA', justifyContent: 'center', alignItems: 'center' },
  addPageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#E8F0FE', borderWidth: 1, borderColor: '#4285F4' },
  addPageBtnText: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  resetPageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0' },
  resetPageBtnText: { fontSize: 13, fontWeight: '500', color: '#9aa0a6' },
  printInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E8F0FE', padding: 12, borderRadius: 10, marginBottom: 16 },
  printInfoText: { flex: 1, fontSize: 12, color: '#4285F4', lineHeight: 18 },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#34A853', paddingVertical: 14, borderRadius: 12 },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  printNote: { fontSize: 11, color: '#5f6368', textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
