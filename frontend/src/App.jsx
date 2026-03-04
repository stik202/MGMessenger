import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiAdminBlockUser,
  apiAdminCreateUser,
  apiAdminUpdateUser,
  apiAdminUsers,
  apiCallInvite,
  apiChangePassword,
  apiBlockUser,
  apiCreateGroup,
  apiDeleteGroup,
  apiDeleteMessage,
  apiForwardMessage,
  apiGetActiveChats,
  apiGetBlockedUsers,
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
  apiUnblockUser,
  apiUpdateMessage,
  apiUpdateGroup,
  apiUpdateMe,
  apiUploadFile,
  openCallSocket,
  openEventsSocket,
} from "./api";

const LS_KEY = "mgm_auth";
const LS_CHAT_PREFS_KEY = "mgm_chat_prefs";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1024;

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

function formatDeviceTime(createdAt, fallback = "") {
  if (!createdAt) return fallback;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}


function chatKey(chat) {
  if (!chat) return "";
  const target = chat.target ?? chat.login ?? chat.id ?? "";
  return `${chat.is_group ? "group" : "private"}:${String(target)}`;
}

function ChatMessage({
  m,
  beginLongPress,
  endLongPress,
  openMessageMenu,
  setImagePreviewUrl,
  retryFailedMessage,
  currentChatKey,
  chatOpenedAtMs,
}) {
  const messageText = m.text || "";
  const storageKey = `${currentChatKey}:${String(m.id)}`;
  const [expanded, setExpanded] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem("expanded_msgs") || "[]");
      return data.includes(storageKey) || data.includes(m.id);
    } catch {
      return false;
    }
  });
  const [animated, setAnimated] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem("animated_msgs") || "[]");
      return data.includes(storageKey) || data.includes(m.id);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!expanded) return;
    try {
      const data = new Set(JSON.parse(localStorage.getItem("expanded_msgs") || "[]"));
      data.add(storageKey);
      localStorage.setItem("expanded_msgs", JSON.stringify([...data]));
    } catch {}
  }, [expanded, storageKey]);

  const isLong = messageText.length > 140;
  const collapsedText = isLong ? messageText.slice(0, 140) + "..." : messageText;
  const createdAtMs = m.created_at ? new Date(m.created_at).getTime() : 0;
  const hasValidCreatedAt = Number.isFinite(createdAtMs) && createdAtMs > 0;
  const shouldAnimate =
    !m.is_mine &&
    !expanded &&
    !animated &&
    hasValidCreatedAt &&
    chatOpenedAtMs > 0 &&
    createdAtMs >= chatOpenedAtMs;

  const [displayText, setDisplayText] = useState(() => (shouldAnimate ? "" : expanded ? messageText : collapsedText));

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayText(expanded ? messageText : collapsedText);
      return;
    }
    setDisplayText("");
    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      setDisplayText(collapsedText.slice(0, idx));
      if (idx >= collapsedText.length) {
        clearInterval(timer);
        try {
          const data = new Set(JSON.parse(localStorage.getItem("animated_msgs") || "[]"));
          data.add(storageKey);
          localStorage.setItem("animated_msgs", JSON.stringify([...data]));
        } catch {}
        setAnimated(true);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [collapsedText, expanded, messageText, shouldAnimate, storageKey]);

  const handleReadMore = (e) => {
    e.preventDefault();
    setExpanded(true);
  };

  return (
    <div
      className={`msg-row ${m.is_mine ? "mine" : "theirs"} ${m._localStatus === "failed" ? "failed" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openMessageMenu(m, e);
      }}
      onTouchStart={(e) => beginLongPress((point) => openMessageMenu(m, point), e)}
      onTouchEnd={endLongPress}
      onTouchCancel={endLongPress}
    >
      {!m.is_mine ? (
        m.sender_avatar_url ? (
          <img src={m.sender_avatar_url} className="msg-avatar" alt="avatar" />
        ) : (
          <div className="msg-avatar-placeholder">{initial({ name: m.sender })}</div>
        )
      ) : null}
      <div className={`msg ${m.is_mine ? "mine" : "theirs"} ${m._localStatus === "failed" ? "failed" : ""}`}>
        <div className="msg-content">
          <div className="msg-sender">{m.sender}</div>
          {m.forwarded_from_name ? <div className="msg-forwarded">РџРµСЂРµСЃР»Р°РЅРѕ: {m.forwarded_from_name}</div> : null}
          {m.file_url ? (m.is_image ? <img src={m.file_url} alt="file" onClick={() => setImagePreviewUrl(m.file_url)} /> : <a href={m.file_url} target="_blank" rel="noreferrer">Р¤Р°Р№Р»</a>) : null}
          <div className="msg-text">{displayText}</div>
          {isLong && !expanded ? (
            <div className="msg-readmore" onClick={handleReadMore}>
              С‡РёС‚Р°С‚СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ
            </div>
          ) : null}
          <div className="msg-meta">
            <div className="msg-time">{m.time}</div>
            {m.is_mine ? (
              <div className={`msg-status ${m.is_read ? "read" : "sent"}`}>
                {m.is_read ? ">>" : ">"}
              </div>
            ) : null}
          </div>
          {m._localStatus === "failed" ? (
            <div className="send-failed">
              <span className="send-failed-icon">!</span>
              <button className="send-failed-btn" onClick={() => retryFailedMessage(m)}>РќРµ РѕС‚РїСЂР°РІР»РµРЅРѕ, РїРѕРІС‚РѕСЂРёС‚СЊ</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
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
  const [activeChatOpenedAtMs, setActiveChatOpenedAtMs] = useState(0);

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
  const [editingMessage, setEditingMessage] = useState(null);
  const [copyToast, setCopyToast] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [chatPrefs, setChatPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_CHAT_PREFS_KEY) || "{}");
    } catch {
      return {};
    }
  });

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
  const [callStatus, setCallStatus] = useState("РћР¶РёРґР°РЅРёРµ");

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
  const messageInputRef = useRef(null);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const stickToBottomRef = useRef(true);
  const reconnectRef = useRef({ timer: null, attempt: 0, stopped: false });

  const allChatItems = useMemo(() => {
    const g = chats.groups.map((x) => ({ ...x, kind: "group", is_group: true, target: x.id }));
    const u = chats.users.map((x) => ({ ...x, kind: "user", is_group: false, target: x.login }));
    return [...g, ...u];
  }, [chats]);
  const activeChatKey = useMemo(() => chatKey(activeChat), [activeChat]);

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

  function getChatPref(item) {
    return chatPrefs[chatKey(item)] || { muted: false, deleted: false };
  }

  function updateChatPref(item, patch) {
    const key = chatKey(item);
    setChatPrefs((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] || { muted: false, deleted: false }), ...patch } };
      localStorage.setItem(LS_CHAT_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function isChatMuted(item) {
    return !!getChatPref(item).muted;
  }

  const visibleChatItems = useMemo(
    () => allChatItems.filter((item) => !getChatPref(item).deleted),
    [allChatItems, chatPrefs]
  );

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
    if (!messageText && !pendingFile && messageInputRef.current) {
      const el = messageInputRef.current;
      requestAnimationFrame(() => {
        el.style.height = "22px";
        el.style.overflowY = "hidden";
        el.scrollTop = 0;
      });
    }
  }, [messageText, pendingFile]);

  useEffect(() => {
    if (!copyToast) return;
    const t = setTimeout(() => setCopyToast(false), 3000);
    return () => clearTimeout(t);
  }, [copyToast]);

  useEffect(() => {
    if (!token || !activeChat) return;
    loadMessages(activeChat);
  }, [token, activeChat]);

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
    applyMessagesWithSmartScroll(normalizeServerMessages(rows));
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
          applyMessagesWithSmartScroll(normalizeServerMessages(rows));
          clearUnreadForChat(activeChatRef.current);
        }
        const eventChat = event.chat_type && event.target ? { is_group: event.chat_type === "group", target: event.target } : null;
        const muted = eventChat ? isChatMuted(eventChat) : false;
        if (
          !muted &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          event.sender_login !== me?.login
        ) {
          new Notification(event.sender_name || "MG Messenger", {
            body: event.preview || "New message",
          });
        }
      }
      if (event.type === "call:invite") {
        setIncomingCall({ from_login: event.from_login, from_name: event.from_name });
        const callChat = { is_group: false, target: event.from_login };
        if (
          !isChatMuted(callChat) &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("Incoming call", {
            body: `${event.from_name || event.from_login} is calling you`,
          });
        }
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
      setError(err.message || "РћС€РёР±РєР° РІС…РѕРґР°");
    }
  }

  function doLogout() {
    localStorage.removeItem(LS_KEY);
    setAuth(null);
    setMe(null);
    setUsers([]);
    setChats({ users: [], groups: [] });
    setActiveChat(null);
    setActiveChatOpenedAtMs(0);
    setMessages([]);
    setIsMobileChat(false);
    endCall(false);
  }

  function openChat(chat) {
    stickToBottomRef.current = true;
    updateChatPref(chat, { deleted: false });
    setActiveChatOpenedAtMs(Date.now());
    setActiveChat(chat);
    clearUnreadForChat(chat);
    if (window.innerWidth <= 768) setIsMobileChat(true);
    loadMessages(chat).catch(() => {});
  }

  function goBackMobile() {
    if (window.innerWidth <= 768) setIsMobileChat(false);
  }

  function withFileAccessToken(fileUrl) {
    if (!fileUrl || !token || !String(fileUrl).includes("/uploads/")) return fileUrl;
    try {
      const isAbsolute = /^https?:\/\//i.test(fileUrl);
      const u = new URL(fileUrl, window.location.origin);
      if (!u.pathname.startsWith("/uploads/")) return fileUrl;
      if (!u.searchParams.get("token")) u.searchParams.set("token", token);
      return isAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
    } catch {
      const sep = fileUrl.includes("?") ? "&" : "?";
      return `${fileUrl}${sep}token=${encodeURIComponent(token)}`;
    }
  }

  function normalizeServerMessages(rows) {
    return (rows || []).map((row) => ({
      ...row,
      file_url: withFileAccessToken(row.file_url),
      time: formatDeviceTime(row.created_at, row.time || ""),
    }));
  }

  function autosizeMessageInput(el) {
    if (!el) return;
    el.style.height = "22px";
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 140 ? "auto" : "hidden";
  }

  function resetMessageInputHeight() {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = "22px";
    el.style.overflowY = "hidden";
    el.scrollTop = 0;
  }

  async function imageFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("РћС€РёР±РєР° С‡С‚РµРЅРёСЏ С„Р°Р№Р»Р°"));
      reader.readAsDataURL(file);
    });
  }

  async function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("РћС€РёР±РєР° РёР·РѕР±СЂР°Р¶РµРЅРёСЏ"));
      img.src = dataUrl;
    });
  }

  async function compressImage(file) {
    const dataUrl = await imageFileToDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.9;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    while (blob && blob.size > MAX_FILE_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    }
    if (!blob) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃР¶Р°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" });
  }

  async function prepareFileForUpload(file) {
    if (!file) return null;
    if (file.type.startsWith("image/")) {
      const prepared = await compressImage(file);
      if (prepared.size > MAX_FILE_BYTES) {
        throw new Error("РР·РѕР±СЂР°Р¶РµРЅРёРµ РЅРµ СѓРґР°Р»РѕСЃСЊ СЃР¶Р°С‚СЊ РґРѕ 2 РњР‘");
      }
      return prepared;
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("Р¤Р°Р№Р» Р±РѕР»СЊС€Рµ 2 РњР‘");
    }
    return file;
  }

  async function sendMessage() {
    const chat = activeChat;
    if (!chat) return;
    if (!messageText.trim() && !pendingFile) return;
    if (editingMessage?.id) {
      await apiUpdateMessage(token, editingMessage.id, messageText);
      setEditingMessage(null);
      setMessageText("");
      resetMessageInputHeight();
      await loadMessages(chat);
      return;
    }
    const retryPayload = {
      chatType: chat.is_group ? "group" : "private",
      target: chat.target,
      text: messageText,
      file: pendingFile,
    };
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender: displayName(me),
      sender_avatar_url: me?.avatar_url || "",
      text: messageText,
      file_url: "",
      is_image: pendingFile ? pendingFile.type.startsWith("image/") : false,
      forwarded_from_login: "",
      forwarded_from_name: "",
      is_mine: true,
      is_read: false,
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      _localStatus: "sending",
      _retryPayload: retryPayload,
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessageText("");
    setPendingFile(null);
    resetMessageInputHeight();
    try {
      await apiSendMessage(token, retryPayload);
    } catch (e) {
      const errText = e?.message || "Not sent";
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, _localStatus: "failed", _errorText: errText } : m))
      );
      if (String(errText).toLowerCase().includes("blocked")) {
        alert(errText);
      }
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
    } catch (e) {
      const errText = e?.message || "Not sent";
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, _localStatus: "failed", _errorText: errText } : m))
      );
      if (String(errText).toLowerCase().includes("blocked")) {
        alert(errText);
      }
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
      setCallStatus("Р’ Р·РІРѕРЅРєРµ");
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
    setCallStatus(isInitiator ? "РћР¶РёРґР°РЅРёРµ РѕС‚РІРµС‚Р°..." : "РџРѕРґРєР»СЋС‡РµРЅРёРµ...");
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
        setCallStatus("Р’ Р·РІРѕРЅРєРµ");
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
    if (!window.isSecureContext) {
      alert("Р“РѕР»РѕСЃРѕРІС‹Рµ Р·РІРѕРЅРєРё РІ Р±СЂР°СѓР·РµСЂРµ СЂР°Р±РѕС‚Р°СЋС‚ С‚РѕР»СЊРєРѕ РїРѕ HTTPS (РёР»Рё РЅР° localhost).");
      return;
    }
    callPeerRef.current = activeChat.login;
    try {
      await apiCallInvite(token, activeChat.login);
    } catch (e) {
      alert(e.message || "Call error");
      return;
    }
    connectCall(roomId(me.login, activeChat.login), true);
  }

  function acceptIncomingCall() {
    if (!incomingCall || !me) return;
    callPeerRef.current = incomingCall.from_login;
    const chat = allChatItems.find((x) => !x.is_group && x.login === incomingCall.from_login);
    if (chat) {
      setActiveChatOpenedAtMs(Date.now());
      setActiveChat(chat);
    }
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
    setCallStatus("РћР¶РёРґР°РЅРёРµ");
  }

  async function openProfile() {
    setProfileOpen(true);
  }

  async function loadBlockedUsers() {
    const rows = await apiGetBlockedUsers(token);
    setBlockedUsers(rows || []);
  }

  async function openBlockedList() {
    await loadBlockedUsers();
    setBlockedOpen(true);
  }

  async function unblockLogin(loginValue) {
    await apiUnblockUser(token, loginValue);
    await loadBlockedUsers();
  }

  async function saveProfile() {
    const updated = await apiUpdateMe(token, profileForm);
    setMe(updated);
    setProfileOpen(false);
    await refreshChats();
  }

  async function submitNewPass() {
    if (!/^\\d{4,6}$/.test(newPass)) return alert("РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РѕС‚ 4 РґРѕ 6 С†РёС„СЂ");
    await apiChangePassword(token, newPass);
    setNewPass("");
    setPassOpen(false);
    alert("РџР°СЂРѕР»СЊ РёР·РјРµРЅРµРЅ");
  }

  function pickMember(u) {
    setSelectedMembers((prev) => (prev.some((x) => x.login === u.login) ? prev : [...prev, u]));
  }

  function dropMember(loginValue) {
    setSelectedMembers((prev) => prev.filter((x) => x.login !== loginValue));
  }

  async function submitGroup() {
    if (!groupName.trim() || !selectedMembers.length) return alert("Р—Р°РїРѕР»РЅРёС‚Рµ РіСЂСѓРїРїСѓ");
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
    try {
      const prepared = await prepareFileForUpload(file);
      const uploaded = await apiUploadFile(token, prepared);
      setEditingGroupAvatar(uploaded.url);
    } catch (e) {
      alert(e.message || "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РІР°С‚Р°СЂ");
    }
  }

  async function uploadMyAvatar(file) {
    if (!file) return;
    try {
      const prepared = await prepareFileForUpload(file);
      const uploaded = await apiUploadFile(token, prepared);
      setProfileForm((prev) => ({ ...prev, avatar_url: uploaded.url }));
    } catch (e) {
      alert(e.message || "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РІР°С‚Р°СЂ");
    }
  }

  async function pickMessageFile(file) {
    if (!file) return;
    try {
      const prepared = await prepareFileForUpload(file);
      setPendingFile(prepared);
    } catch (e) {
      alert(e.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ С„Р°Р№Р»");
    }
  }

  async function transferGroupOwner() {
    if (!activeChat?.is_group || !groupNewOwner.trim()) return;
    await apiTransferGroupOwner(token, activeChat.id, groupNewOwner.trim());
    await refreshChats();
    setGroupSettingsOpen(false);
  }

  async function deleteActiveGroup() {
    if (!activeChat?.is_group) return;
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.")) return;
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
      setCopyToast(true);
    } catch {
      alert("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ");
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
    alert(`РћС‚РєСЂС‹С‚ РєРѕРЅС‚Р°РєС‚: ${opened.name}`);
  }

  async function saveUserNote() {
    if (!userInfo) return;
    await apiSetUserNote(token, userInfo.login, userInfo.note || "");
    alert("Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°");
  }

  async function editOwnMessage(message) {
    setEditingMessage({ id: message.id });
    setMessageText(message.text || "");
    setPendingFile(null);
    requestAnimationFrame(() => {
      if (messageInputRef.current) {
        messageInputRef.current.focus();
        autosizeMessageInput(messageInputRef.current);
      }
    });
  }

  async function deleteOwnMessage(message) {
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ СЌС‚Рѕ СЃРѕРѕР±С‰РµРЅРёРµ?")) return;
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
    if (message?._localStatus === "failed") return;
    setMessageMenu({
      type: "message",
      message,
      x: point?.clientX ?? window.innerWidth / 2,
      y: point?.clientY ?? window.innerHeight / 2,
    });
  }

  async function copyMessageText(message) {
    if (!message?.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // ignore
    }
  }

  function openUserMenu(loginValue, point) {
    setMessageMenu({
      type: "user",
      login: loginValue,
      x: point?.clientX ?? window.innerWidth / 2,
      y: point?.clientY ?? window.innerHeight / 2,
    });
  }

  function openChatOptions(chat, point) {
    setMessageMenu({
      type: "chat",
      chat,
      x: point?.clientX ?? window.innerWidth / 2,
      y: point?.clientY ?? window.innerHeight / 2,
    });
  }

  function toggleChatMute(chat) {
    const muted = isChatMuted(chat);
    updateChatPref(chat, { muted: !muted });
    setMessageMenu(null);
  }

  function deleteChatLocal(chat) {
    updateChatPref(chat, { deleted: true });
    if (activeChat && chatKey(activeChat) === chatKey(chat)) {
      setActiveChat(null);
      setMessages([]);
      setIsMobileChat(false);
    }
    setMessageMenu(null);
  }

  async function blockChatUser(chat) {
    if (!chat || chat.is_group) return;
    if (!window.confirm(`Block ${chat.name || chat.login}?`)) return;
    await apiBlockUser(token, chat.login);
    setMessageMenu(null);
    await loadBlockedUsers();
    deleteChatLocal(chat);
  }

  function handleMessagesScroll() {
    const node = msgListRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }

  function isMobileInputMode() {
    return window.innerWidth <= 768;
  }

  function onChatTouchStart(e) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onChatTouchEnd(e) {
    if (!isMobileChat) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = Math.abs(t.clientY - swipeStartRef.current.y);
    if (dx > 50 && dy < 80) {
      goBackMobile();
    }
  }

  function applyMessagesWithSmartScroll(rows) {
    const node = msgListRef.current;
    if (!node) {
      setMessages(rows);
      return;
    }
    const shouldStick = stickToBottomRef.current;
    const bottomOffset = node.scrollHeight - node.scrollTop;
    setMessages(rows);
    requestAnimationFrame(() => {
      const next = msgListRef.current;
      if (!next) return;
      if (shouldStick) {
        next.scrollTop = next.scrollHeight;
      } else {
        next.scrollTop = Math.max(0, next.scrollHeight - bottomOffset);
      }
    });
  }

  async function openAdmin() {
    setAdminOpen(true);
    setAdminEdit(null);
    setAdminUsers(await apiAdminUsers(token, ""));
  }

  async function createAdminUser() {
    if (!adminNew.login || !adminNew.password) return alert("Р›РѕРіРёРЅ/РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹");
    try {
      await apiAdminCreateUser(token, adminNew);
      setAdminNew({ login: "", password: "", first_name: "", last_name: "", role: "User", is_visible: true });
      setAdminUsers(await apiAdminUsers(token, ""));
    } catch (e) {
      alert(e.message || "РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ");
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
      alert(e.message || "РћС€РёР±РєР° СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ");
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
    if (!window.isSecureContext) {
      alert("РЈРІРµРґРѕРјР»РµРЅРёСЏ СЂР°Р±РѕС‚Р°СЋС‚ С‚РѕР»СЊРєРѕ РїРѕ HTTPS (РёР»Рё РЅР° localhost).");
      return;
    }
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
          applyMessagesWithSmartScroll(normalizeServerMessages(rows));
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
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Р›РѕРіРёРЅ" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="РџР°СЂРѕР»СЊ" />
          <button className="btn-red" type="submit">Р’РѕР№С‚Рё</button>
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
            <h3>Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє</h3>
            <div>{incomingCall.from_name || incomingCall.from_login}</div>
            <button className="btn-blue" onClick={acceptIncomingCall}>РџСЂРёРЅСЏС‚СЊ</button>
            <button className="btn-gray" onClick={() => setIncomingCall(null)}>РћС‚РєР»РѕРЅРёС‚СЊ</button>
          </div>
        </div>
      ) : null}

      {callOpen ? (
        <div className="modal" style={{ display: "flex", zIndex: 8000 }}>
          <div className="card call-card">
            <h3>Р“РѕР»РѕСЃРѕРІРѕР№ Р·РІРѕРЅРѕРє: {callPeerRef.current || activeChat?.name}</h3>
            <div className="muted">{callStatus}</div>
            <audio ref={remoteAudioRef} autoPlay playsInline />
            <button className="btn-red" onClick={() => endCall(true)}>Р—Р°РІРµСЂС€РёС‚СЊ</button>
          </div>
        </div>
      ) : null}

      {imagePreviewUrl ? (
        <div className="image-preview" onClick={() => setImagePreviewUrl("")}>
          <img src={imagePreviewUrl} alt="preview" />
        </div>
      ) : null}

      {copyToast ? (
        <div className="copy-toast">РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°</div>
      ) : null}

      {messageMenu ? (
        <div className="context-backdrop" onMouseDown={() => setMessageMenu(null)} onTouchStart={() => setMessageMenu(null)}>
          <div
            className="context-menu"
            style={{ left: Math.max(8, Math.min(messageMenu.x, window.innerWidth - 190)), top: Math.max(8, Math.min(messageMenu.y, window.innerHeight - 170)) }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {messageMenu.type === "message" ? (
              <>
                {messageMenu.message?.is_mine ? (
                  <button onClick={() => { editOwnMessage(messageMenu.message); setMessageMenu(null); }}>Edit</button>
                ) : null}
                {messageMenu.message?.is_mine ? (
                  <button onClick={() => { deleteOwnMessage(messageMenu.message); setMessageMenu(null); }}>Delete</button>
                ) : null}
                {messageMenu.message?.text ? (
                  <button onClick={() => { copyMessageText(messageMenu.message); setMessageMenu(null); }}>Copy text</button>
                ) : null}
                <button onClick={() => { openForwardDialog(messageMenu.message); setMessageMenu(null); }}>Forward</button>
              </>
            ) : messageMenu.type === "chat" ? (
              <>
                <button onClick={() => toggleChatMute(messageMenu.chat)}>
                  {isChatMuted(messageMenu.chat) ? "Enable notifications" : "Mute notifications"}
                </button>
                <button onClick={() => deleteChatLocal(messageMenu.chat)}>Delete chat</button>
                {!messageMenu.chat?.is_group ? (
                  <button onClick={() => blockChatUser(messageMenu.chat)}>Block user</button>
                ) : null}
              </>
            ) : (
              <button onClick={() => { openUserDetails(messageMenu.login); setMessageMenu(null); }}>Open profile</button>
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
              className={`notify-btn ${notificationPermission === "granted" ? "active" : ""}`}
              title={!window.isSecureContext ? "РЈРІРµРґРѕРјР»РµРЅРёСЏ С‚СЂРµР±СѓСЋС‚ HTTPS" : "Р Р°Р·СЂРµС€РёС‚СЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ"}
              onClick={requestNotifications}
              style={{ display: notificationPermission === "unsupported" ? "none" : "inline-flex" }}
            >
              <svg className="notify-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4a5 5 0 0 0-5 5v2.7c0 .6-.2 1.1-.6 1.6L5 15h14l-1.4-1.7c-.4-.5-.6-1-.6-1.6V9a5 5 0 0 0-5-5Z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
            </button>
            <div className="plus-wrap">
              <button className="plus-btn" onClick={() => setPlusOpen((v) => !v)}>+</button>
              {plusOpen ? (
                <div className="plus-menu">
                  <div onClick={() => { setPlusOpen(false); setSearchOpen(true); }}>РќРѕРІС‹Р№ С‡Р°С‚</div>
                  <div onClick={() => { setPlusOpen(false); setGroupCreateOpen(true); }}>РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ</div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="chat-list">
            {visibleChatItems.map((u) => (
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
                  <div className="chat-title">{u.kind === "group" ? "Р“СЂСѓРїРїР° " : ""}{u.name}</div>
                  <div className="chat-subtitle">{u.last_message || "РќРµС‚ СЃРѕРѕР±С‰РµРЅРёР№"}</div>
                </div>
                <button
                  className="chat-more-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openChatOptions(u, e);
                  }}
                  title="Chat settings"
                >
                  ...
                </button>
                {(u.unread_count ?? 0) > 0 && !isCurrentChat(u) ? <div className="badge">{(u.unread_count ?? 0) > 99 ? "99+" : u.unread_count}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className={`main-chat ${isMobileChat ? "mobile-active" : ""}`} onTouchStart={onChatTouchStart} onTouchEnd={onChatTouchEnd}>
          <div className="chat-h">
            <button className="icon-btn mobile-back" onClick={goBackMobile}>в†ђ</button>
            <span className="chat-header-title">{activeChat ? activeChat.name : "Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі"}</span>
            <button className="icon-btn" onClick={startVoiceCall} style={{ display: activeChat && !activeChat.is_group ? "block" : "none" }}>рџ“ћ</button>
            <button className="icon-btn" onClick={openGroupSettings} style={{ display: isGroupOwner ? "block" : "none" }}>в‹®</button>
          </div>
          <div className="messages" ref={msgListRef} onScroll={handleMessagesScroll}>
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                m={m}
                beginLongPress={beginLongPress}
                endLongPress={endLongPress}
                openMessageMenu={openMessageMenu}
                setImagePreviewUrl={setImagePreviewUrl}
                retryFailedMessage={retryFailedMessage}
                currentChatKey={activeChatKey}
                chatOpenedAtMs={activeChatOpenedAtMs}
              />
            ))}
          </div>
          <div className="input-area">
            {editingMessage?.id ? <div className="edit-hint">Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ</div> : null}
            <div className="input-wrapper">
              <label className="icon-btn">рџ“Ћ<input hidden type="file" onChange={(e) => { pickMessageFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <textarea
                ref={messageInputRef}
                className="message-input"
                rows={1}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onInput={(e) => {
                  autosizeMessageInput(e.target);
                }}
                placeholder={pendingFile ? `Р¤Р°Р№Р»: ${pendingFile.name}` : "РќР°РїРёСЃР°С‚СЊ..."}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (isMobileInputMode()) return;
                  if (e.shiftKey) return;
                  if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              {editingMessage?.id ? (
                <button className="icon-btn" title="РћС‚РјРµРЅРёС‚СЊ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ" onClick={() => { setEditingMessage(null); setMessageText(""); resetMessageInputHeight(); }}>вњ•</button>
              ) : null}
              <button className={`send-btn ${editingMessage?.id ? "send-btn-edit" : ""}`} onClick={sendMessage}>{editingMessage?.id ? "вњ“" : ">"}</button>
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
              <div>Р›РѕРіРёРЅ: {userInfo.login}</div>
              <div>РўРµР»РµС„РѕРЅ: {userInfo.phone || "-"}</div>
              <div>Email: {userInfo.email || "-"}</div>
              <div>Р”РѕР»Р¶РЅРѕСЃС‚СЊ: {userInfo.position || "-"}</div>
            </div>
            <textarea
              className="note-area"
              value={userInfo.note || ""}
              onChange={(e) => setUserInfo((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Р›РёС‡РЅР°СЏ Р·Р°РјРµС‚РєР° (РІРёРґРЅР° С‚РѕР»СЊРєРѕ РІР°Рј)"
            />
            <button className="btn-gray" onClick={() => shareContactLink(userInfo.login)}>РџРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј</button>
            <button className="btn-blue" onClick={saveUserNote}>РЎРѕС…СЂР°РЅРёС‚СЊ Р·Р°РјРµС‚РєСѓ</button>
            <div className="close-txt" onClick={() => setUserInfo(null)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {forwardOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>РџРµСЂРµСЃР»Р°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ</h3>
            <div className="result-list">
              {allChatItems.map((chat) => (
                <div key={`fw-${chat.kind}-${chat.id || chat.login}`} className="chat-item" onClick={() => forwardToChat(chat)}>
                  <div className="chat-title">{chat.is_group ? "Р“СЂСѓРїРїР°: " : ""}{chat.name}</div>
                </div>
              ))}
            </div>
            <div className="close-txt" onClick={() => { setForwardOpen(false); setForwardMessageId(null); }}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>РќРѕРІС‹Р№ С‡Р°С‚</h3>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="РРјСЏ, С‚РµР»РµС„РѕРЅ РёР»Рё РїРѕС‡С‚Р°..." />
            <div className="result-list">{usersFiltered.map((u) => <div key={u.id} className="chat-item" onClick={() => { openChat({ ...u, is_group: false, target: u.login, kind: "user" }); setSearchOpen(false); }}>{u.name}</div>)}</div>
            <div className="close-txt" onClick={() => setSearchOpen(false)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {groupCreateOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>РќРѕРІР°СЏ РіСЂСѓРїРїР°</h3>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹" />
            <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="РџРѕРёСЃРє СѓС‡Р°СЃС‚РЅРёРєРѕРІ..." />
            <div className="result-list compact">{groupUsers.map((u) => <div key={u.id} className="chat-item" onClick={() => pickMember(u)}>{u.name}</div>)}</div>
            <div className="chip-list">{selectedMembers.map((m) => <div className="chip" key={m.login}>{m.name}<span onClick={() => dropMember(m.login)}>x</span></div>)}</div>
            <button className="btn-blue" onClick={submitGroup}>РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ</button>
            <div className="close-txt" onClick={() => setGroupCreateOpen(false)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {groupSettingsOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <div className="group-avatar-editor">
              <label className="avatar-click">
                {editingGroupAvatar ? <img src={editingGroupAvatar} className="avatar large" alt="group avatar" /> : <div className="avatar-placeholder large">{initial({ name: editingGroupName })}</div>}
                <input hidden type="file" accept="image/*" onChange={async (e) => { await uploadGroupAvatar(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            <input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} placeholder="РќР°Р·РІР°РЅРёРµ" />
            <input value={groupEditSearch} onChange={(e) => setGroupEditSearch(e.target.value)} placeholder="Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°..." />
            <div className="result-list compact">{groupEditUsers.map((u) => <div key={u.id} className="chat-item" onClick={() => pickMember(u)}>{u.name}</div>)}</div>
            <div className="chip-list">{selectedMembers.map((m) => <div className="chip" key={m.login}>{m.name}<span onClick={() => dropMember(m.login)}>x</span></div>)}</div>
            <input value={groupNewOwner} onChange={(e) => setGroupNewOwner(e.target.value)} placeholder="Р›РѕРіРёРЅ РЅРѕРІРѕРіРѕ РІР»Р°РґРµР»СЊС†Р°" />
            <button className="btn-blue" onClick={saveGroupSettings}>РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ</button>
            <button className="btn-gray" onClick={transferGroupOwner}>РќР°Р·РЅР°С‡РёС‚СЊ РІР»Р°РґРµР»СЊС†Р°</button>
            <button className="btn-red" onClick={deleteActiveGroup}>РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ</button>
            <div className="close-txt" onClick={() => setGroupSettingsOpen(false)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <div className="profile-avatar-wrap">
              <label className="avatar-click">
                {profileForm.avatar_url ? (
                  <img src={profileForm.avatar_url} className="avatar xlarge" alt="my avatar" />
                ) : (
                  <div className="avatar-placeholder xlarge">{initial(me)}</div>
                )}
                <input hidden type="file" accept="image/*" onChange={async (e) => { await uploadMyAvatar(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            <input value={profileForm.last_name} onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Р¤Р°РјРёР»РёСЏ" />
            <input value={profileForm.first_name} onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="РРјСЏ" />
            <input value={profileForm.middle_name} onChange={(e) => setProfileForm((p) => ({ ...p, middle_name: e.target.value }))} placeholder="РћС‚С‡РµСЃС‚РІРѕ" />
            <input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="РўРµР»РµС„РѕРЅ" />
            <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
            <input value={profileForm.position} onChange={(e) => setProfileForm((p) => ({ ...p, position: e.target.value }))} placeholder="Р”РѕР»Р¶РЅРѕСЃС‚СЊ" />
            {me?.login ? <button className="btn-gray" onClick={() => shareContactLink(me.login)}>РџРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј</button> : null}
            <button className="btn-gray" onClick={openBlockedList}>Blacklist</button>
            <button className="btn-gray" onClick={() => setPassOpen(true)}>РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ</button>
            {me?.role?.toLowerCase() === "admin" ? <button className="btn-gray" onClick={openAdmin}>РђРґРјРёРЅ РЅР°СЃС‚СЂРѕР№РєРё</button> : null}
            <button className="btn-blue" onClick={saveProfile}>РЎРѕС…СЂР°РЅРёС‚СЊ</button>
            <button className="btn-red" onClick={doLogout}>Р’С‹С…РѕРґ</button>
            <div className="close-txt" onClick={() => setProfileOpen(false)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}

      {blockedOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card">
            <h3>Blacklist</h3>
            <div className="result-list compact">
              {blockedUsers.length ? blockedUsers.map((u) => (
                <div key={u.login} className="chat-item">
                  <div className="chat-title-wrap">
                    <div className="chat-title">{u.name || u.login}</div>
                    <div className="chat-subtitle">{u.login}</div>
                  </div>
                  <button className="mini-btn" onClick={() => unblockLogin(u.login)}>Unblock</button>
                </div>
              )) : <div className="muted">List is empty</div>}
            </div>
            <div className="close-txt" onClick={() => setBlockedOpen(false)}>close</div>
          </div>
        </div>
      ) : null}

      {passOpen ? (
        <div className="modal" style={{ display: "flex", zIndex: 6000 }}>
          <div className="card">
            <h3>РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ</h3>
            <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="1234" />
            <button className="btn-blue" onClick={submitNewPass}>РџРѕРґС‚РІРµСЂРґРёС‚СЊ</button>
            <div className="close-txt" onClick={() => setPassOpen(false)}>РѕС‚РјРµРЅР°</div>
          </div>
        </div>
      ) : null}

      {adminOpen ? (
        <div className="modal" style={{ display: "flex" }}>
          <div className="card admin-card">
            <h3>РђРґРјРёРЅ РЅР°СЃС‚СЂРѕР№РєРё</h3>
            <input value={adminQuery} onChange={(e) => setAdminQuery(e.target.value)} placeholder="РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ" />
            <div className="admin-create">
              <input value={adminNew.login} onChange={(e) => setAdminNew((p) => ({ ...p, login: e.target.value }))} placeholder="Р›РѕРіРёРЅ" />
              <input value={adminNew.password} onChange={(e) => setAdminNew((p) => ({ ...p, password: e.target.value }))} placeholder="РџР°СЂРѕР»СЊ" />
              <input value={adminNew.first_name} onChange={(e) => setAdminNew((p) => ({ ...p, first_name: e.target.value }))} placeholder="РРјСЏ" />
              <input value={adminNew.last_name} onChange={(e) => setAdminNew((p) => ({ ...p, last_name: e.target.value }))} placeholder="Р¤Р°РјРёР»РёСЏ" />
              <select value={adminNew.role} onChange={(e) => setAdminNew((p) => ({ ...p, role: e.target.value }))}><option>User</option><option>Admin</option></select>
              <select value={adminNew.is_visible ? "1" : "0"} onChange={(e) => setAdminNew((p) => ({ ...p, is_visible: e.target.value === "1" }))}>
                <option value="1">visible</option>
                <option value="0">hidden</option>
              </select>
              <button className="btn-blue" onClick={createAdminUser}>Р”РѕР±Р°РІРёС‚СЊ</button>
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
                      <button className="mini-btn" onClick={() => startEditUser(u)}>Р РµРґ.</button>
                      <button className="mini-btn" onClick={() => toggleBlock(u)}>{u.is_blocked ? "Р Р°Р·Р±Р»" : "Р‘Р»РѕРє"}</button>
                    </div>
                  </div>
                  {adminEdit?.source_id === u.id ? (
                    <div className="admin-create">
                      <h4>Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</h4>
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
                      <button className="btn-blue" onClick={saveEditUser}>РЎРѕС…СЂР°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="close-txt" onClick={() => setAdminOpen(false)}>Р·Р°РєСЂС‹С‚СЊ</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
