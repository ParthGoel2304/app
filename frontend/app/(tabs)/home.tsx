import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Modal
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  setExcelStore, getExcelStore, 
  getFileRegistry, removeFromFileRegistry, ExcelFile 
} from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  
  // File registry state
  const [registeredFiles, setRegisteredFiles] = useState<ExcelFile[]>([]);
  
  // Active file state
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [activeCellRange, setActiveCellRange] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // File options modal
  const [selectedFile, setSelectedFile] = useState<ExcelFile | null>(null);
  const [showFileOptions, setShowFileOptions] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadSavedConfig();
    }, [])
  );

  const loadSavedConfig = async () => {
    // Load file registry from store
    const files = getFileRegistry();
    setRegisteredFiles(files);
    
    // Load active file info from AsyncStorage
    const fileId = await AsyncStorage.getItem('selected_file_id');
    const fn = await AsyncStorage.getItem('selected_file_name');
    const sn = await AsyncStorage.getItem('selected_sheet');
    const cr = await AsyncStorage.getItem('cell_range');
    
    setActiveFileId(fileId);
    setActiveFileName(fn);
    setActiveSheet(sn);
    setActiveCellRange(cr);
    setDataLoaded(getExcelStore() !== null);
  };

  const handleLoadFileData = async (file: ExcelFile) => {
    try {
      setLoading(true);
      setLoadingFileId(file.fileId);
      
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) {
        Alert.alert('Session Expired', 'Please login again');
        router.replace('/');
        return;
      }

      // For layout files, we need to pick a sheet first
      // For stock files, load the Stock sheet
      const sheetToLoad = file.sheetNames.find(s => 
        s.toLowerCase() === 'stock' || s.toLowerCase().includes('stock')
      ) || file.sheetNames[0];

      // Save selection to AsyncStorage
      await AsyncStorage.setItem('selected_file_id', file.fileId);
      await AsyncStorage.setItem('selected_file_name', file.fileName);
      await AsyncStorage.setItem('selected_sheet', sheetToLoad);
      await AsyncStorage.setItem('cell_range', 'A1:Z500');

      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${file.fileId}&sheet_name=${encodeURIComponent(sheetToLoad)}&cell_range=A1:Z500`
      );

      setExcelStore({
        data: response.data.data,
        fileName: file.fileName,
        fileId: file.fileId,
        sheetName: sheetToLoad,
        cellRange: 'A1:Z500',
        loadedAt: Date.now()
      });

      // Update local state
      setActiveFileId(file.fileId);
      setActiveFileName(file.fileName);
      setActiveSheet(sheetToLoad);
      setActiveCellRange('A1:Z500');
      setDataLoaded(true);

      // Save to recent
      await saveToRecent(file.fileName, file.fileId, sheetToLoad, 'A1:Z500');

      Alert.alert(
        'Data Loaded!',
        `Loaded ${response.data.row_count} rows from "${sheetToLoad}"`,
        [
          { text: 'Open Filter', onPress: () => router.navigate('/(tabs)/filter' as any) },
          { text: 'OK' }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
      setLoadingFileId(null);
    }
  };

  const handleRemoveFile = (file: ExcelFile) => {
    Alert.alert(
      'Remove File',
      `Remove "${file.fileName}" from the registry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => {
            removeFromFileRegistry(file.fileId);
            setRegisteredFiles(getFileRegistry());
            setShowFileOptions(false);
            setSelectedFile(null);
            
            // If this was the active file, clear active state
            if (file.fileId === activeFileId) {
              setActiveFileId(null);
              setActiveFileName(null);
              setDataLoaded(false);
            }
          }
        }
      ]
    );
  };

  const saveToRecent = async (fn: string, fileId: string, sn: string, cr: string) => {
    try {
      const stored = await AsyncStorage.getItem('recent_files');
      const recent = stored ? JSON.parse(stored) : [];
      const entry = { fileId, fileName: fn, sheetName: sn, cellRange: cr, lastOpened: Date.now() };
      const updated = [entry, ...recent.filter((r: any) => r.fileId !== fileId)].slice(0, 10);
      await AsyncStorage.setItem('recent_files', JSON.stringify(updated));
    } catch {}
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from Google Drive?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          router.replace('/');
        }
      }
    ]);
  };

  const openFileOptions = (file: ExcelFile) => {
    setSelectedFile(file);
    setShowFileOptions(true);
  };

  const isActiveFile = (fileId: string) => fileId === activeFileId && dataLoaded;

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
        {/* File Registry Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="folder" size={20} color="#4285F4" />
            <Text style={styles.sectionTitle}>My Files</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{registeredFiles.length}</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.addFileBtn}
            onPress={() => router.push('/files' as any)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addFileBtnText}>Add File</Text>
          </TouchableOpacity>
        </View>

        {/* File List */}
        {registeredFiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#d0d0d0" />
            <Text style={styles.emptyStateTitle}>No Files Added</Text>
            <Text style={styles.emptyStateSub}>
              Tap "Add File" to load Excel files from Google Drive
            </Text>
          </View>
        ) : (
          <View style={styles.fileList}>
            {registeredFiles.map((file, idx) => (
              <TouchableOpacity
                key={file.fileId}
                style={[
                  styles.fileCard,
                  isActiveFile(file.fileId) && styles.fileCardActive
                ]}
                onPress={() => handleLoadFileData(file)}
                onLongPress={() => openFileOptions(file)}
                activeOpacity={0.7}
              >
                <View style={styles.fileIcon}>
                  <Ionicons 
                    name={file.hasLayoutSheets ? 'grid' : 'document'} 
                    size={24} 
                    color={file.hasLayoutSheets ? '#9C27B0' : '#34A853'} 
                  />
                </View>
                
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <View style={[
                      styles.fileTypeBadge,
                      { backgroundColor: file.fileType === 'stock' ? '#E6F4EA' : file.fileType === 'layout' ? '#F3E5F5' : '#E8F0FE' }
                    ]}>
                      <Text style={[
                        styles.fileTypeBadgeText,
                        { color: file.fileType === 'stock' ? '#34A853' : file.fileType === 'layout' ? '#9C27B0' : '#4285F4' }
                      ]}>
                        {file.fileType.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.fileSheetsCount}>
                      {file.sheetNames.length} sheets
                    </Text>
                  </View>
                </View>

                <View style={styles.fileActions}>
                  {loadingFileId === file.fileId ? (
                    <ActivityIndicator size="small" color="#4285F4" />
                  ) : isActiveFile(file.fileId) ? (
                    <View style={styles.activeBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#34A853" />
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.loadBtn}
                      onPress={() => handleLoadFileData(file)}
                    >
                      <Ionicons name="download-outline" size={18} color="#4285F4" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flash" size={20} color="#FA7B17" />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/filter' as any)}
            disabled={!dataLoaded}
          >
            <View style={[styles.actionIcon, { backgroundColor: dataLoaded ? '#FEF0E6' : '#f5f5f5' }]}>
              <Ionicons name="funnel" size={28} color={dataLoaded ? '#FA7B17' : '#c0c0c0'} />
            </View>
            <Text style={[styles.actionTitle, !dataLoaded && styles.actionTitleDisabled]}>
              Filter
            </Text>
            <Text style={styles.actionSub}>Search sizes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/parchi' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0E6FE' }]}>
              <Ionicons name="document-text" size={28} color="#9C27B0" />
            </View>
            <Text style={styles.actionTitle}>Parchi</Text>
            <Text style={styles.actionSub}>Quotations</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/inventory' as any)}
            disabled={!dataLoaded}
          >
            <View style={[styles.actionIcon, { backgroundColor: dataLoaded ? '#E8F0FE' : '#f5f5f5' }]}>
              <Ionicons name="cube" size={28} color={dataLoaded ? '#4285F4' : '#c0c0c0'} />
            </View>
            <Text style={[styles.actionTitle, !dataLoaded && styles.actionTitleDisabled]}>
              Inventory
            </Text>
            <Text style={styles.actionSub}>Stock list</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/layout' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E6F4EA' }]}>
              <Ionicons name="grid" size={28} color="#34A853" />
            </View>
            <Text style={styles.actionTitle}>Layout</Text>
            <Text style={styles.actionSub}>Warehouse view</Text>
          </TouchableOpacity>
        </View>

        {/* Active File Info */}
        {dataLoaded && activeFileName && (
          <View style={styles.activeFileCard}>
            <View style={styles.activeFileHeader}>
              <Ionicons name="checkmark-circle" size={18} color="#34A853" />
              <Text style={styles.activeFileLabel}>Currently Active</Text>
            </View>
            <Text style={styles.activeFileName}>{activeFileName}</Text>
            <Text style={styles.activeFileMeta}>
              Sheet: {activeSheet} • Range: {activeCellRange}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* File Options Modal */}
      <Modal
        visible={showFileOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFileOptions(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFileOptions(false)}
        >
          <View style={styles.optionsModal}>
            {selectedFile && (
              <>
                <Text style={styles.optionsTitle}>{selectedFile.fileName}</Text>
                
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    setShowFileOptions(false);
                    handleLoadFileData(selectedFile);
                  }}
                >
                  <Ionicons name="download-outline" size={22} color="#4285F4" />
                  <Text style={styles.optionText}>Load Data</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => handleRemoveFile(selectedFile)}
                >
                  <Ionicons name="trash-outline" size={22} color="#EA4335" />
                  <Text style={[styles.optionText, { color: '#EA4335' }]}>Remove File</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionCancelBtn}
                  onPress={() => setShowFileOptions(false)}
                >
                  <Text style={styles.optionCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
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
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, marginTop: 8,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#202124' },
  countBadge: {
    backgroundColor: '#E8F0FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  countBadgeText: { fontSize: 12, color: '#4285F4', fontWeight: '600' },
  addFileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4285F4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  addFileBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  emptyState: {
    backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center',
    borderWidth: 2, borderColor: '#e8e8e8', borderStyle: 'dashed',
  },
  emptyStateTitle: { fontSize: 16, fontWeight: '600', color: '#5f6368', marginTop: 12 },
  emptyStateSub: { fontSize: 13, color: '#9aa0a6', textAlign: 'center', marginTop: 6 },
  fileList: { gap: 10, marginBottom: 16 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e8e8e8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  fileCardActive: { borderColor: '#34A853', backgroundColor: '#FAFFF9' },
  fileIcon: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#f8f9fa',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', color: '#202124', marginBottom: 4 },
  fileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileTypeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  fileTypeBadgeText: { fontSize: 10, fontWeight: '700' },
  fileSheetsCount: { fontSize: 11, color: '#9aa0a6' },
  fileActions: { marginLeft: 8 },
  loadBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center',
  },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E6F4EA', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  activeBadgeText: { fontSize: 11, color: '#34A853', fontWeight: '600' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    flex: 1, minWidth: '44%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  actionIcon: {
    width: 56, height: 56, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  actionTitle: { fontSize: 14, fontWeight: '600', color: '#202124', marginBottom: 2 },
  actionTitleDisabled: { color: '#c0c0c0' },
  actionSub: { fontSize: 11, color: '#9aa0a6', textAlign: 'center' },
  activeFileCard: {
    backgroundColor: '#E6F4EA', borderRadius: 14, padding: 14, marginTop: 20,
    borderWidth: 1, borderColor: '#34A853',
  },
  activeFileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  activeFileLabel: { fontSize: 12, color: '#34A853', fontWeight: '600' },
  activeFileName: { fontSize: 15, fontWeight: '700', color: '#202124', marginBottom: 4 },
  activeFileMeta: { fontSize: 12, color: '#5f6368' },
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
  optionCancelBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#f8f9fa', borderRadius: 12,
  },
  optionCancelText: { fontSize: 15, color: '#5f6368', fontWeight: '600' },
});
