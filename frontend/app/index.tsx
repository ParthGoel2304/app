import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EntryScreen() {
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (sessionId) {
        const res = await axios.get(
          `${BACKEND_URL}/api/drive/status?session_id=${sessionId}`,
          { timeout: 5000 }
        );
        if (res.data.connected) {
          router.replace('/(tabs)/home' as any);
          return;
        }
      }
    } catch {}
    router.replace('/login' as any);
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4285F4" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});