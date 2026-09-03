"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Button, Loading } from "@/components/ui";
import { ReportDialog } from "@/components/report-dialog";
import type { Message } from "@/lib/types";

export default function ThreadPage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <RequireAuth roles={["client", "companion", "agent"]}>
      <Thread conversationId={id} />
    </RequireAuth>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // The other participant, derived from a message they sent.
  const counterpartId = messages?.find((m) => m.sender_id !== user?.id)?.sender_id;

  async function load() {
    try {
      const msgs = await api.conversationMessages(conversationId);
      setMessages(msgs);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load messages.");
    }
  }

  // initial load + light polling for new messages
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api.sendMessage(conversationId, text);
      setMessages((cur) => [...(cur ?? []), msg]);
      setBody("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col py-6" style={{ minHeight: "70vh" }}>
      <Link href="/messages" className="text-sm text-muted hover:text-ink">
        ← All messages
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Conversation</h1>
        {counterpartId && (
          <ReportDialog reportedUserId={counterpartId} relatedBookingId={undefined} />
        )}
      </div>

      <div className="mt-4 flex-1">
        {messages === null && <Loading />}
        {messages && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            No messages yet — say hello. Please keep it respectful; messages may be reviewed.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {messages?.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "rounded-br-sm bg-accent text-white"
                      : "rounded-bl-sm bg-surface-2 text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-faint"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <form onSubmit={send} className="mt-4 flex items-end gap-2 border-t border-hair pt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Write a message…"
          className="min-h-11 flex-1 resize-y rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <Button type="submit" loading={sending} disabled={!body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
