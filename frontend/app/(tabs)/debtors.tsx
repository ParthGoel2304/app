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

interface DebtorItem {
  name: string;
  city: string;
  debtTotal: number;
  decision: string;
}

interface BillItem {
  month: string;
  invoiceDate: string;
  dueDate: string;
  city: string;
  daysLeft: string;
  dealerName: string;
  dueAmount: number;
  weight: string;
  billId: string;
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

  // Data
  const [debtors, setDebtors] = useState<DebtorItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [localPayments, setLocalPayments] = useState<PaymentLocal[]>([]);

  // Filters for bills
  const [billFilter, setBillFilter] = useState<'all' | 'overdue' | 'upcoming'>('all');

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ debtor_name: '', amount: '', date: '', reference: '', notes: '' });

  // Detail modal
  const [selectedDebtor, setSelectedDebtor] = useState<DebtorItem | null>(null);
  const [showAskOnly, setShowAskOnly] = useState(false);

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const getSid = async () => await AsyncStorage.getItem('session_id');

  const findSalesFile = async (sid: string) => {
    const res = await axios.get(`${BACKEND_URL}/api/drive/files?session_id=${sid}&folder_only=true`);
    const files = res.data.files || [];
    return files.find((f: any) => f.file_name.toLowerCase().includes('sales'));
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const sid = await getSid();
      if (!sid) { setError('no_session'); return; }

      const file = await findSalesFile(sid);
      if (!file) { setError('no_file'); return; }

      const sheetsRes = await axios.get(`${BACKEND_URL}/api/drive/file/${file.file_id}/sheets?session_id=${sid}`);
      const sheets: string[] = sheetsRes.data.sheet_names || [];

      // Load "Sales Summary" sheet for debtors
      const summarySheet = sheets.find(s => s.toLowerCase().includes('sales summary')) || sheets.find(s => s.toLowerCase().includes('summary'));
      if (summarySheet) {
        const dataRes = await axios.get(
          `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${file.file_id}&sheet_name=${encodeURIComponent(summarySheet)}&cell_range=A1:Z500&_t=${Date.now()}`
        );
        const rows = dataRes.data.data || [];
        // A=name, B=city, E=debt total ("-" means 0)
      const items: DebtorItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] || String(r[0]).trim() === '') continue;
        const rawDebt = String(r[4] || '0').trim();
        const debtTotal = rawDebt === '-' || rawDebt === ' - ' || rawDebt === '' ? 0 : parseFloat(rawDebt) || 0;
        const decision = String(r[5] || '').trim();
           items.push({
            name: String(r[0]).trim(),
            city: String(r[1] || '').trim(),
            debtTotal,
            decision,
          });
        }
        setDebtors(items);
      }

      // Load "Sales" sheet for bills
      const salesSheet = sheets.find(s => s.toLowerCase() === 'sales') || sheets.find(s => s.toLowerCase().includes('sales') && !s.toLowerCase().includes('summary'));
      if (salesSheet) {
        const dataRes = await axios.get(
          `${BACKEND_URL}/api/excel/read?session_id=${sid}&file_id=${file.file_id}&sheet_name=${encodeURIComponent(salesSheet)}&cell_range=A1:Z500&_t=${Date.now()}`
        );
        const rows = dataRes.data.data || [];
        // A=Month, B=Invoice Date, C=Due Date, E=City, G=Days Left, H=Dealer, I=Due Amt, J=Weight, K=Bill ID
        const items: BillItem[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[0] && !r[7]) continue; // skip empty
          const rawAmt = String(r[8] || '0').trim();
          items.push({
            month: String(r[0] || '').trim(),
            invoiceDate: String(r[1] || '').trim(),
            dueDate: String(r[2] || '').trim(),
            city: String(r[4] || '').trim(),
            daysLeft: String(r[6] || '').trim(),
            dealerName: String(r[7] || '').trim(),
            dueAmount: rawAmt === '-' ? 0 : parseFloat(rawAmt) || 0,
            weight: String(r[9] || '').trim(),
            billId: String(r[10] || '').trim(),
          });
        }
        setBills(items);
      }

      // Load local payments
      const payRes = await axios.get(`${BACKEND_URL}/api/debtors/payments/list?session_id=${sid}`);
      setLocalPayments(payRes.data.payments || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.debtor_name.trim() || !paymentForm.amount.trim()) {
      Alert.alert('Error', 'Debtor name and amount are required');
      return;
    }
    try {
      const sid = await getSid();
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
      const payRes = await axios.get(`${BACKEND_URL}/api/debtors/payments/list?session_id=${sid}`);
      setLocalPayments(payRes.data.payments || []);
      Alert.alert('Done', 'Payment recorded');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed');
    }
  };

  const handleDeletePayment = async (payment: PaymentLocal) => {
    Alert.alert('Delete Payment', `Remove payment of ${payment.amount} for ${payment.debtor_name}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const sid = await getSid();
            if (!sid) return;
            await axios.delete(
              `${BACKEND_URL}/api/debtors/payments/${encodeURIComponent(payment.date)}?session_id=${sid}&debtor_name=${encodeURIComponent(payment.debtor_name)}`
            );
            const payRes = await axios.get(`${BACKEND_URL}/api/debtors/payments/list?session_id=${sid}`);
            setLocalPayments(payRes.data.payments || []);
          } catch {}
        }
      }
    ]);
  };

  // Filtered data
  const filteredDebtors = debtors.filter(d => {
  const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.city.toLowerCase().includes(search.toLowerCase());
  const matchesAsk = !showAskOnly || d.decision.toLowerCase() === 'ask';
  return matchesSearch && matchesAsk;
});

  const filteredBills = bills.filter(b => {
    const q = search.toLowerCase();
    const matchesSearch = !q || b.dealerName.toLowerCase().includes(q) || b.city.toLowerCase().includes(q) || b.billId.toLowerCase().includes(q) || b.month.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (billFilter === 'overdue') {
      const days = parseFloat(b.daysLeft);
      return !isNaN(days) && days < 0;
    }
    if (billFilter === 'upcoming') {
      const days = parseFloat(b.daysLeft);
      return !isNaN(days) && days >= 0 && days <= 30;
    }
    return true;
  });

  const totalOutstanding = debtors.reduce((s, d) => s + d.debtTotal, 0);

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'debtors', label: 'Debtors', icon: 'people' },
    { key: 'bills', label: 'Bills', icon: 'document-text' },
    { key: 'payments', label: 'Payments', icon: 'cash' },
  ];

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
          <Text style={st.errTitle}>No Sales File Found</Text>
          <Text style={st.errSub}>Make sure your Drive folder has a file with "Sales" in the name, containing a "Sales Summary" sheet.</Text>
          <TouchableOpacity style={st.retryBtn} onPress={loadAll}><Ionicons name="refresh" size={18} color="#fff" /><Text style={st.retryText}>Retry</Text></TouchableOpacity>
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
          <Text style={st.summaryVal}>{debtors.length}</Text>
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
          <TouchableOpacity key={t.key} style={[st.tab, activeTab === t.key && st.tabActive]} onPress={() => { setActiveTab(t.key); setSearch(''); }} data-testid={`tab-${t.key}`}>
            <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? '#4285F4' : '#9aa0a6'} />
            <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + Filters */}
      <View style={st.searchRow}>
        <View style={st.searchBar}>
          <Ionicons name="search" size={16} color="#9aa0a6" />
          <TextInput style={st.searchInput} placeholder="Search..." placeholderTextColor="#5f6368" value={search} onChangeText={setSearch} />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#5f6368" /></TouchableOpacity> : null}
        </View>
      </View>

      {/* Bill filters */}
      {activeTab === 'bills' && (
        <View style={st.filterRow}>
          {(['all', 'overdue', 'upcoming'] as const).map(f => (
            <TouchableOpacity key={f} style={[st.filterChip, billFilter === f && st.filterChipActive]} onPress={() => setBillFilter(f)} data-testid={`filter-${f}`}>
              <Text style={[st.filterChipText, billFilter === f && st.filterChipTextActive]}>
                {f === 'all' ? `All (${bills.length})` : f === 'overdue' ? 'Overdue' : 'Due < 30d'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* DEBTORS TAB */}
      {activeTab === 'debtors' && (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 }}>
            <TouchableOpacity
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
                backgroundColor: showAskOnly ? '#FBBC05' : '#0f3460',
                borderWidth: 1, borderColor: showAskOnly ? '#FBBC05' : '#1e3a5f' }}
              onPress={() => setShowAskOnly(!showAskOnly)}>
              <Text style={{ fontSize: 12, color: showAskOnly ? '#000' : '#9aa0a6', fontWeight: '600' }}>
                Ask Only
              </Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={filteredDebtors}
            keyExtractor={(_, i) => `d-${i}`}
            contentContainerStyle={st.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity style={st.card} onPress={() => setSelectedDebtor(item)}>
                <View style={st.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={st.cardCity}>{item.city || 'N/A'}</Text>
                    {item.decision ? (
                      <Text style={{ fontSize: 11, color: item.decision.toLowerCase() === 'ask' ? '#FBBC05' : '#34A853', fontWeight: '600', marginTop: 2 }}>
                        {item.decision}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[st.debtBadge, { backgroundColor: item.debtTotal > 0 ? '#3d1a1a' : '#1a3d1a' }]}>
                      <Text style={[st.debtBadgeText, { color: item.debtTotal > 0 ? '#EA4335' : '#34A853' }]}>
                        {item.debtTotal > 0 ? item.debtTotal.toLocaleString('en-IN') : 'Settled'}
                      </Text>
                    </View>
                    {item.balance !== 0 && (
                      <Text style={{ fontSize: 11, color: '#FBBC05', fontWeight: '600' }}>
                        Bal: {item.balance.toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<View style={st.center}><Text style={st.errSub}>No debtors found.</Text></View>}
          />
        </>
      )}

      {/* BILLS TAB */}
      {activeTab === 'bills' && (
        <FlatList
          data={filteredBills}
          keyExtractor={(_, i) => `b-${i}`}
          contentContainerStyle={st.listContent}
          renderItem={({ item }) => {
            const days = parseFloat(item.daysLeft);
            const isOverdue = !isNaN(days) && days < 0;
            return (
              <View style={st.billCard}>
                <View style={st.billTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.billDealer} numberOfLines={1}>{item.dealerName || '-'}</Text>
                    <Text style={st.billCity}>{item.city || '-'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.billAmount, isOverdue && { color: '#EA4335' }]}>
                      {item.dueAmount > 0 ? item.dueAmount.toLocaleString('en-IN') : '-'}
                    </Text>
                    <View style={[st.daysBadge, { backgroundColor: isOverdue ? '#3d1a1a' : '#1a3d2a' }]}>
                      <Text style={[st.daysText, { color: isOverdue ? '#EA4335' : '#34A853' }]}>
                        {isNaN(days) ? item.daysLeft || '-' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={st.billMeta}>
                  <View style={st.billMetaItem}>
                    <Text style={st.billMetaLabel}>Month</Text>
                    <Text style={st.billMetaVal}>{item.month || '-'}</Text>
                  </View>
                  <View style={st.billMetaItem}>
                    <Text style={st.billMetaLabel}>Invoice</Text>
                    <Text style={st.billMetaVal}>{item.invoiceDate || '-'}</Text>
                  </View>
                  <View style={st.billMetaItem}>
                    <Text style={st.billMetaLabel}>Due Date</Text>
                    <Text style={st.billMetaVal}>{item.dueDate || '-'}</Text>
                  </View>
                </View>
                <View style={st.billBottom}>
                  <Text style={st.billId}>Bill: {item.billId || '-'}</Text>
                  <Text style={st.billWeight}>{item.weight ? `${item.weight} kg` : ''}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<View style={st.center}><Text style={st.errSub}>No bills found.</Text></View>}
        />
      )}

      {/* PAYMENTS TAB */}
      {activeTab === 'payments' && (
        <FlatList
          data={localPayments}
          keyExtractor={(_, i) => `p-${i}`}
          contentContainerStyle={st.listContent}
          renderItem={({ item }) => (
            <View style={st.payCard}>
              <View style={st.payTop}>
                <View style={{ flex: 1 }}>
                  <Text style={st.payName}>{item.debtor_name}</Text>
                  <Text style={st.payDate}>{item.date}</Text>
                </View>
                <Text style={st.payAmt}>{parseFloat(String(item.amount)).toLocaleString('en-IN')}</Text>
              </View>
              {item.reference && <Text style={st.payRef}>Ref: {item.reference}</Text>}
              {item.notes && <Text style={st.payNotes}>{item.notes}</Text>}
              <TouchableOpacity style={st.deleteBtn} onPress={() => handleDeletePayment(item)} data-testid={`delete-pay-${item.date}`}>
                <Ionicons name="trash-outline" size={14} color="#EA4335" />
                <Text style={st.deleteBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={st.center}>
              <Ionicons name="cash-outline" size={40} color="#5f6368" />
              <Text style={st.errSub}>No payments recorded yet.</Text>
              <TouchableOpacity style={st.recordBtn} onPress={() => setShowPaymentModal(true)}>
                <Ionicons name="add" size={16} color="#fff" /><Text style={st.recordBtnText}>Record Payment</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Debtor Detail Modal */}
      <Modal visible={!!selectedDebtor} transparent animationType="slide" onRequestClose={() => setSelectedDebtor(null)}>
        <View style={st.modalBg}>
          <View style={st.detailModal}>
            <View style={st.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>{selectedDebtor?.name}</Text>
                <Text style={st.modalCity}>{selectedDebtor?.city || 'N/A'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDebtor(null)}><Ionicons name="close" size={24} color="#9aa0a6" /></TouchableOpacity>
            </View>
            <View style={st.modalDebt}>
              <Text style={st.modalDebtLabel}>Total Debt</Text>
              <Text style={[st.modalDebtVal, { color: (selectedDebtor?.debtTotal || 0) > 0 ? '#EA4335' : '#34A853' }]}>
                {(selectedDebtor?.debtTotal || 0) > 0 ? (selectedDebtor?.debtTotal || 0).toLocaleString('en-IN') : 'Settled'}
              </Text>
            </View>
            {/* Payments for this debtor */}
            <Text style={st.modalSectionTitle}>Payments</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {localPayments.filter(p => p.debtor_name === selectedDebtor?.name).length === 0 ? (
                <Text style={st.errSub}>No payments for this debtor.</Text>
              ) : (
                localPayments.filter(p => p.debtor_name === selectedDebtor?.name).map((p, i) => (
                  <View key={i} style={st.payCard}>
                    <View style={st.payTop}>
                      <Text style={st.payDate}>{p.date}</Text>
                      <Text style={st.payAmt}>{parseFloat(String(p.amount)).toLocaleString('en-IN')}</Text>
                    </View>
                    {p.reference && <Text style={st.payRef}>Ref: {p.reference}</Text>}
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={[st.recordBtn, { marginTop: 16, justifyContent: 'center' }]} onPress={() => {
              setSelectedDebtor(null);
              setPaymentForm({ ...paymentForm, debtor_name: selectedDebtor?.name || '' });
              setShowPaymentModal(true);
            }}>
              <Ionicons name="add" size={16} color="#fff" /><Text style={st.recordBtnText}>Record Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={st.modalBg}>
          <View style={st.formModal}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}><Ionicons name="close" size={24} color="#9aa0a6" /></TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={st.fieldLabel}>Debtor Name *</Text>
              <TextInput style={st.formInput} value={paymentForm.debtor_name} onChangeText={v => setPaymentForm({ ...paymentForm, debtor_name: v })} placeholder="Enter debtor name" placeholderTextColor="#5f6368" data-testid="payment-debtor-name" />
              <Text style={st.fieldLabel}>Amount *</Text>
              <TextInput style={st.formInput} value={paymentForm.amount} onChangeText={v => setPaymentForm({ ...paymentForm, amount: v })} placeholder="Enter amount" placeholderTextColor="#5f6368" keyboardType="numeric" data-testid="payment-amount" />
              <Text style={st.fieldLabel}>Date</Text>
              <TextInput style={st.formInput} value={paymentForm.date} onChangeText={v => setPaymentForm({ ...paymentForm, date: v })} placeholder="YYYY-MM-DD (default: today)" placeholderTextColor="#5f6368" />
              <Text style={st.fieldLabel}>Reference</Text>
              <TextInput style={st.formInput} value={paymentForm.reference} onChangeText={v => setPaymentForm({ ...paymentForm, reference: v })} placeholder="Cheque no, UPI ref, etc." placeholderTextColor="#5f6368" />
              <Text style={st.fieldLabel}>Notes</Text>
              <TextInput style={[st.formInput, { height: 70, textAlignVertical: 'top' }]} value={paymentForm.notes} onChangeText={v => setPaymentForm({ ...paymentForm, notes: v })} placeholder="Optional notes" placeholderTextColor="#5f6368" multiline />
              <TouchableOpacity style={st.submitBtn} onPress={handleRecordPayment} data-testid="submit-payment-btn">
                <Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={st.submitBtnText}>Save Payment</Text>
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
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4285F4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  retryText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  recordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4285F4', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  recordBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#0f3460' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '500' },
  summaryVal: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 4 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#0f3460' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#1e3a5f' },
  tabActive: { backgroundColor: '#1a2f5e', borderColor: '#4285F4' },
  tabText: { fontSize: 13, color: '#9aa0a6', fontWeight: '500' },
  tabTextActive: { color: '#4285F4', fontWeight: '600' },
  searchRow: { marginHorizontal: 16, marginTop: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0f3460', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#1e3a5f' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  filterRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#1e3a5f' },
  filterChipActive: { backgroundColor: '#1a2f5e', borderColor: '#4285F4' },
  filterChipText: { fontSize: 12, color: '#9aa0a6' },
  filterChipTextActive: { color: '#4285F4', fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 80 },
  // Debtor card
  card: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#0f3460' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cardCity: { fontSize: 12, color: '#9aa0a6', marginTop: 2 },
  debtBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  debtBadgeText: { fontSize: 14, fontWeight: '700' },
  // Bill card
  billCard: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#0f3460' },
  billTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  billDealer: { fontSize: 15, fontWeight: '700', color: '#fff' },
  billCity: { fontSize: 12, color: '#9aa0a6', marginTop: 2 },
  billAmount: { fontSize: 17, fontWeight: '700', color: '#FBBC05' },
  daysBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  daysText: { fontSize: 11, fontWeight: '600' },
  billMeta: { flexDirection: 'row', gap: 8, marginTop: 10 },
  billMetaItem: { flex: 1, backgroundColor: '#0f3460', borderRadius: 8, padding: 8, alignItems: 'center' },
  billMetaLabel: { fontSize: 10, color: '#9aa0a6' },
  billMetaVal: { fontSize: 12, fontWeight: '600', color: '#e0e0e0', marginTop: 2 },
  billBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  billId: { fontSize: 11, color: '#4285F4', fontWeight: '500' },
  billWeight: { fontSize: 11, color: '#9aa0a6' },
  // Payment card
  payCard: { backgroundColor: '#16213e', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#0f3460' },
  payTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  payDate: { fontSize: 12, color: '#9aa0a6' },
  payAmt: { fontSize: 16, fontWeight: '700', color: '#34A853' },
  payRef: { fontSize: 12, color: '#FBBC05', marginTop: 4 },
  payNotes: { fontSize: 12, color: '#9aa0a6', marginTop: 2, fontStyle: 'italic' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#3d1a1a' },
  deleteBtnText: { fontSize: 11, color: '#EA4335', fontWeight: '500' },
  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detailModal: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  formModal: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalCity: { fontSize: 13, color: '#9aa0a6', marginTop: 2 },
  modalDebt: { backgroundColor: '#0f3460', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  modalDebtLabel: { fontSize: 12, color: '#9aa0a6' },
  modalDebtVal: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  modalSectionTitle: { fontSize: 14, fontWeight: '600', color: '#4285F4', marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: '#9aa0a6', fontWeight: '500', marginTop: 12, marginBottom: 4 },
  formInput: { backgroundColor: '#0f3460', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#1e3a5f' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#34A853', borderRadius: 10, paddingVertical: 14, marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
