import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, Modal, TextInput, Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getSheetLibrary, setSheetLibrary, updateSheetProfile, SheetProfile } from '../utils/store';

const { width: SW } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COL_LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
  'Q','R','S','T','U','V','W','X','Y','Z',
  'AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ','AK','AL','AM','AN','AO','AP',
  'AQ','AR','AS','AT','AU','AV','AW','AX','AY','AZ',
  'BA','BB',
];

const JGT_HIDDEN_COLS = [1, 2, 3, 9, 10, 11];

const DEFAULT_COL_WIDTHS: Record<number, number> = {
  0: 33, 4: 174, 5: 96, 6: 58, 7: 32, 8: 61,
  9: 80, 13: 90, 14: 86, 15: 102,
};

const DEFAULT_JGT_PAGES = [
  { name: 'Page 1', startRow: 1,   endRow: 42,  startCol: 'A', endCol: 'BB' },
  { name: 'Page 2', startRow: 43,  endRow: 74,  startCol: 'A', endCol: 'BB' },
  { name: 'Page 3', startRow: 77,  endRow: 112, startCol: 'A', endCol: 'BB' },
  { name: 'Page 4', startRow: 115, endRow: 153, startCol: 'A', endCol: 'BB' },
];

const ROWS_PER_PAGE = 24;
const ROW_NUM_W = 28;

const colToIndex = (col: string) =>
  col.length === 1
    ? col.charCodeAt(0) - 65
    : 26 + (col.charCodeAt(0) - 65) * 26 + (col.charCodeAt(1) - 65);

const sheetKey = (profileId: string, suffix: string) =>
  `sheetview_${profileId}_${suffix}`;

export default function SheetViewScreen() {
  const router = useRouter();

  const [activeProfile, setActiveProfile] = useState<SheetProfile | null>(null);
  const [allData, setAllData]   = useState<string[][]>([]);
  const [headers, setHeaders]   = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const [hiddenRows, setHiddenRows]           = useState<Set<number>>(new Set());
  const [showHiddenModal, setShowHiddenModal] = useState(false);

  const [hiddenCols, setHiddenCols]     = useState<Set<number>>(new Set());
  const [showColModal, setShowColModal] = useState(false);

  const [showPrintModal, setShowPrintModal]   = useState(false);
  const [selectedPages, setSelectedPages]     = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [isPrinting, setIsPrinting]           = useState(false);
  const [customPages, setCustomPages]         = useState(DEFAULT_JGT_PAGES);
  const [editingPage, setEditingPage]         = useState<{
    idx: number; name: string; startRow: string; endRow: string;
  } | null>(null);

  const [columnWidths, setColumnWidths]       = useState<Record<number, number>>({ ...DEFAULT_COL_WIDTHS });
  const [showWidthEditor, setShowWidthEditor] = useState(false);

  const isJGTFile = useMemo(() => {
    const name = (activeProfile?.fileName ?? activeProfile?.sheetName ?? '').toLowerCase();
    return name.includes('jgt');
  }, [activeProfile]);

  const isJGTProfile = (p: SheetProfile) =>
    (p.fileName ?? p.sheetName ?? '').toLowerCase().includes('jgt');

  // ── Re-run every time this screen comes into focus ──────────────────────
  useFocusEffect(
    useCallback(() => {
      init();
    }, [])
  );

  const init = async () => {
    setLoading(true);
    setError(null);
    setAllData([]);
    setHeaders([]);
    setHiddenRows(new Set());

    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) setSheetLibrary(JSON.parse(stored));

    const lib = getSheetLibrary();
    if (!lib.length) { setLoading(false); setError('no_profile'); return; }

    // Resolve active profile
    const activeId = await AsyncStorage.getItem('active_sheet_id');
    let profile: SheetProfile | undefined;

    if (activeId) profile = lib.find(s => s.id === activeId);
    if (!profile)  profile = lib.find(s => s.sheetName.toLowerCase() === 'stock');
    if (!profile)  profile = lib[0];
    if (!profile)  { setLoading(false); setError('no_profile'); return; }

    await loadProfileSettings(profile);
    setActiveProfile(profile);

    if (profile.data) {
      processData(profile.data);
      setLoading(false);
    } else {
      await fetchData(profile);
    }
  };

  const loadProfileSettings = async (profile: SheetProfile) => {
    const id = profile.id;

    const savedHidden = await AsyncStorage.getItem(sheetKey(id, 'hidden_cols'));
    if (savedHidden) {
      setHiddenCols(new Set(JSON.parse(savedHidden)));
    } else {
      setHiddenCols(new Set(isJGTProfile(profile) ? JGT_HIDDEN_COLS : []));
    }

    const savedPages = await AsyncStorage.getItem(sheetKey(id, 'print_pages'));
    setCustomPages(savedPages ? JSON.parse(savedPages) : DEFAULT_JGT_PAGES);
    setSelectedPages(new Set([0, 1, 2, 3]));

    const savedWidths = await AsyncStorage.getItem(sheetKey(id, 'col_widths'));
    setColumnWidths(savedWidths ? JSON.parse(savedWidths) : { ...DEFAULT_COL_WIDTHS });

    const ts = await AsyncStorage.getItem(sheetKey(id, 'timestamp'));
    setLastUpdated(ts ?? null);
  };

  const fetchData = async (profile: SheetProfile) => {
    try {
      const sid = await AsyncStorage.getItem('session_id');
      if (!sid) {
        Alert.alert('Session Expired', 'Please login again');
        router.replace('/');
        return;
      }

      let fetchRange = profile.range ?? 'A1:BB500';
      const rangeMatch = fetchRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (rangeMatch && colToIndex(rangeMatch[3]) < colToIndex('BB')) {
        fetchRange = `${rangeMatch[1]}${rangeMatch[2]}:BB${rangeMatch[4]}`;
      }

      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(fetchRange)}&_t=${Date.now()}`
      );
      const rows: string[][] = res.data.data || [];

      updateSheetProfile(profile.id, {
        data: rows,
        rowCount: res.data.row_count,
        colCount: res.data.col_count,
        lastRefreshed: Date.now(),
      });
      const lib = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(lib));

      const now = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      await AsyncStorage.setItem(sheetKey(profile.id, 'timestamp'), now);
      setLastUpdated(now);
      processData(rows);
      setActiveProfile(prev => prev ? { ...prev, data: rows } : prev);
    } catch (err) {
      setError('fetch_failed');
      Alert.alert('Error', err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processData = (rows: string[][]) => {
    setHeaders(rows[0] ?? []);
    setAllData(rows);
  };

  const handleRefresh = async () => {
    if (!activeProfile) return;
    setRefreshing(true);
    await fetchData(activeProfile);
  };

  const visibleCols = useMemo(() => {
    const maxCol = allData[0]?.length || 54;
    return Array.from({ length: maxCol }, (_, i) => i).filter(i => !hiddenCols.has(i));
  }, [hiddenCols, allData]);

  const visibleData = useMemo(() =>
    allData.slice(1).filter((_, idx) => !hiddenRows.has(idx + 1)),
  [allData, hiddenRows]);

  const getColWidth = (i: number) => columnWidths[i] || 60;

  const toggleColHidden = async (colIdx: number) => {
    if (!activeProfile) return;
    setHiddenCols(prev => {
      const next = new Set(prev);
      next.has(colIdx) ? next.delete(colIdx) : next.add(colIdx);
      AsyncStorage.setItem(sheetKey(activeProfile.id, 'hidden_cols'), JSON.stringify([...next]));
      return next;
    });
  };

  const resetHiddenCols = () => {
    if (!activeProfile) return;
    const defaults = isJGTFile ? JGT_HIDDEN_COLS : [];
    setHiddenCols(new Set(defaults));
    AsyncStorage.setItem(sheetKey(activeProfile.id, 'hidden_cols'), JSON.stringify(defaults));
  };

  const toggleRowHidden = (rowIdx: number) =>
    setHiddenRows(prev => {
      const n = new Set(prev);
      n.has(rowIdx) ? n.delete(rowIdx) : n.add(rowIdx);
      return n;
    });

  const showAllRows = () => { setHiddenRows(new Set()); setShowHiddenModal(false); };

  const togglePageSelection = (i: number) =>
    setSelectedPages(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const saveCustomPages = async (pages: typeof DEFAULT_JGT_PAGES) => {
    if (!activeProfile) return;
    setCustomPages(pages);
    await AsyncStorage.setItem(sheetKey(activeProfile.id, 'print_pages'), JSON.stringify(pages));
  };

  const addPageRange = () => {
    const last = customPages[customPages.length - 1];
    const newPage = {
      name: `Page ${customPages.length + 1}`,
      startRow: last ? last.endRow + 1 : 1,
      endRow: last ? last.endRow + 30 : 30,
      startCol: 'A',
      endCol: 'BB',
    };
    const updated = [...customPages, newPage];
    saveCustomPages(updated);
    setSelectedPages(prev => { const n = new Set(prev); n.add(updated.length - 1); return n; });
  };

  const saveEditPage = () => {
    if (!editingPage) return;
    const start = parseInt(editingPage.startRow) || 1;
    const end   = parseInt(editingPage.endRow)   || start + 20;
    saveCustomPages(
      customPages.map((p, i) =>
        i === editingPage.idx
          ? { ...p, name: editingPage.name || `Page ${i + 1}`, startRow: start, endRow: end }
          : p
      )
    );
    setEditingPage(null);
  };

  const removePageRange = (idx: number) => {
    if (customPages.length <= 1) {
      Alert.alert('Cannot Delete', 'You need at least one page range.');
      return;
    }
    saveCustomPages(customPages.filter((_, i) => i !== idx));
    setSelectedPages(prev => { const n = new Set(prev); n.delete(idx); return n; });
  };

  const resetPageRanges = () => {
    saveCustomPages(DEFAULT_JGT_PAGES);
    setSelectedPages(new Set([0, 1, 2, 3]));
  };

  const saveColumnWidths = async (widths: Record<number, number>) => {
    if (!activeProfile) return;
    setColumnWidths(widths);
    await AsyncStorage.setItem(sheetKey(activeProfile.id, 'col_widths'), JSON.stringify(widths));
  };

  const updateColWidth  = (i: number, w: number) =>
    saveColumnWidths({ ...columnWidths, [i]: Math.max(20, w) });

  const resetColumnWidths = () => saveColumnWidths({ ...DEFAULT_COL_WIDTHS });

  const generatePrintHTML = useCallback(() => {
    const visColIndices = visibleCols;
    const sheetTitle = activeProfile?.fileName || activeProfile?.sheetName || 'Sheet';

    const colgroup = () => {
      let s = `<colgroup><col style="width:30px">`;
      visColIndices.forEach(ci => { s += `<col style="width:${getColWidth(ci)}px">`; });
      return s + `</colgroup>`;
    };
    const thead = () => {
      let s = `<thead><tr><th>#</th>`;
      visColIndices.forEach(ci => { s += `<th>${headers[ci] || COL_LABELS[ci] || ci}</th>`; });
      return s + `</tr></thead>`;
    };

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { margin: 5mm; size: A4 landscape; }
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; padding: 5px; }
  h2 { font-size: 12px; margin: 5px 0; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: avoid; }
  th, td { border: 1px solid #333; padding: 3px 4px; text-align: center; font-size: 8px; }
  th { background: #f0f0f0; font-weight: bold; }
  .page-break { page-break-after: always; }
</style></head><body>`;

    if (isJGTFile) {
      [...selectedPages].sort((a, b) => a - b).forEach((pageIdx, pIdx, arr) => {
        const pg = customPages[pageIdx];
        if (!pg) return;
        html += `<h2>${sheetTitle} – ${pg.name}</h2><table>${colgroup()}${thead()}<tbody>`;
        for (let r = pg.startRow; r <= Math.min(pg.endRow, allData.length - 1); r++) {
          if (hiddenRows.has(r)) continue;
          const row = allData[r];
          if (!row) continue;
          html += `<tr><td>${r}</td>`;
          visColIndices.forEach(ci => { html += `<td>${row[ci] || ''}</td>`; });
          html += `</tr>`;
        }
        html += `</tbody></table>`;
        if (pIdx < arr.length - 1) html += `<div class="page-break"></div>`;
      });
    } else {
      const total = Math.ceil(visibleData.length / ROWS_PER_PAGE);
      for (let p = 0; p < total; p++) {
        const slice = visibleData.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
        html += `<h2>${sheetTitle} – Page ${p + 1}/${total}</h2><table>${colgroup()}${thead()}<tbody>`;
        slice.forEach((row, ri) => {
          html += `<tr><td>${p * ROWS_PER_PAGE + ri + 2}</td>`;
          visColIndices.forEach(ci => { html += `<td>${row[ci] || ''}</td>`; });
          html += `</tr>`;
        });
        html += `</tbody></table>`;
        if (p < total - 1) html += `<div class="page-break"></div>`;
      }
    }

    return html + `</body></html>`;
  }, [visibleCols, visibleData, allData, hiddenRows, headers, isJGTFile,
      selectedPages, activeProfile, columnWidths, customPages]);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const html = generatePrintHTML();
      if (Platform.OS === 'android') {
        const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Print Sheet',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html });
      }
      setShowPrintModal(false);
    } catch (err) {
      Alert.alert('Print Error', err.message || 'Failed to print');
    } finally {
      setIsPrinting(false);
    }
  };

  // ── Loading / Error screens ──────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={st.centerText}>Loading sheet data...</Text>
      </View>
    </SafeAreaView>
  );

  if (error === 'no_profile') return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={st.center}>
        <Ionicons name="document-outline" size={48} color="#5f6368" />
        <Text style={st.centerTitle}>No Sheet Selected</Text>
        <Text style={st.centerSub}>Select a sheet from the Home tab first.</Text>
        <TouchableOpacity style={st.goHomeBtn} onPress={() => router.replace('/(tabs)/home' as any)}>
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
        <TouchableOpacity style={st.retryBtn} onPress={handleRefresh}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <Header
        onBack={() => router.back()}
        title={activeProfile?.displayName || activeProfile?.sheetName || 'Sheet View'}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onPrint={() => setShowPrintModal(true)}
        onColumns={() => setShowColModal(true)}
        hiddenRowCount={hiddenRows.size}
        onShowHidden={() => setShowHiddenModal(true)}
      />

      {/* Status bar */}
      <View style={st.tsBar}>
        <Ionicons name="document-text-outline" size={12} color="#4285F4" />
        <Text style={st.tsSheetName} numberOfLines={1}>
          {activeProfile?.fileName || activeProfile?.sheetName || '—'}
        </Text>
        {lastUpdated && (
          <>
            <Text style={st.tsDot}>·</Text>
            <Ionicons name="time-outline" size={12} color="#9aa0a6" />
            <Text style={st.tsText}>{lastUpdated}</Text>
          </>
        )}
        <Text style={st.tsDot}>·</Text>
        <Text style={st.tsText}>{visibleData.length}r {visibleCols.length}c</Text>
        {hiddenRows.size > 0 && (
          <Text style={st.tsHidden}> · {hiddenRows.size} hidden</Text>
        )}
      </View>

      {/* Table */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={st.vScroll}>

          {/* Header row */}
          <View style={st.tableRow}>
            <View style={[st.cell, st.rowNumCell]}>
              <Text style={st.hdrText}>#</Text>
            </View>
            {visibleCols.map((ci, i) => (
              <View key={i} style={[st.hdrCell, { width: getColWidth(ci) }]}>
                <Text style={st.hdrText} numberOfLines={1}>
                  {headers[ci] || COL_LABELS[ci]}
                </Text>
              </View>
            ))}
            <View style={[st.cell, { width: 40 }]}>
              <Text style={st.hdrText}>Hide</Text>
            </View>
          </View>

          {/* Data rows */}
          {visibleData.map((row, rIdx) => {
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
                {visibleCols.map((ci, cIdx) => (
                  <View key={cIdx} style={[st.cell, { width: getColWidth(ci) }]}>
                    <Text style={st.cellText} numberOfLines={2}>{row[ci] || ''}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={[st.cell, { width: 40 }]}
                  onPress={() => toggleRowHidden(actualIdx)}
                >
                  <Ionicons name="eye-off-outline" size={14} color="#9aa0a6" />
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScrollView>

      {/* ── Column Settings Modal ── */}
      <Modal visible={showColModal} transparent animationType="slide" onRequestClose={() => setShowColModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowColModal(false)}>
          <View style={st.colModal} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Column Visibility</Text>
              <TouchableOpacity onPress={() => setShowColModal(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            <Text style={st.modalHint}>Tap to show / hide columns. Saved per sheet.</Text>
            <ScrollView style={st.colList}>
              {COL_LABELS.slice(0, Math.min(54, allData[0]?.length || 54)).map((label, idx) => (
                <TouchableOpacity key={idx} style={st.colItem} onPress={() => toggleColHidden(idx)}>
                  <Ionicons
                    name={hiddenCols.has(idx) ? 'eye-off' : 'eye'}
                    size={20}
                    color={hiddenCols.has(idx) ? '#EA4335' : '#34A853'}
                  />
                  <Text style={st.colLabel}>Col {label}</Text>
                  <Text style={st.colHeader}>{headers[idx] || '—'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={st.resetColBtn} onPress={resetHiddenCols}>
              <Text style={st.resetColBtnText}>
                {isJGTFile ? 'Reset to Default (Hide B,C,D,J,K,L)' : 'Show All Columns'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Hidden Rows Modal ── */}
      <Modal visible={showHiddenModal} transparent animationType="fade" onRequestClose={() => setShowHiddenModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowHiddenModal(false)}>
          <View style={st.hiddenModal} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Hidden Rows ({hiddenRows.size})</Text>
              <TouchableOpacity onPress={() => setShowHiddenModal(false)}>
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            {hiddenRows.size === 0
              ? <Text style={st.noHiddenText}>No hidden rows</Text>
              : (
                <ScrollView style={st.hiddenList}>
                  {[...hiddenRows].sort((a, b) => a - b).map(ri => (
                    <TouchableOpacity key={ri} style={st.hiddenItem} onPress={() => toggleRowHidden(ri)}>
                      <Text style={st.hiddenItemText}>Row {ri + 1}</Text>
                      <Ionicons name="eye" size={18} color="#34A853" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            }
            <TouchableOpacity style={st.showAllBtn} onPress={showAllRows}>
              <Text style={st.showAllBtnText}>Show All Rows</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Print Modal ── */}
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
                <Text style={st.modalHint}>Select pages to print (JGT). Tap ✏️ to edit ranges.</Text>
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
                          <Text style={st.pageCardRange}>Rows {page.startRow}–{page.endRow}</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => setEditingPage({
                              idx,
                              name: page.name,
                              startRow: String(page.startRow),
                              endRow: String(page.endRow),
                            })}
                          >
                            <Ionicons name="pencil-outline" size={16} color="#FBBC05" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removePageRange(idx)}>
                            <Ionicons name="trash-outline" size={16} color="#EA4335" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>

                  {editingPage && (
                    <View style={st.editPageRow}>
                      <TextInput
                        style={[st.editInput, { flex: 2 }]}
                        value={editingPage.name}
                        onChangeText={v => setEditingPage({ ...editingPage, name: v })}
                        placeholder="Name"
                        placeholderTextColor="#5f6368"
                      />
                      <TextInput
                        style={st.editInput}
                        value={editingPage.startRow}
                        onChangeText={v => setEditingPage({ ...editingPage, startRow: v })}
                        placeholder="Start"
                        placeholderTextColor="#5f6368"
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={st.editInput}
                        value={editingPage.endRow}
                        onChangeText={v => setEditingPage({ ...editingPage, endRow: v })}
                        placeholder="End"
                        placeholderTextColor="#5f6368"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity onPress={saveEditPage} style={st.editSaveBtn}>
                        <Ionicons name="checkmark" size={18} color="#34A853" />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={st.addPageBtn} onPress={addPageRange}>
                    <Ionicons name="add-circle-outline" size={16} color="#4285F4" />
                    <Text style={st.addPageBtnText}>Add Page</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.resetPageBtn} onPress={resetPageRanges}>
                    <Ionicons name="refresh-outline" size={16} color="#9aa0a6" />
                    <Text style={st.resetPageBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={st.modalHint}>
                Will print all visible rows ({visibleData.length} rows) across{' '}
                {Math.ceil(visibleData.length / ROWS_PER_PAGE)} pages.
              </Text>
            )}

            <View style={st.printInfo}>
              <Ionicons name="information-circle" size={18} color="#4285F4" />
              <Text style={st.printInfoText}>
                Hidden columns are excluded from print. Manage via Column Settings.
              </Text>
            </View>

            {/* Column width editor */}
            <TouchableOpacity style={st.widthToggle} onPress={() => setShowWidthEditor(!showWidthEditor)}>
              <Ionicons name={showWidthEditor ? 'chevron-up' : 'chevron-down'} size={16} color="#4285F4" />
              <Text style={st.widthToggleText}>Column Widths (Print)</Text>
            </TouchableOpacity>

            {showWidthEditor && (
              <View style={st.widthGrid}>
                {visibleCols.map(ci => (
                  <View key={ci} style={st.widthItem}>
                    <Text style={st.widthLabel}>{COL_LABELS[ci]}</Text>
                    <TextInput
                      style={st.widthInput}
                      value={String(getColWidth(ci))}
                      onChangeText={v => { const n = parseInt(v) || 0; if (n > 0) updateColWidth(ci, n); }}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                    <Text style={st.widthUnit}>px</Text>
                  </View>
                ))}
                <TouchableOpacity style={st.resetWidthBtn} onPress={resetColumnWidths}>
                  <Ionicons name="refresh-outline" size={14} color="#9aa0a6" />
                  <Text style={st.resetWidthBtnText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[st.printBtn, isPrinting && st.printBtnDisabled]}
              onPress={handlePrint}
              disabled={isPrinting}
            >
              {isPrinting
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Ionicons name="print" size={20} color="#fff" />
                    <Text style={st.printBtnText}>Print / Share PDF</Text>
                  </>
                )
              }
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

// ── Header ───────────────────────────────────────────────────────────────────
interface HeaderProps {
  onBack: () => void;
  title?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onPrint?: () => void;
  onColumns?: () => void;
  hiddenRowCount?: number;
  onShowHidden?: () => void;
}

function Header({
  onBack, title = 'Sheet View', onRefresh, refreshing,
  onPrint, onColumns, hiddenRowCount = 0, onShowHidden,
}: HeaderProps) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={onBack} style={st.backBtn}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={st.headerBtns}>
        {hiddenRowCount > 0 && onShowHidden && (
          <TouchableOpacity style={st.hiddenBadgeBtn} onPress={onShowHidden}>
            <Ionicons name="eye-off" size={14} color="#FA7B17" />
            <Text style={st.hiddenBadgeText}>{hiddenRowCount}</Text>
          </TouchableOpacity>
        )}
        {onColumns && (
          <TouchableOpacity style={st.headerIconBtn} onPress={onColumns}>
            <Ionicons name="options" size={18} color="#9C27B0" />
          </TouchableOpacity>
        )}
        {onPrint && (
          <TouchableOpacity style={st.headerIconBtn} onPress={onPrint}>
            <Ionicons name="print" size={18} color="#34A853" />
          </TouchableOpacity>
        )}
        {onRefresh && (
          <TouchableOpacity style={st.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color="#4285F4" />
              : <Ionicons name="refresh" size={18} color="#4285F4" />
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0f1923' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460', gap: 10 },
  backBtn:          { padding: 4 },
  headerTitle:      { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  headerBtns:       { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerIconBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  hiddenBadgeBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FEF0E6' },
  hiddenBadgeText:  { fontSize: 12, fontWeight: '700', color: '#FA7B17' },
  refreshBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  tsBar:            { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#16213e' },
  tsSheetName:      { fontSize: 10, color: '#4285F4', fontWeight: '600', maxWidth: 140 },
  tsDot:            { fontSize: 10, color: '#3d4a5c' },
  tsText:           { fontSize: 10, color: '#9aa0a6' },
  tsHidden:         { fontSize: 10, color: '#FA7B17', fontWeight: '600' },
  vScroll:          { paddingVertical: 4 },
  tableRow:         { flexDirection: 'row' },
  rowEven:          { backgroundColor: 'rgba(255,255,255,0.02)' },
  rowOdd:           { backgroundColor: 'rgba(255,255,255,0.05)' },
  cell:             { height: 32, justifyContent: 'center', paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: '#1e3a5f', borderBottomWidth: 0.5, borderBottomColor: '#1e3a5f' },
  rowNumCell:       { width: ROW_NUM_W, backgroundColor: 'rgba(15,52,96,0.5)' },
  hdrCell:          { height: 34, justifyContent: 'center', paddingHorizontal: 4, backgroundColor: '#0f3460', borderRightWidth: 0.5, borderRightColor: '#1e3a5f', borderBottomWidth: 1.5, borderBottomColor: '#4285F4' },
  hdrText:          { fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'center' },
  rowNumText:       { fontSize: 8, color: '#5f6368', textAlign: 'center' },
  cellText:         { fontSize: 9, color: '#d0d0d0', textAlign: 'center' },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle:      { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 12 },
  centerText:       { fontSize: 13, color: '#9aa0a6', marginTop: 10 },
  centerSub:        { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  goHomeBtn:        { marginTop: 18, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  goHomeBtnText:    { fontSize: 14, fontWeight: '600', color: '#fff' },
  retryBtn:         { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  retryBtnText:     { fontSize: 14, fontWeight: '600', color: '#fff' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  colModal:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  hiddenModal:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '50%' },
  printModal:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:       { fontSize: 18, fontWeight: '700', color: '#202124' },
  modalHint:        { fontSize: 12, color: '#5f6368', marginBottom: 12 },
  colList:          { maxHeight: 300 },
  colItem:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12 },
  colLabel:         { fontSize: 14, fontWeight: '600', color: '#202124', width: 52 },
  colHeader:        { flex: 1, fontSize: 12, color: '#5f6368' },
  resetColBtn:      { marginTop: 12, backgroundColor: '#E8F0FE', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  resetColBtnText:  { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  hiddenList:       { maxHeight: 200 },
  hiddenItem:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  hiddenItemText:   { fontSize: 14, color: '#202124' },
  noHiddenText:     { fontSize: 14, color: '#5f6368', textAlign: 'center', paddingVertical: 20 },
  showAllBtn:       { marginTop: 12, backgroundColor: '#34A853', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  showAllBtnText:   { fontSize: 14, fontWeight: '600', color: '#fff' },
  pageGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  pageCard:         { width: '47%', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageCardSelected: { borderColor: '#4285F4', backgroundColor: '#E8F0FE' },
  pageCardTitle:    { fontSize: 13, fontWeight: '700', color: '#202124' },
  pageCardRange:    { fontSize: 11, color: '#5f6368', marginTop: 2 },
  editPageRow:      { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center', padding: 8, backgroundColor: '#f0f4ff', borderRadius: 8 },
  editInput:        { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#202124' },
  editSaveBtn:      { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E6F4EA', justifyContent: 'center', alignItems: 'center' },
  addPageBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#E8F0FE', borderWidth: 1, borderColor: '#4285F4' },
  addPageBtnText:   { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  resetPageBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0' },
  resetPageBtnText: { fontSize: 13, fontWeight: '500', color: '#9aa0a6' },
  printInfo:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E8F0FE', padding: 12, borderRadius: 10, marginBottom: 16, marginTop: 12 },
  printInfoText:    { flex: 1, fontSize: 12, color: '#4285F4', lineHeight: 18 },
  printBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#34A853', paddingVertical: 14, borderRadius: 12 },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },
  printNote:        { fontSize: 11, color: '#5f6368', textAlign: 'center', marginTop: 12, lineHeight: 16 },
  widthToggle:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  widthToggleText:  { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  widthGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  widthItem:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  widthLabel:       { fontSize: 12, fontWeight: '600', color: '#202124', width: 28 },
  widthInput:       { width: 48, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: '#202124', textAlign: 'center' },
  widthUnit:        { fontSize: 11, color: '#5f6368' },
  resetWidthBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#f8f9fa' },
  resetWidthBtnText:{ fontSize: 12, color: '#9aa0a6' },
});