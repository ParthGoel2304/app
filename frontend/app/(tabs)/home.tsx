import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setExcelStore, getExcelStore } from '../../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const [autoLoading, setAutoLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [cellRange, setCellRange] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadSavedConfig();
    }, [])
  );

  const loadSavedConfig = async () => {
    const fn = await AsyncStorage.getItem('selected_file_name');
    const sn = await AsyncStorage.getItem('selected_sheet');
    const cr = await AsyncStorage.getItem('cell_range');
    setFileName(fn);
    setSheetName(sn);
    setCellRange(cr);
    setDataLoaded(getExcelStore() !== null);
  };

  const handleLoadData = async () => {
    try {
      setAutoLoading(true);
      const sessionId = await AsyncStorage.getItem('session_id');
      const fileId = await AsyncStorage.getItem('selected_file_id');
      const sn = await AsyncStorage.getItem('selected_sheet');
      const cr = await AsyncStorage.getItem('cell_range');
      const fn = await AsyncStorage.getItem('selected_file_name');

      if (!sessionId || !fileId || !sn || !cr) {
        Alert.alert('No File Selected', 'Please select a file first using the Select File button');
        return;
      }

      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${fileId}&sheet_name=${encodeURIComponent(sn)}&cell_range=${encodeURIComponent(cr)}`
      );

      setExcelStore({
        data: response.data.data,
        fileName: fn || '',
        sheetName: sn,
        cellRange: cr,
        loadedAt: Date.now()
      });

      await saveToRecent(fn || '', fileId, sn, cr);
      setDataLoaded(true);

      Alert.alert(
        'Data Ready!',
        `Loaded ${response.data.row_count} rows from "${sn}"`,
        [
          { text: 'Open Filter', onPress: () => router.navigate('/(tabs)/filter' as any) },
          { text: 'OK' }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to load data');
    } finally {
      setAutoLoading(false);
    }
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
          router.replace('/login' as any);
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Smart Excel Reader</Text>
        <TouchableOpacity onPress={handleDisconnect} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color="#EA4335" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active File Card */}
        {fileName ? (
          <View style={styles.fileCard}>
            <View style={styles.fileCardHeader}>
              <Ionicons name="document" size={22} color="#34A853" />
              <Text style={styles.fileCardLabel}>Active File</Text>
              {dataLoaded && (
                <View style={styles.readyBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#34A853" />
                  <Text style={styles.readyBadgeText}>Ready</Text>
                </View>
              )}
            </View>
            <Text style={styles.fileCardName} numberOfLines={2}>{fileName}</Text>
            <Text style={styles.fileCardSub}>Sheet: {sheetName}  ·  Range: {cellRange}</Text>
          </View>
        ) : (
          <View style={[styles.fileCard, styles.fileCardEmpty]}>
            <Ionicons name="document-outline" size={36} color="#d0d0d0" />
            <Text style={styles.emptyCardText}>No file selected</Text>
            <Text style={styles.emptyCardSub}>Tap "Select File" below to get started</Text>
          </View>
        )}

        {/* Action Grid */}
        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/files' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F0FE' }]}>
              <Ionicons name="folder-open" size={28} color="#4285F4" />
            </View>
            <Text style={styles.actionTitle}>Select File</Text>
            <Text style={styles.actionSub}>From Google Drive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={handleLoadData}
            disabled={autoLoading || !fileName}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E6F4EA' }]}>
              {autoLoading
                ? <ActivityIndicator color="#34A853" />
                : <Ionicons name="reload" size={28} color={fileName ? '#34A853' : '#9aa0a6'} />
              }
            </View>
            <Text style={[styles.actionTitle, !fileName && { color: '#9aa0a6' }]}>Load Data</Text>
            <Text style={styles.actionSub}>Fetch from sheet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/filter' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FEF0E6' }]}>
              <Ionicons name="funnel" size={28} color="#FA7B17" />
            </View>
            <Text style={styles.actionTitle}>Filter Tool</Text>
            <Text style={styles.actionSub}>Smart size search</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/parchi' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0E6FE' }]}>
              <Ionicons name="document-text" size={28} color="#9C27B0" />
            </View>
            <Text style={styles.actionTitle}>Parchi</Text>
            <Text style={styles.actionSub}>View quotations</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  logoutBtn: { padding: 4 },
  content: { padding: 16 },
  fileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#e8e8e8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  fileCardEmpty: { alignItems: 'center', paddingVertical: 28 },
  emptyCardText: { fontSize: 15, fontWeight: '600', color: '#9aa0a6', marginTop: 10 },
  emptyCardSub: { fontSize: 12, color: '#c0c0c0', marginTop: 4 },
  fileCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fileCardLabel: { fontSize: 12, color: '#5f6368', marginLeft: 8, flex: 1 },
  fileCardName: { fontSize: 16, fontWeight: '600', color: '#202124', marginBottom: 4 },
  fileCardSub: { fontSize: 12, color: '#5f6368' },
  readyBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E6F4EA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  readyBadgeText: { fontSize: 11, color: '#34A853', fontWeight: '600', marginLeft: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
  actionSub: { fontSize: 11, color: '#9aa0a6', textAlign: 'center' },
});
