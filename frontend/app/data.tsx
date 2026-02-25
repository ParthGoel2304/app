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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const session = await AsyncStorage.getItem('session_id');
      const fileId = await AsyncStorage.getItem('selected_file_id');
      const file_name = await AsyncStorage.getItem('selected_file_name');
      const sheetName = await AsyncStorage.getItem('selected_sheet');
      const cellRange = await AsyncStorage.getItem('cell_range');
      
      if (!session || !fileId || !sheetName || !cellRange) {
        router.replace('/');
        return;
      }
      
      setFileName(file_name || 'Excel File');
      
      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${session}&file_id=${fileId}&sheet_name=${encodeURIComponent(sheetName)}&cell_range=${encodeURIComponent(cellRange)}`
      );
      
      setExcelData(response.data);
    } catch (error: any) {
      console.error('Load data error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load Excel data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleBack = () => {
    router.push('/sheets');
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
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => router.push({
            pathname: '/filter',
            params: {
              data: JSON.stringify(excelData?.data || []),
              sheetName: excelData?.sheet_name,
              fileName: fileName
            }
          })}
        >
          <Ionicons name="funnel" size={16} color="#4285F4" />
          <Text style={styles.filterButtonText}>Filter</Text>
        </TouchableOpacity>
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
            {excelData?.data.map((row, rowIndex) => (
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
          </View>
        </ScrollView>
      </ScrollView>
      
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backToFilesButton}
          onPress={handleBackToFiles}
        >
          <Ionicons name="folder-outline" size={20} color="#4285F4" />
          <Text style={styles.backToFilesButtonText}>Back to Files</Text>
        </TouchableOpacity>
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
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  backToFilesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  backToFilesButtonText: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
    marginLeft: 8,
  },
});