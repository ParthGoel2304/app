import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Linking
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showManualCode, setShowManualCode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    checkExistingSession();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const checkExistingSession = async () => {
    const sid = await AsyncStorage.getItem('session_id');
    if (sid) {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/drive/status?session_id=${sid}`);
        if (res.data.connected) {
          router.replace('/(tabs)/home' as any);
          return;
        }
      } catch {}
      setSessionId(sid);
    }
  };

  const checkConnectionStatus = async (sid: string): Promise<boolean> => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/drive/status?session_id=${sid}`);
      return res.data.connected === true;
    } catch { return false; }
  };

  const handleConnectDrive = async () => {
    try {
      setLoading(true);
      
      // Create session
      let sid = sessionId;
      if (!sid) {
        const sessionRes = await axios.post(`${BACKEND_URL}/api/session/create`);
        sid = sessionRes.data.session_id;
        await AsyncStorage.setItem('session_id', sid!);
        setSessionId(sid);
      }

      // Get auth URL
      const oauthRes = await axios.get(
        `${BACKEND_URL}/api/oauth/drive/connect?session_id=${sid}`
      );
      const url = oauthRes.data.authorization_url;
      setAuthUrl(url);

      // Open browser for Google auth
      await WebBrowser.openBrowserAsync(url);

      // Start polling for connection
      startPolling(sid!);
      
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to initiate connection');
      setLoading(false);
    }
  };

  const startPolling = (sid: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    let attempts = 0;
    pollingRef.current = setInterval(async () => {
      attempts++;
      const connected = await checkConnectionStatus(sid);
      if (connected) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        router.replace('/(tabs)/home' as any);
        return;
      }
      if (attempts > 30) { // Stop after 60 seconds
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 2000);
  };

  const handleCheckConnection = async () => {
    const sid = sessionId || await AsyncStorage.getItem('session_id');
    if (!sid) { Alert.alert('Error', 'No session found. Try connecting again.'); return; }
    
    const connected = await checkConnectionStatus(sid);
    if (connected) {
      router.replace('/(tabs)/home' as any);
    } else {
      Alert.alert(
        'Not Connected Yet',
        'If you completed Google sign-in but got a "Page not found" error, that\'s okay! Tap "Enter Code Manually" to connect.',
        [
          { text: 'Try Again', style: 'cancel' },
          { text: 'Enter Code Manually', onPress: () => setShowManualCode(true) }
        ]
      );
    }
  };

  // Manual code submission (fallback for when redirect fails with 404)
  const handleManualCodeSubmit = async () => {
    if (!manualCode.trim()) return;
    const sid = sessionId || await AsyncStorage.getItem('session_id');
    if (!sid) { Alert.alert('Error', 'No session. Please reconnect.'); return; }

    setSubmitting(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/oauth/drive/manual-connect`, {
        session_id: sid,
        auth_code: manualCode.trim()
      });
      
      if (res.data.status === 'connected') {
        setShowManualCode(false);
        Alert.alert('Connected!', 'Google Drive connected successfully.');
        router.replace('/(tabs)/home' as any);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to connect with this code');
    } finally { setSubmitting(false); }
  };

  const handleOpenAuthUrl = async () => {
    if (authUrl) {
      await Linking.openURL(authUrl);
    } else {
      handleConnectDrive();
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
          data-testid="connect-drive-btn"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="logo-google" size={22} color="#fff" />
          )}
          <Text style={styles.connectBtnText}>
            {loading ? 'Connecting...' : 'Connect Google Drive'}
          </Text>
        </TouchableOpacity>

        {loading && (
          <>
            <TouchableOpacity
              style={styles.checkBtn}
              onPress={handleCheckConnection}
              data-testid="check-connection-btn"
            >
              <Ionicons name="checkmark-circle" size={22} color="#4285F4" />
              <Text style={styles.checkBtnText}>I've Connected - Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => setShowManualCode(true)}
              data-testid="manual-code-btn"
            >
              <Ionicons name="key" size={18} color="#FA7B17" />
              <Text style={styles.manualBtnText}>Got 404? Enter code manually</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.disclaimer}>Read-only access to your Drive files</Text>
      </View>

      {/* Manual Code Modal */}
      <Modal visible={showManualCode} transparent animationType="slide"
        onRequestClose={() => setShowManualCode(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.manualModal}>
            <Text style={styles.modalTitle}>Manual Connection</Text>
            <Text style={styles.modalDesc}>
              If you see a "Page not found" after Google sign-in, don't worry!{'\n\n'}
              Look at your browser's URL bar - it will contain a <Text style={styles.highlight}>code=</Text> parameter.{'\n\n'}
              Copy everything after <Text style={styles.highlight}>code=</Text> and before <Text style={styles.highlight}>&</Text>, then paste it below:
            </Text>
            
            <TextInput
              style={styles.codeInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Paste authorization code here..."
              placeholderTextColor="#9aa0a6"
              multiline
              autoFocus
              data-testid="manual-code-input"
            />

            {authUrl && (
              <TouchableOpacity style={styles.reopenBtn} onPress={handleOpenAuthUrl}>
                <Ionicons name="open-outline" size={16} color="#4285F4" />
                <Text style={styles.reopenBtnText}>Re-open Google sign-in</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowManualCode(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !manualCode.trim() && { opacity: 0.5 }]}
                onPress={handleManualCodeSubmit}
                disabled={!manualCode.trim() || submitting}
                data-testid="submit-code-btn"
              >
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.submitBtnText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  logoBox: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle: {
    fontSize: 15, color: '#9aa0a6', textAlign: 'center',
    marginBottom: 32, lineHeight: 22,
  },
  features: { width: '100%', marginBottom: 36 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 4,
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  featureText: { fontSize: 14, color: '#e0e0e0', flex: 1 },
  connectBtn: {
    flexDirection: 'row', backgroundColor: '#4285F4',
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: 'center',
    width: '100%', gap: 12,
    boxShadow: '0 4px 12px rgba(66,133,244,0.3)',
  },
  btnDisabled: { backgroundColor: '#5f6368' },
  connectBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  checkBtn: {
    flexDirection: 'row', backgroundColor: 'transparent',
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: 'center',
    width: '100%', gap: 12, marginTop: 14,
    borderWidth: 2, borderColor: '#4285F4',
  },
  checkBtnText: { color: '#4285F4', fontSize: 17, fontWeight: '700' },
  manualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12,
  },
  manualBtnText: { color: '#FA7B17', fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 12, color: '#5f6368', marginTop: 20 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  manualModal: {
    backgroundColor: '#16213e', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 400,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 12 },
  modalDesc: { fontSize: 13, color: '#9aa0a6', lineHeight: 20, marginBottom: 16 },
  highlight: { color: '#4285F4', fontWeight: '700' },
  codeInput: {
    backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#4285F4',
    borderRadius: 12, padding: 14, fontSize: 13, color: '#fff',
    minHeight: 70, textAlignVertical: 'top', fontFamily: 'monospace',
  },
  reopenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, alignSelf: 'center',
  },
  reopenBtnText: { color: '#4285F4', fontSize: 13, fontWeight: '600' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#5f6368', borderRadius: 12,
  },
  cancelBtnText: { fontSize: 15, color: '#9aa0a6', fontWeight: '600' },
  submitBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#34A853', borderRadius: 12,
  },
  submitBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
