import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════
   TRUUGO - Sistema de Gestão de Entregadores
   ═══════════════════════════════════════════ */

// ── Storage helpers ──
const KEYS = {
  db: "tg-ent",
  lojas: "tg-lojas",
  ocorr: "tg-ocorr",
  lojasList: "tg-ll",
  rels: "tg-rels",
  users: "tg-users",
  audit: "tg-audit",
  session: "tg-session",
  labels: "tg-labels",
};

async function sGet(k) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

async function sSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

// ── Google Sheets API ──
const API_URL = "https://script.google.com/macros/s/AKfycbwBKQrQV0Wn0fm7sT9T2NVa7Pb5o0qALId2xc0Z3QbtyIbmDqLRon6Axhxcmfppj4B2Kg/exec";

async function cloudPost(action, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...data }),
    });
  } catch (e) {
    console.warn("Cloud sync error:", e);
  }
}

async function syncEntregadoresCloud(entList) {
  await cloudPost("syncEntregadores", {
    data: entList.map((e) => ({
      id: e.id, nome: e.nome, telefone: e.telefone,
      pixTipo: e.pixTipo, pixChave: e.pixChave, banco: e.banco,
    })),
  });
}

async function syncLojasCloud(lojaMap, getEntFn) {
  const rows = [];
  Object.entries(lojaMap).forEach(([loja, ids]) => {
    ids.forEach((id) => {
      const e = getEntFn(id);
      rows.push({ loja, entId: id, entNome: e?.nome || "?" });
    });
  });
  await cloudPost("syncLojas", { data: rows });
}

async function syncOcorrenciaCloud(o, entNome) {
  await cloudPost("addOcorrencia", {
    data: {
      id: o.id, data: o.data, tipo: o.tipo,
      entregador: entNome, loja: o.loja,
      desc: o.desc || "", criadoPor: o.criadoPor || "",
    },
  });
}

async function syncRelatorioCloud(rel, getEntFn) {
  const rows = rel.items.map((item) => {
    const e = getEntFn(item.entId);
    return {
      data: rel.data, entregador: e?.nome || "?", telefone: e?.telefone || "",
      loja: item.loja, valor: item.valor, obs: item.obs || "",
      pix: e?.pixChave || "", banco: e?.banco || "", criadoPor: rel.criadoPor || "",
    };
  });
  await cloudPost("saveRelatorio", { data: rows, total: rel.total });
}

// ── Constants ──
const BANCOS = [
  "Nubank", "Banco do Brasil", "Itaú", "Bradesco", "Santander",
  "Caixa Econômica", "Caixa Econômica Federal", "Inter", "C6", "C6 Bank",
  "PagBank", "Mercado Pago", "PicPay", "Digio", "Sicoob", "Sicredi",
  "Neon", "Original", "Outro",
];
const PIX_TYPES = ["CPF", "CNPJ", "E-mail", "Telefone", "Chave Aleatória"];
const OCORR_TIPOS = [
  "Furo", "Atraso", "Reclamação da loja",
  "Reclamação do entregador", "Acidente", "Outro",
];
const LABELS_DEFAULT = {
  // Abas
  tabEntregadores: "Entregadores",
  tabLojas: "Lojas",
  tabOcorrencias: "Ocorrências",
  tabRelatorio: "Relatório",
  tabAtividades: "Atividades",
  tabBackup: "Backup",
  // Entregadores
  entTitulo: "Entregadores",
  entBusca: "Buscar...",
  entNovo: "Novo cadastro",
  entEditar: "Editar",
  entCadastrar: "Cadastrar",
  entSalvar: "Salvar",
  // Relatório
  relTitulo: "Relatório do Dia",
  relValor: "Diária",
  relObs: "Obs",
  relBtnGerar: "Gerar Relatório",
  relBtnSalvar: "Salvar no Histórico",
  relHistorico: "Histórico de Relatórios",
  // Formato do relatório gerado
  relFormato: "padrao",
  relHeaderTemplate: "Lista de pagamentos — {data} ({dia})",
  relLinhaTemplate: "{num}. {nome} {telefone}\n{loja} – R${valor}\nPIX: {pix}\nBanco: {banco}",
  relLinhaComObs: "(obs: {obs})",
  relTotalTemplate: "Total: R${total} ({count} entregadores)",
  // Ocorrências
  ocorrTitulo: "Ocorrências",
  ocorrBusca: "Buscar nome, loja ou descrição...",
  ocorrBtnNova: "Nova",
  ocorrBtnRegistrar: "Registrar",
  // Lojas
  lojasTitulo: "Entregadores x Lojas",
  lojasBtnAdd: "Adicionar",
  // Backup
  backupTitulo: "Backup e Restauração",
  backupSyncNuvem: "Puxar dados da Nuvem",
  backupExportExcel: "Baixar Excel (.xlsx)",
  backupCopiarJSON: "Copiar Backup",
  backupRestaurar: "Restaurar",
};
const USERS_DEFAULT = [
  { id: 1, nome: "Admin", user: "admin", senha: "admin123", role: "adm" },
  { id: 2, nome: "Coordenador", user: "coord", senha: "coord123", role: "coordenador" },
  { id: 3, nome: "Dev", user: "dev", senha: "dev123", role: "desenvolvedor" },
];
const DIAS_SEMANA = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

// ── Icons ──
function Icon({ d, w = 14, h = 14, sw = 2 }) {
  return (
    <svg width={w} height={h} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

const ICO = {
  search: <Icon d={<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} w={15} h={15} />,
  plus: <Icon d={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} w={16} h={16} sw={2.5} />,
  x: <Icon d={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} sw={2.5} />,
  edit: <Icon d={<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>} w={13} h={13} />,
  trash: <Icon d={<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>} w={13} h={13} />,
  copy: <Icon d={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>} w={12} h={12} />,
  check: <Icon d={<polyline points="20 6 9 17 4 12" />} w={12} h={12} sw={3} />,
  phone: <Icon d={<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />} w={11} h={11} />,
  sort: <Icon d={<><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" /></>} w={13} h={13} />,
  store: <Icon d={<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>} />,
  alert: <Icon d={<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>} />,
  file: <Icon d={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>} />,
  users: <Icon d={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>} w={15} h={15} />,
  chev: <Icon d={<polyline points="6 9 12 15 18 9" />} w={12} h={12} sw={2.5} />,
  dl: <Icon d={<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>} />,
  lock: <Icon d={<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>} w={18} h={18} />,
  log: <Icon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></>} />,
};

// ── Styles ──
const sInp = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1.5px solid #E2E8F0", background: "#fff",
  fontSize: 13, fontFamily: "'Manrope', sans-serif", color: "#1E293B",
};
const sCard = {
  background: "#fff", borderRadius: 12,
  border: "1px solid #E2E8F0", padding: 16, marginBottom: 10,
};
const sLbl = {
  display: "block", fontSize: 10, fontWeight: 600, color: "#94A3B8",
  textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5,
};
const sSecT = {
  fontSize: 10, fontWeight: 700, color: "#94A3B8",
  textTransform: "uppercase", letterSpacing: "1.5px",
};
const sBtnP = {
  padding: "10px 16px", borderRadius: 8, border: "none",
  background: "#3B82F6", color: "#fff", fontSize: 13,
  fontWeight: 600, fontFamily: "'Manrope'", cursor: "pointer",
};
const sBtnS = {
  padding: "10px 16px", borderRadius: 8,
  border: "1.5px solid #E2E8F0", background: "#fff",
  color: "#64748B", fontSize: 13, fontWeight: 500,
  fontFamily: "'Manrope'", cursor: "pointer",
};
const sBtnI = {
  width: 38, height: 38, borderRadius: 8,
  border: "1.5px solid #E2E8F0", display: "flex",
  alignItems: "center", justifyContent: "center",
  flexShrink: 0, cursor: "pointer", background: "#fff",
};
const sActB = {
  width: 28, height: 28, borderRadius: 6, border: "none",
  background: "transparent", color: "#94A3B8",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};

// ── Helpers ──
function fmtPhone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function getDia(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return DIAS_SEMANA[d.getDay()];
}

function tryClipboard(txt) {
  try { navigator.clipboard.writeText(txt).catch(() => {}); } catch (e) {}
}

// ══════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════
export default function TruuGoApp() {
  // ── Auth ──
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ user: "", senha: "", role: "adm" });
  const [loginErr, setLoginErr] = useState("");

  // ── Data ──
  const [ent, setEnt] = useState([]);
  const [lojaMap, setLojaMap] = useState({});
  const [ocorr, setOcorr] = useState([]);
  const [lojasList, setLojasList] = useState([]);
  const [savedRels, setSavedRels] = useState([]);
  const [users, setUsers] = useState(USERS_DEFAULT);
  const [auditLog, setAuditLog] = useState([]);
  const [labels, setLabels] = useState(LABELS_DEFAULT);
  const [loading, setLoading] = useState(true);

  // ── UI State ──
  const [tab, setTab] = useState("entregadores");
  const [search, setSearch] = useState("");
  const [sortAZ, setSortAZ] = useState(false);
  const [filterLoja, setFilterLoja] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [form, setForm] = useState({
    nome: "", telefone: "", pixTipo: "CPF", pixChave: "", banco: "Nubank",
  });

  // ── Ocorrências UI ──
  const [oForm, setOForm] = useState({ entId: "", loja: "", tipo: "Furo", desc: "", data: "" });
  const [showOForm, setShowOForm] = useState(false);
  const [oSearch, setOSearch] = useState("");
  const [oFilterTipo, setOFilterTipo] = useState("");
  const [oFilterData, setOFilterData] = useState("");

  // ── Relatório UI ──
  const [relData, setRelData] = useState("");
  const [relItems, setRelItems] = useState([]);
  const [showRelForm, setShowRelForm] = useState(false);
  const [relItemForm, setRelItemForm] = useState({ entId: "", loja: "", valor: "", obs: "" });
  const [relText, setRelText] = useState("");
  const [viewRelId, setViewRelId] = useState(null);

  // ── Lojas UI ──
  const [viewLoja, setViewLoja] = useState("");
  const [editingLojaIdx, setEditingLojaIdx] = useState(null);
  const [editingLojaName, setEditingLojaName] = useState("");
  const [newLojaName, setNewLojaName] = useState("");

  // ── Backup UI ──
  const [importText, setImportText] = useState("");

  // ── Dev labels ──
  const [editingLabel, setEditingLabel] = useState(null);
  const [editLabelVal, setEditLabelVal] = useState("");

  const formRef = useRef(null);

  // ── Permission check ──
  const role = currentUser?.role || "";
  const can = (action) => {
    if (role === "desenvolvedor" || role === "adm") return true;
    if (role === "coordenador") {
      const blocked = ["editEnt", "editLoja", "backup", "auditLog", "manageUsers"];
      return !blocked.includes(action);
    }
    return false;
  };

  // ══════════════════
  // LOAD ALL DATA
  // ══════════════════
  useEffect(() => {
    (async () => {
      const entData = await sGet(KEYS.db);
      if (entData && entData.length > 0) setEnt(entData);

      const lm = await sGet(KEYS.lojas);
      if (lm) setLojaMap(lm);

      const oc = await sGet(KEYS.ocorr);
      if (oc) setOcorr(oc);

      const ll = await sGet(KEYS.lojasList);
      if (ll) setLojasList(ll);

      const rl = await sGet(KEYS.rels);
      if (rl) setSavedRels(rl);

      const us = await sGet(KEYS.users);
      if (us && us.length > 0) setUsers(us);
      else await sSet(KEYS.users, USERS_DEFAULT);

      const au = await sGet(KEYS.audit);
      if (au) setAuditLog(au);

      const lb = await sGet(KEYS.labels);
      if (lb) setLabels({ ...LABELS_DEFAULT, ...lb });

      const sess = await sGet(KEYS.session);
      if (sess) { setCurrentUser(sess); setLoggedIn(true); }

      setLoading(false);
    })();
  }, []);

  // ══════════════════
  // SAVE HELPERS
  // ══════════════════
  const saveData = async (key, val, setter) => {
    setter(val);
    await sSet(key, val);
  };

  const addAuditEntry = async (action, detail) => {
    const entry = {
      id: Date.now(),
      user: currentUser?.nome || "?",
      role: currentUser?.role || "?",
      action,
      detail,
      date: new Date().toISOString(),
    };
    const updated = [entry, ...auditLog].slice(0, 500);
    setAuditLog(updated);
    await sSet(KEYS.audit, updated);
  };

  // ── Entity helpers ──
  const getEnt = (id) => ent.find((e) => e.id === Number(id));
  const getEntName = (id) => ent.find((e) => e.id === Number(id))?.nome || "?";
  const lojasForEnt = (entId) =>
    Object.entries(lojaMap)
      .filter(([, ids]) => ids.includes(entId))
      .map(([l]) => l);

  const totalRel = relItems.reduce((s, i) => s + Number(i.valor || 0), 0);

  // ══════════════════
  // ENTREGADOR CRUD
  // ══════════════════
  function resetForm() {
    setForm({ nome: "", telefone: "", pixTipo: "CPF", pixChave: "", banco: "Nubank" });
    setEditId(null);
    setShowForm(false);
  }

  async function handleSaveEnt() {
    if (!form.nome.trim() || !form.telefone.trim()) return;
    let updated;
    if (editId !== null) {
      updated = ent.map((e) => (e.id === editId ? { ...form, id: editId } : e));
      addAuditEntry("Editou entregador", form.nome);
    } else {
      updated = [...ent, { ...form, id: Date.now() }];
      addAuditEntry("Cadastrou entregador", form.nome);
    }
    await saveData(KEYS.db, updated, setEnt);
    syncEntregadoresCloud(updated);
    resetForm();
  }

  function handleEditEnt(entry) {
    if (!can("editEnt")) return;
    setForm({
      nome: entry.nome, telefone: entry.telefone,
      pixTipo: entry.pixTipo, pixChave: entry.pixChave, banco: entry.banco,
    });
    setEditId(entry.id);
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function handleDelEnt(id) {
    const n = getEntName(id);
    const updated = ent.filter((e) => e.id !== id);
    await saveData(KEYS.db, updated, setEnt);
    syncEntregadoresCloud(updated);
    setDelConfirm(null);
    addAuditEntry("Excluiu entregador", n);
  }

  // ══════════════════
  // LOJA CRUD
  // ══════════════════
  async function assignLoja(entId, loja) {
    const m = { ...lojaMap };
    if (!m[loja]) m[loja] = [];
    if (!m[loja].includes(entId)) m[loja] = [...m[loja], entId];
    await saveData(KEYS.lojas, m, setLojaMap);
    syncLojasCloud(m, getEnt);
    addAuditEntry("Vinculou entregador", `${getEntName(entId)} → ${loja}`);
  }

  async function unassignLoja(entId, loja) {
    const m = { ...lojaMap };
    if (m[loja]) m[loja] = m[loja].filter((id) => id !== entId);
    await saveData(KEYS.lojas, m, setLojaMap);
    syncLojasCloud(m, getEnt);
  }

  async function renameLoja(idx, newName) {
    if (!newName.trim()) return;
    const old = lojasList[idx];
    const upd = [...lojasList];
    upd[idx] = newName.trim();
    await saveData(KEYS.lojasList, upd, setLojasList);
    const m = { ...lojaMap };
    if (m[old]) { m[newName.trim()] = m[old]; delete m[old]; await saveData(KEYS.lojas, m, setLojaMap); syncLojasCloud(m, getEnt); }
    setEditingLojaIdx(null);
    if (viewLoja === old) setViewLoja(newName.trim());
    addAuditEntry("Renomeou loja", `${old} → ${newName.trim()}`);
  }

  async function addLojaToList() {
    if (!newLojaName.trim() || lojasList.includes(newLojaName.trim())) return;
    await saveData(KEYS.lojasList, [...lojasList, newLojaName.trim()], setLojasList);
    addAuditEntry("Adicionou loja", newLojaName.trim());
    setNewLojaName("");
  }

  async function removeLojaFromList(idx) {
    const name = lojasList[idx];
    await saveData(KEYS.lojasList, lojasList.filter((_, i) => i !== idx), setLojasList);
    const m = { ...lojaMap }; delete m[name];
    await saveData(KEYS.lojas, m, setLojaMap);
    syncLojasCloud(m, getEnt);
    if (viewLoja === name) setViewLoja("");
    addAuditEntry("Removeu loja", name);
  }

  // ══════════════════
  // OCORRÊNCIAS
  // ══════════════════
  async function addOcorrencia() {
    if (!oForm.entId || !oForm.loja || !oForm.tipo) return;
    const nw = {
      id: Date.now(), ...oForm,
      data: oForm.data || new Date().toISOString().slice(0, 10),
      criadoPor: currentUser?.nome || "?",
    };
    await saveData(KEYS.ocorr, [nw, ...ocorr], setOcorr);
    syncOcorrenciaCloud(nw, getEntName(oForm.entId));
    setOForm({ entId: "", loja: "", tipo: "Furo", desc: "", data: "" });
    setShowOForm(false);
    addAuditEntry("Registrou ocorrência", `${oForm.tipo} - ${getEntName(oForm.entId)}`);
  }

  // ══════════════════
  // RELATÓRIO
  // ══════════════════
  function addRelItem() {
    if (!relItemForm.entId || !relItemForm.loja || !relItemForm.valor) return;
    setRelItems([...relItems, { ...relItemForm, id: Date.now() }]);
    setRelItemForm({ entId: "", loja: "", valor: "", obs: "" });
  }

  async function saveRelatorio() {
    const date = relData || new Date().toISOString().slice(0, 10);
    const nw = {
      id: Date.now(), data: date, items: [...relItems],
      total: totalRel, criadoPor: currentUser?.nome || "?",
    };
    await saveData(KEYS.rels, [nw, ...savedRels], setSavedRels);
    syncRelatorioCloud(nw, getEnt);
    addAuditEntry("Salvou relatório", date);
    setCopied("saved");
    setTimeout(() => setCopied(null), 2000);
  }

  function genRelText() {
    const date = relData || new Date().toISOString().slice(0, 10);
    const dia = getDia(date);
    const fmtDate = date.split("-").reverse().join("/");

    // Use customizable templates from labels
    const header = (labels.relHeaderTemplate || "Lista de pagamentos — {data} ({dia})")
      .replace("{data}", fmtDate).replace("{dia}", dia);
    const linhaT = labels.relLinhaTemplate || "{num}. {nome} {telefone}\n{loja} – R${valor}\nPIX: {pix}\nBanco: {banco}";
    const obsT = labels.relLinhaComObs || "(obs: {obs})";
    const totalT = (labels.relTotalTemplate || "Total: R${total} ({count} entregadores)")
      .replace("{total}", totalRel.toFixed(2)).replace("{count}", relItems.length);

    let txt = header + "\n\n";
    relItems.forEach((item, i) => {
      const e = getEnt(item.entId);
      if (!e) return;
      let linha = linhaT
        .replace("{num}", i + 1)
        .replace("{nome}", e.nome)
        .replace("{telefone}", e.telefone)
        .replace("{loja}", item.loja)
        .replace("{valor}", Number(item.valor).toFixed(2))
        .replace("{pix}", e.pixChave || "N/A")
        .replace("{banco}", e.banco || "N/A");
      if (item.obs) {
        const obsLine = obsT.replace("{obs}", item.obs);
        // Insert obs after first line
        const lines = linha.split("\n");
        lines.splice(1, 0, obsLine);
        linha = lines.join("\n");
      }
      txt += linha + "\n\n";
    });
    txt += totalT;
    setRelText(txt);
    tryClipboard(txt);
  }

  // ══════════════════
  // LOGIN
  // ══════════════════
  async function handleLogin() {
    const u = users.find(
      (x) => x.user === loginForm.user && x.senha === loginForm.senha && x.role === loginForm.role
    );
    if (!u) { setLoginErr("Usuário, senha ou perfil inválido"); return; }
    setCurrentUser(u);
    setLoggedIn(true);
    setLoginErr("");
    await sSet(KEYS.session, u);
  }

  async function handleLogout() {
    setLoggedIn(false);
    setCurrentUser(null);
    await sSet(KEYS.session, null);
    setTab("entregadores");
  }

  // ══════════════════
  // FILTERED DATA
  // ══════════════════
  const filtered = useMemo(() => {
    let list = [...ent];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.nome.toLowerCase().includes(s) || e.telefone.includes(search));
    }
    if (filterLoja && lojaMap[filterLoja]) {
      list = list.filter((e) => lojaMap[filterLoja].includes(e.id));
    }
    if (sortAZ) list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return list;
  }, [ent, search, sortAZ, filterLoja, lojaMap]);

  const filteredOcorr = useMemo(() => {
    let list = [...ocorr];
    if (oSearch) {
      const s = oSearch.toLowerCase();
      list = list.filter((o) => {
        const n = getEntName(o.entId).toLowerCase();
        return n.includes(s) || (o.desc || "").toLowerCase().includes(s) || o.loja.toLowerCase().includes(s);
      });
    }
    if (oFilterTipo) list = list.filter((o) => o.tipo === oFilterTipo);
    if (oFilterData) list = list.filter((o) => o.data === oFilterData);
    return list;
  }, [ocorr, oSearch, oFilterTipo, oFilterData, ent]);

  const ocorrByDate = useMemo(() => {
    const map = {};
    filteredOcorr.forEach((o) => {
      if (!map[o.data]) map[o.data] = [];
      map[o.data].push(o);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredOcorr]);

  const entSorted = useMemo(() => {
    return [...ent].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ent]);

  // ══════════════════
  // LOADING
  // ══════════════════
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0A1628" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6", animation: "pulse 1s ease infinite" }} />
      </div>
    );
  }

  // ══════════════════
  // LOGIN SCREEN
  // ══════════════════
  if (!loggedIn) {
    return (
      <div style={{ fontFamily: "'Manrope', sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #0F172A, #1E3A5F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          input:focus, select:focus { outline: none; border-color: #3B82F6 !important; }
          input::placeholder { color: #64748B; }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
        <div style={{ width: "100%", maxWidth: 360, animation: "fadeUp .4s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "rgba(59,130,246,.15)", marginBottom: 16 }}>
              <span style={{ color: "#3B82F6" }}>{ICO.lock}</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>
              <span style={{ color: "#3B82F6" }}>Truu</span>Go
            </h1>
            <p style={{ fontSize: 9, color: "#475569", marginTop: 2, letterSpacing: "2px", textTransform: "uppercase", fontWeight: 600 }}>by GD</p>
          </div>

          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 16, padding: 24, border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...sLbl, color: "#64748B" }}>Usuário</label>
              <input value={loginForm.user} onChange={(e) => setLoginForm({ ...loginForm, user: e.target.value })} placeholder="Seu usuário"
                style={{ ...sInp, background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.1)", color: "#fff" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...sLbl, color: "#64748B" }}>Senha</label>
              <input type="password" value={loginForm.senha} onChange={(e) => setLoginForm({ ...loginForm, senha: e.target.value })} placeholder="••••••"
                style={{ ...sInp, background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.1)", color: "#fff" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ ...sLbl, color: "#64748B" }}>Perfil</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["adm", "ADM"], ["coordenador", "Coord"], ["desenvolvedor", "Dev"]].map(([v, l]) => (
                  <button key={v} onClick={() => setLoginForm({ ...loginForm, role: v })}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: loginForm.role === v ? "1.5px solid #3B82F6" : "1.5px solid rgba(255,255,255,.1)", background: loginForm.role === v ? "rgba(59,130,246,.15)" : "transparent", color: loginForm.role === v ? "#3B82F6" : "#64748B", fontSize: 12, fontWeight: 600, fontFamily: "'Manrope'", cursor: "pointer" }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {loginErr && <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 12, textAlign: "center" }}>{loginErr}</p>}
            <button onClick={handleLogin} style={{ ...sBtnP, width: "100%", padding: "12px" }}>Entrar</button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════
  // TAB BUTTON
  // ══════════════════
  const TabBtn = ({ k, icon, label, perm }) => {
    if (perm && !can(perm)) return null;
    return (
      <button onClick={() => setTab(k)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 0", background: "none", border: "none", color: tab === k ? "#3B82F6" : "#64748B", fontSize: 9, fontWeight: tab === k ? 600 : 400, fontFamily: "'Manrope'", cursor: "pointer" }}>
        <span style={{ opacity: tab === k ? 1 : 0.5 }}>{icon}</span>{label}
      </button>
    );
  };

  // ══════════════════
  // MAIN RENDER
  // ══════════════════
  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 560, margin: "0 auto", minHeight: "100vh", background: "#F1F5F9", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #3B82F6 !important; }
        input::placeholder, textarea::placeholder { color: #94A3B8; }
        @keyframes slideD { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .rw { transition: background .12s; }
        .rw:hover { background: #F8FAFC !important; }
        .ab { opacity: 0; transition: opacity .12s; }
        .rw:hover .ab { opacity: .5; }
        .ab:hover { opacity: 1 !important; }
        button { cursor: pointer; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(135deg, #0F172A, #1E3A5F)", padding: "20px 20px 16px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(59,130,246,.1)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>
              <span style={{ color: "#3B82F6" }}>Truu</span>Go
            </h1>
            <p style={{ fontSize: 8, color: "#475569", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 600 }}>by GD</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 11, color: "#94A3B8" }}>{currentUser?.nome}</p>
            <p style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>{role}</p>
            <button onClick={handleLogout} style={{ marginTop: 4, background: "none", border: "none", color: "#64748B", fontSize: 10, fontFamily: "'Manrope'", textDecoration: "underline" }}>Sair</button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#64748B", marginTop: 8, position: "relative" }}>{ent.length} entregadores · {lojasList.length} lojas</p>
      </div>

      {/* ── NAV ── */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 0, zIndex: 20, overflowX: "auto" }}>
        <TabBtn k="entregadores" icon={ICO.users} label={labels.tabEntregadores} />
        <TabBtn k="lojas" icon={ICO.store} label={labels.tabLojas} />
        <TabBtn k="ocorrencias" icon={ICO.alert} label={labels.tabOcorrencias} />
        <TabBtn k="relatorio" icon={ICO.file} label={labels.tabRelatorio} />
        <TabBtn k="audit" icon={ICO.log} label={labels.tabAtividades} perm="auditLog" />
        <TabBtn k="backup" icon={ICO.dl} label={labels.tabBackup} perm="backup" />
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* ═══════════ ENTREGADORES ═══════════ */}
        {tab === "entregadores" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }}>{ICO.search}</span>
                <input type="text" placeholder={labels.entBusca} value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sInp, paddingLeft: 32, width: "100%" }} />
                {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94A3B8" }}>{ICO.x}</button>}
              </div>
              <button onClick={() => setSortAZ(!sortAZ)} style={{ ...sBtnI, background: sortAZ ? "#3B82F6" : "#fff", color: sortAZ ? "#fff" : "#64748B" }}>{ICO.sort}</button>
              <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={{ ...sBtnI, background: "#3B82F6", color: "#fff", transform: showForm ? "rotate(45deg)" : "none", transition: "transform .2s" }}>{ICO.plus}</button>
            </div>

            <select value={filterLoja} onChange={(e) => setFilterLoja(e.target.value)} style={{ ...sInp, width: "100%", marginBottom: 12, appearance: "auto", fontSize: 12, color: filterLoja ? "#1E293B" : "#94A3B8" }}>
              <option value="">Todas as lojas</option>
              {lojasList.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>

            {showForm && (
              <div ref={formRef} style={{ ...sCard, animation: "slideD .2s ease", marginBottom: 14 }}>
                <p style={sSecT}>{editId ? labels.entEditar : labels.entNovo}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                  <div><label style={sLbl}>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" style={sInp} /></div>
                  <div><label style={sLbl}>Telefone</label><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: fmtPhone(e.target.value) })} placeholder="(00) 00000-0000" style={sInp} /></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}><label style={sLbl}>Tipo PIX</label><select value={form.pixTipo} onChange={(e) => setForm({ ...form, pixTipo: e.target.value })} style={{ ...sInp, appearance: "auto" }}>{PIX_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                    <div style={{ flex: 2 }}><label style={sLbl}>Chave PIX</label><input value={form.pixChave} onChange={(e) => setForm({ ...form, pixChave: e.target.value })} placeholder="Chave PIX" style={sInp} /></div>
                  </div>
                  <div><label style={sLbl}>Banco</label><select value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} style={{ ...sInp, appearance: "auto" }}>{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={resetForm} style={{ ...sBtnS, flex: 1 }}>Cancelar</button>
                    <button onClick={handleSaveEnt} disabled={!form.nome.trim() || !form.telefone.trim()} style={{ ...sBtnP, flex: 2, opacity: form.nome.trim() && form.telefone.trim() ? 1 : .3 }}>{editId ? "Salvar" : "Cadastrar"}</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ ...sCard, padding: 0, overflow: "hidden" }}>
              {filtered.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center" }}><p style={{ fontSize: 13, color: "#94A3B8" }}>Nenhum resultado</p></div>}
              {filtered.map((entry, i) => {
                const exp = expandedId === entry.id;
                const ini = entry.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
                const el = lojasForEnt(entry.id);
                return (
                  <div key={entry.id} className="rw" style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none", position: "relative" }}>
                    {delConfirm === entry.id && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.97)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, zIndex: 10 }}>
                        <span style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>Excluir?</span>
                        <button onClick={() => setDelConfirm(null)} style={{ padding: "4px 12px", borderRadius: 5, border: "1.5px solid #E2E8F0", background: "#fff", fontSize: 11, color: "#64748B", fontFamily: "'Manrope'" }}>Não</button>
                        <button onClick={() => handleDelEnt(entry.id)} style={{ padding: "4px 12px", borderRadius: 5, border: "none", background: "#EF4444", color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: "'Manrope'" }}>Sim</button>
                      </div>
                    )}
                    <div onClick={() => setExpandedId(exp ? null : entry.id)} style={{ display: "flex", alignItems: "center", padding: "11px 14px", cursor: "pointer", gap: 11 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg, #1E3A5F, #3B82F6)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{ini}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.nome}</p>
                        <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}><span style={{ color: "#CBD5E1" }}>{ICO.phone}</span>{entry.telefone}</p>
                      </div>
                      {can("editEnt") && (
                        <div style={{ display: "flex", gap: 1 }}>
                          <button className="ab" onClick={(e) => { e.stopPropagation(); handleEditEnt(entry); }} style={sActB}>{ICO.edit}</button>
                          <button className="ab" onClick={(e) => { e.stopPropagation(); setDelConfirm(entry.id); }} style={{ ...sActB, color: "#CBD5E1" }}>{ICO.trash}</button>
                        </div>
                      )}
                    </div>
                    {exp && (
                      <div style={{ padding: "0 14px 12px 59px", animation: "fadeIn .12s ease" }}>
                        {entry.pixChave ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "8px 11px", background: "#F8FAFC", borderRadius: 8, marginBottom: 6 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "1px" }}>PIX · {entry.pixTipo}</p>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "#334155", fontFamily: "'IBM Plex Mono'", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.pixChave}</p>
                            </div>
                            <button onClick={() => { tryClipboard(entry.pixChave); setCopied(entry.pixChave); setTimeout(() => setCopied(null), 1500); }}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500, fontFamily: "'Manrope'", flexShrink: 0, background: copied === entry.pixChave ? "#ECFDF5" : "#EFF6FF", color: copied === entry.pixChave ? "#059669" : "#3B82F6", cursor: "pointer" }}>
                              {copied === entry.pixChave ? ICO.check : ICO.copy}{copied === entry.pixChave ? "Copiado" : "Copiar"}
                            </button>
                          </div>
                        ) : <p style={{ fontSize: 11, color: "#CBD5E1", marginBottom: 6 }}>PIX não cadastrado</p>}
                        {entry.banco && <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 5, background: "#F1F5F9", fontSize: 11, fontWeight: 500, color: "#64748B", marginBottom: 6 }}>{entry.banco}</span>}
                        {el.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{el.map((l) => <span key={l} style={{ padding: "2px 7px", borderRadius: 4, background: "#EFF6FF", fontSize: 10, fontWeight: 500, color: "#3B82F6" }}>{l}</span>)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══════════ LOJAS ═══════════ */}
        {tab === "lojas" && (
          <>
            <p style={{ ...sSecT, marginBottom: 12 }}>{labels.lojasTitulo}</p>
            <select value={viewLoja} onChange={(e) => setViewLoja(e.target.value)} style={{ ...sInp, width: "100%", marginBottom: 14, appearance: "auto", fontSize: 13 }}>
              <option value="">Selecione uma loja</option>
              {lojasList.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>

            {viewLoja && (
              <div style={{ ...sCard, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", background: "#EFF6FF", borderBottom: "1px solid #DBEAFE" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#1E3A5F" }}>{viewLoja}</p>
                  <p style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{(lojaMap[viewLoja] || []).length} entregador(es)</p>
                </div>
                {can("editLoja") && (
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 8 }}>
                    <select id="addEntLoja" style={{ ...sInp, flex: 1, fontSize: 12, appearance: "auto" }}>
                      <option value="">Adicionar entregador...</option>
                      {ent.filter((e) => !(lojaMap[viewLoja] || []).includes(e.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                    <button onClick={() => { const sel = document.getElementById("addEntLoja"); if (sel.value) { assignLoja(Number(sel.value), viewLoja); sel.value = ""; } }} style={{ ...sBtnP, padding: "8px 14px", fontSize: 12 }}>{labels.lojasBtnAdd}</button>
                  </div>
                )}
                {(lojaMap[viewLoja] || []).map((id) => {
                  const e = getEnt(id); if (!e) return null;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #F8FAFC", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg, #1E3A5F, #3B82F6)", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{e.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>{e.nome}</p><p style={{ fontSize: 10, color: "#94A3B8" }}>{e.telefone}</p></div>
                      {can("editLoja") && <button onClick={() => unassignLoja(id, viewLoja)} style={{ ...sActB, opacity: .5, color: "#EF4444" }}>{ICO.trash}</button>}
                    </div>
                  );
                })}
                {(lojaMap[viewLoja] || []).length === 0 && <p style={{ padding: "24px 14px", fontSize: 12, color: "#CBD5E1", textAlign: "center" }}>Nenhum entregador vinculado</p>}
              </div>
            )}

            {!viewLoja && (
              <>
                <div style={{ ...sCard, padding: 0, overflow: "hidden" }}>
                  {lojasList.map((l, idx) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #F1F5F9", gap: 8 }}>
                      {editingLojaIdx === idx ? (
                        <>
                          <input value={editingLojaName} onChange={(e) => setEditingLojaName(e.target.value)} style={{ ...sInp, flex: 1, fontSize: 12, padding: "6px 10px" }} autoFocus onKeyDown={(e) => { if (e.key === "Enter") renameLoja(idx, editingLojaName); if (e.key === "Escape") setEditingLojaIdx(null); }} />
                          <button onClick={() => renameLoja(idx, editingLojaName)} style={{ ...sActB, color: "#22C55E", opacity: 1 }}>{ICO.check}</button>
                          <button onClick={() => setEditingLojaIdx(null)} style={{ ...sActB, color: "#94A3B8", opacity: 1 }}>{ICO.x}</button>
                        </>
                      ) : (
                        <>
                          <span onClick={() => setViewLoja(l)} style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#334155", cursor: "pointer" }}>{l}</span>
                          <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 6 }}>{(lojaMap[l] || []).length}</span>
                          {can("editLoja") && (
                            <>
                              <button onClick={() => { setEditingLojaIdx(idx); setEditingLojaName(l); }} style={{ ...sActB, opacity: .4 }}>{ICO.edit}</button>
                              <button onClick={() => removeLojaFromList(idx)} style={{ ...sActB, opacity: .3, color: "#EF4444" }}>{ICO.trash}</button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {can("editLoja") && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input value={newLojaName} onChange={(e) => setNewLojaName(e.target.value)} placeholder="Nova loja..." style={{ ...sInp, flex: 1, fontSize: 12 }} onKeyDown={(e) => { if (e.key === "Enter") addLojaToList(); }} />
                    <button onClick={addLojaToList} disabled={!newLojaName.trim()} style={{ ...sBtnP, padding: "8px 14px", fontSize: 12, opacity: newLojaName.trim() ? 1 : .3 }}>Adicionar</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ═══════════ OCORRÊNCIAS ═══════════ */}
        {tab === "ocorrencias" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={sSecT}>{labels.ocorrTitulo}</p>
              <button onClick={() => setShowOForm(!showOForm)} style={{ ...sBtnP, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>{ICO.plus} {labels.ocorrBtnNova}</button>
            </div>

            <div style={{ position: "relative", marginBottom: 10 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }}>{ICO.search}</span>
              <input value={oSearch} onChange={(e) => setOSearch(e.target.value)} placeholder={labels.ocorrBusca} style={{ ...sInp, paddingLeft: 32, fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <select value={oFilterTipo} onChange={(e) => setOFilterTipo(e.target.value)} style={{ ...sInp, flex: 1, appearance: "auto", fontSize: 12, color: oFilterTipo ? "#1E293B" : "#94A3B8" }}>
                <option value="">Todos os tipos</option>
                {OCORR_TIPOS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input type="date" value={oFilterData} onChange={(e) => setOFilterData(e.target.value)} style={{ ...sInp, flex: 1, fontSize: 12 }} />
              {(oSearch || oFilterTipo || oFilterData) && <button onClick={() => { setOSearch(""); setOFilterTipo(""); setOFilterData(""); }} style={{ ...sActB, flexShrink: 0 }}>{ICO.x}</button>}
            </div>

            {showOForm && (
              <div style={{ ...sCard, animation: "slideD .2s ease", marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={sLbl}>Entregador</label><select value={oForm.entId} onChange={(e) => setOForm({ ...oForm, entId: e.target.value })} style={{ ...sInp, appearance: "auto" }}><option value="">Selecione...</option>{entSorted.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                  <div><label style={sLbl}>Loja</label><select value={oForm.loja} onChange={(e) => setOForm({ ...oForm, loja: e.target.value })} style={{ ...sInp, appearance: "auto" }}><option value="">Selecione...</option>{lojasList.map((l) => <option key={l}>{l}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}><label style={sLbl}>Tipo</label><select value={oForm.tipo} onChange={(e) => setOForm({ ...oForm, tipo: e.target.value })} style={{ ...sInp, appearance: "auto" }}>{OCORR_TIPOS.map((t) => <option key={t}>{t}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={sLbl}>Data</label><input type="date" value={oForm.data} onChange={(e) => setOForm({ ...oForm, data: e.target.value })} style={sInp} /></div>
                  </div>
                  <div><label style={sLbl}>Descrição</label><textarea value={oForm.desc} onChange={(e) => setOForm({ ...oForm, desc: e.target.value })} rows={2} placeholder="Detalhe..." style={{ ...sInp, resize: "vertical", fontFamily: "'Manrope'" }} /></div>
                  <div style={{ display: "flex", gap: 8 }}><button onClick={() => setShowOForm(false)} style={{ ...sBtnS, flex: 1 }}>Cancelar</button><button onClick={addOcorrencia} style={{ ...sBtnP, flex: 2 }}>{labels.ocorrBtnRegistrar}</button></div>
                </div>
              </div>
            )}

            {ocorrByDate.length === 0 && <div style={sCard}><p style={{ textAlign: "center", fontSize: 12, color: "#CBD5E1" }}>Nenhuma ocorrência</p></div>}
            {ocorrByDate.map(([date, items]) => (
              <div key={date} style={{ ...sCard, padding: 0, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{date.split("-").reverse().join("/")} ({getDia(date)})</p>
                  <p style={{ fontSize: 10, color: "#94A3B8" }}>{items.length} ocorrência(s)</p>
                </div>
                {items.map((o, i) => (
                  <div key={o.id} style={{ padding: "10px 14px", borderBottom: i < items.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: o.tipo === "Furo" ? "#EF4444" : "#F59E0B", textTransform: "uppercase", letterSpacing: ".5px", padding: "2px 7px", borderRadius: 4, background: o.tipo === "Furo" ? "#FEF2F2" : "#FFFBEB" }}>{o.tipo}</span>
                      {o.criadoPor && <span style={{ fontSize: 9, color: "#CBD5E1" }}>por {o.criadoPor}</span>}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginTop: 6 }}>{getEntName(o.entId)}</p>
                    <p style={{ fontSize: 11, color: "#64748B" }}>{o.loja}</p>
                    {o.desc && <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{o.desc}</p>}
                    <button onClick={async () => { await saveData(KEYS.ocorr, ocorr.filter((x) => x.id !== o.id), setOcorr); }} style={{ marginTop: 6, background: "none", border: "none", fontSize: 10, color: "#CBD5E1", fontFamily: "'Manrope'" }}>Remover</button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* ═══════════ RELATÓRIO ═══════════ */}
        {tab === "relatorio" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={sSecT}>{labels.relTitulo}</p>
              <button onClick={() => setShowRelForm(!showRelForm)} style={{ ...sBtnP, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>{ICO.plus} Adicionar</button>
            </div>
            <input type="date" value={relData} onChange={(e) => setRelData(e.target.value)} style={{ ...sInp, width: "100%", fontSize: 13, marginBottom: 14 }} />

            {showRelForm && (
              <div style={{ ...sCard, animation: "slideD .2s ease", marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={sLbl}>Entregador</label><select value={relItemForm.entId} onChange={(e) => setRelItemForm({ ...relItemForm, entId: e.target.value })} style={{ ...sInp, appearance: "auto" }}><option value="">Selecione...</option>{entSorted.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 2 }}><label style={sLbl}>Loja</label><select value={relItemForm.loja} onChange={(e) => setRelItemForm({ ...relItemForm, loja: e.target.value })} style={{ ...sInp, appearance: "auto" }}><option value="">Selecione...</option>{lojasList.map((l) => <option key={l}>{l}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={sLbl}>{labels.relValor}</label><input type="number" value={relItemForm.valor} onChange={(e) => setRelItemForm({ ...relItemForm, valor: e.target.value })} placeholder="0" style={sInp} /></div>
                  </div>
                  <div><label style={sLbl}>Obs</label><input value={relItemForm.obs} onChange={(e) => setRelItemForm({ ...relItemForm, obs: e.target.value })} placeholder="Ex: almoço e jantar" style={sInp} /></div>
                  <button onClick={addRelItem} style={sBtnP}>Adicionar à lista</button>
                </div>
              </div>
            )}

            <div style={{ ...sCard, padding: 0, overflow: "hidden" }}>
              {relItems.length === 0 && <p style={{ padding: "36px 14px", textAlign: "center", fontSize: 12, color: "#CBD5E1" }}>Adicione pagamentos do dia</p>}
              {relItems.map((item, i) => {
                const e = getEnt(item.entId);
                return (
                  <div key={item.id} style={{ padding: "10px 14px", borderBottom: i < relItems.length - 1 ? "1px solid #F8FAFC" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{e?.nome || "?"}</p>
                      <p style={{ fontSize: 11, color: "#64748B" }}>{item.loja} – R${Number(item.valor).toFixed(2)}</p>
                      {item.obs && <p style={{ fontSize: 10, color: "#94A3B8" }}>obs: {item.obs}</p>}
                    </div>
                    <button onClick={() => setRelItems(relItems.filter((x) => x.id !== item.id))} style={{ ...sActB, opacity: .4, color: "#EF4444" }}>{ICO.trash}</button>
                  </div>
                );
              })}
              {relItems.length > 0 && (
                <div style={{ padding: "12px 14px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Total: {relItems.length} entregadores</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1E3A5F" }}>R${totalRel.toFixed(2)}</span>
                </div>
              )}
            </div>

            {relItems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <button onClick={genRelText} style={{ ...sBtnP, width: "100%", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{ICO.file} {labels.relBtnGerar}</button>
                <button onClick={saveRelatorio} style={{ ...sBtnS, width: "100%", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13 }}>{copied === "saved" ? ICO.check : ICO.file} {copied === "saved" ? "Salvo!" : labels.relBtnSalvar}</button>
                <button onClick={() => { setRelItems([]); setRelData(""); setRelText(""); }} style={{ background: "none", border: "none", fontSize: 12, color: "#94A3B8", fontFamily: "'Manrope'", padding: "8px", textAlign: "center" }}>Limpar lista</button>
              </div>
            )}

            {relText && (
              <div style={{ ...sCard, marginTop: 12, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Relatório gerado</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { const el = document.getElementById("relTA"); if (el) { el.select(); document.execCommand("copy"); setCopied("rel2"); setTimeout(() => setCopied(null), 2000); } }} style={{ ...sBtnP, padding: "5px 12px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>{copied === "rel2" ? ICO.check : ICO.copy} {copied === "rel2" ? "Copiado!" : "Copiar"}</button>
                    <button onClick={() => setRelText("")} style={{ ...sActB, opacity: .5 }}>{ICO.x}</button>
                  </div>
                </div>
                <textarea id="relTA" readOnly value={relText} style={{ width: "100%", padding: "12px 14px", border: "none", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: "#334155", background: "#fff", resize: "vertical", minHeight: 200, lineHeight: 1.6 }} onClick={(e) => e.target.select()} />
              </div>
            )}

            {/* Histórico */}
            {savedRels.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ ...sSecT, marginBottom: 10 }}>{labels.relHistorico}</p>
                <div style={{ ...sCard, padding: 0, overflow: "hidden" }}>
                  {savedRels.map((rel, i) => {
                    const isOpen = viewRelId === rel.id;
                    return (
                      <div key={rel.id} style={{ borderBottom: i < savedRels.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                        <div onClick={() => setViewRelId(isOpen ? null : rel.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{rel.data.split("-").reverse().join("/")} ({getDia(rel.data)})</p>
                            <p style={{ fontSize: 11, color: "#94A3B8" }}>{rel.items.length} entregadores{rel.criadoPor ? ` · por ${rel.criadoPor}` : ""}</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#3B82F6" }}>R${rel.total.toFixed(2)}</span>
                            <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", color: "#94A3B8" }}>{ICO.chev}</span>
                          </div>
                        </div>
                        {isOpen && (
                          <div style={{ padding: "0 14px 12px", animation: "fadeIn .12s ease" }}>
                            {rel.items.map((item, j) => {
                              const e = getEnt(item.entId);
                              return (
                                <div key={j} style={{ padding: "6px 0", borderBottom: j < rel.items.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                                  <p style={{ fontSize: 12, fontWeight: 500, color: "#334155" }}>{e?.nome || "?"} – R${Number(item.valor).toFixed(2)}</p>
                                  <p style={{ fontSize: 10, color: "#94A3B8" }}>{item.loja}{item.obs ? ` (${item.obs})` : ""}</p>
                                </div>
                              );
                            })}
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button onClick={() => { setRelItems(rel.items.map((it, idx) => ({ ...it, id: Date.now() + idx }))); setRelData(rel.data); setViewRelId(null); }} style={{ ...sBtnS, fontSize: 11, padding: "6px 12px", flex: 1 }}>Reabrir</button>
                              <button onClick={async () => await saveData(KEYS.rels, savedRels.filter((x) => x.id !== rel.id), setSavedRels)} style={{ ...sActB, opacity: .4, color: "#EF4444" }}>{ICO.trash}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dev: Personalização do App */}
            {role === "desenvolvedor" && (
              <div style={{ marginTop: 20 }}>
                <p style={{ ...sSecT, marginBottom: 12 }}>Dev: Personalização do App</p>
                <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14 }}>Edite textos, títulos, placeholders e o formato do relatório. As alterações são salvas automaticamente e afetam todos os usuários.</p>

                {[
                  { title: "Abas", keys: ["tabEntregadores", "tabLojas", "tabOcorrencias", "tabRelatorio", "tabAtividades", "tabBackup"] },
                  { title: "Entregadores", keys: ["entTitulo", "entBusca", "entNovo", "entEditar", "entCadastrar", "entSalvar"] },
                  { title: "Relatório - Interface", keys: ["relTitulo", "relValor", "relObs", "relBtnGerar", "relBtnSalvar", "relHistorico"] },
                  { title: "Relatório - Formato do Texto Gerado", keys: ["relHeaderTemplate", "relLinhaTemplate", "relLinhaComObs", "relTotalTemplate"] },
                  { title: "Ocorrências", keys: ["ocorrTitulo", "ocorrBusca", "ocorrBtnNova", "ocorrBtnRegistrar"] },
                  { title: "Lojas", keys: ["lojasTitulo", "lojasBtnAdd"] },
                  { title: "Backup", keys: ["backupTitulo", "backupSyncNuvem", "backupExportExcel", "backupCopiarJSON", "backupRestaurar"] },
                ].map((cat) => (
                  <div key={cat.title} style={{ ...sCard, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F", marginBottom: 10 }}>{cat.title}</p>
                    {cat.keys.filter((k) => labels[k] !== undefined).map((key) => {
                      const val = labels[key];
                      const isTemplate = key.includes("Template") || key.includes("ComObs");
                      return (
                        <div key={key} style={{ display: "flex", alignItems: isTemplate ? "flex-start" : "center", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #F8FAFC" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "'IBM Plex Mono'", display: "block" }}>{key}</span>
                            {isTemplate && <span style={{ fontSize: 9, color: "#CBD5E1", marginTop: 2, display: "block" }}>Variáveis: {"{nome} {telefone} {loja} {valor} {pix} {banco} {obs} {num} {data} {dia} {total} {count}"}</span>}
                          </div>
                          {editingLabel === key ? (
                            <>
                              {isTemplate ? (
                                <textarea value={editLabelVal} onChange={(e) => setEditLabelVal(e.target.value)} rows={3} style={{ ...sInp, flex: 2, fontSize: 11, padding: "6px 10px", fontFamily: "'IBM Plex Mono'", resize: "vertical" }} autoFocus onKeyDown={async (e) => { if (e.key === "Escape") setEditingLabel(null); }} />
                              ) : (
                                <input value={editLabelVal} onChange={(e) => setEditLabelVal(e.target.value)} style={{ ...sInp, flex: 2, fontSize: 12, padding: "6px 10px" }} autoFocus onKeyDown={async (e) => { if (e.key === "Enter") { const nw = { ...labels, [key]: editLabelVal }; await saveData(KEYS.labels, nw, setLabels); setEditingLabel(null); addAuditEntry("Dev: editou label", `${key}: ${val} → ${editLabelVal}`); } if (e.key === "Escape") setEditingLabel(null); }} />
                              )}
                              <button onClick={async () => { const nw = { ...labels, [key]: editLabelVal }; await saveData(KEYS.labels, nw, setLabels); setEditingLabel(null); addAuditEntry("Dev: editou label", `${key}: ${val} → ${editLabelVal}`); }} style={{ ...sActB, color: "#22C55E", opacity: 1 }}>{ICO.check}</button>
                              <button onClick={() => setEditingLabel(null)} style={{ ...sActB, color: "#94A3B8", opacity: 1 }}>{ICO.x}</button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 11, color: "#1E293B", flex: 2, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isTemplate ? "pre-wrap" : "nowrap", fontFamily: isTemplate ? "'IBM Plex Mono'" : "'Manrope'", lineHeight: 1.4 }}>{val}</span>
                              <button onClick={() => { setEditingLabel(key); setEditLabelVal(val); }} style={{ ...sActB, opacity: .5 }}>{ICO.edit}</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <button onClick={async () => { await saveData(KEYS.labels, LABELS_DEFAULT, setLabels); addAuditEntry("Dev: resetou labels", "Restaurou padrão"); setCopied("labelreset"); setTimeout(() => setCopied(null), 2000); }} style={{ ...sBtnS, width: "100%", fontSize: 12, color: "#EF4444", borderColor: "#FCA5A5", marginTop: 8 }}>
                  {copied === "labelreset" ? "Restaurado!" : "Restaurar todos para o padrão"}
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══════════ AUDIT LOG ═══════════ */}
        {tab === "audit" && can("auditLog") && (
          <>
            <p style={{ ...sSecT, marginBottom: 12 }}>Log de Atividades</p>
            <div style={{ ...sCard, padding: 0, overflow: "hidden", maxHeight: 600, overflowY: "auto" }}>
              {auditLog.length === 0 && <p style={{ padding: "36px 14px", textAlign: "center", fontSize: 12, color: "#CBD5E1" }}>Nenhuma atividade</p>}
              {auditLog.map((a, i) => (
                <div key={a.id} style={{ padding: "10px 14px", borderBottom: i < auditLog.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>{a.action}</span>
                    <span style={{ fontSize: 9, color: "#CBD5E1" }}>{new Date(a.date).toLocaleString("pt-BR")}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{a.detail}</p>
                  <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{a.user} ({a.role})</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══════════ BACKUP ═══════════ */}
        {tab === "backup" && can("backup") && (
          <>
            <p style={{ ...sSecT, marginBottom: 12 }}>{labels.backupTitulo}</p>

            {/* Sincronizar da Nuvem */}
            <div style={sCard}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Sincronizar da Nuvem</p>
              <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>Puxa os dados da planilha do Google Sheets e atualiza o app. Use quando trocar de dispositivo ou quando editar dados direto na planilha.</p>
              <button onClick={async () => {
                setCopied("syncing");
                try {
                  const res = await fetch(API_URL + "?action=getAll");
                  const json = await res.json();
                  if (json.status === "ok" && json.data) {
                    const d = json.data;
                    // Entregadores
                    if (d.Entregadores && d.Entregadores.length > 0) {
                      const entCloud = d.Entregadores.map((row) => ({
                        id: Number(row.ID) || Date.now() + Math.random(),
                        nome: row.Nome || "",
                        telefone: row.Telefone || "",
                        pixTipo: row["Tipo PIX"] || "Telefone",
                        pixChave: row["Chave PIX"] || "",
                        banco: row.Banco || "",
                      })).filter((e) => e.nome);
                      await saveData(KEYS.db, entCloud, setEnt);
                    }
                    // Lojas (reconstruir lojaMap)
                    if (d.Lojas && d.Lojas.length > 0) {
                      const newMap = {};
                      const lojasSet = new Set();
                      d.Lojas.forEach((row) => {
                        const loja = row.Loja;
                        const entId = Number(row["Entregador ID"]);
                        if (loja && entId) {
                          if (!newMap[loja]) newMap[loja] = [];
                          if (!newMap[loja].includes(entId)) newMap[loja].push(entId);
                          lojasSet.add(loja);
                        }
                      });
                      await saveData(KEYS.lojas, newMap, setLojaMap);
                      // Atualizar lista de lojas se vieram novas
                      const currentSet = new Set(lojasList);
                      const merged = [...lojasList];
                      lojasSet.forEach((l) => { if (!currentSet.has(l)) merged.push(l); });
                      if (merged.length > lojasList.length) {
                        await saveData(KEYS.lojasList, merged, setLojasList);
                      }
                    }
                    setCopied("synced");
                    addAuditEntry("Sincronizou da nuvem", `${d.Entregadores?.length || 0} entregadores`);
                    setTimeout(() => setCopied(null), 2500);
                  } else {
                    setCopied("syncerr");
                    setTimeout(() => setCopied(null), 3000);
                  }
                } catch (e) {
                  console.error("Sync error:", e);
                  setCopied("syncerr");
                  setTimeout(() => setCopied(null), 3000);
                }
              }} style={{ ...sBtnP, width: "100%", background: "#059669", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {copied === "syncing" ? (
                  <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> Sincronizando...</>
                ) : copied === "synced" ? (
                  <>{ICO.check} Sincronizado!</>
                ) : copied === "syncerr" ? (
                  <>{ICO.alert} Erro na sincronização</>
                ) : (
                  <>{ICO.dl} Puxar dados da Nuvem</>
                )}
              </button>
            </div>

            <div style={sCard}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Exportar para Excel</p>
              <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>Compatível com Google Planilhas.</p>
              <button onClick={async () => {
                try {
                  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs");
                  const wb = XLSX.utils.book_new();
                  const ws1 = XLSX.utils.json_to_sheet([...ent].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((e) => ({ Nome: e.nome, Telefone: e.telefone, "Tipo PIX": e.pixTipo, "Chave PIX": e.pixChave || "", Banco: e.banco || "", Lojas: lojasForEnt(e.id).join(", ") })));
                  ws1["!cols"] = [{ wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 35 }, { wch: 25 }, { wch: 40 }];
                  XLSX.utils.book_append_sheet(wb, ws1, "Entregadores");
                  const ld = []; lojasList.forEach((l) => { const ids = lojaMap[l] || []; if (!ids.length) ld.push({ Loja: l, Entregador: "—", Telefone: "" }); else ids.forEach((id) => { const e = getEnt(id); ld.push({ Loja: l, Entregador: e?.nome || "?", Telefone: e?.telefone || "" }); }); });
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ld), "Lojas");
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ocorr.length ? ocorr.map((o) => ({ Data: o.data, Tipo: o.tipo, Entregador: getEntName(o.entId), Loja: o.loja, Descrição: o.desc || "" })) : [{ Data: "Nenhuma" }]), "Ocorrências");
                  const rd = []; savedRels.forEach((r) => { r.items.forEach((item) => { const e = getEnt(item.entId); rd.push({ Data: r.data, Entregador: e?.nome || "?", Telefone: e?.telefone || "", Loja: item.loja, "Valor (R$)": Number(item.valor), Obs: item.obs || "" }); }); rd.push({ Data: "", Entregador: "TOTAL", "Valor (R$)": r.total }); rd.push({}); });
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rd.length ? rd : [{ Data: "Nenhum" }]), "Relatórios");
                  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `TruuGo_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
                  setCopied("xlsx"); setTimeout(() => setCopied(null), 2500);
                  addAuditEntry("Exportou Excel", "");
                } catch (err) { alert("Erro: " + err.message); }
              }} style={{ ...sBtnP, width: "100%", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {copied === "xlsx" ? ICO.check : ICO.dl} {copied === "xlsx" ? "Excel gerado!" : "Baixar Excel (.xlsx)"}
              </button>
            </div>

            <div style={sCard}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Backup JSON</p>
              <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>Copie e salve em um arquivo .txt</p>
              <button onClick={async () => {
                const bk = JSON.stringify({ v: 1, d: new Date().toISOString(), ent, lojaMap, ocorr, ll: lojasList, rels: savedRels, users, labels });
                tryClipboard(bk);
                setCopied("bk"); setTimeout(() => setCopied(null), 2500);
                addAuditEntry("Exportou backup JSON", "");
              }} style={{ ...sBtnP, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {copied === "bk" ? ICO.check : ICO.copy} {copied === "bk" ? "Copiado!" : "Copiar Backup"}
              </button>
            </div>

            <div style={sCard}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>Importar Backup</p>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Cole o backup aqui..." rows={4} style={{ ...sInp, resize: "vertical", fontFamily: "'IBM Plex Mono'", fontSize: 11, marginBottom: 10 }} />
              <button onClick={async () => {
                try {
                  const d = JSON.parse(importText);
                  if (d.ent) await saveData(KEYS.db, d.ent, setEnt);
                  if (d.lojaMap) await saveData(KEYS.lojas, d.lojaMap, setLojaMap);
                  if (d.ocorr) await saveData(KEYS.ocorr, d.ocorr, setOcorr);
                  if (d.ll) await saveData(KEYS.lojasList, d.ll, setLojasList);
                  if (d.rels) await saveData(KEYS.rels, d.rels, setSavedRels);
                  if (d.users) await saveData(KEYS.users, d.users, setUsers);
                  if (d.labels) await saveData(KEYS.labels, { ...LABELS_DEFAULT, ...d.labels }, setLabels);
                  setImportText("");
                  setCopied("imp"); setTimeout(() => setCopied(null), 2500);
                  addAuditEntry("Importou backup", "");
                } catch (e) { alert("Backup inválido"); }
              }} disabled={!importText.trim()} style={{ ...sBtnP, width: "100%", background: "#0F172A", opacity: importText.trim() ? 1 : .3, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {copied === "imp" ? ICO.check : ICO.file} {copied === "imp" ? "Restaurado!" : "Restaurar"}
              </button>
            </div>
          </>
        )}

      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #E2E8F0", display: "flex", maxWidth: 560, margin: "0 auto", zIndex: 30 }}>
        <TabBtn k="entregadores" icon={ICO.users} label={labels.tabEntregadores} />
        <TabBtn k="lojas" icon={ICO.store} label={labels.tabLojas} />
        <TabBtn k="ocorrencias" icon={ICO.alert} label={labels.tabOcorrencias} />
        <TabBtn k="relatorio" icon={ICO.file} label={labels.tabRelatorio} />
        <TabBtn k="audit" icon={ICO.log} label={labels.tabAtividades} perm="auditLog" />
        <TabBtn k="backup" icon={ICO.dl} label={labels.tabBackup} perm="backup" />
      </div>
    </div>
  );
}
