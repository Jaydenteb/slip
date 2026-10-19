"use server";

import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { chatWithParent, toTurns, type ChatTurn } from "@/lib/agent/parent";
import { allow } from "@/lib/agent/rate-limit";
import { db } from "@/lib/db";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

const MAX_MESSAGE = 1000;
const MAX_TURNS = 30;

// Every action resolves the family from the link token itself, so a family can only
// ever reach its own data.
async function familyFor(token: string) {
  return db.family.findUnique({ where: { linkToken: token }, select: { id: true } });
}

export async function sendMessageAction(
  token: string,
  text: string,
): Promise<{ ok: true; turns: ChatTurn[] } | { ok: false; error: string }> {
  const family = await familyFor(token);
  if (!family) return { ok: false, error: "This link isn't valid any more." };
  const message = text.trim();
  if (!message) return { ok: false, error: "Type a question first." };
  if (message.length > MAX_MESSAGE) return { ok: false, error: "That's a long message. Keep it under 1,000 characters." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`family:${family.id}`, 12, 10 * 60_000) || !allow(`ip:${ip}`, 30, 60 * 60_000) || !allow("global", 400, 60 * 60_000)) {
    return { ok: false, error: "Slip needs a breather. Try again in a few minutes." };
  }

  const thread = await db.chatThread.findFirst({ where: { familyId: family.id }, orderBy: { updatedAt: "desc" } });
  const history = (thread?.messages as unknown as MessageParam[] | undefined) ?? [];
  if (toTurns(history).filter((t) => t.from === "parent").length >= MAX_TURNS) {
    return { ok: false, error: "This chat is getting long. Start a new one to keep going." };
  }

  let messages: MessageParam[];
  try {
    messages = await chatWithParent(family.id, history, message);
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Slip couldn't answer just now. Try again in a moment." };
  }

  const json = messages as unknown as Prisma.InputJsonValue;
  if (thread) await db.chatThread.update({ where: { id: thread.id }, data: { messages: json } });
  else await db.chatThread.create({ data: { familyId: family.id, messages: json } });

  revalidatePath("/office/approvals");
  return { ok: true, turns: toTurns(messages) };
}

export async function newChatAction(token: string) {
  const family = await familyFor(token);
  if (!family) return;
  // Old threads are kept for the record; the newest one is the live chat.
  await db.chatThread.create({ data: { familyId: family.id, messages: [] } });
}

export async function setConsentAction(token: string, eventId: string, studentId: string, given: boolean) {
  const family = await familyFor(token);
  if (!family) return { ok: false as const };
  const updated = await db.enrolment.updateMany({
    where: { eventId, studentId, student: { familyId: family.id } },
    data: { consentGiven: given },
  });
  revalidatePath(`/family/${token}`);
  return { ok: updated.count === 1 };
}
