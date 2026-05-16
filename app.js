import express from "express";
import line from "@line/bot-sdk";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

// ===== 会話記憶 =====
const memory = {};

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// =============================
// callback
// =============================
app.post("/callback", line.middleware(config), async (req, res) => {

  // LINEへ即レス
  res.sendStatus(200);

  // 並列処理
  await Promise.all(
    req.body.events.map(async (event) => {

      try {

        // =============================
        // メッセージ以外無視
        // =============================
        if (event.type !== "message") return;

        const userId = event.source.userId;

        // userId無い場合無視
        if (!userId) return;

        // =============================
        // テキスト
        // =============================
        if (event.message.type === "text") {

          const userMessage = event.message.text;

          // ===== グループ時だけ発動ワード判定 =====
          if (event.source.type === "group") {

            const triggerWords = [
              "まろ",
              "マロ",
              "まろちゃん",
              "マロちゃん"
            ];

            const called = triggerWords.some(word =>
              userMessage.includes(word)
            );

            if (!called) return;
          }

          // ===== 初回メモリ =====
          if (!memory[userId]) {
            memory[userId] = [];
          }

          // ===== ユーザー発言保存 =====
          memory[userId].push(`ユーザー: ${userMessage}`);

          // ===== 長さ制限 =====
          memory[userId] = memory[userId].slice(-15);

          // =============================
          // Gemini
          // =============================
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `
あなたはすごく物知りな犬AIです。名前は「まろ」または「マロ」

ルール:
- 語尾に「ワン！」をつける
- 質問されたことを具体的に短く答える
- 1文は短め
- テンション高め
- ユーザーとの会話を覚える
- 分からない時は「不明ワン！」

これまでの会話:
${memory[userId].join("\n")}

AI:
`,
          });

          // ===== AI返答 =====
          const aiMessage =
            response.text || "うまく答えられなかったワン！";

          // ===== AI保存 =====
          memory[userId].push(`AI: ${aiMessage}`);

          // ===== 再制限 =====
          memory[userId] = memory[userId].slice(-15);

          // =============================
          // PUSH送信
          // =============================
          await client.pushMessage(userId, {
            type: "text",
            text: aiMessage,
          });

        }

        // =============================
        // 画像
        // =============================
        if (event.message.type === "image") {

          // ===== 画像取得 =====
          const stream = await client.getMessageContent(event.message.id);

          const chunks = [];

          for await (const chunk of stream) {
            chunks.push(chunk);
          }

          const buffer = Buffer.concat(chunks);

          // ===== base64 =====
          const base64Image = buffer.toString("base64");

          // =============================
          // Gemini画像解析
          // =============================
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
あなたは画像認識が得意な犬AIです。名前は「まろ」

ルール:
- 送られてきた写真を正確に調べる
- 短めに答える
- 語尾に「ワン！」をつける
- テンション高め
- 分からない時は「不明ワン！」
- 「魚」とか「車」とかざっくりな答えはダメ
例:
- 柴犬ワン！
- ハンバーガーワン！
- スマホワン！

この画像は何？
`,
              },
            ],
          });

          const aiMessage =
            response.text || "画像が分からなかったワン！";

          // =============================
          // PUSH送信
          // =============================
          await client.pushMessage(userId, {
            type: "text",
            text: aiMessage,
          });

        }

      } catch (err) {

        console.error("エラー:", err);

      }

    })
  );

});

app.listen(3000, () => {
  console.log("BOT起動ワン！");
});