import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ExcelFile {
  file_id: string;
  file_name: string;
  modified_time: string;
  size?: string;
}

export default function FilesScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const session = await AsyncStorage.getItem('session_id');
      if (!session) {
        router.replace('/');
        return;
      }
      
      setSessionId(session);
      
      // Add timestamp to force fresh data (bypass cache)
      // Use folder_only=true to get files from the specific office folder
      const response = await axios.get(
        `${BACKEND_URL}/api/drive/files?session_id=${session}&folder_only=true&_t=${Date.now()}`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      
      setFiles(response.data.files);
    } catch (error: any) {
      console.error('Load files error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load files');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFiles();
  };

  const handleFilePress = async (file: ExcelFile) => {
    try {
      // Save selected file
      await AsyncStorage.setItem('selected_file_id', file.file_id);
      await AsyncStorage.setItem('selected_file_name', file.file_name);
      
      // Navigate to sheet selector
      router.push('/sheets');
    } catch (error) {
      Alert.alert('Error', 'Failed to select file');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect Google Drive?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/');
          },
        },
      ]
    );
  };

  const formatSize = (bytes?: string) => {
    if (!bytes) return 'Unknown';
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderFileItem = ({ item }: { item: ExcelFile }) => (
    <TouchableOpacity
      style={styles.fileItem}
      onPress={() => handleFilePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.fileIcon}>
        <Ionicons name="document" size={32} color="#34A853" />
      </View>
      
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={2}>
          {item.file_name}
        </Text>
        <Text style={styles.fileDetails}>
          {formatDate(item.modified_time)} • {formatSize(item.size)}
        </Text>
      </View>
      
      <Ionicons name="chevron-forward" size={24} color="#5f6368" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Loading Excel files...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Excel Files</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#EA4335" />
        </TouchableOpacity>
      </View>
      
      {files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={80} color="#9aa0a6" />
          <Text style={styles.emptyTitle}>No Excel Files Found</Text>
          <Text style={styles.emptySubtitle}>
            Upload Excel files to your Google Drive to see them here
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Ionicons name="refresh" size={20} color="#4285F4" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={files}
          renderItem={renderFileItem}
          keyExtractor={(item) => item.file_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#4285F4']}
            />
          }
        />
      )}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#202124',
  },
  logoutButton: {
    padding: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#5f6368',
  },
  listContent: {
    padding: 16,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },
  fileIcon: {
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
  },
  fileDetails: {
    fontSize: 12,
    color: '#5f6368',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#5f6368',
    textAlign: 'center',
    marginTop: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#E8F0FE',
    borderRadius: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
    marginLeft: 8,
  },
});