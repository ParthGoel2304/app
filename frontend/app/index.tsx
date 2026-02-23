import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('session_id');
      if (sessionId) {
        // Check if Drive is connected
        const response = await axios.get(`${BACKEND_URL}/api/drive/status?session_id=${sessionId}`);
        if (response.data.connected) {
          router.replace('/files');
          return;
        }
      }
    } catch (error) {
      console.log('No existing session');
    } finally {
      setChecking(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setLoading(true);
      
      // Create session
      const sessionResponse = await axios.post(`${BACKEND_URL}/api/session/create`);
      const sessionId = sessionResponse.data.session_id;
      
      // Save session
      await AsyncStorage.setItem('session_id', sessionId);
      
      // Get OAuth URL
      const oauthResponse = await axios.get(
        `${BACKEND_URL}/api/oauth/drive/connect?session_id=${sessionId}`
      );
      
      const authUrl = oauthResponse.data.authorization_url;
      
      // Open browser for OAuth
      const result = await WebBrowser.openBrowserAsync(authUrl);
      
      if (result.type === 'cancel' || result.type === 'dismiss') {
        Alert.alert('Cancelled', 'Please complete the authentication to continue');
        setLoading(false);
        return;
      }
      
      // Wait a bit for callback to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check connection status
      const statusResponse = await axios.get(
        `${BACKEND_URL}/api/drive/status?session_id=${sessionId}`
      );
      
      if (statusResponse.data.connected) {
        Alert.alert('Success', 'Google Drive connected successfully!');
        router.replace('/files');
      } else {
        Alert.alert('Error', 'Failed to connect. Please try again.');
      }
      
    } catch (error: any) {
      console.error('Connection error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to connect to Google Drive');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="document-text" size={80} color="#4285F4" />
        
        <Text style={styles.title}>Excel Reader</Text>
        <Text style={styles.subtitle}>Connect your Google Drive to read Excel files</Text>
        
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={24} color="#34A853" />
            <Text style={styles.featureText}>Read Excel files from Google Drive</Text>
          </View>
          
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={24} color="#34A853" />
            <Text style={styles.featureText}>Select specific sheets and ranges</Text>
          </View>
          
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={24} color="#34A853" />
            <Text style={styles.featureText}>Manual sync on demand</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={[styles.connectButton, loading && styles.buttonDisabled]}
          onPress={handleConnectDrive}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={24} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Connect Google Drive</Text>
            </>
          )}
        </TouchableOpacity>
        
        <Text style={styles.disclaimer}>
          We only request read-only access to your files
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#202124',
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#5f6368',
    textAlign: 'center',
    marginBottom: 40,
  },
  featureList: {
    width: '100%',
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#202124',
    marginLeft: 12,
    flex: 1,
  },
  connectButton: {
    flexDirection: 'row',
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#9aa0a6',
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#5f6368',
    marginTop: 16,
    textAlign: 'center',
  },
});