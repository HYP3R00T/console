import type { FastifyInstance } from "fastify";
import type { Conversation } from "../../../web/src/lib/api.ts";

const headers = { "x-console-request": "1" };
export const historyAnswer = (index: number) =>
  `Answer ${index}\n${"History fixture text. ".repeat(24)}`;
export async function seedHistory(
  app: FastifyInstance,
  id: string,
  start: number,
  count: number,
) {
  for (let index = start; index < start + count; index++) {
    const sent = await app.inject({
      method: "POST",
      url: `/v1/sessions/${id}/messages`,
      headers,
      payload: { text: `Question ${index}`, requestId: `history-${index}` },
    });
    if (sent.statusCode !== 202) throw new Error(sent.body);
    let done = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const snapshot = (
        await app.inject(`/v1/sessions/${id}`)
      ).json<Conversation>();
      if (
        snapshot.status === "idle" &&
        snapshot.messages.at(-1)?.text === historyAnswer(index)
      ) {
        done = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!done) throw new Error(`History fixture timed out at ${index}`);
  }
}
