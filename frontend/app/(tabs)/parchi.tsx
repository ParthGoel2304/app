import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ParchiItem {
  id: number;
  size: string;
  diff: number;
  finalRate: number;
  stock: string;
  editingRate?: boolean;
  editRateValue?: string;
}

export default function ParchiScreen() {
  const [parchiName, setParchiName] = useState('Parchi 1');
  const [editingName, setEditingName] = useState(false);
  const [items, setItems] = useState<ParchiItem[]>([]);
  const [basicRate, setBasicRate] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadParchi();
    }, [])
  );

  const loadParchi = async () => {
    try {
      const stored = await AsyncStorage.getItem('parchi_items');
      const br = await AsyncStorage.getItem('parchi_basic_rate');
      const name = await AsyncStorage.getItem('parchi_name');
      if (stored) setItems(JSON.parse(stored));
      if (br) setBasicRate(br);
      if (name) setParchiName(name);
    } catch {}
  };

  const saveItems = async (updated: ParchiItem[]) => {
    setItems(updated);
    await AsyncStorage.setItem('parchi_items', JSON.stringify(updated));
  };

  const deleteItem = (id: number) => {
    Alert.alert('Remove', 'Remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => saveItems(items.filter(i => i.id !== id))
      }
    ]);
  };

  const startEditRate = (id: number, cur: number) => {
    setItems(items.map(i =>
      i.id === id
        ? { ...i, editingRate: true, editRateValue: cur.toString() }
        : { ...i, editingRate: false }
    ));
  };

  const confirmEditRate = async (id: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newRate = parseFloat(item.editRateValue || '0') || item.finalRate;
    const updated = items.map(i =>
      i.id === id
        ? { ...i, finalRate: newRate, editingRate: false, editRateValue: undefined }
        : i
    );
    await saveItems(updated);
  };

  const clearAll = () => {
    Alert.alert('Clear Parchi', 'Remove all items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          await saveItems([]);
          await AsyncStorage.removeItem('parchi_name');
          setParchiName('Parchi 1');
        }
      }
    ]);
  };

  const saveName = async (name: string) => {
    setParchiName(name);
    setEditingName(false);
    await AsyncStorage.setItem('parchi_name', name);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {editingName ? (
          <TextInput
            style={styles.nameInput}
            value={parchiName}
            onChangeText={setParchiName}
            onBlur={() => saveName(parchiName)}
            onSubmitEditing={() => saveName(parchiName)}
            autoFocus
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingName(true)} style={styles.nameRow}>
            <Text style={styles.headerTitle}>{parchiName}</Text>
            <Ionicons name="pencil-outline" size={15} color="#9aa0a6" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
        {items.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={20} color="#EA4335" />
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>Parchi is Empty</Text>
          <Text style={styles.emptySub}>
            Use the Filter tab to search sizes, select them, and add here
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Column headers */}
          <View style={styles.tableHead}>
            <Text style={[styles.headCell, styles.cSize]}>Size</Text>
            <Text style={[styles.headCell, styles.cDiff]}>Diff</Text>
            <Text style={[styles.headCell, styles.cRate]}>Rate</Text>
            <View style={styles.cDel} />
          </View>

          {items.map(item => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={[styles.cell, styles.cSize]} numberOfLines={2}>
                {item.size}
              </Text>
              <Text
                style={[
                  styles.cell, styles.cDiff,
                  { color: item.diff >= 0 ? '#34A853' : '#EA4335' }
                ]}
              >
                {item.diff >= 0 ? '+' : ''}{item.diff}
              </Text>
              <View style={styles.cRate}>
                {item.editingRate ? (
                  <TextInput
                    style={styles.rateInput}
                    value={item.editRateValue}
                    onChangeText={v =>
                      setItems(items.map(i =>
                        i.id === item.id ? { ...i, editRateValue: v } : i
                      ))
                    }
                    onBlur={() => confirmEditRate(item.id)}
                    onSubmitEditing={() => confirmEditRate(item.id)}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity onPress={() => startEditRate(item.id, item.finalRate)}>
                    <Text style={styles.rateValue}>₹{item.finalRate}</Text>
                    <Text style={styles.rateTap}>tap to edit</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.cDel}
                onPress={() => deleteItem(item.id)}
              >
                <Ionicons name="close-circle" size={20} color="#EA4335" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {items.length} item{items.length !== 1 ? 's' : ''}  ·  Basic Rate: ₹{basicRate}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#202124' },
  nameInput: {
    fontSize: 20, fontWeight: '700', color: '#202124', flex: 1,
    borderBottomWidth: 2, borderBottomColor: '#4285F4', paddingBottom: 2,
  },
  clearBtn: { padding: 8 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#202124', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginTop: 8 },
  content: { padding: 16 },
  tableHead: {
    flexDirection: 'row', backgroundColor: '#4285F4',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
    alignItems: 'center',
  },
  headCell: { fontSize: 12, fontWeight: '700', color: '#fff' },
  tableRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12, marginBottom: 6,
    borderWidth: 1, borderColor: '#e8e8e8', alignItems: 'center',
  },
  cell: { fontSize: 13, color: '#202124', fontWeight: '500' },
  cSize: { flex: 3 },
  cDiff: { flex: 1.2, textAlign: 'center' },
  cRate: { flex: 2, alignItems: 'center' },
  cDel: { width: 28, alignItems: 'center' },
  rateValue: { fontSize: 14, fontWeight: '700', color: '#34A853', textAlign: 'center' },
  rateTap: { fontSize: 9, color: '#9aa0a6', textAlign: 'center' },
  rateInput: {
    borderWidth: 1, borderColor: '#4285F4', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, fontSize: 14,
    color: '#202124', minWidth: 70, textAlign: 'center',
  },
  summary: {
    marginTop: 12, padding: 16, backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#e8e8e8', alignItems: 'center',
  },
  summaryText: { fontSize: 13, color: '#5f6368', fontWeight: '500' },
});
