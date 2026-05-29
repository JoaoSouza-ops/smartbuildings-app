import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, StatusBar, Platform,
  Animated, Easing, Dimensions, TouchableWithoutFeedback,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

// ─── Configuração ─────────────────────────────────────────────────────────────
const API_BASE        = "http://10.44.117.200:8000";
const ENROLL_ENDPOINT = "/api/v1/access/enroll";
const API_KEY_ENROLL  = "chave_secreta_enroll_123";

// ─── Tipos dos enums do contrato ──────────────────────────────────────────────
// openapi.yaml §TipoVinculoEnum / TurnoEnum
type TipoVinculo = "GRADUACAO" | "POS_GRADUACAO" | "PROFESSOR" | "FUNCIONARIO";
type Turno       = "MANHA" | "TARDE" | "NOITE" | "INTEGRAL";

// ─── Schemas do contrato ──────────────────────────────────────────────────────
// openapi.yaml §AlunoEnrollado  (HTTP 201)
interface AlunoEnrollado {
  id_aluno:      number;
  matricula:     string;
  nome_completo: string;
  mensagem:      string;
}
// openapi.yaml §ProblemDetails  (RFC 7807 — todos os erros)
interface ProblemDetails {
  type?:     string;
  title:     string;
  status:    number;
  detail?:   string | null;
  instance?: string | null;
}

// ─── Sistema de Toast ─────────────────────────────────────────────────────────
type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastPayload {
  variant:   ToastVariant;
  title:     string;
  message:   string;
  meta?:     string;          // linha extra (ex: "Matrícula: 2024001234 · ID: 42")
  duration?: number;          // ms até auto-dismiss (default 5000)
}

const TOAST_COLORS: Record<ToastVariant, string> = {
  success: "#00E5C0",
  error:   "#FF4D6D",
  warning: "#F5A623",
  info:    "#4A9EFF",
};

const TOAST_ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error:   "✕",
  warning: "!",
  info:    "i",
};

// ── Hook useToast ─────────────────────────────────────────────────────────────
function useToast() {
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  const translateY  = useRef(new Animated.Value(120)).current;
  const opacity     = useRef(new Animated.Value(0)).current;
  const progress    = useRef(new Animated.Value(1)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    progressAnim.current?.stop();
    Animated.parallel([
      Animated.timing(translateY, { toValue: 120, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,   duration: 240, useNativeDriver: true }),
    ]).start(() => setPayload(null));
  }, [translateY, opacity]);

  const show = useCallback((toast: ToastPayload) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    progressAnim.current?.stop();

    // Reset animações
    translateY.setValue(120);
    opacity.setValue(0);
    progress.setValue(1);
    setPayload(toast);

    const dur = toast.duration ?? 5000;

    // Entrada
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // Barra de progresso
    progressAnim.current = Animated.timing(progress, {
      toValue: 0, duration: dur, easing: Easing.linear, useNativeDriver: false,
    });
    progressAnim.current.start();

    dismissTimer.current = setTimeout(dismiss, dur);
  }, [translateY, opacity, progress, dismiss]);

  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  return { payload, show, dismiss, translateY, opacity, progress };
}

// ── Componente ToastNotification ──────────────────────────────────────────────
interface ToastProps {
  payload:    ToastPayload;
  translateY: Animated.Value;
  opacity:    Animated.Value;
  progress:   Animated.Value;
  onDismiss:  () => void;
}

function ToastNotification({ payload, translateY, opacity, progress, onDismiss }: ToastProps) {
  const color = TOAST_COLORS[payload.variant];
  const icon  = TOAST_ICONS[payload.variant];

  const progressWidth = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      style={[styles.toastWrapper, { transform: [{ translateY }], opacity }]}
      pointerEvents="box-none"
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.toastCard}>
          {/* Barra lateral colorida por variante */}
          <View style={[styles.toastStripe, { backgroundColor: color }]} />

          {/* Ícone */}
          <View style={[styles.toastIconBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <Text style={[styles.toastIconText, { color }]}>{icon}</Text>
          </View>

          {/* Conteúdo */}
          <View style={styles.toastBody}>
            <Text style={styles.toastTitle} numberOfLines={1}>{payload.title}</Text>
            <Text style={styles.toastMessage} numberOfLines={3}>{payload.message}</Text>
            {payload.meta ? (
              <Text style={styles.toastMeta} numberOfLines={1}>{payload.meta}</Text>
            ) : null}
          </View>

          {/* Botão fechar */}
          <TouchableOpacity onPress={onDismiss} style={styles.toastCloseBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.toastCloseIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>

      {/* Barra de progresso */}
      <Animated.View style={[styles.toastProgress, { width: progressWidth, backgroundColor: color }]} />
    </Animated.View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gerarIdempotencyKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Mapeia status HTTP → ToastPayload, usando os campos do ProblemDetails do contrato
// Mapeia status HTTP → ToastPayload, garantindo que message seja sempre string
function problemToToast(status: number, data: any, retryAfter?: string | null): ToastPayload {
  // 1. Evita crash garantindo que o detail seja convertido em string
  let safeDetail = "Ocorreu um erro inesperado.";
  
  if (typeof data?.detail === "string") {
    safeDetail = data.detail;
  } else if (Array.isArray(data?.detail)) {
    // É um HTTPValidationError do FastAPI (Erro 422)
    // Extrai as mensagens de erro do array e as junta em uma única string
    safeDetail = data.detail.map((err: any) => err.msg).join(", ");
  }

  const safeTitle = typeof data?.title === "string" ? data.title : undefined;

  switch (status) {
    case 400:
      return {
        variant: "error",
        title:   safeTitle ?? "Requisição inválida",
        message: safeDetail !== "Ocorreu um erro inesperado." ? safeDetail : "Os dados enviados são inválidos.",
      };
    case 401:
      return {
        variant: "error",
        title:   safeTitle ?? "Não autorizado",
        message: "Chave de API ausente ou inválida. Contate o administrador.",
      };
    case 403:
      return {
        variant: "error",
        title:   safeTitle ?? "Acesso negado",
        message: "Permissão insuficiente para realizar o cadastro.",
      };
    case 409:
      return {
        variant: "warning",
        title:   safeTitle ?? "Conflito de cadastro",
        message: safeDetail !== "Ocorreu um erro inesperado." ? safeDetail : "Esta matrícula ou face já está cadastrada no sistema.",
      };
    case 422:
      return {
        variant: "warning",
        title:   safeTitle ?? "Dados inválidos",
        message: safeDetail !== "Ocorreu um erro inesperado." ? safeDetail : "A imagem não pôde ser processada ou os dados estão fora do formato esperado.",
      };
    case 429: {
      const retry = retryAfter ? ` Tente novamente em ${retryAfter}s.` : "";
      return {
        variant:  "warning",
        title:    safeTitle ?? "Limite de requisições",
        message:  `Muitas tentativas em pouco tempo.${retry}`,
        duration: 7000,
      };
    }
    case 500:
      return {
        variant: "error",
        title:   safeTitle ?? "Erro interno",
        message: safeDetail !== "Ocorreu um erro inesperado." ? safeDetail : "Erro inesperado na infraestrutura. Tente novamente.",
      };
    case 503:
      return {
        variant:  "error",
        title:    safeTitle ?? "Serviço indisponível",
        message:  "O banco de dados está offline. Tente novamente em instantes.",
        duration: 7000,
      };
    default:
      return {
        variant: "error",
        title:   safeTitle ?? `Erro ${status}`,
        message: safeDetail,
      };
  }
}


// ─── Tela principal ───────────────────────────────────────────────────────────
export default function EnrollScreen() {
  const [nome,        setNome]        = useState("");
  const [matricula,   setMatricula]   = useState("");
  const [curso,       setCurso]       = useState("");
  const [tipoVinculo, setTipoVinculo] = useState<TipoVinculo>("GRADUACAO");
  const [turno,       setTurno]       = useState<Turno>("MANHA");
  const [foto,        setFoto]        = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  const toast = useToast();

  // ── Câmera / Galeria ────────────────────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setFoto(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show({ variant: "warning", title: "Permissão negada", message: "Acesse as configurações para permitir o uso da câmera." });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setFoto(result.assets[0].uri);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!nome.trim() || !matricula.trim() || !curso.trim() || !foto) {
      toast.show({
        variant: "warning",
        title: "Campos incompletos",
        message: "Preencha nome, matrícula, curso e adicione uma foto antes de continuar.",
      });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      // Campos obrigatórios — Body_enroll_student_api_v1_access_enroll_post
      formData.append("matricula", matricula.trim());
      formData.append("nome_completo", nome.trim());
      formData.append("curso", curso.trim());
      formData.append("tipo_vinculo", tipoVinculo); // TipoVinculoEnum
      formData.append("turno", turno); // TurnoEnum
      
      // foto: contentMediaType image/jpeg (contrato §Body_enroll_student)
      if (Platform.OS === "web") {
        const fetchResult = await fetch(foto);
        const blob = await fetchResult.blob();
        formData.append("foto", blob, "foto_perfil.jpg");
      } else {
        let uri = foto;
        if (Platform.OS === "android" && !uri.startsWith("file://")) uri = "file://" + uri;
        formData.append("foto", { uri, name: "foto_perfil.jpg", type: "image/jpeg" } as any);
      }

      // Requisição à API
      const response = await fetch(`${API_BASE}${ENROLL_ENDPOINT}`, {
        method: "POST",
        headers: {
          "X-API-Key-Enroll": API_KEY_ENROLL, // Autenticação requerida pelo contrato
          "Idempotency-Key": gerarIdempotencyKey(), // UUID para evitar duplicidade
        },
        body: formData,
      });

      // ─── Tratamento de Sucesso (HTTP 201) ────────
      if (response.status === 201) {
        const data = (await response.json()) as AlunoEnrollado;
        
        toast.show({
          variant: "success",
          title: "Cadastro realizado!",
          message: data.mensagem || `${data.nome_completo} foi cadastrado(a) com sucesso.`,
          meta: `Matrícula: ${data.matricula} · ID: ${data.id_aluno}`, // Usa os campos do schema AlunoEnrollado
        });

        // Limpa o formulário após o sucesso
        setNome("");
        setMatricula("");
        setCurso("");
        setFoto(null);
        setTipoVinculo("GRADUACAO");
        setTurno("MANHA");
      } 
      // ─── Tratamento de Erros do Contrato ─────────
      else {
        // Tenta capturar o Body de erro (ProblemDetails)
        let errorData: ProblemDetails = { title: "Erro", status: response.status };
        try {
          errorData = await response.json();
        } catch (e) {
          // Fallback caso a API não retorne JSON
        }
        
        // Verifica se há o header de rate limit do HTTP 429
        const retryAfter = response.headers.get("Retry-After");
        
        // Mapeia o erro para o formato ToastPayload e o exibe
        const toastConfig = problemToToast(response.status, errorData, retryAfter);
        toast.show(toastConfig);
      }

    } catch (error) {
      // Captura erros de rede ou de execução (timeout, falha de DNS, etc)
      toast.show({
        variant: "error",
        title: "Erro de Conexão",
        message: "Não foi possível conectar ao servidor. Verifique sua rede e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0E1A" />

        <View style={styles.header}>
          <View style={styles.headerAccent} />
          <Text style={styles.headerTitle}>Cadastro Biométrico</Text>
          <Text style={styles.headerSub}>NOVO ALUNO · RECONHECIMENTO FACIAL</Text>
        </View>

        {/* Foto */}
        <View style={styles.fotoSection}>
          {foto ? (
            <Image source={{ uri: foto }} style={styles.fotoPreview} />
          ) : (
            <View style={styles.fotoPlaceholder}>
              <Text style={styles.fotoPlaceholderIcon}>👤</Text>
              <Text style={styles.fotoPlaceholderText}>Sem foto</Text>
            </View>
          )}
          <View style={styles.fotoButtons}>
            <TouchableOpacity style={styles.fotoBtn} onPress={takePhoto}>
              <Text style={styles.fotoBtnText}>📷 Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fotoBtn} onPress={pickImage}>
              <Text style={styles.fotoBtnText}>🖼 Galeria</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Campos */}
        <Text style={styles.fieldLabel}>Nome Completo</Text>
        <TextInput style={styles.input} value={nome} onChangeText={setNome}
          placeholder="Ex: João da Silva" placeholderTextColor="#3A4060" />

        <Text style={styles.fieldLabel}>Matrícula</Text>
        <TextInput style={styles.input} value={matricula} onChangeText={setMatricula}
          placeholder="Ex: 2024001234" placeholderTextColor="#3A4060" keyboardType="numeric" />

        <Text style={styles.fieldLabel}>Curso</Text>
        <TextInput style={styles.input} value={curso} onChangeText={setCurso}
          placeholder="Ex: Engenharia de Computação" placeholderTextColor="#3A4060" />

        {/* TipoVinculoEnum */}
        <Text style={styles.fieldLabel}>Tipo de Vínculo</Text>
        <View style={styles.chipRow}>
          {(["GRADUACAO", "POS_GRADUACAO", "PROFESSOR", "FUNCIONARIO"] as TipoVinculo[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, tipoVinculo === t && styles.chipActive]} onPress={() => setTipoVinculo(t)}>
              <Text style={[styles.chipText, tipoVinculo === t && styles.chipTextActive]}>{t.replace("_", " ")}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TurnoEnum */}
        <Text style={styles.fieldLabel}>Turno</Text>
        <View style={styles.chipRow}>
          {(["MANHA", "TARDE", "NOITE", "INTEGRAL"] as Turno[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, turno === t && styles.chipActive]} onPress={() => setTurno(t)}>
              <Text style={[styles.chipText, turno === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btnSubmit} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#0A0E1A" />
            : <Text style={styles.btnSubmitText}>Cadastrar Aluno</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Toast — renderizado sobre o ScrollView */}
      {toast.payload && (
        <ToastNotification
          payload={toast.payload}
          translateY={toast.translateY}
          opacity={toast.opacity}
          progress={toast.progress}
          onDismiss={toast.dismiss}
        />
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get("window");

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#0A0E1A" },
  container: { flex: 1 },
  content:   { paddingBottom: 40 },

  header: {
    paddingTop: Platform.OS === "ios" ? 56 : (StatusBar.currentHeight ?? 24) + 12,
    paddingBottom: 20, paddingHorizontal: 24,
    backgroundColor: "#0D1220", borderBottomWidth: 1, borderBottomColor: "#1C2540", marginBottom: 24,
  },
  headerAccent: { width: 40, height: 3, backgroundColor: "#00E5C0", borderRadius: 2, marginBottom: 10 },
  headerTitle:  { fontSize: 22, fontWeight: "700", color: "#E8EBF5" },
  headerSub:    { fontSize: 10, color: "#5A6080", marginTop: 2, letterSpacing: 1.5 },

  fotoSection:      { alignItems: "center", marginBottom: 24 },
  fotoPreview:      { width: 120, height: 120, borderRadius: 60, marginBottom: 12, borderWidth: 2, borderColor: "#00E5C0" },
  fotoPlaceholder:  { width: 120, height: 120, borderRadius: 60, backgroundColor: "#111827", borderWidth: 2, borderColor: "#1C2540", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  fotoPlaceholderIcon: { fontSize: 36 },
  fotoPlaceholderText: { fontSize: 11, color: "#3A4060", marginTop: 4 },
  fotoButtons:      { flexDirection: "row", gap: 12 },
  fotoBtn:          { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  fotoBtnText:      { color: "#E8EBF5", fontSize: 13 },

  fieldLabel: { fontSize: 11, fontWeight: "600", color: "#8892B0", marginBottom: 6, letterSpacing: 0.5, paddingHorizontal: 24 },
  input:      { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1C2540", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: "#E8EBF5", fontSize: 15, marginBottom: 16, marginHorizontal: 24 },

  chipRow:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, paddingHorizontal: 24 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#1C2540", backgroundColor: "#111827" },
  chipActive:    { backgroundColor: "#00E5C0", borderColor: "#00E5C0" },
  chipText:      { color: "#8892B0", fontSize: 12 },
  chipTextActive:{ color: "#0A0E1A", fontWeight: "700" },

  btnSubmit:     { backgroundColor: "#00E5C0", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginHorizontal: 24, marginTop: 8 },
  btnSubmitText: { color: "#0A0E1A", fontWeight: "800", fontSize: 15, letterSpacing: 1 },

  // ── Toast ──────────────────────────────────────────────────────────────────
  toastWrapper: {
    position:  "absolute",
    bottom:    Platform.OS === "ios" ? 40 : 24,
    left:      16,
    right:     16,
    zIndex:    999,
    elevation: 12,
    borderRadius: 14,
    overflow: "hidden",
    // Sombra
    shadowColor:   "#000",
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius:  16,
  },
  toastCard: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: "#0D1220",
    borderWidth:     1,
    borderColor:     "#1C2540",
    borderRadius:    14,
    paddingVertical: 14,
    paddingRight:    14,
    gap:             12,
    overflow:        "hidden",
  },
  toastStripe: {
    width:        4,
    alignSelf:    "stretch",
    borderRadius: 2,
    marginLeft:   2,
  },
  toastIconBadge: {
    width:        32,
    height:       32,
    borderRadius: 16,
    borderWidth:  1,
    justifyContent: "center",
    alignItems:   "center",
  },
  toastIconText: { fontSize: 14, fontWeight: "800" },
  toastBody:     { flex: 1, gap: 2 },
  toastTitle:    { fontSize: 13, fontWeight: "700", color: "#E8EBF5" },
  toastMessage:  { fontSize: 12, color: "#8892B0", lineHeight: 17 },
  toastMeta:     { fontSize: 10, color: "#5A6080", marginTop: 3, letterSpacing: 0.3 },
  toastCloseBtn: { padding: 2 },
  toastCloseIcon:{ fontSize: 11, color: "#3A4060" },
  toastProgress: {
    position: "absolute",
    bottom:   0,
    left:     0,
    height:   2,
    borderRadius: 1,
  },
});