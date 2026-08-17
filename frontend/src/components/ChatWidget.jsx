import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { getUser } from "../lib/auth";

async function fetchChatState() {
  return apiRequest("/chat/state/");
}

async function sendMessage(content) {
  return apiRequest("/chat/messages/", {
    method: "POST",
    body: { content },
  });
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lastReadId, setLastReadId] = useState(0);
  const messagesRef = useRef(null);
  const user = getUser();

  const { data, refetch } = useQuery({
    queryKey: ["chat-state"],
    queryFn: fetchChatState,
    refetchInterval: open ? 3000 : 5000,
  });

  const messages = data?.messages || [];
  const activeUsers = data?.active_users || [];
  const maxId = messages.length ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    if (open && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [open, messages.length]);

  const unread = open ? 0 : messages.filter((m) => m.id > lastReadId).length;

  const mutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      setInput("");
      refetch();
    },
  });

  function handleToggle() {
    if (open) setLastReadId(maxId);
    setOpen(!open);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content || mutation.isPending) return;
    mutation.mutate(content);
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Chat interno">
          <div className="chat-header">
            <div className="chat-header-title">
              <i className="bi bi-chat-dots" />
              <span>Chat interno</span>
            </div>
            <button
              type="button"
              className="btn btn-icon btn-sm chat-close"
              onClick={handleToggle}
              aria-label="Cerrar chat"
            >
              <i className="bi bi-x" />
            </button>
          </div>

          <div className="chat-users">
            {activeUsers.map((u) => (
              <span key={u.id} className="chat-user-chip">
                <span className="chat-user-dot" />
                {u.name}
              </span>
            ))}
          </div>

          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">Aún no hay mensajes. ¡Saluda al equipo!</div>
            ) : (
              messages.map((m) => {
                const mine = m.user_id === user?.id;
                return (
                  <div key={m.id} className={`chat-msg${mine ? " chat-msg--mine" : ""}`}>
                    <div className="chat-msg-bubble">
                      <div className="chat-msg-meta">
                        <span className="chat-msg-name">{mine ? "Tú" : m.name}</span>
                        <span className="chat-msg-time">{formatTime(m.created_at)}</span>
                      </div>
                      <div className="chat-msg-text">{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form className="chat-input" onSubmit={handleSubmit}>
            <input
              type="text"
              className="form-control"
              placeholder="Escribe un mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              aria-label="Mensaje"
            />
            <button
              type="submit"
              className="btn btn-primary chat-send"
              disabled={!input.trim() || mutation.isPending}
              aria-label="Enviar mensaje"
            >
              <i className="bi bi-send" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chat-bubble"
        onClick={handleToggle}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        <i className={`bi ${open ? "bi-x" : "bi-chat-dots"}`} />
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
    </div>
  );
}