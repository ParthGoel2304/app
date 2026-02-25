import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearExcelStore, getExcelStore } from '../../utils/store';

export default function SettingsScreen() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [cellRange, setCellRange] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('selected_file_name').then(v => setFileName(v));
      AsyncStorage.getItem('selected_sheet').then(v => setSheetName(v));
      AsyncStorage.getItem('cell_range').then(v => setCellRange(v));
      setDataLoaded(getExcelStore() !== null);
    }, [])
  );

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Google Drive',
      'This will remove all saved data and sign you out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive',
          onPress: async () => {
            clearExcelStore();
            await AsyncStorage.clear();
            router.replace('/login' as any);
          }
        }
      ]
    );
  };

  const handleClearCache = () => {
    clearExcelStore();
    setDataLoaded(false);
    Alert.alert('Cleared', 'Data cache cleared. Reload from Home tab.');
  };

  const handleClearParchi = () => {
    Alert.alert('Clear Parchi', 'Remove all Parchi items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('parchi_items');
          await AsyncStorage.removeItem('parchi_name');
          Alert.alert('Done', 'Parchi cleared');
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active Data */}
        <Text style={styles.sectionLabel}>ACTIVE DATA</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="document" size={18} color="#4285F4" />
            <Text style={styles.infoKey}>File</Text>
            <Text style={styles.infoVal} numberOfLines={1}>{fileName || 'None'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="grid-outline" size={18} color="#4285F4" />
            <Text style={styles.infoKey}>Sheet</Text>
            <Text style={styles.infoVal}>{sheetName || 'None'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="resize-outline" size={18} color="#4285F4" />
            <Text style={styles.infoKey}>Range</Text>
            <Text style={styles.infoVal}>{cellRange || 'None'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons
              name="server-outline" size={18}
              color={dataLoaded ? '#34A853' : '#9aa0a6'}
            />
            <Text style={styles.infoKey}>Cache</Text>
            <Text style={[styles.infoVal, { color: dataLoaded ? '#34A853' : '#9aa0a6' }]}>
              {dataLoaded ? 'Loaded ✓' : 'Empty'}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <Text style={styles.sectionLabel}>ACTIONS</Text>
        <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
          <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="sync-outline" size={20} color="#FA7B17" />
          </View>
          <Text style={styles.actionText}>Clear Data Cache</Text>
          <Ionicons name="chevron-forward" size={18} color="#9aa0a6" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow} onPress={handleClearParchi}>
          <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
            <Ionicons name="document-text-outline" size={20} color="#9C27B0" />
          </View>
          <Text style={styles.actionText}>Clear Parchi</Text>
          <Ionicons name="chevron-forward" size={18} color="#9aa0a6" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionRow, styles.disconnectRow]}
          onPress={handleDisconnect}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#FFEBEE' }]}>
            <Ionicons name="log-out-outline" size={20} color="#EA4335" />
          </View>
          <Text style={[styles.actionText, { color: '#EA4335' }]}>Disconnect Google Drive</Text>
          <Ionicons name="chevron-forward" size={18} color="#EA4335" />
        </TouchableOpacity>

        <Text style={styles.version}>Smart Excel Reader  ·  v1.0</Text>
      </ScrollView>
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
  content: { padding: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9aa0a6',
    letterSpacing: 1, marginBottom: 8, marginTop: 8,
  },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: '#e8e8e8', marginBottom: 20,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  infoKey: { fontSize: 13, color: '#5f6368', width: 52 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: '#202124' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 14 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 10, gap: 14,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  disconnectRow: { borderColor: '#FFEBEE' },
  actionIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#202124' },
  version: { textAlign: 'center', fontSize: 12, color: '#c0c0c0', marginTop: 16, marginBottom: 8 },
});
