import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useFocusEffect } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type TabKey = 'debtors' | 'bills' | 'payments';

interface DebtorRow {
  name: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  rows: string[][];
}

interface PaymentLocal {
  debtor_name: string;
  amount: number;
  date: string;
  reference?: string;
  notes?: string;
  created_at?: string;
}

export default function DebtorsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('debtors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Data states
  const [debtorsData, setDebtorsData] = useState<string[][]>([]);
  const [billsData, setBillsData] = useState<string[][]>([]);
  const [paymentsData, setPaymentsData] = useState<string[][]>([]);
  const [localPayments, setLocalPayments] = useState<PaymentLocal[]>([]);

  // Record payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    debtor_name: '', amount: '', date: '', reference: '', notes: ''
  });

  // Selected debtor for detail view
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadData();
    loadLocalPayments();
  }, []));

  const getSessionId = async () => {
    return await AsyncStorage.getItem('session_id');
  };

  const findDebtorFile = async (sid: string) => {
    const filesRes = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&folder_only=true`);
    const files = filesRes.data.files || [];
    // Look for a file that might contain debtor data
    return files.find((f: any) =>
      f.file_name.toLowerCase().includes('debtor') ||
      f.file_name.toLowerCase().includes('account') ||
      f.file_name.toLowerCase().includes('ledger') ||
      f.file_name.toLowerCase().includes('sales')
    );
  };

  const loadSheetData = async (sid: string, fileId: string, sheetName: string) => {
    const res = await axios.get(
      `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${fileId}&sheet_name=${encodeURIComponent(sheetName)}&cell_range=A1:Z500&_t=${Date.now()}`
    );
    return res.data.data || [];
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sid = await getSessionId();
      if (!sid) { setError('No session'); return; }

      const file = await findDebtorFile(sid);
      if (!file) { setError('no_file'); return; }

      // Get sheets list
      const sheetsRes = await axios.get(
        `${BACKEND_URL}/api/drive/file/${file.file_id}/sheets?session_id=${sid}`
      );
      const sheets: string[] = sheetsRes.data.sheet_names || [];

      // Load Debtors sheet
      const debtorSheet = sheets.find(s => s.toLowerCase().includes('debtor'));
      if (debtorSheet) {
        const data = await loadSheetData(sid, file.file_id, debtorSheet);
        setDebtorsData(data);
      }

      // Load OriginalBills sheet
      const billsSheet = sheets.find(s =>
        s.toLowerCase().includes('bill') || s.toLowerCase().includes('invoice')
      );
      if (billsSheet) {
        const data = await loadSheetData(sid, file.file_id, billsSheet);
        setBillsData(data);
      }

      // Load Payments sheet
      const paySheet = sheets.find(s => s.toLowerCase().includes('payment'));
      if (paySheet) {
        const data = await loadSheetData(sid, file.file_id, paySheet);
        setPaymentsData(data);
      }
    } catch (err: any) {
      console.error('Debtors load error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalPayments = async () => {
    try {
      const sid = await getSessionId();
      if (!sid) return;
      const res = await axios.get(`${BACKEND_URL}/api/debtors/payments/list?session_id=${sid}`);
      setLocalPayments(res.data.payments || []);
    } catch {}
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.debtor_name.trim() || !paymentForm.amount.trim()) {
      Alert.alert('Error', 'Debtor name and amount are required');
      return;
    }
    try {
      const sid = await getSessionId();
      if (!sid) return;
      await axios.post(`${BACKEND_URL}/api/debtors/payments/record?session_id=${sid}`, {
        debtor_name: paymentForm.debtor_name.trim(),
        amount: parseFloat(paymentForm.amount),
        date: paymentForm.date || new Date().toISOString().split('T')[0],
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });
      setShowPaymentModal(false);
      setPaymentForm({ debtor_name: '', amount: '', date: '', reference: '', notes: '' });
      loadLocalPayments();
      Alert.alert('Success', 'Payment recorded');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to record payment');
    }
  };

  // Parse debtors into structured data
  const debtorsList = React.useMemo(() => {
    if (debtorsData.length < 2) return [];
    const headers = debtorsData[0].map(h => (h || '').toString().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('party') || h.includes('debtor'));
    const billedIdx = headers.findIndex(h => h.includes('billed') || h.includes('total') || h.includes('amount'));
    const paidIdx = headers.findIndex(h => h.includes('paid') || h.includes('received'));
    const outIdx = headers.findIndex(h => h.includes('outstanding') || h.includes('balance') || h.includes('due'));

    return debtorsData.slice(1).filter(r => r[nameIdx >= 0 ? nameIdx : 0]).map(r => ({
      name: (r[nameIdx >= 0 ? nameIdx : 0] || '').toString(),
      totalBilled: parseFloat(r[billedIdx >= 0 ? billedIdx : 1]) || 0,
      totalPaid: parseFloat(r[paidIdx >= 0 ? paidIdx : 2]) || 0,
      outstanding: parseFloat(r[outIdx >= 0 ? outIdx : 3]) || 0,
      rows: [r],
    }));
  }, [debtorsData]);

  const filteredDebtors = debtorsList.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = debtorsList.reduce((s, d) => s + d.outstanding, 0);

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'debtors', label: 'Debtors', icon: 'people' },
    { key: 'bills', label: 'Bills', icon: 'document-text' },
    { key: 'payments', label: 'Payments', icon: 'cash' },
  ];

  const renderDebtorCard = ({ item }: { item: DebtorRow }) => (
    <TouchableOpacity
      style={st.card}
      onPress={() => setSelectedDebtor(item.name)}
      data-testid={`debtor-${item.name}`}
    >
      <View style={st.cardHeader}>
        <Text style={st.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={[st.outBadge, { backgroundColor: item.outstanding > 0 ? '#3d1a1a' : '#1a3d1a' }]}>
          <Text style={[st.outBadgeText, { color: item.outstanding > 0 ? '#EA4335' : '#34A853' }]}>
            {item.outstanding > 0 ? `Due: ${item.outstanding.toLocaleString('en-IN')}` : 'Settled'}
          </Text>
        </View>
      </View>
      <View style={st.cardRow}>
        <View style={st.cardStat}>
          <Text style={st.cardStatLabel}>Billed</Text>
          <Text style={st.cardStatVal}>{item.totalBilled.toLocaleString('en-IN')}</Text>
        </View>
        <View style={st.cardStat}>
          <Text style={st.cardStatLabel}>Paid</Text>
          <Text style={[st.cardStatVal, { color: '#34A853' }]}>{item.totalPaid.toLocaleString('en-IN')}</Text>
        </View>
        <View style={st.cardStat}>
          <Text style={st.cardStatLabel}>Outstanding</Text>
          <Text style={[st.cardStatVal, { color: '#EA4335' }]}>{item.outstanding.toLocaleString('en-IN')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderBillRow = ({ item, index }: { item: string[]; index: number }) => {
    if (index === 0) return null; // skip header
    return (
      <View style={st.tableRow}>
        {item.slice(0, 6).map((cell, ci) => (
          <Text key={ci} style={[st.tableCell, ci === 0 && st.tableCellFirst]} numberOfLines={1}>
            {cell || '-'}
          </Text>
        ))}
      </View>
    );
  };

  const renderPaymentItem = ({ item }: { item: PaymentLocal }) => (
    <View style={st.paymentCard}>
      <View style={st.paymentHeader}>
        <Text style={st.paymentName}>{item.debtor_name}</Text>
        <Text style={st.paymentAmt}>{parseFloat(String(item.amount)).toLocaleString('en-IN')}</Text>
      </View>
      <View style={st.paymentMeta}>
        <Text style={st.paymentDate}>{item.date}</Text>
        {item.reference && <Text style={st.paymentRef}>Ref: {item.reference}</Text>}
      </View>
      {item.notes && <Text style={st.paymentNotes}>{item.notes}</Text>}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <View style={st.center}><ActivityIndicator size="large" color="#4285F4" /><Text style={st.loadText}>Loading debtors...</Text></View>
      </SafeAreaView>
    );
  }

  if (error === 'no_file') {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <View style={st.center}>
          <Ionicons name="document-text-outline" size={48} color="#5f6368" />
          <Text style={st.errTitle}>No Debtor File Found</Text>
          <Text style={st.errSub}>Make sure your Drive folder contains a file with "Debtors", "Account" or "Ledger" in the name.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Debtors Ledger</Text>
        <TouchableOpacity style={st.recordBtn} onPress={() => setShowPaymentModal(true)} data-testid="record-payment-btn">
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={st.recordBtnText}>Record Payment</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={st.summary}>
        <View style={st.summaryItem}>
          <Text style={st.summaryLabel}>Total Debtors</Text>
          <Text style={st.summaryVal}>{debtorsList.length}</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={st.summaryLabel}>Outstanding</Text>
          <Text style={[st.summaryVal, { color: '#EA4335' }]}>{totalOutstanding.toLocaleString('en-IN')}</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={st.summaryLabel}>Payments</Text>
          <Text style={[st.summaryVal, { color: '#34A853' }]}>{localPayments.length}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={st.tabs}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[st.tab, activeTab === t.key && st.tabActive]}
            onPress={() => setActiveTab(t.key)}
            data-testid={`tab-${t.key}`}
          >
            <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? '#4285F4' : '#9aa0a6'} />
            <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={st.searchBar}>
        <Ionicons name="search" size={16} color="#9aa0a6" />
        <TextInput
          style={st.searchInput}
          placeholder="Search..."
          placeholderTextColor="#5f6368"
          value={search}
          onChangeText={setSearch}
          data-testid="debtors-search"
        />
      </View>

      {/* Content */}
      {activeTab === 'debtors' && (
        <FlatList
          data={filteredDebtors}
          renderItem={renderDebtorCard}
          keyExtractor={(item, idx) => `${item.name}-${idx}`}
          contentContainerStyle={st.listContent}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={st.errSub}>No debtors found. Make sure the file has a "Debtors" sheet.</Text>
            </View>
          }
        />
      )}

      {activeTab === 'bills' && (
        <FlatList
          data={billsData}
          renderItem={renderBillRow}
          keyExtractor={(_, idx) => `bill-${idx}`}
          contentContainerStyle={st.listContent}
          ListHeaderComponent={
            billsData.length > 0 ? (
              <View style={[st.tableRow, st.tableHeader]}>
                {billsData[0].slice(0, 6).map((h, i) => (
                  <Text key={i} style={[st.tableHeaderCell, i === 0 && st.tableCellFirst]}>{h || `Col ${i + 1}`}</Text>
                ))}
              </View>
            ) : null
          }
          stickyHeaderIndices={[0]}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={st.errSub}>No bills data found. Make sure the file has an "OriginalBills" or "Invoice" sheet.</Text>
            </View>
          }
        />
      )}

      {activeTab === 'payments' && (
        <FlatList
          data={localPayments}
          renderItem={renderPaymentItem}
          keyExtractor={(item, idx) => `pay-${idx}-${item.date}`}
          contentContainerStyle={st.listContent}
          ListHeaderComponent={
            paymentsData.length > 1 ? (
              <View style={st.excelPayHeader}>
                <Ionicons name="document-text" size={14} color="#4285F4" />
                <Text style={st.excelPayLabel}>Excel Payments: {paymentsData.length - 1} rows</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={st.errSub}>No payments recorded yet. Tap "Record Payment" to add one.</Text>
            </View>
          }
        />
      )}

      {/* Debtor Detail Modal */}
      <Modal visible={!!selectedDebtor} transparent animationType="slide" onRequestClose={() => setSelectedDebtor(null)}>
        <View style={st.modalBg}>
          <View style={st.detailModal}>
            <View style={st.detailHeader}>
              <Text style={st.detailTitle}>{selectedDebtor}</Text>
              <TouchableOpacity onPress={() => setSelectedDebtor(null)}>
                <Ionicons name="close" size={24} color="#9aa0a6" />
              </TouchableOpacity>
            </View>
            {/* Show local payments for this debtor */}
            <Text style={st.detailSectionTitle}>Recorded Payments</Text>
            <ScrollView style={st.detailScroll}>
              {localPayments.filter(p => p.debtor_name === selectedDebtor).length === 0 ? (
                <Text style={st.errSub}>No payments recorded for this debtor.</Text>
              ) : (
                localPayments.filter(p => p.debtor_name === selectedDebtor).map((p, i) => (
                  <View key={i} style={st.paymentCard}>
                    <View style={st.paymentHeader}>
                      <Text style={st.paymentDate}>{p.date}</Text>
                      <Text style={st.paymentAmt}>{parseFloat(String(p.amount)).toLocaleString('en-IN')}</Text>
                    </View>
                    {p.reference && <Text style={st.paymentRef}>Ref: {p.reference}</Text>}
                    {p.notes && <Text style={st.paymentNotes}>{p.notes}</Text>}
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={st.recordBtn}
              onPress={() => {
                setSelectedDebtor(null);
                setPaymentForm({ ...paymentForm, debtor_name: selectedDebtor || '' });
                setShowPaymentModal(true);
              }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={st.recordBtnText}>Record Payment for {selectedDebtor}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={st.modalBg}>
          <View style={st.formModal}>
            <View style={st.detailHeader}>
              <Text style={st.detailTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color="#9aa0a6" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={st.fieldLabel}>Debtor Name *</Text>
              <TextInput
                style={st.formInput}
                value={paymentForm.debtor_name}
                onChangeText={v => setPaymentForm({ ...paymentForm, debtor_name: v })}
                placeholder="Enter debtor name"
                placeholderTextColor="#5f6368"
                data-testid="payment-debtor-name"
              />
              <Text style={st.fieldLabel}>Amount *</Text>
              <TextInput
                style={st.formInput}
                value={paymentForm.amount}
                onChangeText={v => setPaymentForm({ ...paymentForm, amount: v })}
                placeholder="Enter amount"
                placeholderTextColor="#5f6368"
                keyboardType="numeric"
                data-testid="payment-amount"
              />
              <Text style={st.fieldLabel}>Date</Text>
              <TextInput
                style={st.formInput}
                value={paymentForm.date}
                onChangeText={v => setPaymentForm({ ...paymentForm, date: v })}
                placeholder="YYYY-MM-DD (default: today)"
                placeholderTextColor="#5f6368"
                data-testid="payment-date"
              />
              <Text style={st.fieldLabel}>Reference</Text>
              <TextInput
                style={st.formInput}
                value={paymentForm.reference}
                onChangeText={v => setPaymentForm({ ...paymentForm, reference: v })}
                placeholder="Cheque no, UPI ref, etc."
                placeholderTextColor="#5f6368"
              />
              <Text style={st.fieldLabel}>Notes</Text>
              <TextInput
                style={[st.formInput, { height: 80, textAlignVertical: 'top' }]}
                value={paymentForm.notes}
                onChangeText={v => setPaymentForm({ ...paymentForm, notes: v })}
                placeholder="Optional notes"
                placeholderTextColor="#5f6368"
                multiline
              />
              <TouchableOpacity style={st.submitBtn} onPress={handleRecordPayment} data-testid="submit-payment-btn">
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={st.submitBtnText}>Save Payment</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadText: { color: '#9aa0a6', marginTop: 12, fontSize: 14 },
  errTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16 },
  errSub: { color: '#9aa0a6', fontSize: 14, textAlign: 'center', marginTop: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#4285F4', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  recordBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16213e', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#0f3460',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '500' },
  summaryVal: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 4 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#0f3460' },
  tabs: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#1e3a5f',
  },
  tabActive: { backgroundColor: '#1a2f5e', borderColor: '#4285F4' },
  tabText: { fontSize: 13, color: '#9aa0a6', fontWeight: '500' },
  tabTextActive: { color: '#4285F4', fontWeight: '600' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0f3460', marginHorizontal: 16, marginTop: 10,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#1e3a5f',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 80 },
  card: {
    backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#0f3460',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  outBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  outBadgeText: { fontSize: 12, fontWeight: '600' },
  cardRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  cardStat: { flex: 1, backgroundColor: '#0f3460', borderRadius: 8, padding: 8, alignItems: 'center' },
  cardStatLabel: { fontSize: 10, color: '#9aa0a6' },
  cardStatVal: { fontSize: 14, fontWeight: '700', color: '#e0e0e0', marginTop: 2 },
  tableRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#0f3460',
    paddingVertical: 10, paddingHorizontal: 8,
  },
  tableHeader: { backgroundColor: '#16213e' },
  tableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '700', color: '#4285F4' },
  tableCell: { flex: 1, fontSize: 12, color: '#e0e0e0' },
  tableCellFirst: { flex: 1.5 },
  paymentCard: {
    backgroundColor: '#16213e', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#0f3460',
  },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  paymentAmt: { fontSize: 16, fontWeight: '700', color: '#34A853' },
  paymentMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  paymentDate: { fontSize: 12, color: '#9aa0a6' },
  paymentRef: { fontSize: 12, color: '#FBBC05' },
  paymentNotes: { fontSize: 12, color: '#9aa0a6', marginTop: 4, fontStyle: 'italic' },
  excelPayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0f3460', borderRadius: 8, padding: 10, marginBottom: 10,
  },
  excelPayLabel: { fontSize: 12, color: '#4285F4', fontWeight: '500' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detailModal: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  formModal: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  detailSectionTitle: { fontSize: 14, fontWeight: '600', color: '#4285F4', marginBottom: 10 },
  detailScroll: { maxHeight: 200, marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: '#9aa0a6', fontWeight: '500', marginTop: 12, marginBottom: 4 },
  formInput: {
    backgroundColor: '#0f3460', borderRadius: 10, padding: 12,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#1e3a5f',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#34A853', borderRadius: 10, paddingVertical: 14, marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
