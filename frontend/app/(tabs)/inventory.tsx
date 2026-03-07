import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, FlatList, Modal
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExcelStore, getColOffset } from '../../utils/store';

interface StockItem {
  rowIndex: number;
  size: string;
  altName: string;
  sizeDiff: number;
  jgtStock: string;
  jgiStock: string;
  totalStock: string;
}

export default function InventoryScreen() {
  const router = useRouter();
  const [dataAvailable, setDataAvailable] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [sortBy, setSortBy] = useState<'size' | 'stock'>('size');
  const [sortAsc, setSortAsc] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [])
  );

  const loadInventory = () => {
    const store = getExcelStore();
    if (!store || store.data.length < 2) {
      setDataAvailable(false);
      setItems([]);
      return;
    }

    setDataAvailable(true);
    const offset = getColOffset(store.cellRange);
    const eIdx = 4 - offset;   // Col E - Size
    const fIdx = 5 - offset;   // Col F - Alt name
    const hIdx = 7 - offset;   // Col H - Size diff
    const mIdx = 12 - offset;  // Col M - JGT Stock
    const nIdx = 13 - offset;  // Col N - JGI Stock
    const oIdx = 14 - offset;  // Col O - Total Stock

    const loadedItems: StockItem[] = [];
    
    for (let i = 1; i < store.data.length; i++) {
      const row = store.data[i];
      if (!row) continue;
      
      const size = (row[eIdx] || '').toString().trim();
      if (!size) continue;

      const altName = (row[fIdx] || '').toString().trim();
      const diffRaw = (row[hIdx] || '0').toString().replace(/[^\d.-]/g, '');
      const sizeDiff = parseFloat(diffRaw) || 0;
      const jgtStock = (row[mIdx] || '0').toString();
      const jgiStock = (row[nIdx] || '0').toString();
      const totalStock = (row[oIdx] || '0').toString();

      loadedItems.push({
        rowIndex: i,
        size,
        altName,
        sizeDiff,
        jgtStock,
        jgiStock,
        totalStock,
      });
    }

    setItems(loadedItems);
    setFilteredItems(loadedItems);
  };

  // Search filter
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredItems(items);
      return;
    }
    
    const q = query.toLowerCase().replace(/\s+/g, '');
    const filtered = items.filter(item => {
      const normSize = item.size.toLowerCase().replace(/\s+/g, '');
      const normAlt = item.altName.toLowerCase().replace(/\s+/g, '');
      return normSize.includes(q) || normAlt.includes(q);
    });
    setFilteredItems(filtered);
  };

  // Sort
  const handleSort = (by: 'size' | 'stock') => {
    if (sortBy === by) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(by);
      setSortAsc(true);
    }

    const sorted = [...filteredItems].sort((a, b) => {
      if (by === 'size') {
        return sortAsc ? a.size.localeCompare(b.size) : b.size.localeCompare(a.size);
      } else {
        const stockA = parseFloat(a.totalStock) || 0;
        const stockB = parseFloat(b.totalStock) || 0;
        return sortAsc ? stockA - stockB : stockB - stockA;
      }
    });
    setFilteredItems(sorted);
  };

  // Stock level color
  const getStockColor = (stock: string) => {
    const val = parseFloat(stock) || 0;
    if (val === 0) return '#EA4335'; // Red - empty
    if (val < 500) return '#FA7B17'; // Orange - low
    return '#34A853'; // Green - available
  };

  const renderItem = ({ item }: { item: StockItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.8}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemSize} numberOfLines={1}>{item.size}</Text>
        <View style={[styles.stockBadge, { backgroundColor: getStockColor(item.totalStock) + '20' }]}>
          <View style={[styles.stockDot, { backgroundColor: getStockColor(item.totalStock) }]} />
          <Text style={[styles.stockText, { color: getStockColor(item.totalStock) }]}>
            {parseFloat(item.totalStock).toLocaleString('en-IN')} kg
          </Text>
        </View>
      </View>
      {item.altName && (
        <Text style={styles.itemAlt} numberOfLines={1}>{item.altName}</Text>
      )}
      <View style={styles.itemDetails}>
        <View style={styles.detailChip}>
          <Text style={styles.detailLabel}>Diff</Text>
          <Text style={[styles.detailValue, { color: item.sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
            {item.sizeDiff >= 0 ? '+' : ''}{item.sizeDiff}
          </Text>
        </View>
        <View style={styles.detailChip}>
          <Text style={styles.detailLabel}>JGT</Text>
          <Text style={styles.detailValue}>{item.jgtStock}</Text>
        </View>
        <View style={styles.detailChip}>
          <Text style={styles.detailLabel}>JGI</Text>
          <Text style={styles.detailValue}>{item.jgiStock}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (!dataAvailable) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inventory</Text>
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="cube-outline" size={64} color="#d0d0d0" />
          <Text style={styles.emptyTitle}>No Data Loaded</Text>
          <Text style={styles.emptySub}>Load stock data from the Home tab</Text>
          <TouchableOpacity
            style={styles.goHomeBtn}
            onPress={() => router.navigate('/(tabs)/home' as any)}
          >
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={styles.goHomeBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredItems.length} items</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#9aa0a6" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search size or alias..."
          placeholderTextColor="#c0c0c0"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9aa0a6" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort Options */}
      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[styles.sortBtn, sortBy === 'size' && styles.sortBtnActive]}
          onPress={() => handleSort('size')}
        >
          <Text style={[styles.sortBtnText, sortBy === 'size' && styles.sortBtnTextActive]}>
            Size {sortBy === 'size' && (sortAsc ? '↑' : '↓')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortBy === 'stock' && styles.sortBtnActive]}
          onPress={() => handleSort('stock')}
        >
          <Text style={[styles.sortBtnText, sortBy === 'stock' && styles.sortBtnTextActive]}>
            Stock {sortBy === 'stock' && (sortAsc ? '↑' : '↓')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => `${item.rowIndex}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Detail Modal */}
      <Modal
        visible={selectedItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <View style={styles.detailModal}>
            {selectedItem && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedItem.size}</Text>
                  <TouchableOpacity onPress={() => setSelectedItem(null)}>
                    <Ionicons name="close" size={24} color="#5f6368" />
                  </TouchableOpacity>
                </View>
                
                {selectedItem.altName && (
                  <Text style={styles.modalAlt}>{selectedItem.altName}</Text>
                )}

                <View style={styles.modalGrid}>
                  <View style={styles.modalGridItem}>
                    <Text style={styles.modalGridLabel}>Size Diff</Text>
                    <Text style={[styles.modalGridValue, { color: selectedItem.sizeDiff >= 0 ? '#34A853' : '#EA4335' }]}>
                      {selectedItem.sizeDiff >= 0 ? '+' : ''}{selectedItem.sizeDiff}
                    </Text>
                  </View>
                  <View style={styles.modalGridItem}>
                    <Text style={styles.modalGridLabel}>JGT Stock</Text>
                    <Text style={styles.modalGridValue}>{selectedItem.jgtStock} kg</Text>
                  </View>
                  <View style={styles.modalGridItem}>
                    <Text style={styles.modalGridLabel}>JGI Stock</Text>
                    <Text style={styles.modalGridValue}>{selectedItem.jgiStock} kg</Text>
                  </View>
                  <View style={[styles.modalGridItem, styles.modalGridTotal]}>
                    <Text style={styles.modalGridLabel}>Total Stock</Text>
                    <Text style={[styles.modalGridValue, styles.totalValue]}>
                      {parseFloat(selectedItem.totalStock).toLocaleString('en-IN')} kg
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.addToFilterBtn}
                  onPress={() => {
                    setSelectedItem(null);
                    router.push({
                      pathname: '/(tabs)/filter' as any,
                    });
                  }}
                >
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.addToFilterText}>Search in Filter</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  countBadge: {
    backgroundColor: '#0f3460', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  countText: { fontSize: 12, color: '#4285F4', fontWeight: '600' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#9aa0a6', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  goHomeBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, gap: 8,
  },
  goHomeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0f3460', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1e3a5f',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#fff' },
  sortBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  sortLabel: { fontSize: 13, color: '#9aa0a6' },
  sortBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#0f3460',
    borderWidth: 1, borderColor: '#1e3a5f',
  },
  sortBtnActive: { backgroundColor: '#1a2f5e', borderColor: '#4285F4' },
  sortBtnText: { fontSize: 12, color: '#9aa0a6', fontWeight: '500' },
  sortBtnTextActive: { color: '#4285F4', fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  itemCard: {
    backgroundColor: '#16213e', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#0f3460',
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemSize: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1 },
  stockBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 6,
  },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 12, fontWeight: '600' },
  itemAlt: { fontSize: 12, color: '#9aa0a6', marginTop: 4, marginBottom: 8 },
  itemDetails: { flexDirection: 'row', gap: 8, marginTop: 8 },
  detailChip: {
    flex: 1, backgroundColor: '#0f3460', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  detailLabel: { fontSize: 10, color: '#9aa0a6', fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#e0e0e0', marginTop: 2 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  detailModal: {
    backgroundColor: '#16213e', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  modalAlt: { fontSize: 14, color: '#9aa0a6', marginBottom: 20 },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  modalGridItem: {
    width: '47%', backgroundColor: '#0f3460', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  modalGridTotal: { width: '100%', backgroundColor: '#1a2f5e' },
  modalGridLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '500' },
  modalGridValue: { fontSize: 18, fontWeight: '700', color: '#e0e0e0', marginTop: 4 },
  totalValue: { fontSize: 24, color: '#4285F4' },
  addToFilterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4285F4', borderRadius: 12, paddingVertical: 14,
    marginTop: 20, gap: 8,
  },
  addToFilterText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
