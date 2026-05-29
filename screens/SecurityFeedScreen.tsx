import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, StatusBar,
  Platform, ActivityIndicator,
} from "react-native";

// ─── Config ───────────────────────────────────────────────────────────────────
const WS_URL        = "ws://10.44.117.200:8000/ws/feed";
const API_KEY_ADMIN = "chave_secreta_admin_123";

// ─── Payload real do manager.broadcast() ─────────────────────────────────────
// Estrutura flat montada por _montar_payload_ws() + .update() no verify_access.
//
// Casos emitidos pelo backend:
//
//  1. Face não reconhecida (distancia > THRESHOLD):
//     resultado: "BLOQUEADO", codigo_motivo: "ROSTO_NAO_RECONHECIDO", id_aluno: null, nome_aluno: "Desconhecido"
//
//  2. RBAC bloqueou (aluno identificado mas sem permissão):
//     resultado: "BLOQUEADO", codigo_motivo: <código RBAC>, id_aluno: <int>, nome_aluno: <nome>
//
//  3. Acesso liberado:
//     resultado: "LIBERADO", codigo_motivo: "ACESSO_OK", id_aluno: <int>, nome_aluno: <nome>
//
// Nota: status 422 (LowQualityImageError) lança HTTPException direto — não faz
// broadcast, portanto nunca chega ao WS.
interface WsBroadcastPayload {
  // Campos de identidade
  id_aluno:     number | null;
  nome_aluno:   string;
  // Resultado do motor RBAC
  resultado:    "LIBERADO" | "BLOQUEADO";
  codigo_motivo: string; // "ACESSO_OK" | "ROSTO_NAO_RECONHECIDO" | código RBAC
  // Infraestrutura do dispositivo (vindos de _montar_payload_ws)
  localizacao:  string;
  ocorrido_em:  string; // ISO 8601
  // Campos opcionais que _montar_payload_ws pode incluir
  id?:          string;
  distancia?:   number;
  mac_address?: string;
}

// ─── Modelo normalizado para a lista ─────────────────────────────────────────
// "DESCONHECIDO" é o estado visual para ROSTO_NAO_RECONHECIDO:
// o aluno existe no sistema mas o rosto não bateu com nenhum vetor.
type ResultadoAcesso = "LIBERADO" | "BLOQUEADO" | "DESCONHECIDO";

interface AccessEvent {
  id:            string;
  resultado:     ResultadoAcesso;
  nome_aluno:    string;
  id_aluno:      number | null;
  codigo_motivo: string;
  localizacao:   string;
  ocorrido_em:   string;
  distancia?:    number;
}

type WsStatus = "conectando" | "conectado" | "desconectado" | "erro";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Mapeia o payload flat do broadcast para o modelo de exibição.
// "ROSTO_NAO_RECONHECIDO" é separado de "BLOQUEADO" para ter cor/ícone próprios.
function normalizarEvento(raw: WsBroadcastPayload): AccessEvent {
  let resultado: ResultadoAcesso;
  if (raw.resultado === "LIBERADO") {
    resultado = "LIBERADO";
  } else if (raw.codigo_motivo === "ROSTO_NAO_RECONHECIDO") {
    resultado = "DESCONHECIDO"; // face não bateu com nenhum vetor biométrico
  } else {
    resultado = "BLOQUEADO";    // identificado, mas RBAC negou
  }

  return {
    id:            raw.id ?? Math.random().toString(36).slice(2),
    resultado,
    nome_aluno:    raw.nome_aluno || "—",
    id_aluno:      raw.id_aluno,
    codigo_motivo: raw.codigo_motivo,
    localizacao:   raw.localizacao || "Terminal",
    ocorrido_em:   raw.ocorrido_em || new Date().toISOString(),
    distancia:     raw.distancia,
  };
}

// Converte codigo_motivo (snake_case do backend) em texto legível
function labelMotivo(codigo: string, resultado: ResultadoAcesso): string {
  if (resultado === "LIBERADO") return "ACESSO AUTORIZADO";
  const mapa: Record<string, string> = {
    ROSTO_NAO_RECONHECIDO:  "ROSTO NÃO RECONHECIDO",
    FORA_DO_TURNO:          "FORA DO TURNO",
    FORA_DO_BLOCO:          "FORA DO BLOCO",
    ACESSO_SUSPENSO:        "ACESSO SUSPENSO",
    OVERRIDE_BLOQUEADO:     "OVERRIDE: BLOQUEADO",
    SEM_VINCULO_ATIVO:      "SEM VÍNCULO ATIVO",
  };
  return mapa[codigo] ?? codigo.replace(/_/g, " ");
}

// ─── Paleta semântica por resultado ──────────────────────────────────────────
const COR: Record<ResultadoAcesso, string> = {
  LIBERADO:     "#00E5C0",
  BLOQUEADO:    "#FF4D6D",
  DESCONHECIDO: "#F5A623",
};

const ICONE: Record<ResultadoAcesso, string> = {
  LIBERADO:     "✓",
  BLOQUEADO:    "✕",
  DESCONHECIDO: "?",
};

// ─── Card de evento ───────────────────────────────────────────────────────────
function EventCard({ item }: { item: AccessEvent }) {
  const cor   = COR[item.resultado];
  const icone = ICONE[item.resultado];
  const hora  = new Date(item.ocorrido_em).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const motivoLabel = labelMotivo(item.codigo_motivo, item.resultado);

  return (
    <View style={[styles.card, { borderLeftColor: cor }]}>
      {/* Ícone */}
      <View style={styles.cardLeft}>
        <View style={[styles.iconBox, {
          backgroundColor: cor + "18",
          borderColor:     cor + "44",
          borderWidth: 1,
        }]}>
          <Text style={[styles.iconText, { color: cor }]}>{icone}</Text>
        </View>
      </View>

      {/* Corpo */}
      <View style={styles.cardBody}>
        {/* Nome + hora */}
        <View style={styles.rowBetween}>
          <Text style={styles.nomeAluno} numberOfLines={1}>{item.nome_aluno}</Text>
          <Text style={styles.hora}>{hora}</Text>
        </View>

        {/* Localização + distância biométrica */}
        <View style={styles.rowBetween}>
          <Text style={styles.localizacao} numberOfLines={1}>📍 {item.localizacao}</Text>
          {item.distancia != null && (
            <Text style={styles.distancia}>d={item.distancia.toFixed(3)}</Text>
          )}
        </View>

        {/* Motivo */}
        <Text style={[styles.motivo, { color: cor }]} numberOfLines={1}>
          {motivoLabel}
        </Text>
      </View>
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function SecurityFeedScreen() {
  const [events,     setEvents]     = useState<AccessEvent[]>([]);
  const [wsStatus,   setWsStatus]   = useState<WsStatus>("conectando");
  const [contadores, setContadores] = useState({ liberados: 0, bloqueados: 0, desconhecidos: 0 });
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    function connect() {
      setWsStatus("conectando");
      ws.current = new WebSocket(`${WS_URL}?token=${API_KEY_ADMIN}`);

      ws.current.onopen = () => setWsStatus("conectado");

      ws.current.onmessage = (e) => {
        try {
          const raw: WsBroadcastPayload = JSON.parse(e.data);

          // Valida presença dos campos mínimos do broadcast
          if (!raw.resultado || !raw.codigo_motivo) return;

          // Aceita apenas LIBERADO e BLOQUEADO (os dois únicos valores
          // emitidos pelo verify_access). Descarta heartbeats ou outros frames.
          if (raw.resultado !== "LIBERADO" && raw.resultado !== "BLOQUEADO") return;

          const evento = normalizarEvento(raw);

          setEvents((prev) => [evento, ...prev.slice(0, 49)]);
          setContadores((prev) => ({
            liberados:     evento.resultado === "LIBERADO"     ? prev.liberados     + 1 : prev.liberados,
            bloqueados:    evento.resultado === "BLOQUEADO"    ? prev.bloqueados    + 1 : prev.bloqueados,
            desconhecidos: evento.resultado === "DESCONHECIDO" ? prev.desconhecidos + 1 : prev.desconhecidos,
          }));
        } catch (err) {
          console.warn("[WS] Erro ao processar mensagem:", err);
        }
      };

      ws.current.onerror = () => setWsStatus("erro");

      ws.current.onclose = () => {
        setWsStatus("desconectado");
        setTimeout(connect, 5000);
      };
    }

    connect();
    return () => { ws.current?.close(); };
  }, []);

  const statusColor = { conectado: "#00E5C0", conectando: "#F5A623", desconectado: "#FF4D6D", erro: "#FF4D6D" }[wsStatus];
  const statusLabel = { conectado: "AO VIVO", conectando: "CONECTANDO", desconectado: "DESCONECTADO", erro: "ERRO" }[wsStatus];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Fluxo de Acesso</Text>
          <Text style={styles.subtitle}>Monitoramento biométrico em tempo real</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor + "55" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Contadores */}
      <View style={styles.statsRow}>
        {([
          { label: "LIBERADOS",     valor: contadores.liberados,     cor: "#00E5C0" },
          { label: "BLOQUEADOS",    valor: contadores.bloqueados,    cor: "#FF4D6D" },
          { label: "DESCONHECIDOS", valor: contadores.desconhecidos, cor: "#F5A623" },
        ] as const).map(({ label, valor, cor }) => (
          <View key={label} style={[styles.statCard, { borderColor: cor + "33" }]}>
            <Text style={[styles.statValue, { color: cor }]}>{valor}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Lista */}
      {wsStatus === "conectando" && events.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#00E5C0" />
          <Text style={styles.loadingText}>Abrindo túnel de eventos...</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard item={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aguardando transmissões das catracas...</Text>
          }
        />
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#0D1220",
    paddingTop: Platform.OS === "ios" ? 50 : (StatusBar.currentHeight ?? 20),
  },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1C2540",
  },
  title:    { fontSize: 20, fontWeight: "700", color: "#E8EBF5" },
  subtitle: { fontSize: 11, color: "#5A6080", marginTop: 2 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#111827", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },

  statsRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#111827", borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, alignItems: "center",
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#5A6080", fontWeight: "600", letterSpacing: 0.5, marginTop: 2 },

  center:      { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { color: "#5A6080", fontSize: 13 },
  list:        { paddingHorizontal: 12, paddingBottom: 40, paddingTop: 4 },
  emptyText:   { color: "#5A6080", textAlign: "center", marginTop: 40, fontSize: 13 },

  card: {
    flexDirection: "row", backgroundColor: "#111827", borderRadius: 10,
    marginBottom: 8, overflow: "hidden", borderLeftWidth: 4,
    borderWidth: 1, borderColor: "#1C2540",
  },
  cardLeft:   { paddingLeft: 10, justifyContent: "center" },
  iconBox:    { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  iconText:   { fontSize: 14, fontWeight: "800" },
  cardBody:   { flex: 1, padding: 10, gap: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nomeAluno:  { fontSize: 13, fontWeight: "600", color: "#E8EBF5", flex: 1, marginRight: 8 },
  hora:       { fontSize: 10, color: "#5A6080" },
  localizacao:{ fontSize: 11, color: "#8892B0", flex: 1 },
  distancia:  { fontSize: 10, color: "#3A4060", fontVariant: ["tabular-nums"] },
  motivo:     { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});