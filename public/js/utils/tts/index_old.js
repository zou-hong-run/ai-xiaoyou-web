import { encodeText, getWebSocketUrl } from '../redrun.js'

// 配置参数
const config = {
  hostUrl: "wss://tts-api.xfyun.cn/v2/tts", // WebSocket URL
  appid: "7673eeaf",
  apiSecret: "OGEyZDJjZjY4YTkzNGEwZjRhYWY3MDI1",
  apiKey: "17d63998b8054d42c7d4ae46c5a27644",
};
let ws;
// 发送语音合成请求

const speaker = document.getElementById("speaker");
function sendRequest(text) {
  text = encodeText(text, "UTF8");
  let frame = {
    common: {
      app_id: config.appid,
    },
    business: {
      aue: "lame", // 选择音频格式
      auf: "audio/L16;rate=16000", // 选择音频编码
      // vcn: speaker.value || "x4_lingxiaolu_en", // 选择语音
      vcn: "x4_lingxiaowan_en", // 选择语音
      tte: "UTF8", // 输入文本编码
      sfl: 1
    },
    data: {
      text: text, // Base64 编码文本
      status: 2, // 语音合成结束
    },
  };
  ws.send(JSON.stringify(frame));
}

export const startTTS = (text, onTTSSteam) => {
  let url = getWebSocketUrl(config.hostUrl, config.apiKey, config.apiSecret);
  ws = new WebSocket(url);
  ws.onopen = function () {
    console.log("TTS WebSocket connected");
    sendRequest(text);
  };
  // WebSocket 接收到消息时
  ws.onmessage = function (event) {
    let res = JSON.parse(event.data);
    if (res.code !== 0) {
      console.error(`Error: ${res.code}: ${res.message}`);
      ws.close();
      return;
    }
    if (res.data.status !== 2) {
      let binaryString = atob(res.data.audio); // 解码为二进制字符串
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i); // 转换为字节数组
      }
      onTTSSteam(bytes, false)
    } else {
      // 最后的音频片段接收完后关闭 WebSocket
      let binaryString = atob(res.data.audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      ws.close(); // 关闭 WebSocket 连接
      onTTSSteam(bytes, true)
    }
  };

  ws.onclose = function () {
    console.log("TTS WebSocket closed");
  };

  ws.onerror = function (error) {
    console.error("TTS WebSocket error:", error);
  };
};