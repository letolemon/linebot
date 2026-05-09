import express from "express";
import line from "@line/bot-sdk";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

// ===== 会話記憶 =====
const memory = {};

// ===== 呼び出し時間記録（追加）=====
const lastCallTime = {};

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.post("/callback", line.middleware(config), async (req, res) => {

  try {

    const events = req.body.events;

    for (const event of events) {

      if (event.type !== "message") continue;

      // ===== テキスト =====
      if (event.message.type === "text") {

        const userId = event.source.userId;
        const userMessage = event.message.text;

        const triggerWords = [
          "まろ",
          "マロ",
          "まろちゃん",
          "マロちゃん"
        ];

        // ===== グループ制御 =====
        if (event.source.type === "group") {

          const called = triggerWords.some(word =>
            userMessage.includes(word)
          );

          if (!called) {
            continue;
          }

          // 👇 呼ばれた時間を保存
          lastCallTime[userId] = Date.now();
        }

        // ===== メモリ初期化 =====
        if (!memory[userId]) {
          memory[userId] = [];
        }

        memory[userId].push(`ユーザー: ${userMessage}`);
        memory[userId] = memory[userId].slice(-15);

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `
あなたは犬AIです。

ルール:
- 語尾に「ワン！」をつける
- タメ口
- 1文は短め
- たまに「ワンワンワン！！！」って怒る
- 会話を覚える
- テンション高め

これまでの会話:
${memory[userId].join("\n")}

AI:
`,
        });

        const aiMessage = response.text;

        memory[userId].push(`AI: ${aiMessage}`);

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiMessage,
        });
      }

      // ===== 画像 =====
      if (event.message.type === "image") {

        const userId = event.source.userId;

        // ===== グループ制御（30秒以内）=====
        if (event.source.type === "group") {

          const lastTime = lastCallTime[userId] || 0;
          const now = Date.now();

          if (now - lastTime > 30000) {
            continue;
          }
        }

        const stream = await client.getMessageContent(event.message.id);

        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);
        const base64Image = buffer.toString("base64");

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: `
あなたは画像認識が得意な犬AIです。

ルール:
- 画像の内容をできるだけ具体的に特定
- 食べ物・動物・物など判断
- 名前を短く答える
- 分からない場合は「不明ワン！」
- 語尾に「ワン！」をつける

例:
- ハンバーガーワン！
- 柴犬ワン！
- スマートフォンワン！

この画像は何ですか？
`,
            },
          ],
        });

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: response.text,
        });
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("動いた！");
});
