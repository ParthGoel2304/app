import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Modal, TextInput
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  getSheetLibrary, setSheetLibrary,
  getActiveSheetId, setActiveSheetId, getActiveSheet,
  removeSheetProfile, updateSheetProfile,
  SheetProfile
} from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  
  // Sheet library state
  const [sheetLibrary, setLocalLibrary] = useState<SheetProfile[]>([]);
  const [activeSheetId, setLocalActiveId] = useState<string | null>(null);
  const [activeSheet, setLocalActiveSheet] = useState<SheetProfile | null>(null);
  
  // UI state
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<SheetProfile | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadLibrary();
    }, [])
  );

  const loadLibrary = async () => {
    try {
      // Load from AsyncStorage
      const stored = await AsyncStorage.getItem('sheet_library');
      const storedActiveId = await AsyncStorage.getItem('active_sheet_id');
      
      if (stored) {
        const library = JSON.parse(stored);
        setSheetLibrary(library);  // Update global store
        setLocalLibrary(library);
      } else {
        setLocalLibrary(getSheetLibrary());
      }
      
      if (storedActiveId) {
        setActiveSheetId(storedActiveId);  // Update global store
        setLocalActiveId(storedActiveId);
      } else {
        setLocalActiveId(getActiveSheetId());
      }
      
      setLocalActiveSheet(getActiveSheet());
    } catch (error) {
      console.error('Failed to load library:', error);
    }
  };

  const handleSetActive = async (sheet: SheetProfile) => {
    setActiveSheetId(sheet.id);
    setLocalActiveId(sheet.id);
    setLocalActiveSheet(sheet);
    await AsyncStorage.setItem('active_sheet_id', sheet.id);
  };

  const handleRefreshSheet = async (sheet: SheetProfile) => {
    setRefreshingId(sheet.id);
    
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        router.replace('/');
        return;
      }

      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${sheet.fileId}&sheet_name=${encodeURIComponent(sheet.sheetName)}&cell_range=${encodeURIComponent(sheet.range)}`
      );

      // Update the sheet profile with new data
      updateSheetProfile(sheet.id, {
        data: response.data.data,
        rowCount: response.data.row_count,
        colCount: response.data.col_count,
        lastRefreshed: Date.now(),
      });

      // Persist
      const library = getSheetLibrary();
      await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
      setLocalLibrary([...library]);
      
      if (sheet.id === activeSheetId) {
        setLocalActiveSheet(getActiveSheet());
      }

      Alert.alert('Refreshed!', `Data updated from Google Drive`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to refresh data');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteSheet = async (sheet: SheetProfile) => {
    Alert.alert(
      'Delete Sheet',
      `Remove "${sheet.displayName}" from library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            removeSheetProfile(sheet.id);
            const library = getSheetLibrary();
            await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
            setLocalLibrary([...library]);
            
            if (sheet.id === activeSheetId) {
              setLocalActiveId(null);
              setLocalActiveSheet(null);
              await AsyncStorage.removeItem('active_sheet_id');
            }
            
            setShowOptions(false);
            setSelectedSheet(null);
          }
        }
      ]
    );
  };

  const handleRenameSheet = async () => {
    if (!selectedSheet || !renameText.trim()) return;
    
    updateSheetProfile(selectedSheet.id, { displayName: renameText.trim() });
    const library = getSheetLibrary();
    await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
    setLocalLibrary([...library]);
    
    if (selectedSheet.id === activeSheetId) {
      setLocalActiveSheet(getActiveSheet());
    }
    
    setShowRenameModal(false);
    setShowOptions(false);
    setSelectedSheet(null);
    setRenameText('');
  };

  const openOptions = (sheet: SheetProfile) => {
    setSelectedSheet(sheet);
    setShowOptions(true);
  };

  const openRename = () => {
    if (selectedSheet) {
      setRenameText(selectedSheet.displayName);
      setShowRenameModal(true);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from Google Drive?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          router.replace('/');
        }
      }
    ]);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'layout': return { bg: '#F3E5F5', text: '#9C27B0' };
      case 'stock': return { bg: '#E6F4EA', text: '#34A853' };
      default: return { bg: '#E8F0FE', text: '#4285F4' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Smart Excel Reader</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity onPress={() => router.navigate('/(tabs)/settings' as any)} style={styles.headerBtn}>
            <Ionicons name="settings-outline" size={22} color="#5f6368" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={styles.headerBtn}>
            <Ionicons name="log-out-outline" size={22} color="#EA4335" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active Sheet Card */}
        {activeSheet ? (
          <View style={styles.activeCard}>
            <View style={styles.activeCardHeader}>
              <Ionicons name="checkmark-circle" size={20} color="#34A853" />
              <Text style={styles.activeLabel}>Active Sheet</Text>
            </View>
            <Text style={styles.activeName}>{activeSheet.displayName}</Text>
            <Text style={styles.activeMeta}>
              {activeSheet.rowCount} rows • Range: {activeSheet.range}
            </Text>
            <View style={styles.activeFooter}>
              <View style={[styles.typeBadge, { backgroundColor: getTypeColor(activeSheet.sheetType).bg }]}>
                <Text style={[styles.typeBadgeText, { color: getTypeColor(activeSheet.sheetType).text }]}>
                  {activeSheet.sheetType.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.refreshedText}>
                Refreshed {new Date(activeSheet.lastRefreshed).toLocaleDateString()}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noActiveCard}>
            <Ionicons name="document-outline" size={32} color="#9aa0a6" />
            <Text style={styles.noActiveText}>No Active Sheet</Text>
            <Text style={styles.noActiveSub}>
              Add a file and save a sheet to get started
            </Text>
          </View>
        )}

        {/* Add File Button */}
        <TouchableOpacity
          style={styles.addFileBtn}
          onPress={() => router.push('/files' as any)}
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.addFileBtnText}>Add File from Drive</Text>
        </TouchableOpacity>

        {/* Saved Sheets Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="library" size={18} color="#5f6368" />
            <Text style={styles.sectionTitle}>Saved Sheets</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{sheetLibrary.length}</Text>
            </View>
          </View>
        </View>

        {sheetLibrary.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={40} color="#d0d0d0" />
            <Text style={styles.emptyTitle}>No Saved Sheets</Text>
            <Text style={styles.emptySub}>
              Load data from a file and tap "Save to Library"
            </Text>
          </View>
        ) : (
          <View style={styles.sheetList}>
            {sheetLibrary.map((sheet) => {
              const isActive = sheet.id === activeSheetId;
              const typeColor = getTypeColor(sheet.sheetType);
              
              return (
                <TouchableOpacity
                  key={sheet.id}
                  style={[styles.sheetCard, isActive && styles.sheetCardActive]}
                  onPress={() => handleSetActive(sheet)}
                  onLongPress={() => openOptions(sheet)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sheetCardLeft}>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={20} color="#34A853" />
                    ) : (
                      <Ionicons name="document" size={20} color="#9aa0a6" />
                    )}
                  </View>
                  
                  <View style={styles.sheetCardContent}>
                    <Text style={[styles.sheetName, isActive && styles.sheetNameActive]} numberOfLines={1}>
                      {sheet.displayName}
                    </Text>
                    <View style={styles.sheetMeta}>
                      <View style={[styles.typeBadgeSmall, { backgroundColor: typeColor.bg }]}>
                        <Text style={[styles.typeBadgeSmallText, { color: typeColor.text }]}>
                          {sheet.sheetType}
                        </Text>
                      </View>
                      <Text style={styles.sheetMetaText}>
                        {sheet.rowCount} rows
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.refreshBtn}
                    onPress={() => handleRefreshSheet(sheet)}
                    disabled={refreshingId === sheet.id}
                  >
                    {refreshingId === sheet.id ? (
                      <ActivityIndicator size="small" color="#4285F4" />
                    ) : (
                      <Ionicons name="refresh" size={18} color="#4285F4" />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flash" size={18} color="#FA7B17" />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          {/* Primary Actions (Tab shortcuts) */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/purchase' as any)}
            data-testid="quick-action-purchase"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E6F4EA' }]}>
              <Ionicons name="cart" size={26} color="#34A853" />
            </View>
            <Text style={styles.actionTitle}>Purchase</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/calculator' as any)}
            data-testid="quick-action-calculator"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F0FE' }]}>
              <Ionicons name="calculator" size={26} color="#4285F4" />
            </View>
            <Text style={styles.actionTitle}>Calculator</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/layout' as any)}
            data-testid="quick-action-layout"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="grid" size={26} color="#E65100" />
            </View>
            <Text style={styles.actionTitle}>Layout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/filter' as any)}
            disabled={!activeSheet || !activeSheet.data}
            data-testid="quick-action-filter"
          >
            <View style={[styles.actionIcon, { backgroundColor: activeSheet?.data ? '#FEF0E6' : '#f5f5f5' }]}>
              <Ionicons name="funnel" size={26} color={activeSheet?.data ? '#FA7B17' : '#c0c0c0'} />
            </View>
            <Text style={[styles.actionTitle, !activeSheet?.data && styles.actionTitleDisabled]}>
              Smart Filter
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/parchi' as any)}
            data-testid="quick-action-parchi"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0E6FE' }]}>
              <Ionicons name="document-text" size={26} color="#9C27B0" />
            </View>
            <Text style={styles.actionTitle}>Parchi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/sheetview' as any)}
            data-testid="quick-action-sheetview"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="eye" size={26} color="#1565C0" />
            </View>
            <Text style={styles.actionTitle}>Sheet View</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sheet Options Modal */}
      <Modal
        visible={showOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptions(false)}
        >
          <View style={styles.optionsModal}>
            {selectedSheet && (
              <>
                <Text style={styles.optionsTitle} numberOfLines={1}>
                  {selectedSheet.displayName}
                </Text>

                <TouchableOpacity style={styles.optionItem} onPress={() => handleSetActive(selectedSheet)}>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#34A853" />
                  <Text style={styles.optionText}>Set as Active</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionItem} onPress={() => handleRefreshSheet(selectedSheet)}>
                  <Ionicons name="refresh" size={22} color="#4285F4" />
                  <Text style={styles.optionText}>Refresh Data</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionItem} onPress={openRename}>
                  <Ionicons name="pencil" size={22} color="#FA7B17" />
                  <Text style={styles.optionText}>Rename</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionItem} onPress={() => handleDeleteSheet(selectedSheet)}>
                  <Ionicons name="trash-outline" size={22} color="#EA4335" />
                  <Text style={[styles.optionText, { color: '#EA4335' }]}>Delete</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowOptions(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Rename Sheet</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter new name"
              autoFocus
            />
            <View style={styles.renameBtns}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => {
                  setShowRenameModal(false);
                  setRenameText('');
                }}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.renameSaveBtn}
                onPress={handleRenameSheet}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#202124' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 6 },
  content: { padding: 16 },
  
  // Active Sheet Card
  activeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 2, borderColor: '#34A853',
  },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  activeLabel: { fontSize: 12, color: '#34A853', fontWeight: '600' },
  activeName: { fontSize: 17, fontWeight: '700', color: '#202124', marginBottom: 4 },
  activeMeta: { fontSize: 13, color: '#5f6368', marginBottom: 10 },
  activeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshedText: { fontSize: 11, color: '#9aa0a6' },
  
  noActiveCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 16,
    alignItems: 'center', borderWidth: 2, borderColor: '#e8e8e8', borderStyle: 'dashed',
  },
  noActiveText: { fontSize: 15, fontWeight: '600', color: '#5f6368', marginTop: 10 },
  noActiveSub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 4 },
  
  // Add File Button
  addFileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4285F4', paddingVertical: 14, borderRadius: 12, marginBottom: 20,
  },
  addFileBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  
  // Section Header
  sectionHeader: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#202124' },
  countBadge: { backgroundColor: '#E8F0FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: 12, color: '#4285F4', fontWeight: '600' },
  
  // Empty State
  emptyState: {
    backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#5f6368', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#9aa0a6', textAlign: 'center', marginTop: 4 },
  
  // Sheet List
  sheetList: { gap: 8, marginBottom: 20 },
  sheetCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  sheetCardActive: { borderColor: '#34A853', backgroundColor: '#FAFFF9' },
  sheetCardLeft: { marginRight: 12 },
  sheetCardContent: { flex: 1 },
  sheetName: { fontSize: 14, fontWeight: '600', color: '#202124', marginBottom: 4 },
  sheetNameActive: { color: '#34A853' },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetMetaText: { fontSize: 11, color: '#9aa0a6' },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  
  // Type Badge
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  typeBadgeSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeSmallText: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  
  // Action Grid
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    flexBasis: '30%', flexGrow: 1, maxWidth: '48%', backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8',
  },
  actionIcon: {
    width: 50, height: 50, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  actionTitle: { fontSize: 13, fontWeight: '600', color: '#202124' },
  actionTitleDisabled: { color: '#c0c0c0' },
  
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  optionsModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 320,
  },
  optionsTitle: { fontSize: 16, fontWeight: '700', color: '#202124', marginBottom: 16, textAlign: 'center' },
  optionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  optionText: { fontSize: 15, color: '#202124', fontWeight: '500' },
  cancelBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#f8f9fa', borderRadius: 12,
  },
  cancelBtnText: { fontSize: 15, color: '#5f6368', fontWeight: '600' },
  
  // Rename Modal
  renameModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320,
  },
  renameTitle: { fontSize: 18, fontWeight: '700', color: '#202124', marginBottom: 16 },
  renameInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12,
    padding: 14, fontSize: 16, color: '#202124', marginBottom: 16,
  },
  renameBtns: { flexDirection: 'row', gap: 12 },
  renameCancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12,
  },
  renameCancelText: { fontSize: 15, color: '#5f6368', fontWeight: '600' },
  renameSaveBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#4285F4', borderRadius: 12,
  },
  renameSaveText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
