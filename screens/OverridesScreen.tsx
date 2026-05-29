import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, StatusBar, Platform
} from "react-native";

const API_BASE = "http://10.44.117.200:8000";
const API_KEY_ADMIN = "chave_secreta_admin_123";

function generateIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface Override {
  id_override: number;
  id_aluno: number;
  aluno: {
    id_aluno: number;
    nome_completo: string;
    matricula: string;
  };
  bloco: string;
  tipo_override: "PERMITIR" | "BLOQUEAR";
  motivo: string;
  criado_em: string;
}

export default function OverridesScreen() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Controle de exibição padrão para não carregar todo o histórico de uma vez
  const [abaAtual, setAbaAtual] = useState<"VALIDOS" | "HISTORICO">("VALIDOS");

  const [matricula, setMatricula] = useState("");
  const [bloco, setBloco] = useState("BLOCO_AULAS");
  const [tipoOverride, setTipoOverride] = useState<"PERMITIR" | "BLOQUEAR">("PERMITIR");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchOverrides = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/overrides`, {
        method: "GET",
        headers: {
          "X-API-Key-Admin": API_KEY_ADMIN,
          "Accept": "application/json",
        },
      });

      if (!response.ok) throw new Error();
      const data = await response.json();
      
      // Caso a rota tenha sido atualizada para retornar paginação (como em Devices)
      // garanta que estamos acessando o array correto.
      const lista = data.data ? data.data : data; 
      setOverrides(lista);
    } catch (error) {
      Alert.alert("Erro", "Não foi possível sincronizar as exceções de acesso.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const handleCreateOverride = async () => {
    if (!matricula.trim() || !motivo.trim()) {
      Alert.alert("Campos obrigatórios", "Informe a matrícula do aluno e uma justificativa.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/overrides`, {
        method: "POST",
        headers: {
          "X-API-Key-Admin": API_KEY_ADMIN,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify({
          matricula: matricula.trim(),
          bloco: bloco,
          tipo_override: tipoOverride,
          motivo: motivo.trim(),
        }),
      });

      if (!response.ok) {
        if (response.status === 404) throw new Error("Matrícula não encontrada no sistema.");
        throw new Error("Erro interno ao processar a regra.");
      }

      Alert.alert("Sucesso", "Regra de exceção publicada!");
      setMatricula("");
      setMotivo("");
      setModalVisible(false);
      fetchOverrides();
    } catch (error: any) {
      Alert.alert("Erro de Operação", error.message || "Não foi possível aplicar a exceção.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOverride = async (id: number) => {
    Alert.alert(
      "Confirmar Remoção",
      "Deseja revogar esta regra de exceção e retornar ao fluxo de biometria padrão?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Revogar",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE}/api/v1/admin/overrides/${id}`, {
                method: "DELETE",
                headers: { "X-API-Key-Admin": API_KEY_ADMIN },
              });
              if (!response.ok) throw new Error();
              fetchOverrides();
            } catch (error) {
              Alert.alert("Erro", "Não foi possível excluir a regra.");
            }
          },
        },
      ]
    );
  };

  // ─── Lógica de Filtro: Regras do dia atual vs Histórico Completo ───
  const getFilteredOverrides = () => {
    if (abaAtual === "HISTORICO") return overrides;

    const dataHoje = new Date().toDateString();
    return overrides.filter((item) => {
      const dataCriacao = new Date(item.criado_em).toDateString();
      return dataCriacao === dataHoje;
    });
  };

  const listData = getFilteredOverrides();

  const renderItem = ({ item }: { item: Override }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.alunoName}>{item.aluno?.nome_completo || `Aluno ID: ${item.id_aluno}`}</Text>
          <Text style={styles.metaText}>Matrícula: {item.aluno?.matricula || "N/A"}</Text>
        </View>
        <View style={[styles.badge, item.tipo_override === "PERMITIR" ? styles.badgePermitir : styles.badgeBloquear]}>
          <Text style={styles.badgeText}>{item.tipo_override}</Text>
        </View>
      </View>
      <Text style={styles.motivoText}><Text style={{fontWeight: "600"}}>Motivo:</Text> {item.motivo}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>Bloco: {item.bloco} · {new Date(item.criado_em).toLocaleDateString()}</Text>
        <TouchableOpacity onPress={() => handleDeleteOverride(item.id_override)}>
          <Text style={styles.deleteLink}>Revogar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
        <Text style={styles.title}>Exceções de Acesso</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Criar Regra</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, abaAtual === "VALIDOS" && styles.tabActive]} 
          onPress={() => setAbaAtual("VALIDOS")}
        >
          <Text style={[styles.tabText, abaAtual === "VALIDOS" && styles.tabTextActive]}>Válidos Hoje</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, abaAtual === "HISTORICO" && styles.tabActive]} 
          onPress={() => setAbaAtual("HISTORICO")}
        >
          <Text style={[styles.tabText, abaAtual === "HISTORICO" && styles.tabTextActive]}>Histórico Antigo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id_override.toString()}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchOverrides(); }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum desvio localizado para esta visualização.</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Configurar Nova Exceção</Text>

            <Text style={styles.fieldLabel}>MATRÍCULA DO ESTUDANTE</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 202400123"
              placeholderTextColor="#5A6080"
              autoCapitalize="characters"
              value={matricula}
              onChangeText={setMatricula}
            />

            <Text style={styles.fieldLabel}>AÇÃO DE OVERRIDE</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, tipoOverride === "PERMITIR" && styles.chipPermitirActive]}
                onPress={() => setTipoOverride("PERMITIR")}
              >
                <Text style={styles.chipText}>PERMITIR ACESSO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, tipoOverride === "BLOQUEAR" && styles.chipBloquearActive]}
                onPress={() => setTipoOverride("BLOQUEAR")}
              >
                <Text style={styles.chipText}>BLOQUEAR ACESSO</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>BLOCO AFETADO</Text>
            <View style={styles.chipRow}>
              {["SEDE", "BLOCO_AULAS", "LABORATORIO"].map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, bloco === b && styles.chipActive]}
                  onPress={() => setBloco(b)}
                >
                  <Text style={styles.chipText}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>JUSTIFICATIVA / MOTIVO</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: "top" }]}
              placeholder="Ex: Cartão provisório por falha biometria facial"
              placeholderTextColor="#5A6080"
              multiline
              value={motivo}
              onChangeText={setMotivo}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnCancelText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleCreateOverride} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#0D1220" /> : <Text style={styles.btnSaveText}>Aplicar</Text>}
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#E8EBF5" },
  addButton: { backgroundColor: "#FF4D6D", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  tabsContainer: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 16, borderBottomWidth: 1, borderColor: "#1C2540" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderColor: "transparent" },
  tabActive: { borderColor: "#00E5C0" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#5A6080" },
  tabTextActive: { color: "#00E5C0" },
  list: { paddingHorizontal: 16 },
  card: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  alunoName: { fontSize: 15, fontWeight: "600", color: "#E8EBF5" },
  metaText: { fontSize: 12, color: "#8892B0" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgePermitir: { backgroundColor: "rgba(0, 229, 192, 0.15)" },
  badgeBloquear: { backgroundColor: "rgba(255, 77, 109, 0.15)" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#E8EBF5" },
  motivoText: { fontSize: 13, color: "#8892B0", marginVertical: 6 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderColor: "#1C2540" },
  dateText: { fontSize: 11, color: "#5A6080" },
  deleteLink: { fontSize: 12, fontWeight: "600", color: "#FF4D6D" },
  emptyText: { color: "#5A6080", textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#0D1220", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#E8EBF5", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: "#8892B0", marginBottom: 6 },
  input: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: "#E8EBF5", fontSize: 15, marginBottom: 16 },
  chipRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#1C2540", backgroundColor: "#111827" },
  chipActive: { backgroundColor: "#00E5C0", borderColor: "#00E5C0" },
  chipPermitirActive: { backgroundColor: "#00E5C0", borderColor: "#00E5C0" },
  chipBloquearActive: { backgroundColor: "#FF4D6D", borderColor: "#FF4D6D" },
  chipText: { color: "#E8EBF5", fontSize: 11, fontWeight: "600" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  btnCancel: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540" },
  btnCancelText: { color: "#8892B0", fontWeight: "600" },
  btnSave: { backgroundColor: "#00E5C0" },
  btnSaveText: { color: "#0D1220", fontWeight: "600" }
});