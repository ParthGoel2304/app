import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  addSheetProfile, 
  generateSheetId, 
  createDisplayName, 
  detectSheetType,
  setActiveSheetId,
  getSheetLibrary,
  SheetProfile
} from '../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ExcelData {
  sheet_name: string;
  cell_range: string;
  data: string[][];
  row_count: number;
  col_count: number;
}

export default function DataScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileId, setFileId] = useState<string>('');
  const [sheetName, setSheetName] = useState<string>('');
  const [cellRange, setCellRange] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const session = await AsyncStorage.getItem('session_id');
      const fId = await AsyncStorage.getItem('selected_file_id');
      const fName = await AsyncStorage.getItem('selected_file_name');
      const sName = await AsyncStorage.getItem('selected_sheet');
      const cRange = await AsyncStorage.getItem('cell_range');
      
      if (!session || !fId || !sName || !cRange) {
        router.replace('/');
        return;
      }
      
      setFileName(fName || 'Excel File');
      setFileId(fId);
      setSheetName(sName);
      setCellRange(cRange);
      
      // Check if already saved in library
      const library = getSheetLibrary();
      const exists = library.find(s => s.fileId === fId && s.sheetName === sName);
      setAlreadySaved(!!exists);
      
      // Add timestamp to force fresh data (bypass cache)
      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${session}&file_id=${fId}&sheet_name=${encodeURIComponent(sName)}&cell_range=${encodeURIComponent(cRange)}&_t=${Date.now()}`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      
      setExcelData(response.data);
    } catch (error) {
      console.error('Load data error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load Excel data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!excelData || !fileName || !fileId || !sheetName || !cellRange) {
      Alert.alert('Error', 'Data not loaded yet');
      return;
    }

    setSaving(true);
    
    try {
      const sheetType = detectSheetType(sheetName, fileName);
      const displayName = createDisplayName(fileName, sheetName);
      
      const newProfile: SheetProfile = {
        id: generateSheetId(),
        displayName,
        fileName,
        fileId,
        sheetName,
        range: cellRange,
        sheetType,
        data: excelData.data,
        rowCount: excelData.row_count,
        colCount: excelData.col_count,
        savedAt: Date.now(),
        lastRefreshed: Date.now(),
      };
      
      const result = addSheetProfile(newProfile);
      
      if (result.success) {
        // Set as active sheet
        setActiveSheetId(newProfile.id);
        
        // Persist to AsyncStorage
        const library = getSheetLibrary();
        await AsyncStorage.setItem('sheet_library', JSON.stringify(library));
        await AsyncStorage.setItem('active_sheet_id', newProfile.id);
        
        setAlreadySaved(true);
        
        Alert.alert(
          'Saved!',
          `"${displayName}" added to your library`,
          [
            { text: 'Go to Home', onPress: () => router.replace('/(tabs)/home' as any) },
            { text: 'Stay Here' }
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to save');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save sheet profile');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleBack = () => {
    router.back();
  };

  const handleBackToFiles = () => {
    router.replace('/files');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Loading Excel data...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#202124" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{fileName}</Text>
          <Text style={styles.headerSubtitle}>
            {excelData?.sheet_name} • {excelData?.cell_range}
          </Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#4285F4" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="grid-outline" size={16} color="#5f6368" />
          <Text style={styles.statText}>
            {excelData?.row_count} rows × {excelData?.col_count} cols
          </Text>
        </View>
        <View style={[
          styles.typeBadge,
          { backgroundColor: detectSheetType(sheetName, fileName) === 'layout' ? '#F3E5F5' : '#E6F4EA' }
        ]}>
          <Text style={[
            styles.typeBadgeText,
            { color: detectSheetType(sheetName, fileName) === 'layout' ? '#9C27B0' : '#34A853' }
          ]}>
            {detectSheetType(sheetName, fileName).toUpperCase()}
          </Text>
        </View>
      </View>
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#4285F4']}
          />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableContainer}>
            {excelData?.data.slice(0, 20).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {row.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    style={[
                      styles.tableCell,
                      rowIndex === 0 && styles.tableCellHeader,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tableCellText,
                        rowIndex === 0 && styles.tableCellTextHeader,
                      ]}
                      numberOfLines={3}
                    >
                      {cell || ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            {excelData && excelData.row_count > 20 && (
              <View style={styles.moreRowsIndicator}>
                <Text style={styles.moreRowsText}>
                  + {excelData.row_count - 20} more rows...
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
      
      <View style={styles.footer}>
        {/* Save to Library Button - Main CTA */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            alreadySaved && styles.saveButtonSaved
          ]}
          onPress={handleSaveToLibrary}
          disabled={saving || alreadySaved}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : alreadySaved ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#34A853" />
              <Text style={[styles.saveButtonText, styles.saveButtonTextSaved]}>
                Saved to Library
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="bookmark" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save to Library</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBackToFiles}
          >
            <Ionicons name="folder-outline" size={18} color="#4285F4" />
            <Text style={styles.secondaryButtonText}>Browse Files</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.navigate('/(tabs)/filter' as any)}
          >
            <Ionicons name="funnel" size={18} color="#4285F4" />
            <Text style={styles.secondaryButtonText}>Filter</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#5f6368',
    marginTop: 2,
  },
  refreshButton: {
    padding: 4,
    marginLeft: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#5f6368',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#E8F0FE',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    color: '#5f6368',
    marginLeft: 6,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  tableContainer: {
    padding: 16,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    minWidth: 120,
    maxWidth: 200,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tableCellHeader: {
    backgroundColor: '#4285F4',
  },
  tableCellText: {
    fontSize: 14,
    color: '#202124',
  },
  tableCellTextHeader: {
    color: '#fff',
    fontWeight: '600',
  },
  moreRowsIndicator: {
    padding: 16,
    alignItems: 'center',
  },
  moreRowsText: {
    fontSize: 13,
    color: '#5f6368',
    fontStyle: 'italic',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  saveButtonSaved: {
    backgroundColor: '#E6F4EA',
    borderWidth: 1,
    borderColor: '#34A853',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  saveButtonTextSaved: {
    color: '#34A853',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4285F4',
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '600',
  },
});
