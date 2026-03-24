import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Modal, ActivityIndicator, Alert, TextInput, FlatList
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

interface RackEntry { size: string; stock: number; rateDiff: number; }
interface LayoutSection { name: string; rows: string[][]; }
interface LayoutVersion {
  layout_id: string; session_id: string; name: string;
  layout_type: string; sections: LayoutSection[];
  created_at: string | null; updated_at: string | null;
}

// Default grid definitions
const DEFAULT_JGT: LayoutSection[] = [
  { name: 'R Section', rows: [
    ['R1.1','R2.1','R3.1','R4.1','R5.1','R6.1','R7.1','Others'],
    ['R1.2','R2.2','R3.2','R4.2','R5.2','R6.2','R7.2'],
    ['R1.3','R2.3','R3.3','R4.3','R5.3','R6.3','R7.3'],
  ]},
  { name: 'L Section', rows: [
    ['L1.1','L2.1','Gap','L3.1','L4.1','L5.1','L6.1','L7.1','L8.1'],
    ['L1.2','L2.2','','L3.2','L4.2','L5.2','L6.2','L7.2','L8.2'],
  ]},
  { name: 'F Section', rows: [
    ['F1.1','F2.1','F3.1','F4.1'],
    ['F1.2','F2.2','F3.2','F4.2'],
  ]},
  { name: 'O Section', rows: [
    ['O1.1','O2.1','O3.1','O4.1','O5.1','O6.1','Gap','O7.1','O8.1','O9.1','O10.1'],
    ['O1.2','O2.2','O3.2','O4.2','O5.2','O6.2','','O7.2','O8.2','O9.2','O10.2'],
  ]},
];

const DEFAULT_JGI: LayoutSection[] = [
  { name: '', rows: [
    ['LA1.1','LA1.2','LA1.3','LA1.4','LA1.5','LA1.6','LA1.7','LA1.8','LA1.9','LA1.10','LA1.11','LA1.12'],
    ['LA2.1','LA2.2','LA2.3','LA2.4','LA2.5','LA2.6','LA2.7','LA2.8','LA2.9','LA2.10','LA2.11','LA2.12','LA2.13'],
    ['','','','','','S1','','','','','','',''],
    ['LA3.1','LA3.2','LA3.3','LA3.4','LA3.5','LA3.6','LA3.7','LA3.8','LA3.9','LA3.10','LA3.11','LA3.12','LA3.13'],
    ['LA4.1','LA4.2','LA4.3','','','','LA5.1','LA5.2','LA5.3'],
  ]},
  { name: '', rows: [['Office Side','','','','','','','','','','','','Gate Side']] },
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

  // Version management state
  const [savedVersions, setSavedVersions] = useState<LayoutVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null); // null = default
  const [customSections, setCustomSections] = useState<{ jgt: LayoutSection[] | null; jgi: LayoutSection[] | null }>({ jgt: null, jgi: null });
  const [showVersionPanel, setShowVersionPanel] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editSections, setEditSections] = useState<LayoutSection[]>([]);
  const [editCellModal, setEditCellModal] = useState<{ sIdx: number; rIdx: number; cIdx: number } | null>(null);
  const [editCellText, setEditCellText] = useState('');
  const [saveNameModal, setSaveNameModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Rack search state
  const [searchQuery, setSearchQuery] = useState('');
  const [compactMode, setCompactMode] = useState(true);

  useFocusEffect(useCallback(() => { loadProfiles(); }, []));

  const loadProfiles = async () => {
    const stored = await AsyncStorage.getItem('sheet_library');
    if (stored) {
      const library: SheetProfile[] = JSON.parse(stored);
      setSheetLibrary(library);
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
      if (jgt?.data) setJgtRackMap(parseSheetData(jgt.data, jgt.range));
      if (jgi?.data) setJgiRackMap(parseSheetData(jgi.data, jgi.range));
    }
    // Load saved versions
    const sessionId = await AsyncStorage.getItem('session_id');
    if (sessionId) {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/layouts/list?session_id=${sessionId}`);
        setSavedVersions(res.data.layouts || []);
      } catch (e) { /* ignore */ }
    }
  };

  const parseSheetData = (rows: string[][], range: string): Map<string, RackEntry[]> => {
    const offset = getColOffset(range);
    const colB = 1 - offset, colE = 4 - offset, colI = 8 - offset, colJ = 9 - offset;
    const map = new Map<string, RackEntry[]>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rackID = (row[colB] ?? '').toString().trim();
      if (!rackID) continue;
      const rackKey = rackID.toUpperCase();
      const entry: RackEntry = {
        size: (row[colE] ?? '').toString().trim(),
        stock: parseFloat((row[colI] ?? '0').toString().replace(/[^\d.-]/g, '')) || 0,
        rateDiff: parseFloat((row[colJ] ?? '0').toString().replace(/[^\d.-]/g, '')) || 0,
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
      if (!sessionId) { Alert.alert('Session Expired', 'Please login again'); return; }
      const res = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${profile.fileId}&sheet_name=${encodeURIComponent(profile.sheetName)}&cell_range=${encodeURIComponent(profile.range)}&_t=${Date.now()}`
      );
      const rows: string[][] = res.data.data || [];
      updateSheetProfile(profile.id, { data: rows, rowCount: res.data.row_count, colCount: res.data.col_count, lastRefreshed: Date.now() });
      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
      const newMap = parseSheetData(rows, profile.range);
      if (type === 'jgt') { setJgtRackMap(newMap); setJgtProfile({ ...profile, data: rows }); }
      else { setJgiRackMap(newMap); setJgiProfile({ ...profile, data: rows }); }
      Alert.alert('Refreshed!', `${type.toUpperCase()} data updated`);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to refresh');
    } finally { setLoading(false); }
  };

  const isSearchMatch = (rackID: string) => {
    if (!searchQuery.trim()) return true; // Show all if no search
    const q = searchQuery.trim().toLowerCase();
    // Search by SIZE - check if any item in this rack contains the search term
    const entries = getRackEntries(rackID, currentMap);
    return entries.some(e => e.size.toLowerCase().includes(q));
  };

  // Get first 8 characters of size names for display
  const getShortNames = (rackID: string): string[] => {
    const entries = getRackEntries(rackID, currentMap);
    if (entries.length === 0) return [];
    // Show first 8 characters of each size (not abbreviated)
    return entries.map(e => {
      const size = e.size.trim();
      // Extract the part before any parenthesis, then take first 8 chars
      const beforeParen = size.split('(')[0].trim();
      return beforeParen.substring(0, 8);
    }).filter(s => s.length > 0);
  };

  // Rack lookup
  const getRackEntries = (rackID: string, map: Map<string, RackEntry[]>): RackEntry[] => {
    const key = rackID.replace(/\(.*\)/g, '').trim().toUpperCase();
    let result = map.get(key);
    if (result?.length) return result;
    const key2 = key.replace(/\.$/, '');
    result = map.get(key2);
    if (result?.length) return result;
    for (const [k, v] of map.entries()) {
      if (k.trim() === key || k.trim() === key2) return v;
    }
    return [];
  };

  const totalStock = (entries: RackEntry[]) => entries.reduce((s, e) => s + e.stock, 0);
  const stockColor = (stock: number) => {
    if (stock === 0) return '#FFCDD2';
    if (stock < 1000) return '#FFE0B2';
    return '#C8E6C9';
  };
  const handleRackTap = (rackID: string) => {
    if (editMode) return; // Don't show details in edit mode
    const map = activeTab === 'jgt' ? jgtRackMap : jgiRackMap;
    setSelectedRack(rackID);
    setSelectedEntries(getRackEntries(rackID, map));
  };

  // Get current sections (custom version or default)
  const getCurrentSections = (): LayoutSection[] => {
    const custom = activeTab === 'jgt' ? customSections.jgt : customSections.jgi;
    if (custom) return custom;
    return activeTab === 'jgt' ? DEFAULT_JGT : DEFAULT_JGI;
  };

  // ─── Version management ────────────────────────────────────────────────
  const loadVersion = async (version: LayoutVersion) => {
    const type = version.layout_type as 'jgt' | 'jgi';
    setCustomSections(prev => ({ ...prev, [type]: version.sections }));
    setActiveVersionId(version.layout_id);
    setActiveTab(type);
    setShowVersionPanel(false);
  };

  const loadDefault = () => {
    setCustomSections(prev => ({ ...prev, [activeTab]: null }));
    setActiveVersionId(null);
    setShowVersionPanel(false);
  };

  const deleteVersion = async (layoutId: string) => {
    Alert.alert('Delete Version', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await axios.delete(`${BACKEND_URL}/api/layouts/${layoutId}`);
          setSavedVersions(prev => prev.filter(v => v.layout_id !== layoutId));
          if (activeVersionId === layoutId) {
            setCustomSections(prev => ({ ...prev, [activeTab]: null }));
            setActiveVersionId(null);
          }
        } catch (e) { Alert.alert('Error', 'Failed to delete'); }
      }}
    ]);
  };

  // ─── Edit mode ─────────────────────────────────────────────────────────
  const enterEditMode = () => {
    const sections = getCurrentSections();
    // Deep clone
    setEditSections(JSON.parse(JSON.stringify(sections)));
    setEditMode(true);
  };

  const exitEditMode = () => { setEditMode(false); setEditSections([]); };

  const openCellEditor = (sIdx: number, rIdx: number, cIdx: number) => {
    setEditCellText(editSections[sIdx].rows[rIdx][cIdx]);
    setEditCellModal({ sIdx, rIdx, cIdx });
  };

  const saveCellEdit = () => {
    if (!editCellModal) return;
    const { sIdx, rIdx, cIdx } = editCellModal;
    const updated = [...editSections];
    updated[sIdx] = { ...updated[sIdx], rows: [...updated[sIdx].rows] };
    updated[sIdx].rows[rIdx] = [...updated[sIdx].rows[rIdx]];
    updated[sIdx].rows[rIdx][cIdx] = editCellText.trim();
    setEditSections(updated);
    setEditCellModal(null);
  };

  const addRowToSection = (sIdx: number) => {
    const updated = [...editSections];
    const lastRow = updated[sIdx].rows[updated[sIdx].rows.length - 1];
    const newRow = lastRow.map(() => '');
    updated[sIdx] = { ...updated[sIdx], rows: [...updated[sIdx].rows, newRow] };
    setEditSections(updated);
  };

  const removeRowFromSection = (sIdx: number) => {
    const updated = [...editSections];
    if (updated[sIdx].rows.length <= 1) return;
    updated[sIdx] = { ...updated[sIdx], rows: updated[sIdx].rows.slice(0, -1) };
    setEditSections(updated);
  };

  const addCellToRow = (sIdx: number, rIdx: number) => {
    const updated = [...editSections];
    updated[sIdx] = { ...updated[sIdx], rows: [...updated[sIdx].rows] };
    updated[sIdx].rows[rIdx] = [...updated[sIdx].rows[rIdx], ''];
    setEditSections(updated);
  };

  const removeCellFromRow = (sIdx: number, rIdx: number) => {
    const updated = [...editSections];
    if (updated[sIdx].rows[rIdx].length <= 1) return;
    updated[sIdx] = { ...updated[sIdx], rows: [...updated[sIdx].rows] };
    updated[sIdx].rows[rIdx] = updated[sIdx].rows[rIdx].slice(0, -1);
    setEditSections(updated);
  };

  const addSection = () => {
    setEditSections([...editSections, { name: 'New Section', rows: [['', '']] }]);
  };

  const removeSection = (sIdx: number) => {
    if (editSections.length <= 1) return;
    setEditSections(editSections.filter((_, i) => i !== sIdx));
  };

  const editSectionName = (sIdx: number, name: string) => {
    const updated = [...editSections];
    updated[sIdx] = { ...updated[sIdx], name };
    setEditSections(updated);
  };

  const openSaveDialog = () => {
    setSaveName(`${activeTab.toUpperCase()} - Custom ${new Date().toLocaleDateString()}`);
    setSaveNameModal(true);
  };

  const saveVersion = async () => {
    if (!saveName.trim()) return;
    const sessionId = await AsyncStorage.getItem('session_id');
    if (!sessionId) { Alert.alert('Error', 'No session'); return; }
    try {
      setLoading(true);
      if (activeVersionId) {
        // Update existing
        await axios.put(`${BACKEND_URL}/api/layouts/${activeVersionId}`, {
          name: saveName.trim(),
          sections: editSections,
        });
        setSavedVersions(prev => prev.map(v =>
          v.layout_id === activeVersionId ? { ...v, name: saveName.trim(), sections: editSections } : v
        ));
      } else {
        // Create new
        const res = await axios.post(`${BACKEND_URL}/api/layouts/save`, {
          session_id: sessionId,
          name: saveName.trim(),
          layout_type: activeTab,
          sections: editSections,
        });
        const newVersion: LayoutVersion = {
          layout_id: res.data.layout_id,
          session_id: sessionId,
          name: saveName.trim(),
          layout_type: activeTab,
          sections: editSections,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setSavedVersions(prev => [newVersion, ...prev]);
        setActiveVersionId(res.data.layout_id);
      }
      setCustomSections(prev => ({ ...prev, [activeTab]: editSections }));
      setEditMode(false);
      setSaveNameModal(false);
      Alert.alert('Saved!', `Layout "${saveName.trim()}" saved`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save');
    } finally { setLoading(false); }
  };

  // Apply edits without saving (just view changes)
  const applyEditsLocally = () => {
    setCustomSections(prev => ({ ...prev, [activeTab]: editSections }));
    setEditMode(false);
  };

  // ─── Render helpers ────────────────────────────────────────────────────
  const currentProfile = activeTab === 'jgt' ? jgtProfile : jgiProfile;
  const currentMap = activeTab === 'jgt' ? jgtRackMap : jgiRackMap;
  const currentSections = editMode ? editSections : getCurrentSections();
  const hasData = currentProfile?.data && currentMap.size > 0;

  const renderCell = (text: string, idx: number, sIdx?: number, rIdx?: number) => {
    if (!text) {
      if (editMode && sIdx !== undefined && rIdx !== undefined) {
        return (
          <TouchableOpacity key={idx} style={[s.emptyCell, s.editableEmpty]} onPress={() => openCellEditor(sIdx, rIdx, idx)}>
            <Ionicons name="add" size={14} color="#9aa0a6" />
          </TouchableOpacity>
        );
      }
      return <View key={idx} style={s.emptyCell} />;
    }
    if (text === 'Gap') return <View key={idx} style={s.gapCell}><Text style={s.gapText}>Gap</Text></View>;
    if (text === 'Office Side' || text === 'Gate Side')
      return <View key={idx} style={s.labelCell}><Text style={s.labelText}>{text}</Text></View>;

    if (editMode && sIdx !== undefined && rIdx !== undefined) {
      return (
        <TouchableOpacity key={idx} style={[s.rackCell, { backgroundColor: '#E3F2FD', borderColor: '#4285F4', borderStyle: 'dashed' as any }]}
          onPress={() => openCellEditor(sIdx, rIdx, idx)}>
          <Text style={s.rackCode}>{text}</Text>
          <Ionicons name="pencil" size={8} color="#4285F4" style={{ position: 'absolute', top: 2, right: 2 }} />
        </TouchableOpacity>
      );
    }

    const entries = getRackEntries(text, currentMap);
    const stock = totalStock(entries);
    const bg = entries.length > 0 ? stockColor(stock) : '#E8E8E8';
    const matched = isSearchMatch(text);
    const shortNames = compactMode ? getShortNames(text) : [];
    
    // If searching and this rack doesn't match, hide it (show empty space)
    if (searchQuery.trim() && !matched) {
      return <View key={idx} style={[s.rackCell, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'transparent' }]}>
        <Text style={[s.rackCode, { color: '#3a3a3a', fontSize: 8 }]}>{text}</Text>
      </View>;
    }
    
    return (
      <TouchableOpacity key={idx} style={[s.rackCell, { backgroundColor: bg }, matched && searchQuery.trim() && s.rackCellHighlight]}
        onPress={() => handleRackTap(text)} activeOpacity={0.7} data-testid={`rack-cell-${text}`}>
        <Text style={s.rackCode}>{text}</Text>
        {compactMode && shortNames.length > 0 && (
          <View style={s.shortNamesBox}>
            {shortNames.slice(0, 2).map((sn, i) => (
              <Text key={i} style={s.shortNameText} numberOfLines={1}>{sn}</Text>
            ))}
            {shortNames.length > 2 && <Text style={s.shortNameMore}>+{shortNames.length - 2}</Text>}
          </View>
        )}
        {entries.length > 1 && !compactMode && (
          <View style={s.multiDot}><Text style={s.multiDotText}>{entries.length}</Text></View>
        )}
      </TouchableOpacity>
    );
  };

  const activeVersionName = activeVersionId
    ? savedVersions.find(v => v.layout_id === activeVersionId)?.name || 'Custom'
    : 'Default';

  const versionsForTab = savedVersions.filter(v => v.layout_type === activeTab);

  // ─── No profile saved ─────────────────────────────────────────────────
  if (!jgtProfile && !jgiProfile) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Warehouse Layout</Text></View>
        <View style={s.center}>
          <Ionicons name="grid-outline" size={56} color="#5f6368" />
          <Text style={s.centerTitle}>No Layout Sheets</Text>
          <Text style={s.centerSub}>Save Inventory_Chart_JGT and Inventory Chart_JGI{'\n'}sheets from Home tab to view layouts.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Warehouse Layout</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!editMode && currentProfile && (
            <TouchableOpacity style={s.headerBtn} onPress={() => refreshData(activeTab)} disabled={loading} data-testid="layout-refresh-btn">
              {loading ? <ActivityIndicator size="small" color="#4285F4" /> : <Ionicons name="refresh" size={18} color="#4285F4" />}
            </TouchableOpacity>
          )}
          {!editMode && (
            <TouchableOpacity style={s.headerBtn} onPress={() => setShowVersionPanel(true)} data-testid="versions-btn">
              <Ionicons name="albums" size={18} color="#9C27B0" />
            </TouchableOpacity>
          )}
          {!editMode ? (
            <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#FEF0E6' }]} onPress={enterEditMode} data-testid="edit-layout-btn">
              <Ionicons name="create" size={18} color="#FA7B17" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#FFCDD2' }]} onPress={exitEditMode}>
              <Ionicons name="close" size={18} color="#EA4335" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tab, activeTab === 'jgt' && s.tabActive]}
          onPress={() => { setActiveTab('jgt'); if (editMode) exitEditMode(); }} data-testid="tab-jgt">
          <Text style={[s.tabText, activeTab === 'jgt' && s.tabTextActive]}>JGT</Text>
          {!jgtProfile && <Text style={s.tabMissing}>Not saved</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'jgi' && s.tabActive]}
          onPress={() => { setActiveTab('jgi'); if (editMode) exitEditMode(); }} data-testid="tab-jgi">
          <Text style={[s.tabText, activeTab === 'jgi' && s.tabTextActive]}>JGI</Text>
          {!jgiProfile && <Text style={s.tabMissing}>Not saved</Text>}
        </TouchableOpacity>
      </View>

      {/* Version indicator */}
      <View style={s.versionBar}>
        <Ionicons name="git-branch" size={14} color="#9C27B0" />
        <Text style={s.versionText}>{activeVersionName}</Text>
        {editMode && <View style={s.editBadge}><Text style={s.editBadgeText}>EDITING</Text></View>}
      </View>

      {/* Search Bar */}
      {!editMode && (
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color="#9aa0a6" />
          <TextInput
            style={s.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by size (e.g. 72X72)"
            placeholderTextColor="#5f6368"
            data-testid="size-search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9aa0a6" />
            </TouchableOpacity>
          )}
          <View style={s.searchDivider} />
          <TouchableOpacity onPress={() => refreshData(activeTab)} style={s.searchRefreshBtn} data-testid="search-refresh-btn">
            <Ionicons name="refresh" size={16} color="#34A853" />
          </TouchableOpacity>
          <View style={s.searchDivider} />
          <TouchableOpacity onPress={() => setCompactMode(!compactMode)} style={s.compactToggle}>
            <Ionicons name={compactMode ? 'list' : 'apps'} size={16} color={compactMode ? '#4285F4' : '#9aa0a6'} />
            <Text style={[s.compactToggleText, compactMode && { color: '#4285F4' }]}>{compactMode ? 'Compact' : 'Detail'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend (only in view mode) */}
      {!editMode && (
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#C8E6C9' }]} /><Text style={s.legendLabel}>&gt;1000kg</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#FFE0B2' }]} /><Text style={s.legendLabel}>Low</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#FFCDD2' }]} /><Text style={s.legendLabel}>Empty</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#E8E8E8' }]} /><Text style={s.legendLabel}>No Data</Text></View>
        </View>
      )}

      {/* Content */}
      {!currentProfile && !editMode ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#FA7B17" />
          <Text style={s.centerTitle}>{activeTab.toUpperCase()} Sheet Not Saved</Text>
          <Text style={s.centerSub}>Save Inventory_{activeTab === 'jgt' ? 'Chart_JGT' : 'Chart_JGI'} from Home tab.</Text>
        </View>
      ) : !hasData && !editMode ? (
        <View style={s.center}>
          <TouchableOpacity style={s.loadBtn} onPress={() => refreshData(activeTab)} disabled={loading} data-testid="load-data-btn">
            {loading ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="cloud-download" size={24} color="#fff" /><Text style={s.loadBtnText}>Load Data</Text></>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.hScroll}>
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={s.vScroll}>
            {!editMode && (
              <View style={s.layoutTitleBar}>
                <Text style={s.layoutTitle}>
                  {activeTab === 'jgt' ? 'JGT Visual Inventory Layout' : 'JGI Visual Inventory Layout'}
                </Text>
              </View>
            )}

            {currentSections.map((section, sIdx) => (
              <View key={sIdx} style={s.section}>
                {editMode ? (
                  <View style={s.sectionEditHeader}>
                    <TextInput style={s.sectionNameInput} value={section.name} onChangeText={(t) => editSectionName(sIdx, t)} placeholder="Section Name" placeholderTextColor="#9aa0a6" />
                    <TouchableOpacity onPress={() => addRowToSection(sIdx)} style={s.sectionEditBtn}><Ionicons name="add" size={16} color="#34A853" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => removeRowFromSection(sIdx)} style={s.sectionEditBtn}><Ionicons name="remove" size={16} color="#EA4335" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSection(sIdx)} style={s.sectionEditBtn}><Ionicons name="trash" size={14} color="#EA4335" /></TouchableOpacity>
                  </View>
                ) : section.name ? (
                  <Text style={s.sectionName}>{section.name}</Text>
                ) : null}

                {section.rows.map((row, rIdx) => (
                  <View key={rIdx} style={s.row}>
                    {row.map((cell, cIdx) => renderCell(cell, cIdx, sIdx, rIdx))}
                    {editMode && (
                      <View style={{ flexDirection: 'row', marginLeft: 2 }}>
                        <TouchableOpacity onPress={() => addCellToRow(sIdx, rIdx)} style={s.rowEditBtn}><Ionicons name="add-circle" size={16} color="#34A853" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => removeCellFromRow(sIdx, rIdx)} style={s.rowEditBtn}><Ionicons name="remove-circle" size={16} color="#EA4335" /></TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
                {sIdx < currentSections.length - 1 && <View style={s.divider} />}
              </View>
            ))}

            {editMode && (
              <TouchableOpacity style={s.addSectionBtn} onPress={addSection}>
                <Ionicons name="add-circle" size={20} color="#4285F4" />
                <Text style={s.addSectionText}>Add Section</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </ScrollView>
      )}

      {/* Edit mode bottom bar */}
      {editMode && (
        <View style={s.editBottomBar}>
          <TouchableOpacity style={s.editApplyBtn} onPress={applyEditsLocally}>
            <Ionicons name="eye" size={18} color="#4285F4" />
            <Text style={s.editApplyText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.editSaveBtn} onPress={openSaveDialog}>
            <Ionicons name="save" size={18} color="#fff" />
            <Text style={s.editSaveText}>Save Version</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Version Panel Modal */}
      <Modal visible={showVersionPanel} transparent animationType="slide" onRequestClose={() => setShowVersionPanel(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowVersionPanel(false)}>
          <View style={s.versionPanel} onStartShouldSetResponder={() => true}>
            <View style={s.versionPanelHeader}>
              <Text style={s.versionPanelTitle}>Layout Versions</Text>
              <TouchableOpacity onPress={() => setShowVersionPanel(false)}><Ionicons name="close" size={24} color="#5f6368" /></TouchableOpacity>
            </View>
            
            {/* Default option */}
            <TouchableOpacity style={[s.versionItem, !activeVersionId && s.versionItemActive]} onPress={loadDefault}>
              <Ionicons name="cube" size={18} color={!activeVersionId ? '#4285F4' : '#9aa0a6'} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.versionItemName, !activeVersionId && { color: '#4285F4' }]}>Default</Text>
                <Text style={s.versionItemMeta}>Original hardcoded layout</Text>
              </View>
              {!activeVersionId && <Ionicons name="checkmark-circle" size={20} color="#4285F4" />}
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300 }}>
              {versionsForTab.length === 0 ? (
                <Text style={s.noVersionsText}>No custom versions for {activeTab.toUpperCase()}</Text>
              ) : versionsForTab.map(v => (
                <TouchableOpacity key={v.layout_id} style={[s.versionItem, activeVersionId === v.layout_id && s.versionItemActive]}
                  onPress={() => loadVersion(v)}>
                  <Ionicons name="git-branch" size={18} color={activeVersionId === v.layout_id ? '#9C27B0' : '#9aa0a6'} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.versionItemName, activeVersionId === v.layout_id && { color: '#9C27B0' }]}>{v.name}</Text>
                    <Text style={s.versionItemMeta}>{v.updated_at ? new Date(v.updated_at).toLocaleDateString() : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteVersion(v.layout_id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={18} color="#EA4335" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cell Edit Modal */}
      <Modal visible={editCellModal !== null} transparent animationType="fade" onRequestClose={() => setEditCellModal(null)}>
        <View style={s.modalBg}>
          <View style={s.cellEditModal}>
            <Text style={s.cellEditTitle}>Edit Rack ID</Text>
            <TextInput style={s.cellEditInput} value={editCellText} onChangeText={setEditCellText} placeholder="Rack ID (e.g., R1.1)" autoFocus autoCapitalize="characters" />
            <Text style={s.cellEditHint}>Leave empty for blank cell, "Gap" for gap</Text>
            <View style={s.cellEditBtns}>
              <TouchableOpacity style={s.cellEditCancel} onPress={() => setEditCellModal(null)}>
                <Text style={s.cellEditCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cellEditSave} onPress={saveCellEdit}>
                <Text style={s.cellEditSaveText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Name Modal */}
      <Modal visible={saveNameModal} transparent animationType="fade" onRequestClose={() => setSaveNameModal(false)}>
        <View style={s.modalBg}>
          <View style={s.cellEditModal}>
            <Text style={s.cellEditTitle}>Save Layout Version</Text>
            <TextInput style={s.cellEditInput} value={saveName} onChangeText={setSaveName} placeholder="Version name" autoFocus />
            <View style={s.cellEditBtns}>
              <TouchableOpacity style={s.cellEditCancel} onPress={() => setSaveNameModal(false)}>
                <Text style={s.cellEditCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cellEditSave} onPress={saveVersion} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.cellEditSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rack Detail Modal */}
      <Modal visible={selectedRack !== null} transparent animationType="fade" onRequestClose={() => setSelectedRack(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setSelectedRack(null)}>
          <View style={s.modal}>
            {selectedRack && (
              <>
                <View style={s.modalHeader}>
                  <View style={s.rackBadge}>
                    <Ionicons name="location" size={16} color="#fff" />
                    <Text style={s.rackBadgeText}>{selectedRack}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRack(null)}><Ionicons name="close" size={24} color="#5f6368" /></TouchableOpacity>
                </View>
                {selectedEntries.length === 0 ? (
                  <View style={s.emptyRack}><Ionicons name="cube-outline" size={40} color="#9aa0a6" /><Text style={s.emptyRackTitle}>Empty Rack</Text></View>
                ) : selectedEntries.length === 1 ? (
                  <View style={s.singleEntry}>
                    <DetailRow label="Size" value={selectedEntries[0].size || 'N/A'} />
                    <DetailRow label="Stock" value={`${selectedEntries[0].stock.toLocaleString('en-IN')} kg`} color={selectedEntries[0].stock > 0 ? '#34A853' : '#EA4335'} />
                    <DetailRow label="Rate Diff" value={`${selectedEntries[0].rateDiff >= 0 ? '+' : ''}${selectedEntries[0].rateDiff}`} color={selectedEntries[0].rateDiff >= 0 ? '#34A853' : '#EA4335'} />
                  </View>
                ) : (
                  <ScrollView style={s.multiList}>
                    {selectedEntries.map((e, i) => (
                      <View key={i} style={s.multiItem}>
                        <View style={s.multiItemRow}>
                          <Text style={s.multiSize}>{e.size || 'Unknown'}</Text>
                          <Text style={[s.multiStock, { color: e.stock > 0 ? '#34A853' : '#EA4335' }]}>{e.stock.toLocaleString('en-IN')} kg</Text>
                        </View>
                        <Text style={[s.multiDiff, { color: e.rateDiff >= 0 ? '#34A853' : '#EA4335' }]}>Rate Diff: {e.rateDiff >= 0 ? '+' : ''}{e.rateDiff}</Text>
                      </View>
                    ))}
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Total Stock</Text>
                      <Text style={s.totalValue}>{totalStock(selectedEntries).toLocaleString('en-IN')} kg</Text>
                    </View>
                  </ScrollView>
                )}
                <View style={[s.stockBar, { backgroundColor: stockColor(totalStock(selectedEntries)) }]}>
                  <Ionicons name={totalStock(selectedEntries) > 1000 ? 'checkmark-circle' : totalStock(selectedEntries) > 0 ? 'alert-circle' : 'close-circle'} size={20}
                    color={totalStock(selectedEntries) > 1000 ? '#34A853' : totalStock(selectedEntries) > 0 ? '#FA7B17' : '#EA4335'} />
                  <Text style={s.stockBarText}>{totalStock(selectedEntries) > 1000 ? 'In Stock' : totalStock(selectedEntries) > 0 ? 'Low Stock' : 'Empty'}</Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const CW = 66, CH = 46;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: '#16213e', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, marginHorizontal: 4, backgroundColor: '#0f3460' },
  tabActive: { backgroundColor: '#4285F4' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9aa0a6' },
  tabTextActive: { color: '#fff' },
  tabMissing: { fontSize: 9, color: '#EA4335', marginTop: 2 },
  // Version bar
  versionBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 6, backgroundColor: '#16213e' },
  versionText: { fontSize: 12, color: '#9aa0a6', fontWeight: '500' },
  editBadge: { backgroundColor: '#FA7B17', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  editBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  // Search bar
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#16213e', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#0f3460', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#fff' },
  searchDivider: { width: 1, height: 20, backgroundColor: '#0f3460' },
  searchRefreshBtn: { padding: 6 },
  compactToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0f3460' },
  compactToggleText: { fontSize: 10, fontWeight: '600', color: '#9aa0a6' },
  // Legend
  legend: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, gap: 14, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 10, color: '#9aa0a6' },
  // Center states
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 16 },
  centerSub: { fontSize: 13, color: '#9aa0a6', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  loadBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  loadBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  // Grid
  hScroll: { paddingHorizontal: 12 },
  vScroll: { paddingVertical: 12 },
  layoutTitleBar: { backgroundColor: '#0f3460', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginBottom: 14, alignSelf: 'flex-start' },
  layoutTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  section: { marginBottom: 8 },
  sectionName: { fontSize: 11, fontWeight: '600', color: '#4285F4', marginBottom: 6, marginLeft: 4 },
  divider: { height: 12 },
  row: { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  emptyCell: { width: CW, height: CH, marginRight: 3 },
  editableEmpty: { borderWidth: 1, borderColor: '#0f3460', borderStyle: 'dashed', borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  gapCell: { width: CW, height: CH, marginRight: 3, justifyContent: 'center', alignItems: 'center' },
  gapText: { fontSize: 9, color: '#5f6368', fontStyle: 'italic' },
  labelCell: { minWidth: CW, height: CH, marginRight: 3, backgroundColor: '#F3E5F5', borderRadius: 5, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  labelText: { fontSize: 9, fontWeight: '600', color: '#7B1FA2' },
  rackCell: { width: CW, height: CH, marginRight: 3, borderRadius: 5, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  rackCode: { fontSize: 10, fontWeight: '700', color: '#202124' },
  shortNamesBox: { marginTop: 1 },
  shortNameText: { fontSize: 7, color: '#5f6368', fontWeight: '500', lineHeight: 9 },
  shortNameMore: { fontSize: 6, color: '#4285F4', fontWeight: '700' },
  rackCellHighlight: { borderColor: '#FA7B17', borderWidth: 2 },
  multiDot: { position: 'absolute', top: 2, right: 2, backgroundColor: '#4285F4', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  multiDotText: { fontSize: 7, fontWeight: '700', color: '#fff' },
  // Edit mode
  sectionEditHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  sectionNameInput: { flex: 1, backgroundColor: '#0f3460', color: '#fff', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  sectionEditBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  rowEditBtn: { width: 22, height: CH, justifyContent: 'center', alignItems: 'center' },
  addSectionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, marginTop: 8, backgroundColor: '#0f3460', borderRadius: 8, alignSelf: 'flex-start' },
  addSectionText: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  // Edit bottom bar
  editBottomBar: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460' },
  editApplyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#E8F0FE' },
  editApplyText: { fontSize: 15, fontWeight: '600', color: '#4285F4' },
  editSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#34A853' },
  editSaveText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  // Version panel
  versionPanel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  versionPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  versionPanelTitle: { fontSize: 18, fontWeight: '700', color: '#202124' },
  versionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  versionItemActive: { backgroundColor: '#F3E8FD', borderRadius: 10, paddingHorizontal: 10 },
  versionItemName: { fontSize: 15, fontWeight: '600', color: '#202124' },
  versionItemMeta: { fontSize: 11, color: '#9aa0a6', marginTop: 2 },
  noVersionsText: { fontSize: 13, color: '#9aa0a6', textAlign: 'center', paddingVertical: 20 },
  // Cell edit modal
  cellEditModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '90%', maxWidth: 340 },
  cellEditTitle: { fontSize: 18, fontWeight: '700', color: '#202124', marginBottom: 12 },
  cellEditInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 14, fontSize: 16, color: '#202124', marginBottom: 8 },
  cellEditHint: { fontSize: 11, color: '#9aa0a6', marginBottom: 16 },
  cellEditBtns: { flexDirection: 'row', gap: 12 },
  cellEditCancel: { flex: 1, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12 },
  cellEditCancelText: { fontSize: 15, color: '#5f6368', fontWeight: '600' },
  cellEditSave: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: '#4285F4', borderRadius: 12 },
  cellEditSaveText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'center', padding: 0 },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '90%', maxWidth: 340, marginBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  rackBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4285F4', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  rackBadgeText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyRack: { alignItems: 'center', paddingVertical: 20 },
  emptyRackTitle: { fontSize: 16, fontWeight: '600', color: '#5f6368', marginTop: 10 },
  singleEntry: { marginBottom: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailLabel: { fontSize: 14, color: '#5f6368' },
  detailValue: { fontSize: 16, fontWeight: '700', color: '#202124' },
  multiList: { maxHeight: 200, marginBottom: 14 },
  multiItem: { backgroundColor: '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#4285F4' },
  multiItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  multiSize: { fontSize: 13, fontWeight: '600', color: '#202124', flex: 1 },
  multiStock: { fontSize: 15, fontWeight: '700' },
  multiDiff: { fontSize: 11, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F0FE', borderRadius: 8, padding: 10, marginTop: 6 },
  totalLabel: { fontSize: 13, fontWeight: '600', color: '#4285F4' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#4285F4' },
  stockBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 8 },
  stockBarText: { fontSize: 13, fontWeight: '600', color: '#202124' },
});
