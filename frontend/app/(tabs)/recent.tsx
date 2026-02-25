import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, ActivityIndicator
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setExcelStore } from '../store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface RecentFile {
  fileId: string;
  fileName: string;
  sheetName: string;
  cellRange: string;
  lastOpened: number;
}

export default function RecentScreen() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('recent_files').then(stored => {
        if (stored) setRecent(JSON.parse(stored));
        else setRecent([]);
      });
    }, [])
  );

  const handleOpen = async (file: RecentFile) => {
    try {
      setLoadingId(file.fileId);
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) { Alert.alert('Error', 'Session expired. Please reconnect.'); return; }

      await AsyncStorage.setItem('selected_file_id', file.fileId);
      await AsyncStorage.setItem('selected_file_name', file.fileName);
      await AsyncStorage.setItem('selected_sheet', file.sheetName);
      await AsyncStorage.setItem('cell_range', file.cellRange);

      const response = await axios.get(
        `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${file.fileId}&sheet_name=${encodeURIComponent(file.sheetName)}&cell_range=${encodeURIComponent(file.cellRange)}`
      );

      setExcelStore({
        data: response.data.data,
        fileName: file.fileName,
        sheetName: file.sheetName,
        cellRange: file.cellRange,
        loadedAt: Date.now(),
      });

      // Update recent list timestamp
      const stored = await AsyncStorage.getItem('recent_files');
      const list = stored ? JSON.parse(stored) : [];
      const updated = [
        { ...file, lastOpened: Date.now() },
        ...list.filter((r: RecentFile) => r.fileId !== file.fileId)
      ].slice(0, 10);
      await AsyncStorage.setItem('recent_files', JSON.stringify(updated));

      Alert.alert(
        'Loaded!',
        `${response.data.row_count} rows ready`,
        [
          { text: 'Open Filter', onPress: () => router.navigate('/(tabs)/filter' as any) },
          { text: 'OK' }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to load file');
    } finally {
      setLoadingId(null);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + '  ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recent Files</Text>
      </View>

      {recent.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="time-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>No Recent Files</Text>
          <Text style={styles.emptySub}>Files you open will appear here for quick access</Text>
        </View>
      ) : (
        <FlatList
          data={recent}
          keyExtractor={item => item.fileId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handleOpen(item)}
              disabled={loadingId === item.fileId}
              activeOpacity={0.7}
            >
              <View style={styles.fileIconBox}>
                <Ionicons name="document" size={28} color="#34A853" />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                <Text style={styles.fileMeta}>{item.sheetName}  ·  {item.cellRange}</Text>
                <Text style={styles.fileDate}>{formatDate(item.lastOpened)}</Text>
              </View>
              {loadingId === item.fileId
                ? <ActivityIndicator color="#4285F4" />
                : <Ionicons name="chevron-forward" size={20} color="#9aa0a6" />
              }
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#202124' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#202124', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginTop: 8 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#e8e8e8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  fileIconBox: { marginRight: 14 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', color: '#202124', marginBottom: 3 },
  fileMeta: { fontSize: 12, color: '#5f6368', marginBottom: 2 },
  fileDate: { fontSize: 11, color: '#9aa0a6' },
});
