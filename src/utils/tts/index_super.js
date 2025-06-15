import { encodeText, getWebSocketUrl } from '../redrun.js'
// 0 小右 1 小露 2小飞
let user_type = 1
const setUserType = (_type) => {
  user_type = _type
}
const getUserType = () => {
  return user_type
}
// 配置参数
const config = {
  hostUrl: "wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6", // WebSocket URL
  host: "cbm01.cn-huabei-1.xf-yun.com",
  appid: import.meta.env.VITE_SPARK_APPID,
  apiSecret: import.meta.env.VITE_SPARK_API_SECRET,
  apiKey: import.meta.env.VITE_SPARK_API_KEY,
  uri: "/v1/private/mcd9m97e6"
};

let ws;

function getVcn() {
  const userType = getUserType();
  switch (userType) {
    case 0: return "x4_lingyouyou_oral";
    case 1: return "x4_lingxiaoxuan_oral";
    case 2: return "x4_lingfeiyi_oral";
    default: return "x4_lingyouyou_oral";
  }
}

// 发送语音合成请求
function sendRequest(text) {
  text = encodeText(text, "UTF8");
  const vcn = getVcn();

  let frame = {
    header: {
      app_id: config.appid,
      status: 2
    },
    parameter: {
      tts: {
        vcn: vcn,
        volume: 10,
        rhy: 0,
        speed: 50,
        pitch: 50,
        bgs: 0,
        reg: 0,
        rdn: 0,
        audio: {
          encoding: "raw",
          sample_rate: 16000,
          channels: 1,
          bit_depth: 8,
          frame_size: 0,
        },
      }
    },
    payload: {
      text: {
        encoding: "utf8",
        compress: "raw",
        format: "plain",
        status: 2,
        seq: 0,
        text: text,
      }
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
  const date = new Date().toUTCString();
  const authStr = getAuthStr(date);
  const url = `${config.hostUrl}?authorization=${authStr}&date=${date}&host=${config.host}`;

  ws = new WebSocket(url);

  ws.onopen = function () {
    console.log("TTS WebSocket connected");
    sendRequest(text);
  };

  ws.onmessage = function (event) {
    let res = JSON.parse(event.data);
    if (res.header.code !== 0) {
      console.error(`Error: ${res.header.code}: ${res.header.message}`);
      ws.close();
      return;
    }

    if (res.payload && res.payload.audio) {
      const audioData = decodeAudioData(res.payload.audio.audio);
      onTTSSteam(audioData, res.payload.audio.status === 2);

      if (res.payload.audio.status === 2) {
        ws.close();
      }
    }
  };

  ws.onclose = function () {
    console.log("TTS WebSocket closed");
  };

  ws.onerror = function (error) {
    console.error("TTS WebSocket error:", error);
  };
};

// 鉴权签名
function getAuthStr(date) {
  const signatureOrigin = `host: ${config.host}\ndate: ${date}\nGET ${config.uri} HTTP/1.1`;
  const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, config.apiSecret);
  const signature = CryptoJS.enc.Base64.stringify(signatureSha);
  const authorizationOrigin = `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(authorizationOrigin));
}
