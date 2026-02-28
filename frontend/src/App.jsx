import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiAdminBlockUser,
  apiAdminCreateUser,
  apiAdminUpdateUser,
  apiAdminUsers,
  apiCallInvite,
  apiChangePassword,
  apiCreateGroup,
  apiDeleteGroup,
  apiDeleteMessage,
  apiForwardMessage,
  apiGetActiveChats,
  apiGetMe,
  apiGetMessages,
  apiGetUserInfo,
  apiOpenInvite,
  apiLogin,
  apiSearchUsers,
  apiSendMessage,
  apiSetUserNote,
  apiShareContact,
  apiTransferGroupOwner,
  apiUpdateMessage,
  apiUpdateGroup,
  apiUpdateMe,
  apiUploadFile,
  openCallSocket,
  openEventsSocket,
} from "./api";

const LS_KEY = "mgm_auth";

const initialProfile = {
  last_name: "",
  first_name: "",
  middle_name: "",
  phone: "",
  email: "",
  position: "",
  avatar_url: "",
};

function displayName(user) {
  const full = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  return full || user?.login || "User";
}

function initial(obj) {
  return (obj?.name || obj?.login || "?").charAt(0).toUpperCase();
}

function roomId(a, b) {
  return [a, b].sort().join("__");
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const token = auth?.token;

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState({ users: [], groups: [] });
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isMobileChat, setIsMobileChat] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  const [profileForm, setProfileForm] = useState(initialProfile);
  const [newPass, setNewPass] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupEditSearch, setGroupEditSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupAvatar, setEditingGroupAvatar] = useState("");
  const [groupNewOwner, setGroupNewOwner] = useState("");
  const [forwardMessageId, setForwardMessageId] = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [messageMenu, setMessageMenu] = useState(null);

  const [adminUsers, setAdminUsers] = useState([]);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminNew, setAdminNew] = useState({
    login: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "User",
    is_visible: true,
  });
  const [adminEdit, setAdminEdit] = useState(null);

  const [incomingCall, setIncomingCall] = useState(null);
  const [callOpen, setCallOpen] = useState(false);
  const [callStatus, setCallStatus] = useState("Ожидание");

  const activeChatRef = useRef(null);
  const msgListRef = useRef(null);
  const eventsWsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const callWsRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const initiatorRef = useRef(false);
  const offerSentRef = useRef(false);
  const callPeerRef = useRef("");
  const pollingRef = useRef(null);
  const longPressRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const reconnectRef = useRef({ timer: null, attempt: 0, stopped: false });

  const allChatItems = useMemo(() => {
    const g = chats.groups.map((x) => ({ ...x, kind: "group", is_group: true, target: x.id }));
    const u = chats.users.map((x) => ({ ...x, kind: "user", is_group: false, target: x.login }));
    return [...g, ...u];
  }, [chats]);

  const usersFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return users.filter((u) => `${u.name} ${u.login} ${u.phone || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }, [users, searchQuery]);

  const groupUsers = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return users.filter((u) => `${u.name} ${u.login} ${u.phone || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }, [users, groupSearch]);

  const groupEditUsers = useMemo(() => {
    const q = groupEditSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return users.filter((u) => `${u.name} ${u.login}`.toLowerCase().includes(q));
  }, [users, groupEditSearch]);

  const adminFiltered = useMemo(() => {
    const q = adminQuery.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter((u) => `${u.id} ${u.login} ${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q));
  }, [adminUsers, adminQuery]);

  function isCurrentChat(item) {
    if (!activeChat) return false;
    return String(activeChat.target) === String(item.target) && !!activeChat.is_group === !!item.is_group;
  }

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!token) return;
    initSession();
    connectEvents();
    return () => {
      reconnectRef.current.stopped = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (eventsWsRef.current) eventsWsRef.current.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    startPolling();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    handleInviteFromUrl().catch(() => {});
  }, [token, chats.users.length, chats.groups.length]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setIsMobileChat(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!token || !activeChat) return;
    loadMessages(activeChat);
  }, [token, activeChat]);

  useEffect(() => {
    if (msgListRef.current && stickToBottomRef.current) {
      msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    }
  }, [messages]);

  async function initSession() {
    try {
      const [meData, usersData, chatsData] = await Promise.all([apiGetMe(token), apiSearchUsers(token, ""), apiGetActiveChats(token)]);
      setMe(meData);
      setUsers(usersData);
      setChats(chatsData);
      setProfileForm({
        ...initialProfile,
        ...{
          last_name: meData.last_name || "",
          first_name: meData.first_name || "",
          middle_name: meData.middle_name || "",
          phone: meData.phone || "",
          email: meData.email || "",
          position: meData.position || "",
          avatar_url: meData.avatar_url || "",
        },
      });
    } catch {
      doLogout();
    }
  }

  async function refreshChats() {
    const data = await apiGetActiveChats(token);
    setChats(data);
  }

  async function loadMessages(chat = activeChatRef.current) {
    if (!chat) return;
    clearUnreadForChat(chat);
    const rows = await apiGetMessages(token, chat.is_group ? "group" : "private", chat.target);
    if (stickToBottomRef.current) {
      // keep autoscroll only when user is already near the bottom
      stickToBottomRef.current = true;
    }
    setMessages(rows);
    await refreshChats();
    clearUnreadForChat(chat);
  }

  async function connectEvents() {
    reconnectRef.current.stopped = false;
    if (eventsWsRef.current) eventsWsRef.current.close();
    const ws = openEventsSocket(token, async (event) => {
      if (event.type === "message:new" || event.type === "chat:update") {
        await refreshChats();
        if (activeChatRef.current) {
          const rows = await apiGetMessages(
            token,
            activeChatRef.current.is_group ? "group" : "private",
            activeChatRef.current.target
          );
          setMessages(rows);
          clearUnreadForChat(activeChatRef.current);
        }
        if (
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          event.sender_login !== me?.login
        ) {
          new Notification(event.sender_name || "MG Messenger", {
            body: event.preview || "Новое сообщение",
          });
        }
      }
      if (event.type === "call:invite") {
        setIncomingCall({ from_login: event.from_login, from_name: event.from_name });
      }
    });
    ws.onopen = () => {
      reconnectRef.current.attempt = 0;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
    };
    ws.onclose = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current.stopped) return;
      const attempt = Math.min(reconnectRef.current.attempt + 1, 8);
      reconnectRef.current.attempt = attempt;
      const delayMs = Math.min(20000, 1000 * 2 ** (attempt - 1));
      reconnectRef.current.timer = setTimeout(() => {
        connectEvents().catch(() => {});
      }, delayMs);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
    eventsWsRef.current = ws;
  }

  async function doLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await apiLogin(login.trim(), password);
      const next = { token: res.access_token, profile: res.profile };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setAuth(next);
      if ("Notification" in window) setNotificationPermission(Notification.permission);
      setLogin("");
      setPassword("");
    } catch (err) {
      setError(err.message || "Ошибка входа");
    }
  }

  function doLogout() {
    localStorage.removeItem(LS_KEY);
    setAuth(null);
    setMe(null);
    setUsers([]);
    setChats({ users: [], groups: [] });
    setActiveChat(null);
    setMessages([]);
    setIsMobileChat(false);
    endCall(false);
  }

  function openChat(chat) {
    stickToBottomRef.current = true;
    setActiveChat(chat);
    clearUnreadForChat(chat);
    if (window.innerWidth <= 768) setIsMobileChat(true);
    loadMessages(chat).catch(() => {});
  }

  function goBackMobile() {
    if (window.innerWidth <= 768) setIsMobileChat(false);
  }

  async function sendMessage() {
    const chat = activeChat;
    if (!chat) return;
    if (!messageText.trim() && !pendingFile) return;
    const retryPayload = {
      chatType: chat.is_group ? "group" : "private",
      target: chat.target,
      text: messageText,
      file: pendingFile,
    };
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender: displayName(me),
      text: messageText,
      file_url: "",
      is_image: false,
      is_mine: true,
      is_read: false,
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      _localStatus: "sending",
      _retryPayload: retryPayload,
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessageText("");
    setPendingFile(null);
    try {
      await apiSendMessage(token, retryPayload);
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, _localStatus: "failed", _errorText: "Не отправлено" } : m))
      );
      return;
    }
    await Promise.all([loadMessages(chat), refreshChats()]);
  }

  async function retryFailedMessage(message) {
    if (!message?._retryPayload) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, _localStatus: "sending" } : m)));
    try {
      await apiSendMessage(token, message._retryPayload);
      await Promise.all([loadMessages(activeChatRef.current), refreshChats()]);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, _localStatus: "failed", _errorText: "Не отправлено" } : m))
      );
    }
  }

  function ensurePeer() {
    if (peerRef.current) return peerRef.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = (e) => {
      if (e.candidate && callWsRef.current) {
        callWsRef.current.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
      }
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
      setCallStatus("В звонке");
    };
    peerRef.current = pc;
    return pc;
  }

  async function attachMic(pc) {
    if (!localStreamRef.current) {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
  }

  function connectCall(room, isInitiator) {
    setCallOpen(true);
    setCallStatus(isInitiator ? "Ожидание ответа..." : "Подключение...");
    initiatorRef.current = isInitiator;
    offerSentRef.current = false;
    const ws = openCallSocket(token, room, async (msg) => {
      const pc = ensurePeer();
      if (msg.type === "join" && initiatorRef.current && !offerSentRef.current) {
        offerSentRef.current = true;
        await attachMic(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", sdp: offer }));
      }
      if (msg.type === "offer" && !initiatorRef.current) {
        await attachMic(pc);
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", sdp: answer }));
      }
      if (msg.type === "answer") {
        await pc.setRemoteDescription(msg.sdp);
        setCallStatus("В звонке");
      }
      if (msg.type === "ice" && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch {
          // ignore
        }
      }
      if (msg.type === "hangup") endCall(false);
    });
    ws.onopen = () => ws.send(JSON.stringify({ type: "join" }));
    callWsRef.current = ws;
  }

  async function startVoiceCall() {
    if (!activeChat || activeChat.is_group) return;
    callPeerRef.current = activeChat.login;
    await apiCallInvite(token, activeChat.login);
    connectCall(roomId(me.login, activeChat.login), true);
  }

  function acceptIncomingCall() {
    if (!incomingCall || !me) return;
    callPeerRef.current = incomingCall.from_login;
    const chat = allChatItems.find((x) => !x.is_group && x.login === incomingCall.from_login);
    if (chat) setActiveChat(chat);
    connectCall(roomId(me.login, incomingCall.from_login), false);
    setIncomingCall(null);
  }

  function endCall(sendSignal = true) {
    if (sendSignal && callWsRef.current && callWsRef.current.readyState === WebSocket.OPEN) {
      callWsRef.current.send(JSON.stringify({ type: "hangup" }));
    }
    if (callWsRef.current) callWsRef.current.close();
    callWsRef.current = null;
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setCallOpen(false);
    setCallStatus("Ожидание");
  }

  async function openProfile() {
    setProfileOpen(true);
  }

  async function saveProfile() {
    const updated = await apiUpdateMe(token, profileForm);
    setMe(updated);
    setProfileOpen(false);
    await refreshChats();
  }

  async function submitNewPass() {
    if (!/^\\d{4,6}$/.test(newPass)) return alert("Пароль должен быть от 4 до 6 цифр");
    await apiChangePassword(token, newPass);
    setNewPass("");
    setPassOpen(false);
    alert("Пароль изменен");
  }

  function pickMember(u) {
    setSelectedMembers((prev) => (prev.some((x) => x.login === u.login) ? prev : [...prev, u]));
  }

  function dropMember(loginValue) {
    setSelectedMembers((prev) => prev.filter((x) => x.login !== loginValue));
  }

  async function submitGroup() {
    if (!groupName.trim() || !selectedMembers.length) return alert("Заполните группу");
    await apiCreateGroup(token, groupName.trim(), selectedMembers.map((m) => m.login));
    setGroupCreateOpen(false);
    setGroupName("");
    setSelectedMembers([]);
    await refreshChats();
  }

  function openGroupSettings() {
    if (!activeChat?.is_group) return;
    setEditingGroupName(activeChat.name || "");
    setEditingGroupAvatar(activeChat.avatar_url || "");
    setSelectedMembers(users.filter((u) => (activeChat.members || []).includes(u.login)));
    setGroupNewOwner(activeChat.owner_login || "");
    setGroupSettingsOpen(true);
  }

  async function saveGroupSettings() {
    await apiUpdateGroup(token, activeChat.id, {
      name: editingGroupName.trim(),
      avatar_url: editingGroupAvatar,
      members: selectedMembers.map((m) => m.login),
    });
    setGroupSettingsOpen(false);
    await refreshChats();
  }

  async function uploadGroupAvatar(file) {
    if (!file) return;
    const uploaded = await apiUploadFile(token, file);
    setEditingGroupAvatar(uploaded.url);
  }

  async function transferGroupOwner() {
    if (!activeChat?.is_group || !groupNewOwner.trim()) return;
    await apiTransferGroupOwner(token, activeChat.id, groupNewOwner.trim());
    await refreshChats();
    setGroupSettingsOpen(false);
  }

  async function deleteActiveGroup() {
    if (!activeChat?.is_group) return;
    if (!window.confirm("Удалить группу? Это действие нельзя отменить.")) return;
    await apiDeleteGroup(token, activeChat.id);
    setGroupSettingsOpen(false);
    setActiveChat(null);
    setMessages([]);
    await refreshChats();
  }

  async function openUserDetails(loginValue) {
    const data = await apiGetUserInfo(token, loginValue);
    setUserInfo(data);
  }

  async function shareContactLink(targetLogin) {
    const shared = await apiShareContact(token, targetLogin);
    const link = `${window.location.origin}${shared.path}`;
    try {
      await navigator.clipboard.writeText(link);
      alert("Ссылка скопирована: " + link);
    } catch {
      alert("Ссылка: " + link);
    }
  }

  async function handleInviteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    const opened = await apiOpenInvite(token, inviteToken);
    const existing = chats.users.find((u) => u.login === opened.login);
    const chatObj = existing || {
      ...opened,
      id: opened.id || opened.login,
      kind: "user",
      is_group: false,
      target: opened.login,
      login: opened.login,
      name: opened.name,
      unread_count: 0,
      last_message: "",
      last_time: "",
    };
    openChat(chatObj);
    params.delete("invite");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
    alert(`Открыт контакт: ${opened.name}`);
  }

  async function saveUserNote() {
    if (!userInfo) return;
    await apiSetUserNote(token, userInfo.login, userInfo.note || "");
    alert("Заметка сохранена");
  }

  async function editOwnMessage(message) {
    const value = window.prompt("Новый текст сообщения", message.text || "");
    if (value === null) return;
    await apiUpdateMessage(token, message.id, value);
    await loadMessages();
  }

  async function deleteOwnMessage(message) {
    if (!window.confirm("Удалить это сообщение?")) return;
    await apiDeleteMessage(token, message.id);
    await loadMessages();
  }

  function openForwardDialog(message) {
    setForwardMessageId(message.id);
    setForwardOpen(true);
  }

  async function forwardToChat(chat) {
    if (!forwardMessageId) return;
    await apiForwardMessage(token, forwardMessageId, chat.is_group ? "group" : "private", chat.target);
    setForwardOpen(false);
    setForwardMessageId(null);
    setMessageMenu(null);
    await refreshChats();
  }

  function beginLongPress(callback, event, delay = 550) {
    clearTimeout(longPressRef.current);
    const point = event?.touches?.[0] || event;
    longPressRef.current = setTimeout(() => {
      callback(point);
    }, delay);
  }

  function endLongPress() {
    clearTimeout(longPressRef.current);
  }

  function openMessageMenu(message, point) {
    if (!message?.is_mine) return;
    if (message?._localStatus === "failed") return;
    setMessageMenu({
      type: "message",
      message,
      x: point?.clientX ?? window.innerWidth / 2,
      y: point?.clientY ?? window.innerHeight / 2,
    });
  }

  function openUserMenu(loginValue, point) {
    setMessageMenu({
      type: "user",
      login: loginValue,
      x: point?.clientX ?? window.innerWidth / 2,
      y: point?.clientY ?? window.innerHeight / 2,
    });
  }

  function handleMessagesScroll() {
    const node = msgListRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }

  async function openAdmin() {
    setAdminOpen(true);
    setAdminEdit(null);
    setAdminUsers(await apiAdminUsers(token, ""));
  }

  async function createAdminUser() {
    if (!adminNew.login || !adminNew.password) return alert("Логин/пароль обязательны");
    try {
      await apiAdminCreateUser(token, adminNew);
      setAdminNew({ login: "", password: "", first_name: "", last_name: "", role: "User", is_visible: true });
      setAdminUsers(await apiAdminUsers(token, ""));
    } catch (e) {
      alert(e.message || "Ошибка создания пользователя");
    }
  }

  function startEditUser(u) {
    setAdminEdit({
      source_id: u.id,
      id: u.id,
      login: u.login,
      role: u.role,
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      middle_name: u.middle_name || "",
      phone: u.phone || "",
      email: u.email || "",
      position: u.position || "",
      avatar_url: u.avatar_url || "",
      is_blocked: !!u.is_blocked,
      is_visible: u.is_visible !== false,
      password: "",
    });
  }

  async function saveEditUser() {
    try {
      const payload = { ...adminEdit };
      delete payload.source_id;
      await apiAdminUpdateUser(token, adminEdit.source_id, payload);
      setAdminEdit(null);
      setAdminUsers(await apiAdminUsers(token, ""));
      await refreshChats();
    } catch (e) {
      alert(e.message || "Ошибка редактирования пользователя");
    }
  }

  async function toggleBlock(u) {
    await apiAdminBlockUser(token, u.id, !u.is_blocked);
    setAdminUsers(await apiAdminUsers(token, ""));
  }

  function clearUnreadForChat(chat) {
    if (!chat) return;
    setChats((prev) => {
      const key = chat.is_group ? "groups" : "users";
      const items = prev[key].map((item) => {
        const currentTarget = chat.target ?? chat.login ?? chat.id;
        const itemTarget = item.target ?? item.login ?? item.id;
        if (String(itemTarget) === String(currentTarget)) {
          return { ...item, unread_count: 0 };
        }
        return item;
      });
      return { ...prev, [key]: items };
    });
  }

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  }

  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      if (!token) return;
      try {
        await refreshChats();
        if (activeChatRef.current) {
          const rows = await apiGetMessages(
            token,
            activeChatRef.current.is_group ? "group" : "private",
            activeChatRef.current.target
          );
          setMessages(rows);
        }
      } catch {
        // keep silent; websocket/poll will retry
      }
    }, 2500);
  }

  const isGroupOwner = activeChat?.is_group && me && activeChat.owner_login === me.login;

  if (!auth) {
    return (
      <div className="login-screen modal" style={{ display: "flex" }}>
        <form className="card" onSubmit={doLogin}>
          <h2 className="center">MG Messenger</h2>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Пароль" />
          <button className="btn-red" type="submit">Войти</button>
          {error ? <div className="error-text">{error}</div> : null}
        </form>
      </div>
    );
  }

  return (
    <>
      {incomingCall ? (
        <div className="modal" style={{ display: "flex", zIndex: 9000 }}>
          <div className="card">
            <h3>Входящий звонок</h3>
            <div>{incomingCall.from_name || incomingCall.from_login}</div>
            <button className="btn-blue" onClick={acceptIncomingCall}>Принять</button>
            <button className="btn-gray" onClick={() => setIncomingCall(null)}>Отклонить</button>
          </div>
        </div>
      ) : null}

      {callOpen ? (
        <div className="modal" style={{ display: "flex", zIndex: 8000 }}>
          <div className="card call-card">
            <h3>Голосовой звонок: {callPeerRef.current || activeChat?.name}</h3>
            <div className="muted">{callStatus}</div>
            <audio ref={remoteAudioRef} autoPlay playsInline />
            <button className="btn-red" onClick={() => endCall(true)}>Завершить</button>
          </div>
        </div>
      ) : null}

      {imagePreviewUrl ? (
        <div className="image-preview" onClick={() => setImagePreviewUrl("")}>
          <img src={imagePreviewUrl} alt="preview" />
        </div>
      ) : null}

      {messageMenu ? (
        <div className="context-backdrop" onMouseDown={() => setMessageMenu(null)} onTouchStart={() => setMessageMenu(null)}>
          <div
            className="context-menu"
            style={{ left: Math.max(8, Math.min(messageMenu.x, window.innerWidth - 190)), top: Math.max(8, Math.min(messageMenu.y, window.innerHeight - 170)) }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {messageMenu.type === "message" ? (
              <>
                <button onClick={() => { editOwnMessage(messageMenu.message); setMessageMenu(null); }}>Редактировать</button>
                <button onClick={() => { deleteOwnMessage(messageMenu.message); setMessageMenu(null); }}>Удалить</button>
                <button onClick={() => { openForwardDialog(messageMenu.message); setMessageMenu(null); }}>Переслать</button>
              </>
            ) : (
              <button onClick={() => { openUserDetails(messageMenu.login); setMessageMenu(null); }}>Открыть профиль</button>
            )}
          </div>
        </div>
      ) : null}

      <div className="app-container">
        <div className={`sidebar ${isMobileChat ? "mobile-hidden" : ""}`}>
          <div className="side-head">
            <div className="avatar-click" onClick={openProfile}>
              {me?.avatar_url ? <img src={me.avatar_url} className="avatar" alt="me" /> : <div className="avatar-placeholder">{initial(me)}</div>}
            </div>
            <div className="brand">MG MESSENGER</div>
            <button
              className="notify-btn"
              title="Разрешить уведомления"
              onClick={requestNotifications}
              style={{ display: notificationPermission === "granted" || notificationPermission === "unsupported" ? "none" : "inline-flex" }}
            >
              🔔
            </button>
            <div className="plus-wrap">
              <button className="plus-btn" onClick={() => setPlusOpen((v) => !v)}>+</button>
              {plusOpen ? (
                <div className="plus-menu">
                  <div onClick={() => { setPlusOpen(false); setSearchOpen(true); }}>Новый чат</div>
                  <div onClick={() => { setPlusOpen(false); setGroupCreateOpen(true); }}>Создать группу</div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="chat-list">
            {allChatItems.map((u) => (
              <div className="chat-item" key={`${u.kind}-${u.id || u.login}`} onClick={() => openChat(u)}>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!u.is_group) openUserMenu(u.login, e);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    if (!u.is_group) beginLongPress((point) => openUserMenu(u.login, point), e);
                  }}
                  onTouchEnd={endLongPress}
                  onTouchCancel={endLongPress}
                  className="avatar-click"
                >
                  {u.avatar_url ? <img src={u.avatar_url} className="avatar" alt="avatar" /> : <div className="avatar-placeholder">{initial(u)}</div>}
                </div>
                <div className="chat-title-wrap">
                  <div className="chat-title">{u.kind === "group" ? "Группа " : ""}{u.name}</div>
                  <div className="chat-subtitle">{u.last_message || "Нет сообщений"}</div>
                </div>
                {u.unread_count > 0 && !isCurrentChat(u) ? <div className="badge">{u.unread_count}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className={`main-chat ${isMobileChat ? "mobile-active" : ""}`}>
          <div className="chat-h">
            <button className="icon-btn mobile-back" onClick={goBackMobile}>←</button>
            <span className="chat-header-title">{activeChat ? activeChat.name : "Выберите диалог"}</span>
            <button className="icon-btn" onClick={startVoiceCall} style={{ display: activeChat && !activeChat.is_group ? "block" : "none" }}>📞</button>
            <button className="icon-btn" onClick={openGroupSettings} style={{ display: isGroupOwner ? "block" : "none" }}>⋮</button>
          </div>
          <div className="messages" ref={msgListRef} onScroll={handleMessagesScroll}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`msg ${m.is_mine ? "mine" : "theirs"} ${m._localStatus === "failed" ? "failed" : ""}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMessageMenu(m, e);
                }}
                onTouchStart={(e) => beginLongPress((point) => openMessageMenu(m, point), e)}
                onTouchEnd={endLongPress}
                onTouchCancel={endLongPress}
              >
                <div className="msg-sender">{m.sender}</div>
                {m.file_url ? (m.is_image ? <img src={m.file_url} alt="file" onClick={() => setImagePreviewUrl(m.file_url)} /> : <a href={m.file_url} target="_blank" rel="noreferrer">Файл</a>) : null}
                <div>{m.text}</div>
                <div className="msg-time">{m.time}</div>
                {m._localStatus === "failed" ? (
                  <div className="send-failed">
                    <span className="send-failed-icon">!</span>
                    <button className="send-failed-btn" onClick={() => retryFailedMessage(m)}>Не отправлено, повторить</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="input-area">
            <div className="input-wrapper">
              <label className="icon-btn">📎<input hidden type="file" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} /></label>
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder={pendingFile ? `Файл: ${pendingFile.name}` : "Написать..."} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
              <button className="send-btn" onClick={sendMessage}>🚀</button>
            </div>
          </div>
        </div>
      </div>

      {userInfo ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <div className="profile-avatar-wrap">
              {userInfo.avatar_url ? <img src={userInfo.avatar_url} className="avatar xlarge" alt="user" /> : <div className="avatar-placeholder xlarge">{initial(userInfo)}</div>}
            </div>
            <h3 className="center">{userInfo.name}</h3>
            <div className="info-box">
              <div>Логин: {userInfo.login}</div>
              <div>Телефон: {userInfo.phone || "-"}</div>
              <div>Email: {userInfo.email || "-"}</div>
              <div>Должность: {userInfo.position || "-"}</div>
            </div>
            <textarea
              className="note-area"
              value={userInfo.note || ""}
              onChange={(e) => setUserInfo((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Личная заметка (видна только вам)"
            />
            <button className="btn-gray" onClick={() => shareContactLink(userInfo.login)}>Поделиться контактом</button>
            <button className="btn-blue" onClick={saveUserNote}>Сохранить заметку</button>
            <div className="close-txt" onClick={() => setUserInfo(null)}>закрыть</div>
          </div>
        </div>
      ) : null}

      {forwardOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>Переслать сообщение</h3>
            <div className="result-list">
              {allChatItems.map((chat) => (
                <div key={`fw-${chat.kind}-${chat.id || chat.login}`} className="chat-item" onClick={() => forwardToChat(chat)}>
                  <div className="chat-title">{chat.is_group ? "Группа: " : ""}{chat.name}</div>
                </div>
              ))}
            </div>
            <div className="close-txt" onClick={() => { setForwardOpen(false); setForwardMessageId(null); }}>закрыть</div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>Новый чат</h3>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Имя, телефон или почта..." />
            <div className="result-list">{usersFiltered.map((u) => <div key={u.id} className="chat-item" onClick={() => { openChat({ ...u, is_group: false, target: u.login, kind: "user" }); setSearchOpen(false); }}>{u.name}</div>)}</div>
            <div className="close-txt" onClick={() => setSearchOpen(false)}>закрыть</div>
          </div>
        </div>
      ) : null}

      {groupCreateOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>Новая группа</h3>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Название группы" />
            <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Поиск участников..." />
            <div className="result-list compact">{groupUsers.map((u) => <div key={u.id} className="chat-item" onClick={() => pickMember(u)}>{u.name}</div>)}</div>
            <div className="chip-list">{selectedMembers.map((m) => <div className="chip" key={m.login}>{m.name}<span onClick={() => dropMember(m.login)}>x</span></div>)}</div>
            <button className="btn-blue" onClick={submitGroup}>Создать группу</button>
            <div className="close-txt" onClick={() => setGroupCreateOpen(false)}>закрыть</div>
          </div>
        </div>
      ) : null}

      {groupSettingsOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <div className="group-avatar-editor">
              {editingGroupAvatar ? <img src={editingGroupAvatar} className="avatar large" alt="group avatar" /> : <div className="avatar-placeholder large">{initial({ name: editingGroupName })}</div>}
              <label className="btn-gray upload-btn">
                Загрузить аватар
                <input hidden type="file" accept="image/*" onChange={(e) => uploadGroupAvatar(e.target.files?.[0])} />
              </label>
            </div>
            <input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} placeholder="Название" />
            <input value={groupEditSearch} onChange={(e) => setGroupEditSearch(e.target.value)} placeholder="Добавить участника..." />
            <div className="result-list compact">{groupEditUsers.map((u) => <div key={u.id} className="chat-item" onClick={() => pickMember(u)}>{u.name}</div>)}</div>
            <div className="chip-list">{selectedMembers.map((m) => <div className="chip" key={m.login}>{m.name}<span onClick={() => dropMember(m.login)}>x</span></div>)}</div>
            <input value={groupNewOwner} onChange={(e) => setGroupNewOwner(e.target.value)} placeholder="Логин нового владельца" />
            <button className="btn-blue" onClick={saveGroupSettings}>Сохранить изменения</button>
            <button className="btn-gray" onClick={transferGroupOwner}>Назначить владельца</button>
            <button className="btn-red" onClick={deleteActiveGroup}>Удалить группу</button>
            <div className="close-txt" onClick={() => setGroupSettingsOpen(false)}>закрыть</div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <input value={profileForm.last_name} onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Фамилия" />
            <input value={profileForm.first_name} onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="Имя" />
            <input value={profileForm.middle_name} onChange={(e) => setProfileForm((p) => ({ ...p, middle_name: e.target.value }))} placeholder="Отчество" />
            <input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" />
            <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
            <input value={profileForm.position} onChange={(e) => setProfileForm((p) => ({ ...p, position: e.target.value }))} placeholder="Должность" />
            {me?.login ? <button className="btn-gray" onClick={() => shareContactLink(me.login)}>Поделиться контактом</button> : null}
            <button className="btn-gray" onClick={() => setPassOpen(true)}>Сменить пароль</button>
            {me?.role?.toLowerCase() === "admin" ? <button className="btn-gray" onClick={openAdmin}>Админ настройки</button> : null}
            <button className="btn-blue" onClick={saveProfile}>Сохранить</button>
            <button className="btn-red" onClick={doLogout}>Выход</button>
            <div className="close-txt" onClick={() => setProfileOpen(false)}>закрыть</div>
          </div>
        </div>
      ) : null}

      {passOpen ? (
        <div className="modal" style={{ display: "flex", zIndex: 6000 }}>
          <div className="card">
            <h3>Новый пароль</h3>
            <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="1234" />
            <button className="btn-blue" onClick={submitNewPass}>Подтвердить</button>
            <div className="close-txt" onClick={() => setPassOpen(false)}>отмена</div>
          </div>
        </div>
      ) : null}

      {adminOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card admin-card">
            <h3>Админ настройки</h3>
            <input value={adminQuery} onChange={(e) => setAdminQuery(e.target.value)} placeholder="Поиск пользователя" />
            <div className="admin-create">
              <input value={adminNew.login} onChange={(e) => setAdminNew((p) => ({ ...p, login: e.target.value }))} placeholder="Логин" />
              <input value={adminNew.password} onChange={(e) => setAdminNew((p) => ({ ...p, password: e.target.value }))} placeholder="Пароль" />
              <input value={adminNew.first_name} onChange={(e) => setAdminNew((p) => ({ ...p, first_name: e.target.value }))} placeholder="Имя" />
              <input value={adminNew.last_name} onChange={(e) => setAdminNew((p) => ({ ...p, last_name: e.target.value }))} placeholder="Фамилия" />
              <select value={adminNew.role} onChange={(e) => setAdminNew((p) => ({ ...p, role: e.target.value }))}><option>User</option><option>Admin</option></select>
              <select value={adminNew.is_visible ? "1" : "0"} onChange={(e) => setAdminNew((p) => ({ ...p, is_visible: e.target.value === "1" }))}>
                <option value="1">visible</option>
                <option value="0">hidden</option>
              </select>
              <button className="btn-blue" onClick={createAdminUser}>Добавить</button>
            </div>
            <div className="admin-list">
              {adminFiltered.map((u) => (
                <div key={u.id}>
                  <div className="admin-row">
                    <div>
                      <b>{u.login}</b> ({u.role})
                      <div className="muted mini">id: {u.id}</div>
                      <div className="muted mini">{u.name || "-"}</div>
                      <div className="muted mini">visible: {u.is_visible ? "yes" : "no"}</div>
                    </div>
                    <div className="admin-actions">
                      <button className="mini-btn" onClick={() => startEditUser(u)}>Ред.</button>
                      <button className="mini-btn" onClick={() => toggleBlock(u)}>{u.is_blocked ? "Разбл" : "Блок"}</button>
                    </div>
                  </div>
                  {adminEdit?.source_id === u.id ? (
                    <div className="admin-create">
                      <h4>Редактирование пользователя</h4>
                      <input value={adminEdit.id} onChange={(e) => setAdminEdit((p) => ({ ...p, id: e.target.value }))} placeholder="id" />
                      <input value={adminEdit.login} onChange={(e) => setAdminEdit((p) => ({ ...p, login: e.target.value }))} placeholder="login" />
                      <input value={adminEdit.role} onChange={(e) => setAdminEdit((p) => ({ ...p, role: e.target.value }))} placeholder="role" />
                      <input value={adminEdit.first_name} onChange={(e) => setAdminEdit((p) => ({ ...p, first_name: e.target.value }))} placeholder="first_name" />
                      <input value={adminEdit.last_name} onChange={(e) => setAdminEdit((p) => ({ ...p, last_name: e.target.value }))} placeholder="last_name" />
                      <input value={adminEdit.middle_name} onChange={(e) => setAdminEdit((p) => ({ ...p, middle_name: e.target.value }))} placeholder="middle_name" />
                      <input value={adminEdit.phone} onChange={(e) => setAdminEdit((p) => ({ ...p, phone: e.target.value }))} placeholder="phone" />
                      <input value={adminEdit.email} onChange={(e) => setAdminEdit((p) => ({ ...p, email: e.target.value }))} placeholder="email" />
                      <input value={adminEdit.position} onChange={(e) => setAdminEdit((p) => ({ ...p, position: e.target.value }))} placeholder="position" />
                      <input value={adminEdit.avatar_url} onChange={(e) => setAdminEdit((p) => ({ ...p, avatar_url: e.target.value }))} placeholder="avatar_url" />
                      <input value={adminEdit.password} onChange={(e) => setAdminEdit((p) => ({ ...p, password: e.target.value }))} placeholder="new password" />
                      <select value={adminEdit.is_blocked ? "1" : "0"} onChange={(e) => setAdminEdit((p) => ({ ...p, is_blocked: e.target.value === "1" }))}><option value="0">active</option><option value="1">blocked</option></select>
                      <select value={adminEdit.is_visible ? "1" : "0"} onChange={(e) => setAdminEdit((p) => ({ ...p, is_visible: e.target.value === "1" }))}><option value="1">visible</option><option value="0">hidden</option></select>
                      <button className="btn-blue" onClick={saveEditUser}>Сохранить пользователя</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="close-txt" onClick={() => setAdminOpen(false)}>закрыть</div>
          </div>
        </div>
      ) : null}
    </>
  );
}



