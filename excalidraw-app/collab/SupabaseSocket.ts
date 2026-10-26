import { getSupabaseClient } from "../data/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Callback = (...args: any[]) => void;

/**
 * SupabaseSocket mimics the subset of socket.io Socket used by Portal/Collab,
 * but connects directly via Supabase Realtime Broadcast & Presence!
 * This guarantees real-time live cursors, laser pointers, shape moving, and user roster
 * with ZERO external websocket server dependencies.
 */
export class SupabaseSocket {
  id: string;
  private channel: RealtimeChannel;
  private listeners: Map<string, Set<Callback>> = new Map();
  private isConnected = false;
  private roomId: string;

  constructor(roomId: string) {
    this.roomId = roomId;
    // Generate a unique client socket id
    this.id = `user_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

    const supabase = getSupabaseClient();
    this.channel = supabase.channel(`zippy_room:${roomId}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: this.id },
      },
    });

    // Listen for broadcast messages from peers
    this.channel.on("broadcast", { event: "server-broadcast" }, ({ payload }) => {
      this.handleIncoming(payload);
    });

    this.channel.on("broadcast", { event: "server-volatile-broadcast" }, ({ payload }) => {
      this.handleIncoming(payload);
    });

    // Listen for peer join/leaves via presence
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState();
      const clientIds = Object.keys(state);
      this.emitInternal("room-user-change", clientIds);
    });

    this.channel.on("presence", { event: "join" }, ({ key }) => {
      if (key !== this.id) {
        this.emitInternal("new-user", key);
      }
    });

    // Kick event
    this.channel.on("broadcast", { event: "kick-user" }, ({ payload }) => {
      if (payload && payload.targetSocketId === this.id) {
        this.emitInternal("kicked", payload);
      }
    });

    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        this.isConnected = true;
        this.emitInternal("connect");
        this.emitInternal("init-room");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.emitInternal("connect_error", new Error(`Realtime status: ${status}`));
      }
    });
  }

  private handleIncoming(payload: any) {
    if (!payload || !payload.data) return;
    try {
      // payload.data is a base64 encoded JSON representation of encryptedBuffer + iv
      const binaryString = atob(payload.data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = new Uint8Array(payload.iv);
      this.emitInternal("client-broadcast", bytes.buffer, iv);
    } catch (err) {
      console.error("Error decoding broadcast payload:", err);
    }
  }

  emit(event: string, ...args: any[]) {
    if (event === "join-room") {
      const username = localStorage.getItem("excalidraw-username") || "Zippy Collaborator";
      this.channel.track({
        socketId: this.id,
        username,
        joinedAt: new Date().toISOString(),
      }).catch(console.error);

      // Check if we are the first in the room
      setTimeout(() => {
        const state = this.channel.presenceState();
        if (Object.keys(state).length <= 1) {
          this.emitInternal("first-in-room");
        }
      }, 300);
      return;
    }

    if (event === "server-broadcast" || event === "server-volatile-broadcast") {
      const [, encryptedBuffer, iv] = args;
      // Convert encryptedBuffer to base64 string
      const bytes = new Uint8Array(encryptedBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const data = btoa(binary);

      this.channel.send({
        type: "broadcast",
        event,
        payload: {
          data,
          iv: Array.from(iv instanceof Uint8Array ? iv : new Uint8Array(iv)),
          senderId: this.id,
        },
      }).catch(console.error);
      return;
    }

    if (event === "kick-peer") {
      const [targetSocketId] = args;
      this.channel.send({
        type: "broadcast",
        event: "kick-user",
        payload: { targetSocketId },
      }).catch(console.error);
    }
  }

  on(event: string, callback: Callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  once(event: string, callback: Callback) {
    const onceWrapper: Callback = (...args: any[]) => {
      this.off(event, onceWrapper);
      callback(...args);
    };
    this.on(event, onceWrapper);
    return this;
  }

  off(event: string, callback?: Callback) {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback);
    }
    return this;
  }

  private emitInternal(event: string, ...args: any[]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(...args);
        } catch (e) {
          console.error(`Error in listener for ${event}:`, e);
        }
      });
    }
  }

  close() {
    this.isConnected = false;
    this.channel.untrack().catch(() => {});
    const supabase = getSupabaseClient();
    supabase.removeChannel(this.channel).catch(() => {});
    this.listeners.clear();
  }
}
