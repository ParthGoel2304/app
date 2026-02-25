import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { setExcelStore } from '../utils/store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EntryScreen() {
  const router = useRouter();

  useEffect(() => {
    boot();
  }, []);

  // Fast boot: check session + auto-load last file → go directly to Filter
  const boot = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) { router.replace('/login' as any); return; }

      // Check session validity
      const statusRes = await axios.get(
        `${BACKEND_URL}/api/drive/status?session_id=${sessionId}`,
        { timeout: 5000 }
      );
      if (!statusRes.data.connected) { router.replace('/login' as any); return; }

      // Try to auto-load the last used file directly
      const fileId = await AsyncStorage.getItem('selected_file_id');
      const sheetName = await AsyncStorage.getItem('selected_sheet');
      const cellRange = await AsyncStorage.getItem('cell_range');
      const fileName = await AsyncStorage.getItem('selected_file_name');

      if (fileId && sheetName && cellRange) {
        try {
          const dataRes = await axios.get(
            `${BACKEND_URL}/api/excel/read?session_id=${sessionId}&file_id=${fileId}&sheet_name=${encodeURIComponent(sheetName)}&cell_range=${encodeURIComponent(cellRange)}`,
            { timeout: 15000 }
          );
          setExcelStore({
            data: dataRes.data.data,
            fileName: fileName || '',
            sheetName,
            cellRange,
            loadedAt: Date.now(),
          });
          // Data loaded — jump straight to Filter
          router.replace('/(tabs)/filter' as any);
          return;
        } catch {
          // Auto-load failed — go to Home tab (user can manually load)
        }
      }

      // No saved file or auto-load failed → Home tab
      router.replace('/(tabs)/home' as any);
    } catch {
      router.replace('/login' as any);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4285F4" />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: { marginTop: 12, fontSize: 14, color: '#9aa0a6' },
});