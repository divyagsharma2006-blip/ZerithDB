"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Laptop,
  Save,
  Database,
  ArrowRightLeft,
  Copy,
  Check,
  Trash2,
} from "lucide-react";

type ClientId = "A" | "B";

type Note = {
  id: string;
  text: string;
  senderId: ClientId;
  timestamp: number;
};

type Toast = {
  id: string;
  message: string;
  type: "success" | "error";
};

type Client = {
  id: ClientId;
  name: string;
  color: string;
  notes: Note[];
  input: string;
  identity: string;
  lastClearedAt: number;
};

const MAX_TIMESTAMP_SKEW_MS = 60_000;

const dummyMessage: Note = {
  id: "dummy-1",
  text: "Hello from Client A!",
  senderId: "A",
  timestamp: Date.now(),
};

const CLIENTS_CONFIG: Omit<Client, "notes" | "input" | "identity" | "lastClearedAt">[] = [
  { id: "A", name: "Alice", color: "blue" },
  { id: "B", name: "Bob", color: "purple" },
];

const INSTRUCTIONS = [
  "Type a message in Browser A and click Save. See it instantly sync to Browser B.",
  {
    text: "Click the Network: Online button to simulate going offline.",
    highlight: "Network: Online",
    highlightColor: "red",
  },
  "Create different notes in Browser A and Browser B. Notice they don't sync.",
  {
    text: "Click Network: Offline to reconnect. Watch the CRDT engine automatically merge the states perfectly!",
    highlight: "Network: Offline",
    highlightColor: "green",
  },
  "Click Clear Chat on any browser to remove all messages (syncs when online).",
];

// Helper to generate mock Ed25519 did:key identifiers
async function generateMockDID(): Promise<string> {
  const mockPublicKey = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `did:key:z${mockPublicKey}`;
}

function sanitizeTimestamp(value: number, now = Date.now()): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), now + MAX_TIMESTAMP_SKEW_MS);
}

function sortNotesByTimestamp(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.timestamp - b.timestamp);
}

function reconcileClients(clients: Client[]) {
  const latestClearTimestamp = clients.reduce(
    (maxClearTimestamp, client) =>
      Math.max(maxClearTimestamp, sanitizeTimestamp(client.lastClearedAt)),
    0
  );

  const allNotesMap = new Map<string, Note>();

  clients.forEach((client) => {
    client.notes.forEach((note) => {
      const noteTimestamp = sanitizeTimestamp(note.timestamp);
      if (noteTimestamp <= latestClearTimestamp) return;

      const existing = allNotesMap.get(note.id);
      if (!existing || noteTimestamp > existing.timestamp) {
        allNotesMap.set(note.id, { ...note, timestamp: noteTimestamp });
      }
    });
  });

  const mergedNotes = sortNotesByTimestamp(Array.from(allNotesMap.values()));

  let changed = false;
  const syncedClients = clients.map((client) => {
    const sanitizedClientNotes = sortNotesByTimestamp(
      client.notes
        .map((note) => ({ ...note, timestamp: sanitizeTimestamp(note.timestamp) }))
        .filter((note) => note.timestamp > latestClearTimestamp)
    );
    const notesChanged = JSON.stringify(sanitizedClientNotes) !== JSON.stringify(mergedNotes);
    const clearChanged = sanitizeTimestamp(client.lastClearedAt) !== latestClearTimestamp;

    if (notesChanged || clearChanged) {
      changed = true;
      return { ...client, notes: mergedNotes, lastClearedAt: latestClearTimestamp };
    }

    return client;
  });

  return { changed, mergedNotes, syncedClients };
}

// Separate component for better scalability and cleaner code
function ClientCard({
  client,
  isLoading,
  onAddNote,
  onUpdateInput,
  onCopyIdentity,
  onClearChat,
}: {
  client: Client;
  isLoading: boolean;
  onAddNote: (id: ClientId, text: string) => void;
  onUpdateInput: (id: ClientId, value: string) => void;
  onCopyIdentity: (text: string) => void;
  onClearChat: (id: ClientId) => void;
}) {
  const isBlue = client.color === "blue";
  const textColor = isBlue ? "text-blue-400" : "text-purple-400";
  const bgColor = isBlue ? "bg-blue-50" : "bg-purple-50";
  const borderColor = isBlue ? "border-blue-100" : "border-purple-100";
  const identityBorder = isBlue ? "border-blue-200" : "border-purple-200";
  const identityText = isBlue ? "text-blue-700" : "text-purple-700";
  const identityIcon = isBlue
    ? "text-blue-500 hover:text-blue-700 hover:bg-blue-100"
    : "text-purple-500 hover:text-purple-700 hover:bg-purple-100";
  const focusRingColor = isBlue
    ? "focus:ring-blue-500/20 focus:border-blue-500"
    : "focus:ring-purple-500/20 focus:border-purple-500";

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[520px] max-h-[700px]">
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2 text-white">
          <Laptop className={`w-4 h-4 ${textColor}`} />
          <span className="text-sm font-semibold tracking-wide">
            Browser {client.id} ({client.name})
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
          <Database className="w-3.5 h-3.5" /> IndexedDB Active
        </div>
      </div>

      {/* Identity Display */}
      <div className={`${bgColor} px-4 py-3 border-b ${borderColor}`}>
        <div className="flex items-center justify-between mb-2">
          <div
            className={`text-xs font-semibold ${isBlue ? "text-blue-900" : "text-purple-900"} uppercase tracking-wide`}
          >
            Identity (Ed25519 Mock)
          </div>
          <button
            onClick={() => onClearChat(client.id)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear all messages"
            aria-label={`Clear chat for Browser ${client.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Chat</span>
          </button>
        </div>
        <div
          className={`flex items-center gap-2 bg-white rounded-lg px-3 py-2 border ${identityBorder}`}
        >
          <code className={`text-xs ${identityText} font-mono flex-1 truncate`}>
            {client.identity || "(generating...)"}
          </code>
          <button
            onClick={() => onCopyIdentity(client.identity)}
            disabled={!client.identity}
            className={`ml-2 p-1.5 ${identityIcon} disabled:text-gray-400 disabled:hover:bg-transparent rounded transition-colors flex-shrink-0`}
            title={client.identity ? "Copy public key" : "Loading..."}
            aria-label={`Copy Browser ${client.id} public key`}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : client.notes.length === 0 ? (
          <div className="text-center text-gray-400 mt-20 text-sm">
            No messages. Type below to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {client.notes.map((note) => (
              <div
                key={note.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <p className="text-gray-800 wrap-break-word whitespace-pre-wrap">{note.text}</p>
                <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                  ID: {note.id} • {new Date(note.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAddNote(client.id, client.input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={client.input}
            onChange={(e) => onUpdateInput(client.id, e.target.value)}
            placeholder="Type a message offline/online..."
            className={`flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all ${focusRingColor}`}
          />
          <button
            type="submit"
            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncCount, setSyncCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());
  const isInitialMount = useRef(true);

  // Initialize clients
  const [clients, setClients] = useState<Client[]>(() =>
    CLIENTS_CONFIG.map((client) => ({
      ...client,
      notes: client.id === "A" ? [dummyMessage] : [],
      input: "",
      identity: "",
      lastClearedAt: 0,
    }))
  );

  // Simulate DB initialization and generate identities
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setIsPeerConnected(true);
    }, 1500);

    (async () => {
      const newClients = await Promise.all(
        clients.map(async (c) => ({
          ...c,
          identity: await generateMockDID(),
        }))
      );
      setClients(newClients);
    })();

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setIsPeerConnected(false);
      return;
    }

    setIsPeerConnected(false);
    const timer = setTimeout(() => setIsPeerConnected(true), 1000);
    return () => clearTimeout(timer);
  }, [isOnline]);

  const peerStatus = !isOnline
    ? "offline"
    : isLoading || !isPeerConnected
      ? "connecting"
      : "connected";

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = toastTimeouts.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);

    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimeouts.current.delete(timeout);
    }, 2000);

    toastTimeouts.current.add(timeout);
  };

  const copyToClipboard = async (text: string) => {
    if (!text.trim()) {
      showToast("Failed to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard!", "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  // Clear chat for a specific client
  const clearChat = (clientId: ClientId) => {
    const clearedAt = sanitizeTimestamp(Date.now());
    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId
          ? { ...client, notes: [], lastClearedAt: clearedAt }
          : client
      )
    );
    showToast(`Chat cleared for Browser ${clientId}`, "success");
  };

  // ALWAYS sync regardless of online status (makes offline mode behave like online)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (isLoading) return;

    const { changed, mergedNotes, syncedClients } = reconcileClients(clients);

    if (changed) {
      setClients(syncedClients);
      setSyncCount((prev) => prev + 1);
      
      if (mergedNotes.length > 0 && !isInitialMount.current) {
        showToast(
          `Synced ${mergedNotes.length} message${mergedNotes.length !== 1 ? "s" : ""} across browsers`,
          "success"
        );
      }
    }
  }, [clients, isLoading]);

  const addNote = (clientId: ClientId, text: string) => {
    if (!text.trim()) return;
    
    const newNote: Note = {
      id: Math.random().toString(36).substring(7) + Date.now(),
      text,
      timestamp: Date.now(),
      senderId: clientId,
    };

    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId
          ? { ...client, notes: [...client.notes, newNote], input: "" }
          : client
      )
    );
    
    showToast(`Message saved in Browser ${clientId}`, "success");
  };

  const updateInput = (clientId: ClientId, value: string) => {
    setClients((prev) =>
      prev.map((client) => (client.id === clientId ? { ...client, input: value } : client))
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden">
      {/* HEADER - Fixed at top */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 h-16 flex items-center justify-between fixed top-0 left-0 right-0 z-50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
          <Link
            href="/"
            className="text-gray-500 hover:text-black transition-colors flex items-center gap-1.5 text-sm font-medium shrink-0 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            <span className="truncate">Back</span>
          </Link>
          <div className="h-4 w-px bg-gray-300 shrink-0"></div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <img src="/logo.svg" alt="ZerithDB Logo" className="w-full h-full" />
            </div>
            <span className="font-semibold text-gray-900 text-base md:text-lg tracking-tight truncate">
              ZerithDB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-wrap md:flex-nowrap justify-end min-w-0">
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full shrink-0">
            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">CRDT Sync: {syncCount}</span>
          </div>

          <div
            className={`hidden md:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full shrink-0 ${
              peerStatus === "connected"
                ? "bg-green-50 text-green-700"
                : peerStatus === "connecting"
                  ? "bg-yellow-50 text-yellow-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                peerStatus === "connected"
                  ? "bg-green-500"
                  : peerStatus === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-400"
              }`}
            />
            <span className="truncate">
              {peerStatus === "connected"
                ? "Peers Connected"
                : peerStatus === "connecting"
                  ? "Connecting..."
                  : "Offline"}
            </span>
          </div>
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border shrink-0 ${
              isOnline
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            }`}
          >
            {isOnline ? <Wifi className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            <span className="sm:hidden">{isOnline ? "Online" : "Offline"}</span>
          </button>
        </div>
      </header>

      {/* Spacer to prevent content from hiding under fixed header */}
      <div className="h-16"></div>

      {/* TITLE SECTION */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 pt-6 md:pt-8 pb-2">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          Interactive Playground
        </h1>
        <p className="text-sm text-gray-500 mt-1">Test CRDT synchronization in real-time</p>
      </div>

      {/* MAIN PLAYGROUND */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 pt-2 md:pt-4 grid md:grid-cols-2 gap-6 md:gap-8 items-start overflow-x-hidden">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            isLoading={isLoading}
            onAddNote={addNote}
            onUpdateInput={updateInput}
            onCopyIdentity={copyToClipboard}
            onClearChat={clearChat}
          />
        ))}
      </main>

      {/* INFO FOOTER */}
      <div className="max-w-3xl mx-auto text-center pb-12 px-4 md:px-6 overflow-x-hidden">
        <h3 className="font-semibold text-gray-900 mb-2">How to test the Playground:</h3>
        <ul className="text-sm text-gray-500 flex flex-col gap-2 break-words">
          {INSTRUCTIONS.map((instruction, index) => (
            <li key={index} className="break-words">
              {index + 1}.{" "}
              {typeof instruction === "string" ? (
                instruction
              ) : (
                <>
                  Click the{" "}
                  <strong className={`text-${instruction.highlightColor}-600 whitespace-nowrap`}>
                    {instruction.highlight}
                  </strong>{" "}
                  {instruction.text.replace(instruction.highlight, "").trim()}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Toast Notifications */}
      <div
        className="fixed bottom-4 md:bottom-6 right-4 md:right-6 flex flex-col gap-2 pointer-events-none max-w-[calc(100%-2rem)] md:max-w-md z-50"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto break-words min-w-0 ${
              toast.type === "success"
                ? "bg-black text-white"
                : "bg-red-100 text-red-900 border border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="w-4 h-4 text-green-400 shrink-0" />
            ) : (
              <span className="text-lg shrink-0">✕</span>
            )}
            <span className="text-sm font-medium truncate">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}