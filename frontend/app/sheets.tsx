import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function SheetsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [cellRange, setCellRange] = useState<string>('A1:Z100');
  const [fileName, setFileName] = useState<string>('');
  const [fileId, setFileId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    loadSheets();
  }, []);

  const loadSheets = async () => {
    try {
      const session = await AsyncStorage.getItem('session_id');
      const file_id = await AsyncStorage.getItem('selected_file_id');
      const file_name = await AsyncStorage.getItem('selected_file_name');
      
      if (!session || !file_id || !file_name) {
        router.replace('/');
        return;
      }
      
      setSessionId(session);
      setFileId(file_id);
      setFileName(file_name);
      
      // Add timestamp to force fresh data (bypass cache)
      const response = await axios.get(
        `${BACKEND_URL}/api/drive/file/${file_id}/sheets?session_id=${session}&_t=${Date.now()}`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      
      setSheets(response.data.sheet_names);
      if (response.data.sheet_names.length > 0) {
        setSelectedSheet(response.data.sheet_names[0]);
      }
    } catch (error: any) {
      console.error('Load sheets error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load sheets');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleViewData = async () => {
    if (!selectedSheet) {
      Alert.alert('Error', 'Please select a sheet');
      return;
    }
    
    if (!cellRange) {
      Alert.alert('Error', 'Please enter a cell range');
      return;
    }
    
    try {
      // Save configuration
      await AsyncStorage.setItem('selected_sheet', selectedSheet);
      await AsyncStorage.setItem('cell_range', cellRange);
      
      // Save to backend
      await axios.post(
        `${BACKEND_URL}/api/config/save?session_id=${sessionId}`,
        {
          file_id: fileId,
          file_name: fileName,
          sheet_name: selectedSheet,
          cell_range: cellRange,
        }
      );
      
      // Navigate to data view
      router.push('/data');
    } catch (error: any) {
      console.error('Save config error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save configuration');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Loading sheets...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#202124" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Configure Sheet</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.fileCard}>
            <Ionicons name="document" size={24} color="#34A853" />
            <Text style={styles.fileNameText} numberOfLines={2}>{fileName}</Text>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Sheet</Text>
            <Text style={styles.sectionSubtitle}>Choose which sheet to read data from</Text>
            
            <View style={styles.sheetsContainer}>
              {sheets.map((sheet, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.sheetButton,
                    selectedSheet === sheet && styles.sheetButtonSelected,
                  ]}
                  onPress={() => setSelectedSheet(sheet)}
                >
                  <Text
                    style={[
                      styles.sheetButtonText,
                      selectedSheet === sheet && styles.sheetButtonTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {sheet}
                  </Text>
                  {selectedSheet === sheet && (
                    <Ionicons name="checkmark-circle" size={20} color="#4285F4" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cell Range</Text>
            <Text style={styles.sectionSubtitle}>Specify which cells to read (e.g., A1:D10)</Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="grid-outline" size={20} color="#5f6368" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={cellRange}
                onChangeText={setCellRange}
                placeholder="A1:Z100"
                placeholderTextColor="#9aa0a6"
                autoCapitalize="characters"
              />
            </View>
            
            <View style={styles.examplesContainer}>
              <Text style={styles.examplesTitle}>Examples:</Text>
              {['A1:D10', 'B2:F50', 'A1:Z100'].map((example, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.exampleChip}
                  onPress={() => setCellRange(example)}
                >
                  <Text style={styles.exampleChipText}>{example}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
        
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.viewDataButton}
            onPress={handleViewData}
          >
            <Text style={styles.viewDataButtonText}>View Data</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#5f6368',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  fileNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginLeft: 12,
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 16,
  },
  sheetsContainer: {
    gap: 12,
  },
  sheetButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sheetButtonSelected: {
    borderColor: '#4285F4',
    backgroundColor: '#E8F0FE',
  },
  sheetButtonText: {
    fontSize: 16,
    color: '#202124',
    flex: 1,
  },
  sheetButtonTextSelected: {
    color: '#4285F4',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#202124',
    paddingVertical: 16,
  },
  examplesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  examplesTitle: {
    fontSize: 12,
    color: '#5f6368',
    marginRight: 8,
  },
  exampleChip: {
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  exampleChipText: {
    fontSize: 12,
    color: '#4285F4',
    fontWeight: '500',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  viewDataButton: {
    flexDirection: 'row',
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDataButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
});