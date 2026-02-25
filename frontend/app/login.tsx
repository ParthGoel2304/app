import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const checkConnectionStatus = async (sessionId: string, attempts = 0): Promise<boolean> => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/drive/status?session_id=${sessionId}`);
      if (res.data.connected) return true;
      if (attempts < 5) {
        await new Promise(r => setTimeout(r, 2000));
        return checkConnectionStatus(sessionId, attempts + 1);
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleConnectDrive = async () => {
    try {
      setLoading(true);
      const sessionRes = await axios.post(`${BACKEND_URL}/api/session/create`);
      const sessionId = sessionRes.data.session_id;
      await AsyncStorage.setItem('session_id', sessionId);

      const oauthRes = await axios.get(
        `${BACKEND_URL}/api/oauth/drive/connect?session_id=${sessionId}`
      );

      Alert.alert(
        'Sign in with Google',
        'After signing in and granting permissions, come back and tap "I\'ve Connected".',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'Continue',
            onPress: async () => {
              await WebBrowser.openBrowserAsync(oauthRes.data.authorization_url);
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to initiate connection');
      setLoading(false);
    }
  };

  const handleCheckConnection = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (!sessionId) { Alert.alert('Error', 'No session found. Try connecting again.'); return; }

      const connected = await checkConnectionStatus(sessionId);
      if (connected) {
        router.replace('/(tabs)/home' as any);
      } else {
        Alert.alert(
          'Not Connected',
          'Google Drive is not connected yet. Please complete authentication in the browser.',
          [
            { text: 'Try Again', onPress: () => setLoading(false) },
            { text: 'Check Again', onPress: handleCheckConnection }
          ]
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to check connection status');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoBox}>
          <Ionicons name="document-text" size={56} color="#4285F4" />
        </View>

        <Text style={styles.title}>Smart Excel Reader</Text>
        <Text style={styles.subtitle}>
          Connect Google Drive to read your inventory Excel files instantly
        </Text>

        <View style={styles.features}>
          {[
            { icon: 'search', text: 'Smart size filter with exact matching' },
            { icon: 'document-text', text: 'Create quotation Parchis instantly' },
            { icon: 'volume-medium', text: 'Hindi audio readout for sizes' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={18} color="#4285F4" />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.connectBtn, loading && styles.btnDisabled]}
          onPress={handleConnectDrive}
          disabled={loading}
        >
          <Ionicons name="logo-google" size={22} color="#fff" />
          <Text style={styles.connectBtnText}>Connect Google Drive</Text>
        </TouchableOpacity>

        {loading && (
          <TouchableOpacity
            style={styles.checkBtn}
            onPress={handleCheckConnection}
          >
            <Ionicons name="checkmark-circle" size={22} color="#4285F4" />
            <Text style={styles.checkBtnText}>I've Connected — Continue</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.disclaimer}>Read-only access to your Drive files</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  logoBox: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#202124', marginBottom: 8 },
  subtitle: {
    fontSize: 15, color: '#5f6368', textAlign: 'center',
    marginBottom: 32, lineHeight: 22,
  },
  features: { width: '100%', marginBottom: 36 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 4,
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  featureText: { fontSize: 14, color: '#202124', flex: 1 },
  connectBtn: {
    flexDirection: 'row', backgroundColor: '#4285F4',
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: 'center',
    width: '100%', gap: 12,
    shadowColor: '#4285F4', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  btnDisabled: { backgroundColor: '#9aa0a6', shadowOpacity: 0 },
  connectBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  checkBtn: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: 'center',
    width: '100%', gap: 12, marginTop: 14,
    borderWidth: 2, borderColor: '#4285F4',
  },
  checkBtnText: { color: '#4285F4', fontSize: 17, fontWeight: '700' },
  disclaimer: { fontSize: 12, color: '#9aa0a6', marginTop: 20 },
});
