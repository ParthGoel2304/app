import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, Share, Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface ParchiItem {
  id: number;
  size: string;
  pcs: number;
  weight: number;
  rate: number;
  diff: number;
}

interface FooterRow {
  id: string;
  label: string;
  value: number;
  isPercent?: boolean;
  percentValue?: number;
  editable: boolean;
  isTotal?: boolean;
}

const DEFAULT_FOOTER_ROWS: FooterRow[] = [
  { id: 'loading', label: 'LOADING', value: 0, editable: true },
  { id: 'kanta', label: 'KANTA', value: 0, editable: true },
  { id: 'gst', label: 'GST', value: 18, isPercent: true, percentValue: 18, editable: true },
];

export default function ParchiScreen() {
  // Header fields
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [parchiDate, setParchiDate] = useState(new Date().toLocaleDateString('en-IN'));
  
  // Items
  const [items, setItems] = useState<ParchiItem[]>([]);
  const [basicRate, setBasicRate] = useState('');
  
  // Footer rows (editable, reorderable)
  const [footerRows, setFooterRows] = useState<FooterRow[]>(DEFAULT_FOOTER_ROWS);
  
  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowLabel, setNewRowLabel] = useState('');
  
  // PDF name modal
  const [showPdfNameModal, setShowPdfNameModal] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadParchi();
    }, [])
  );

  const loadParchi = async () => {
    try {
      const stored = await AsyncStorage.getItem('parchi_items');
      const br = await AsyncStorage.getItem('parchi_basic_rate');
      const header = await AsyncStorage.getItem('parchi_header');
      const footer = await AsyncStorage.getItem('parchi_footer');
      
      if (stored) {
        const rawItems = JSON.parse(stored);
        // Convert old format to new format with pcs, weight
        const converted = rawItems.map((item: any) => ({
          id: item.id,
          size: item.size,
          pcs: item.pcs || 0,
          weight: item.weight || 0,
          rate: item.finalRate || item.rate || 0,
          diff: item.diff || 0,
        }));
        setItems(converted);
      }
      if (br) setBasicRate(br);
      if (header) {
        const h = JSON.parse(header);
        setCompanyName(h.companyName || '');
        setLocation(h.location || '');
        setVehicleNo(h.vehicleNo || '');
        setParchiDate(h.date || new Date().toLocaleDateString('en-IN'));
      }
      if (footer) {
        setFooterRows(JSON.parse(footer));
      }
    } catch {}
  };

  const saveAll = async (
    newItems?: ParchiItem[],
    newFooter?: FooterRow[]
  ) => {
    const itemsToSave = newItems || items;
    const footerToSave = newFooter || footerRows;
    
    await AsyncStorage.setItem('parchi_items', JSON.stringify(itemsToSave));
    await AsyncStorage.setItem('parchi_footer', JSON.stringify(footerToSave));
    await AsyncStorage.setItem('parchi_header', JSON.stringify({
      companyName, location, vehicleNo, date: parchiDate
    }));
  };

  // Calculations
  const totalPcs = items.reduce((sum, i) => sum + (i.pcs || 0), 0);
  const totalWeight = items.reduce((sum, i) => sum + (i.weight || 0), 0);
  const subtotal = items.reduce((sum, i) => sum + ((i.weight || 0) * (i.rate || 0)), 0);
  
  const footerCharges = footerRows
    .filter(r => !r.isPercent && r.id !== 'gst')
    .reduce((sum, r) => sum + (r.value || 0), 0);
  
  const preGstTotal = subtotal + footerCharges;
  
  const gstRow = footerRows.find(r => r.id === 'gst');
  const gstPercent = gstRow?.percentValue || 18;
  const gstAmount = Math.round(preGstTotal * gstPercent / 100);
  
  const grandTotal = preGstTotal + gstAmount;

  // Item handlers
  const updateItem = (id: number, field: keyof ParchiItem, value: any) => {
    const updated = items.map(i => 
      i.id === id ? { ...i, [field]: value } : i
    );
    setItems(updated);
    saveAll(updated);
  };

  const deleteItem = (id: number) => {
    Alert.alert('Remove Item', 'Remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          const updated = items.filter(i => i.id !== id);
          setItems(updated);
          saveAll(updated);
        }
      }
    ]);
  };

  // Footer row handlers
  const updateFooterRow = (id: string, value: number) => {
    const updated = footerRows.map(r => {
      if (r.id === id) {
        if (r.isPercent) {
          return { ...r, percentValue: value };
        }
        return { ...r, value };
      }
      return r;
    });
    setFooterRows(updated);
    saveAll(undefined, updated);
  };

  const addFooterRow = () => {
    setShowAddRow(true);
    setNewRowLabel('');
  };

  const confirmAddRow = () => {
    if (newRowLabel && newRowLabel.trim()) {
      const newRow: FooterRow = {
        id: `custom_${Date.now()}`,
        label: newRowLabel.trim().toUpperCase(),
        value: 0,
        editable: true,
      };
      const updated = [...footerRows, newRow];
      setFooterRows(updated);
      saveAll(undefined, updated);
    }
    setShowAddRow(false);
    setNewRowLabel('');
  };

  const deleteFooterRow = (id: string) => {
    if (['loading', 'kanta', 'gst'].includes(id)) {
      Alert.alert('Cannot Delete', 'This is a default row. You can set its value to 0 instead.');
      return;
    }
    const updated = footerRows.filter(r => r.id !== id);
    setFooterRows(updated);
    saveAll(undefined, updated);
  };

  const moveFooterRow = (id: string, direction: 'up' | 'down') => {
    const idx = footerRows.findIndex(r => r.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === footerRows.length - 1) return;
    
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...footerRows];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setFooterRows(updated);
    saveAll(undefined, updated);
  };

  const clearAll = () => {
    Alert.alert('Clear Parchi', 'Remove all items and reset?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          setItems([]);
          setCompanyName('');
          setLocation('');
          setVehicleNo('');
          setParchiDate(new Date().toLocaleDateString('en-IN'));
          setFooterRows(DEFAULT_FOOTER_ROWS);
          await AsyncStorage.removeItem('parchi_items');
          await AsyncStorage.removeItem('parchi_header');
          await AsyncStorage.removeItem('parchi_footer');
        }
      }
    ]);
  };

  // Share handlers
  const generateText = () => {
    let text = `OM SHREE\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (companyName) text += `M/S ${companyName}\n`;
    if (location) text += `${location}\n`;
    text += `DATE: ${parchiDate}\n`;
    if (vehicleNo) text += `V.N.: ${vehicleNo}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    text += `S.N. | SIZE | PCS | WT(KG) | RATE | AMOUNT\n`;
    text += `─────────────────────────────────────────\n`;
    
    items.forEach((item, idx) => {
      const amount = (item.weight || 0) * (item.rate || 0);
      text += `${idx + 1} | ${item.size} | ${item.pcs} | ${item.weight} | ${item.rate.toFixed(2)} | ${Math.round(amount)}\n`;
    });
    
    text += `─────────────────────────────────────────\n`;
    text += `TOTAL | ${totalPcs} | ${totalWeight} | | ${Math.round(subtotal)}\n`;
    
    footerRows.forEach(row => {
      if (row.id === 'gst') {
        text += `GST @${gstPercent}% | | | | ${gstAmount}\n`;
      } else if (row.value > 0) {
        text += `${row.label} | | | | ${row.value}\n`;
      }
    });
    
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `GRAND TOTAL: ₹${grandTotal.toLocaleString('en-IN')}\n`;
    
    return text;
  };

  const shareWhatsApp = async () => {
    const text = generateText();
    try {
      await Share.share({
        message: text,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share');
    }
  };

  // Show PDF name modal before generating
  const promptPdfName = () => {
    // Default name: Date + Party + Time
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
    const defaultName = `${companyName || 'Parchi'}_${dateStr}_${timeStr}`;
    setPdfFileName(defaultName);
    setShowPdfNameModal(true);
  };

  const generatePDF = async () => {
    setShowPdfNameModal(false);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 18px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .info-box { border: 1px solid #000; padding: 10px; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: center; }
          th { background: #f0f0f0; font-weight: bold; }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .total-row { font-weight: bold; background: #f9f9f9; }
          .grand-total { font-size: 14px; font-weight: bold; background: #e0e0e0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>OM SHREE</h1>
        </div>
        
        <div class="info-box">
          <div class="info-row">
            <span><strong>M/S</strong> ${companyName || '_______________'}</span>
            <span><strong>DATE:</strong> ${parchiDate}</span>
          </div>
          <div class="info-row">
            <span>${location || ''}</span>
            <span><strong>V.N.:</strong> ${vehicleNo || '_______________'}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>S.N.</th>
              <th>SIZE</th>
              <th>PCS (NOS)</th>
              <th>WT (KG)</th>
              <th>RATE</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td class="text-left">${item.size}</td>
                <td>${item.pcs || ''}</td>
                <td>${item.weight || ''}</td>
                <td>${item.rate.toFixed(2)}</td>
                <td class="text-right">${Math.round((item.weight || 0) * (item.rate || 0))}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td></td>
              <td class="text-left">TOTAL</td>
              <td>${totalPcs}</td>
              <td>${totalWeight}</td>
              <td></td>
              <td class="text-right">${Math.round(subtotal)}</td>
            </tr>
            ${footerRows.filter(r => r.id !== 'gst' && r.value > 0).map(row => `
              <tr>
                <td></td>
                <td class="text-left">${row.label}</td>
                <td></td>
                <td></td>
                <td></td>
                <td class="text-right">${row.value}</td>
              </tr>
            `).join('')}
            <tr>
              <td></td>
              <td class="text-left">GST @${gstPercent}%</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="text-right">${gstAmount}</td>
            </tr>
            <tr class="grand-total">
              <td></td>
              <td class="text-left">GRAND TOTAL</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="text-right">₹${grandTotal.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('PDF Generated', `Saved to: ${uri}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to generate PDF');
    }
  };

  // Inline edit helpers
  const startEdit = (field: string, currentValue: string | number) => {
    setEditingField(field);
    setEditValue(String(currentValue));
  };

  const confirmEdit = (onSave: (val: string) => void) => {
    onSave(editValue);
    setEditingField(null);
    setEditValue('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Parchi</Text>
        <View style={styles.headerActions}>
          {items.length > 0 && (
            <>
              <TouchableOpacity onPress={shareWhatsApp} style={styles.headerBtn}>
                <Ionicons name="share-social" size={20} color="#25D366" />
              </TouchableOpacity>
              <TouchableOpacity onPress={generatePDF} style={styles.headerBtn}>
                <Ionicons name="document" size={20} color="#EA4335" />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={clearAll} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={20} color="#EA4335" />
          </TouchableOpacity>
        </View>
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
          {/* OM SHREE Header */}
          <Text style={styles.omShree}>OM SHREE</Text>
          
          {/* Company Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>M/S</Text>
              {editingField === 'company' ? (
                <TextInput
                  style={styles.infoInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={() => confirmEdit(v => { setCompanyName(v); saveAll(); })}
                  autoFocus
                  placeholder="Company Name"
                />
              ) : (
                <TouchableOpacity onPress={() => startEdit('company', companyName)} style={styles.infoValue}>
                  <Text style={styles.infoText}>{companyName || 'Tap to enter'}</Text>
                  <Ionicons name="pencil" size={12} color="#9aa0a6" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location</Text>
              {editingField === 'location' ? (
                <TextInput
                  style={styles.infoInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={() => confirmEdit(v => { setLocation(v); saveAll(); })}
                  autoFocus
                  placeholder="Location"
                />
              ) : (
                <TouchableOpacity onPress={() => startEdit('location', location)} style={styles.infoValue}>
                  <Text style={styles.infoText}>{location || 'Tap to enter'}</Text>
                  <Ionicons name="pencil" size={12} color="#9aa0a6" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.infoRowSplit}>
              <View style={styles.infoHalf}>
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoTextBold}>{parchiDate}</Text>
              </View>
              <View style={styles.infoHalf}>
                <Text style={styles.infoLabel}>V.N.</Text>
                {editingField === 'vehicle' ? (
                  <TextInput
                    style={styles.infoInputSmall}
                    value={editValue}
                    onChangeText={setEditValue}
                    onBlur={() => confirmEdit(v => { setVehicleNo(v); saveAll(); })}
                    autoFocus
                    placeholder="Vehicle No"
                  />
                ) : (
                  <TouchableOpacity onPress={() => startEdit('vehicle', vehicleNo)}>
                    <Text style={styles.infoTextBold}>{vehicleNo || 'Tap to enter'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Items Table */}
          <View style={styles.tableWrap}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colSn]}>S.N.</Text>
              <Text style={[styles.th, styles.colSize]}>SIZE</Text>
              <Text style={[styles.th, styles.colPcs]}>PCS</Text>
              <Text style={[styles.th, styles.colWt]}>WT</Text>
              <Text style={[styles.th, styles.colRate]}>RATE</Text>
              <Text style={[styles.th, styles.colAmt]}>AMT</Text>
              <View style={styles.colDel} />
            </View>

            {items.map((item, idx) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colSn]}>{idx + 1}</Text>
                <Text style={[styles.td, styles.colSize]} numberOfLines={1}>{item.size}</Text>
                
                {editingField === `pcs_${item.id}` ? (
                  <TextInput
                    style={[styles.tdInput, styles.colPcs]}
                    value={editValue}
                    onChangeText={setEditValue}
                    onBlur={() => confirmEdit(v => updateItem(item.id, 'pcs', parseInt(v) || 0))}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.colPcs}
                    onPress={() => startEdit(`pcs_${item.id}`, item.pcs)}
                  >
                    <Text style={styles.td}>{item.pcs || '-'}</Text>
                  </TouchableOpacity>
                )}
                
                {editingField === `wt_${item.id}` ? (
                  <TextInput
                    style={[styles.tdInput, styles.colWt]}
                    value={editValue}
                    onChangeText={setEditValue}
                    onBlur={() => confirmEdit(v => updateItem(item.id, 'weight', parseFloat(v) || 0))}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.colWt}
                    onPress={() => startEdit(`wt_${item.id}`, item.weight)}
                  >
                    <Text style={styles.td}>{item.weight || '-'}</Text>
                  </TouchableOpacity>
                )}
                
                {editingField === `rate_${item.id}` ? (
                  <TextInput
                    style={[styles.tdInput, styles.colRate]}
                    value={editValue}
                    onChangeText={setEditValue}
                    onBlur={() => confirmEdit(v => updateItem(item.id, 'rate', parseFloat(v) || 0))}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.colRate}
                    onPress={() => startEdit(`rate_${item.id}`, item.rate)}
                  >
                    <Text style={[styles.td, styles.rateText]}>{item.rate.toFixed(2)}</Text>
                  </TouchableOpacity>
                )}
                
                <Text style={[styles.td, styles.colAmt, styles.amtText]}>
                  {Math.round((item.weight || 0) * (item.rate || 0))}
                </Text>
                
                <TouchableOpacity style={styles.colDel} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="close-circle" size={18} color="#EA4335" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Total Row */}
            <View style={[styles.tableRow, styles.totalRow]}>
              <Text style={[styles.td, styles.colSn]}></Text>
              <Text style={[styles.td, styles.colSize, styles.totalLabel]}>TOTAL</Text>
              <Text style={[styles.td, styles.colPcs, styles.totalVal]}>{totalPcs}</Text>
              <Text style={[styles.td, styles.colWt, styles.totalVal]}>{totalWeight}</Text>
              <Text style={[styles.td, styles.colRate]}></Text>
              <Text style={[styles.td, styles.colAmt, styles.totalVal]}>{Math.round(subtotal)}</Text>
              <View style={styles.colDel} />
            </View>
          </View>

          {/* Footer Rows */}
          <View style={styles.footerSection}>
            {footerRows.map((row, idx) => (
              <View key={row.id} style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.footerMove}
                  onPress={() => moveFooterRow(row.id, 'up')}
                  disabled={idx === 0}
                >
                  <Ionicons name="chevron-up" size={16} color={idx === 0 ? '#d0d0d0' : '#4285F4'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.footerMove}
                  onPress={() => moveFooterRow(row.id, 'down')}
                  disabled={idx === footerRows.length - 1}
                >
                  <Ionicons name="chevron-down" size={16} color={idx === footerRows.length - 1 ? '#d0d0d0' : '#4285F4'} />
                </TouchableOpacity>
                
                <Text style={styles.footerLabel}>
                  {row.id === 'gst' ? `GST @${row.percentValue}%` : row.label}
                </Text>
                
                {editingField === `footer_${row.id}` ? (
                  <TextInput
                    style={styles.footerInput}
                    value={editValue}
                    onChangeText={setEditValue}
                    onBlur={() => confirmEdit(v => updateFooterRow(row.id, parseFloat(v) || 0))}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.footerValueWrap}
                    onPress={() => startEdit(`footer_${row.id}`, row.isPercent ? row.percentValue! : row.value)}
                  >
                    <Text style={styles.footerValue}>
                      {row.id === 'gst' 
                        ? `₹${gstAmount.toLocaleString('en-IN')}`
                        : `₹${row.value.toLocaleString('en-IN')}`
                      }
                    </Text>
                    <Ionicons name="pencil" size={12} color="#9aa0a6" />
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity
                  style={styles.footerDel}
                  onPress={() => deleteFooterRow(row.id)}
                >
                  <Ionicons name="close" size={16} color="#EA4335" />
                </TouchableOpacity>
              </View>
            ))}
            
            {showAddRow ? (
              <View style={styles.addRowInput}>
                <TextInput
                  style={styles.addRowTextInput}
                  value={newRowLabel}
                  onChangeText={setNewRowLabel}
                  placeholder="Enter row label (e.g. TRANSPORT)"
                  placeholderTextColor="#9aa0a6"
                  autoFocus
                />
                <TouchableOpacity style={styles.addRowConfirm} onPress={confirmAddRow}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.addRowCancel} onPress={() => setShowAddRow(false)}>
                  <Ionicons name="close" size={18} color="#EA4335" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRowBtn} onPress={addFooterRow}>
                <Ionicons name="add-circle" size={18} color="#4285F4" />
                <Text style={styles.addRowText}>Add Row</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Grand Total */}
          <View style={styles.grandTotalCard}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <Text style={styles.grandTotalValue}>₹{grandTotal.toLocaleString('en-IN')}</Text>
          </View>

          {/* Share Buttons */}
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareBtn} onPress={shareWhatsApp}>
              <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              <Text style={styles.shareBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareBtn, styles.pdfBtn]} onPress={generatePDF}>
              <Ionicons name="document-text" size={22} color="#fff" />
              <Text style={styles.shareBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#202124' },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerBtn: { padding: 4 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#202124', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginTop: 8 },
  content: { padding: 16 },
  omShree: {
    fontSize: 22, fontWeight: '800', color: '#202124',
    textAlign: 'center', marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e8e8e8', marginBottom: 16,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoRowSplit: { flexDirection: 'row', marginTop: 4 },
  infoHalf: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9aa0a6', fontWeight: '600', width: 55 },
  infoValue: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 14, color: '#202124' },
  infoTextBold: { fontSize: 14, fontWeight: '600', color: '#202124' },
  infoInput: {
    flex: 1, fontSize: 14, color: '#202124',
    borderBottomWidth: 1, borderBottomColor: '#4285F4', paddingVertical: 2,
  },
  infoInputSmall: {
    fontSize: 14, color: '#202124',
    borderBottomWidth: 1, borderBottomColor: '#4285F4', paddingVertical: 2,
  },
  tableWrap: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e8e8e8', marginBottom: 12,
  },
  tableHead: {
    flexDirection: 'row', backgroundColor: '#4285F4',
    paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center',
  },
  th: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  totalRow: { backgroundColor: '#f9f9f9' },
  td: { fontSize: 12, color: '#202124', textAlign: 'center' },
  tdInput: {
    fontSize: 12, color: '#202124', textAlign: 'center',
    borderWidth: 1, borderColor: '#4285F4', borderRadius: 4,
    paddingVertical: 2, paddingHorizontal: 4,
  },
  totalLabel: { fontWeight: '700' },
  totalVal: { fontWeight: '700', color: '#4285F4' },
  rateText: { color: '#34A853', fontWeight: '600' },
  amtText: { fontWeight: '600' },
  colSn: { width: 28 },
  colSize: { flex: 2.5, textAlign: 'left', paddingLeft: 4 },
  colPcs: { width: 36 },
  colWt: { width: 44 },
  colRate: { width: 48 },
  colAmt: { width: 52, textAlign: 'right' },
  colDel: { width: 24, alignItems: 'center' },
  footerSection: { marginBottom: 12 },
  footerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  footerMove: { padding: 4 },
  footerLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#202124', marginLeft: 8 },
  footerValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerValue: { fontSize: 14, fontWeight: '700', color: '#202124' },
  footerInput: {
    fontSize: 14, fontWeight: '700', color: '#202124',
    borderWidth: 1, borderColor: '#4285F4', borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 8, minWidth: 80, textAlign: 'right',
  },
  footerDel: { padding: 6, marginLeft: 8 },
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 12, gap: 6,
  },
  addRowText: { fontSize: 13, color: '#4285F4', fontWeight: '600' },
  addRowInput: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8,
  },
  addRowTextInput: {
    flex: 1, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontSize: 14, color: '#202124',
  },
  addRowConfirm: {
    backgroundColor: '#34A853', width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  addRowCancel: {
    backgroundColor: '#fff', width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EA4335',
  },
  grandTotalCard: {
    backgroundColor: '#4285F4', borderRadius: 14, padding: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  grandTotalValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  shareRow: { flexDirection: 'row', gap: 12 },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14, gap: 8,
  },
  pdfBtn: { backgroundColor: '#EA4335' },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
