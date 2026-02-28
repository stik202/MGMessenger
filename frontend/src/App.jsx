import { useEffect, useMemo, useState } from "react";
import {
  apiChangePassword,
  apiCreateGroup,
  apiGetActiveChats,
  apiGetMe,
  apiGetMessages,
  apiLogin,
  apiSearchUsers,
  apiSendMessage,
  apiUpdateMe,
} from "./api";

const LS_KEY = "mgm_auth";

function displayName(user) {
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.login;
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [me, setMe] = useState(null);
  const [chats, setChats] = useState({ users: [], groups: [] });
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);

  const [search, setSearch] = useState("");
  const [searchUsers, setSearchUsers] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState("");

  const token = auth?.token;

  useEffect(() => {
    if (!token) return;
    apiGetMe(token).then(setMe).catch(() => logout());
    reloadChats();
  }, [token]);

  useEffect(() => {
    if (!token || !activeChat) return;
    loadMessages();
    const timer = setInterval(loadMessages, 5000);
    return () => clearInterval(timer);
  }, [token, activeChat]);

  useEffect(() => {
    if (!token || search.length < 2) {
      setSearchUsers([]);
      return;
    }
    const t = setTimeout(() => {
      apiSearchUsers(token, search).then(setSearchUsers).catch(() => setSearchUsers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, token]);

  async function doLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await apiLogin(login, password);
      const next = { token: res.access_token, profile: res.profile };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setAuth(next);
    } catch (e2) {
      setError(e2.message);
    }
  }

  function logout() {
    localStorage.removeItem(LS_KEY);
    setAuth(null);
    setMe(null);
    setChats({ users: [], groups: [] });
    setActiveChat(null);
    setMessages([]);
  }

  async function reloadChats() {
    if (!token) return;
    const data = await apiGetActiveChats(token);
    setChats(data);
  }

  async function loadMessages() {
    if (!token || !activeChat) return;
    const data = await apiGetMessages(token, activeChat.is_group ? "group" : "private", activeChat.target);
    setMessages(data);
  }

  async function sendMessage() {
    if (!token || !activeChat) return;
    if (!text.trim() && !file) return;

    await apiSendMessage(token, {
      chatType: activeChat.is_group ? "group" : "private",
      target: activeChat.target,
      text,
      file,
    });
    setText("");
    setFile(null);
    await loadMessages();
    await reloadChats();
  }

  async function openPrivateChat(user) {
    setActiveChat({
      title: user.name,
      target: user.login,
      is_group: false,
    });
  }

  async function openGroupChat(group) {
    setActiveChat({
      title: group.name,
      target: group.id,
      is_group: true,
    });
  }

  async function createGroup() {
    const members = groupMembers
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!groupName || members.length === 0) return;
    await apiCreateGroup(token, groupName, members);
    setGroupName("");
    setGroupMembers("");
    await reloadChats();
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!me) return;
    const form = new FormData(e.target);
    const payload = {
      first_name: form.get("first_name") || "",
      last_name: form.get("last_name") || "",
      middle_name: form.get("middle_name") || "",
      phone: form.get("phone") || "",
      email: form.get("email") || "",
      position: form.get("position") || "",
      avatar_url: form.get("avatar_url") || "",
    };
    const updated = await apiUpdateMe(token, payload);
    setMe(updated);
  }

  async function changePassword() {
    const next = prompt("Новый пароль (4+ символов):");
    if (!next) return;
    await apiChangePassword(token, next);
    alert("Пароль изменен");
  }

  const allChatItems = useMemo(() => {
    const users = chats.users.map((u) => ({ ...u, kind: "user" }));
    const groups = chats.groups.map((g) => ({ ...g, kind: "group" }));
    return [...groups, ...users];
  }, [chats]);

  if (!auth) {
    return (
      <main className="auth-wrap">
        <form className="auth-card" onSubmit={doLogin}>
          <h1>MG Messenger</h1>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" />
          <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" />
          <button type="submit">Войти</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="layout">
      <aside className="sidebar">
        <div className="panel-block">
          <b>{me ? displayName(me) : auth.profile.login}</b>
          <button onClick={logout}>Выйти</button>
        </div>

        <div className="panel-block">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск сотрудника"
          />
          <div className="search-results">
            {searchUsers.map((u) => (
              <button key={u.id} className="item-btn" onClick={() => openPrivateChat(u)}>
                {u.name} ({u.login})
              </button>
            ))}
          </div>
        </div>

        <div className="panel-block">
          <h3>Чаты</h3>
          {allChatItems.map((x) => (
            <button
              key={`${x.kind}-${x.id}`}
              className="item-btn"
              onClick={() => (x.kind === "group" ? openGroupChat(x) : openPrivateChat(x))}
            >
              {x.kind === "group" ? "[Группа] " : ""}
              {x.kind === "group" ? x.name : x.name}
            </button>
          ))}
        </div>

        <div className="panel-block">
          <h3>Новая группа</h3>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Название" />
          <input
            value={groupMembers}
            onChange={(e) => setGroupMembers(e.target.value)}
            placeholder="Логины через запятую"
          />
          <button onClick={createGroup}>Создать</button>
        </div>
      </aside>

      <section className="chat">
        <header className="chat-header">{activeChat ? activeChat.title : "Выберите чат"}</header>
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={m.is_mine ? "msg me" : "msg"}>
              <div className="meta">{m.sender}</div>
              {m.file_url ? (
                m.is_image ? (
                  <img src={m.file_url} alt="file" className="msg-image" />
                ) : (
                  <a href={m.file_url} target="_blank" rel="noreferrer">
                    Файл
                  </a>
                )
              ) : null}
              <div>{m.text}</div>
              <div className="time">{m.time}</div>
            </div>
          ))}
        </div>

        <div className="send-box">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button onClick={sendMessage} disabled={!activeChat}>Отправить</button>
        </div>

        {me && (
          <form className="profile" onSubmit={saveProfile}>
            <h3>Профиль</h3>
            <input name="last_name" defaultValue={me.last_name} placeholder="Фамилия" />
            <input name="first_name" defaultValue={me.first_name} placeholder="Имя" />
            <input name="middle_name" defaultValue={me.middle_name} placeholder="Отчество" />
            <input name="phone" defaultValue={me.phone} placeholder="Телефон" />
            <input name="email" defaultValue={me.email} placeholder="Email" />
            <input name="position" defaultValue={me.position} placeholder="Должность" />
            <input name="avatar_url" defaultValue={me.avatar_url} placeholder="URL аватара" />
            <div className="profile-actions">
              <button type="submit">Сохранить</button>
              <button type="button" onClick={changePassword}>Сменить пароль</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

