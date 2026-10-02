import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, MatchState, ServerEvent, Snapshot } from "./types";

const API = import.meta.env.VITE_API_BASE_URL || "";
const userId = localStorage.getItem("90m-user-id") || crypto.randomUUID();
localStorage.setItem("90m-user-id", userId);

export function useMatchRoom(matchId: string, displayName: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [analysis, setAnalysis] = useState("Ask about the game, a tactical change, or something said in the room.");
  const [thinking, setThinking] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const retry = useRef<number | undefined>(undefined);
  const nameRef = useRef(displayName);

  useEffect(() => {
    nameRef.current = displayName;
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: "join", payload: { userId, displayName } }));
    }
  }, [displayName]);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    const connect = () => {
      setConnection("connecting");
      const base = API || window.location.origin;
      const url = new URL(`/api/matches/${matchId}/live`, base);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => { attempts = 0; setConnection("live"); ws.send(JSON.stringify({ type: "join", payload: { userId, displayName: nameRef.current } })); };
      ws.onmessage = (message) => {
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.type === "room.snapshot") setSnapshot(event.payload);
        if (event.type === "match.updated") { setSimulating(false); setSnapshot((old) => old ? { ...old, match: event.payload } : old); }
        if (event.type === "chat.created") setSnapshot((old) => old ? { ...old, chat: [...old.chat, event.payload].slice(-100) } : old);
        if (event.type === "presence.updated") setSnapshot((old) => old ? { ...old, connectedUsers: event.payload.connectedUsers } : old);
        if (event.type === "ai.thinking") { setThinking(true); setError(""); }
        if (event.type === "ai.response") { setThinking(false); setAnalysis(event.payload.answer); }
        if (event.type === "ai.unavailable") { setThinking(false); setError(event.payload.message); }
        if (event.type === "error") setError(event.payload.message);
      };
      ws.onclose = () => { if (!active) return; setConnection("offline"); attempts++; retry.current = window.setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000)); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { active = false; clearTimeout(retry.current); socket.current?.close(); };
  }, [matchId]);

  const send = useCallback((event: object) => {
    if (socket.current?.readyState !== WebSocket.OPEN) { setError("Reconnecting to the room…"); return; }
    socket.current.send(JSON.stringify(event));
  }, []);
  const simulate = useCallback(async () => {
    setError("");
    setSimulating(true);
    try {
      const response = await fetch(`${API}/api/matches/${matchId}/simulate`, { method: "POST" });
      if (!response.ok) throw new Error("Simulation request failed");
    } catch {
      setSimulating(false); setError("Could not start the simulation.");
    }
  }, [matchId]);

  const reset = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`${API}/api/matches/${matchId}/reset`, { method: "POST" });
      if (!response.ok) throw new Error("Reset request failed");
    } catch {
      setError("Could not reset the match.");
    }
  }, [matchId]);

  return {
    snapshot, connection, analysis, thinking, simulating, error, simulate, reset,
    ask: (question: string) => send({ type: "ai.ask", payload: { question } }),
    chat: (text: string) => send({ type: "chat.send", payload: { text } }),
  };
}

export const emptyMatch = null as MatchState | null;
export const emptyChat = [] as ChatMessage[];
