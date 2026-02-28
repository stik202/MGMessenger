const API_BASE = import.meta.env.VITE_API_BASE || "";

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiBase() {
  return API_BASE;
}

export async function apiLogin(login, password) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка входа");
  return response.json();
}

export async function apiGetActiveChats(token) {
  const response = await fetch(`${API_BASE}/api/chats/active`, { headers: headers(token) });
  if (!response.ok) throw new Error("Ошибка получения чатов");
  return response.json();
}

export async function apiSearchUsers(token, q) {
  const response = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(q)}`, {
    headers: headers(token),
  });
  if (!response.ok) throw new Error("Ошибка поиска пользователей");
  return response.json();
}

export async function apiGetMessages(token, chatType, target) {
  const response = await fetch(
    `${API_BASE}/api/messages?chat_type=${encodeURIComponent(chatType)}&target=${encodeURIComponent(target)}`,
    { headers: headers(token) }
  );
  if (!response.ok) throw new Error("Ошибка получения сообщений");
  return response.json();
}

export async function apiSendMessage(token, payload) {
  const form = new FormData();
  form.append("chat_type", payload.chatType);
  form.append("target", payload.target);
  form.append("text", payload.text || "");
  if (payload.file) form.append("file", payload.file);

  const response = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: headers(token),
    body: form,
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка отправки");
  return response.json();
}

export async function apiCreateGroup(token, name, members) {
  const response = await fetch(`${API_BASE}/api/groups`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name, members }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка создания группы");
  return response.json();
}

export async function apiGetMe(token) {
  const response = await fetch(`${API_BASE}/api/me`, { headers: headers(token) });
  if (!response.ok) throw new Error("Ошибка профиля");
  return response.json();
}

export async function apiUpdateMe(token, payload) {
  const response = await fetch(`${API_BASE}/api/me`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Ошибка сохранения профиля");
  return response.json();
}

export async function apiChangePassword(token, newPassword) {
  const response = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка смены пароля");
  return response.json();
}

export async function apiUploadFile(token, file) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: headers(token),
    body: form,
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка загрузки файла");
  return response.json();
}

export async function apiUpdateGroup(token, groupId, payload) {
  const response = await fetch(`${API_BASE}/api/groups/${groupId}`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка сохранения группы");
  return response.json();
}

export async function apiAdminUsers(token, q = "") {
  const response = await fetch(`${API_BASE}/api/admin/users?q=${encodeURIComponent(q)}`, {
    headers: headers(token),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка списка пользователей");
  return response.json();
}

export async function apiAdminCreateUser(token, payload) {
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка создания пользователя");
  return response.json();
}

export async function apiAdminUpdateUser(token, id, payload) {
  const response = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка редактирования пользователя");
  return response.json();
}

export async function apiAdminBlockUser(token, id, isBlocked) {
  const response = await fetch(`${API_BASE}/api/admin/users/${id}/block`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ is_blocked: isBlocked }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка блокировки пользователя");
  return response.json();
}

export async function apiCallInvite(token, targetLogin) {
  const response = await fetch(`${API_BASE}/api/calls/invite`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ target_login: targetLogin }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка звонка");
  return response.json();
}

export async function apiGetUserInfo(token, login) {
  const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(login)}`, {
    headers: headers(token),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка загрузки пользователя");
  return response.json();
}

export async function apiSetUserNote(token, login, note) {
  const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(login)}/note`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка сохранения заметки");
  return response.json();
}

export async function apiUpdateMessage(token, messageId, text) {
  const response = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(messageId)}`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка редактирования сообщения");
  return response.json();
}

export async function apiDeleteMessage(token, messageId) {
  const response = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка удаления сообщения");
  return response.json();
}

export async function apiForwardMessage(token, messageId, chatType, target) {
  const response = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(messageId)}/forward`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ chat_type: chatType, target }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка пересылки сообщения");
  return response.json();
}

export async function apiTransferGroupOwner(token, groupId, newOwnerLogin) {
  const response = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/owner`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ new_owner_login: newOwnerLogin }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка смены владельца");
  return response.json();
}

export async function apiDeleteGroup(token, groupId) {
  const response = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка удаления группы");
  return response.json();
}

export async function apiShareContact(token, targetLogin) {
  const response = await fetch(`${API_BASE}/api/contacts/share`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ target_login: targetLogin }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ошибка создания ссылки");
  return response.json();
}

export async function apiOpenInvite(token, inviteToken) {
  const response = await fetch(`${API_BASE}/api/contacts/invite/${encodeURIComponent(inviteToken)}`, {
    method: "POST",
    headers: headers(token),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Ссылка недействительна");
  return response.json();
}

export function openEventsSocket(token, onMessage) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/events?token=${encodeURIComponent(token)}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed payload
    }
  };
  return ws;
}

export function openCallSocket(token, roomId, onMessage) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${proto}://${window.location.host}/api/ws/calls/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`
  );
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed payload
    }
  };
  return ws;
}
