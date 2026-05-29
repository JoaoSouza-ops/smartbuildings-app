import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, StatusBar, Platform
} from "react-native";

const API_BASE = "http://10.44.117.200:8000";
const API_KEY_ADMIN = "chave_secreta_admin_123";

interface Device {
  id_dispositivo: number;
  localizacao: string;
  bloco: string;
  ativo: number;
  ultimo_ping: string | null;
}

function isOffline(ultimo_ping: string | null): boolean {
  if (!ultimo_ping) return true;
  return Date.now() - new Date(ultimo_ping).getTime() > 2 * 60 * 1000; // 2 minutos
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Campos do formulário de criação
  const [localizacao, setLocalizacao] = useState("");
  const [bloco, setBloco] = useState("BLOCO_AULAS");
  const [submitting, setSubmitting] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/devices`, {
        method: "GET",
        headers: {
          "X-API-Key-Admin": API_KEY_ADMIN,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const responseData = await response.json();
      
      // Aqui está a correção: acessamos responseData.data porque a API retorna
      // { data: [...], total: X, page: Y, size: Z, pages: W }
      setDevices(responseData.data || []); 
      
    } catch (error) {
      Alert.alert("Erro", "Não foi possível carregar a lista de dispositivos de acesso.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  const handleCreateDevice = async () => {
    if (!localizacao.trim()) {
      Alert.alert("Aviso", "Por favor, informe a localização do dispositivo.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/devices`, {
        method: "POST",
        headers: {
          "X-API-Key-Admin": API_KEY_ADMIN,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          localizacao: localizacao.trim(),
          bloco: bloco,
          ativo: 1
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao salvar o novo terminal.");
      }

      Alert.alert("Sucesso", "Novo terminal de acesso registrado!");
      setLocalizacao("");
      setModalVisible(false);
      fetchDevices();
    } catch (error) {
      Alert.alert("Erro de Cadastro", "Não foi possível registrar o dispositivo.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: Device }) => {
    const offline = isOffline(item.ultimo_ping);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.localizacao}>{item.localizacao}</Text>
          <View style={[styles.statusBadge, offline ? styles.badgeOffline : styles.badgeOnline]}>
            <Text style={styles.statusText}>{offline ? "OFFLINE" : "ONLINE"}</Text>
          </View>
        </View>
        <Text style={styles.metaText}>Bloco: {item.bloco}</Text>
        <Text style={styles.metaText}>
          Último Sinal: {item.ultimo_ping ? new Date(item.ultimo_ping).toLocaleTimeString() : "Nunca conectado"}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5C0" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Terminais de Borda</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id_dispositivo.toString()}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum dispositivo de acesso localizado.</Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Registrar Terminal</Text>
            
            <Text style={styles.fieldLabel}>LOCALIZAÇÃO EXATA</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Catraca Principal - Bloco B"
              placeholderTextColor="#5A6080"
              value={localizacao}
              onChangeText={setLocalizacao}
            />

            <Text style={styles.fieldLabel}>BLOCO INSTITUCIONAL</Text>
            <View style={styles.chipRow}>
              {["SEDE", "BLOCO_AULAS", "LABORATORIO", "BIBLIOTECA"].map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, bloco === b && styles.chipActive]}
                  onPress={() => setBloco(b)}
                >
                  <Text style={styles.chipText}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.btn, styles.btnCancel]} 
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btn, styles.btnSave]} 
                onPress={handleCreateDevice}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator size="small" color="#0D1220" /> : <Text style={styles.btnSaveText}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1220", paddingTop: Platform.OS === "ios" ? 50 : 20 },
  center: { flex: 1, backgroundColor: "#0D1220", justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700", color: "#E8EBF5" },
  addButton: { backgroundColor: "#00E5C0", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#0D1220", fontWeight: "600", fontSize: 14 },
  list: { paddingHorizontal: 16 },
  card: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  localizacao: { fontSize: 16, fontWeight: "600", color: "#E8EBF5", flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOnline: { backgroundColor: "rgba(0, 229, 192, 0.15)" },
  badgeOffline: { backgroundColor: "rgba(255, 77, 109, 0.15)" },
  statusText: { fontSize: 10, fontWeight: "700", color: "#E8EBF5" },
  metaText: { fontSize: 13, color: "#8892B0", marginTop: 2 },
  emptyText: { color: "#5A6080", textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#0D1220", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#E8EBF5", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: "#8892B0", marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: "#E8EBF5", fontSize: 15, marginBottom: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#1C2540", backgroundColor: "#111827" },
  chipActive: { backgroundColor: "#00E5C0", borderColor: "#00E5C0" },
  chipText: { color: "#E8EBF5", fontSize: 12 },
  modalActions: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  btnCancel: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540" },
  btnCancelText: { color: "#8892B0", fontWeight: "600" },
  btnSave: { backgroundColor: "#00E5C0" },
  btnSaveText: { color: "#0D1220", fontWeight: "600" }
});