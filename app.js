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

app.post("/callback", line.middleware(config), async (req, res) => {

  try {

    const events = req.body.events;

    for (const event of events) {

      // メッセージ以外は無視
      if (event.type !== "message") continue;

      // ===== テキスト =====
      if (event.message.type === "text") {

        const userId = event.source.userId;
        const userMessage = event.message.text;

        // ===== グループでは特定ワード時だけ反応 =====
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

          // 呼ばれてなければ無視
          if (!called) {
            continue;
          }
        }

        // ===== 初回ならメモリ作成 =====
        if (!memory[userId]) {
          memory[userId] = [];
        }

        // ===== ユーザー発言保存 =====
        memory[userId].push(`ユーザー: ${userMessage}`);

        // ===== 長すぎ防止 =====
        memory[userId] = memory[userId].slice(-15);

        // ===== Geminiへ送信 =====
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `
あなたはすごく物知りな犬AIです。、名前は「まろ」または「マロ」

ルール:
- 語尾に「ワン！」をつける
- 質問されたことをできるだけ具体的に詳しくかつ短く伝える
- 食べ物・動物・物なども考える
- 分からない場合は「不明ワン！」と答える
- タメ口
- 1文は短め
- ユーザーとの会話を覚えている
- テンション高め

これまでの会話:
${memory[userId].join("\n")}

AI:
`,
        });

        const aiMessage = response.text;

        // ===== AI返答保存 =====
        memory[userId].push(`AI: ${aiMessage}`);

        // ===== LINE返信 =====
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiMessage,
        });
      }

      // ===== 画像 =====
      if (event.message.type === "image") {


        // LINEから画像取得
        const stream = await client.getMessageContent(event.message.id);

        const chunks = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        // base64変換
        const base64Image = buffer.toString("base64");

        // Geminiへ画像送信
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
あなたは画像認識が得意な犬AIです。名前は「まろ」または「マロ」

ルール:
- 画像に写っているものをできるだけ具体的に特定する
- 食べ物・動物・物・キャラクターなどカテゴリも考える、特にキャラクターはより詳しく
- 名前を短く答える（1〜2文）
- 分からない場合は「不明ワン！」と答える
- 語尾に「ワン！」をつける
- テンション高め

例:
- 「ハンバーガーワン！」
- 「柴犬ワン！」
- 「スマートフォンワン！」

この画像に写っているものは何ですか？
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
