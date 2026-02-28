const API_BASE = import.meta.env.VITE_API_BASE || "";

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
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


