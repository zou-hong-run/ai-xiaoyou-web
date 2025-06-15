import { encodeText, getWebSocketUrl } from '../redrun.js'
console.log(import.meta.env);
// 配置参数
const config = {
  hostUrl: "wss://tts-api.xfyun.cn/v2/tts", // WebSocket URL
  appid: import.meta.env.VITE_SPARK_APPID,
  apiSecret: import.meta.env.VITE_SPARK_API_SECRET,
  apiKey: import.meta.env.VITE_SPARK_API_KEY,
};
let ws;
// 发送语音合成请求

function sendRequest(text) {
  text = encodeText(text, "UTF8");
  let frame = {
    common: {
      app_id: config.appid,
    },
    business: {
      aue: "raw", // 选择音频格式
      auf: "audio/L16;rate=16000", // 选择音频编码
      // vcn: speaker.value || "x4_lingxiaolu_en", // 选择语音
      // vcn: "x4_lingxiaowan_en", // 选择语音
      // vcn: "x4_yezi", // 选择语音 持续使用
      // vcn: "x4_lingxiaoshan_profnews", // 选择语音 新闻 持续使用
      // vcn: "qianhui", // 选择语音 日语 持续使用
      vcn: "x_mengmengsad", // 
      tte: "UTF8", // 输入文本编码
      sfl: 1,
      // speed: 50
    },
    data: {
      text: text, // Base64 编码文本
      status: 2, // 语音合成结束
    },
  };
  ws.send(JSON.stringify(frame));
}

function decodeAudioData(base64Data) {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Int16Array(len / 2);

  // 处理16-bit PCM（假设是小端）
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
  }

  // 转换为Float32并归一化（-1.0 ~ 1.0）
  const float32Data = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    float32Data[i] = Math.max(-1, bytes[i] / 32768);
  }

  return float32Data;
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
    const audioData = decodeAudioData(res.data.audio); // 实现解码
    onTTSSteam(audioData, res.data.status === 2);
    if (res.data.status === 2) {
      ws.close()
    }
  };

  ws.onclose = function () {
    console.log("TTS WebSocket closed");
  };

  ws.onerror = function (error) {
    console.error("TTS WebSocket error:", error);
  };
};