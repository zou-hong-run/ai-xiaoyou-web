import { getWebSocketUrl, toBase64 } from "../redrun.js";

// Configuration
const config = {
  hostUrl: "wss://iat-api.xfyun.cn/v2/iat",
  appid: import.meta.env.VITE_SPARK_APPID,
  apiSecret: import.meta.env.VITE_SPARK_API_SECRET,
  apiKey: import.meta.env.VITE_SPARK_API_KEY,
  highWaterMark: 1280,
};

let language = 'zh_cn';
let accent = "mandarin";

const FRAME = {
  STATUS_FIRST_FRAME: 0,
  STATUS_CONTINUE_FRAME: 1,
  STATUS_LAST_FRAME: 2,
};

let resultText = '';
let resultTextTemp = '';

let audioContext = null;
let audioWorkletNode = null;
let mediaSource = null;

let iatContext = {
  iatWs: null,
  streamRef: null,
  audioData: [],
  onIATStartCallback: null,
  onIATChangeCallback: null,
  onIATEndCallback: null,
  iatResult: [],
};

let timer = null;

// Audio worklet processor code as a string (will be registered)
const workletProcessorCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => {
      // Handle messages from the main thread if needed
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      // Send audio data to main thread
      this.port.postMessage(input[0].buffer);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

// Register the worklet processor
async function registerWorkletProcessor() {
  try {
    const blob = new Blob([workletProcessorCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to register worklet processor:', error);
  }
}

const webSocketSend = () => {
  if (iatContext.iatWs.readyState !== 1) return false;

  const _audioData = iatContext.audioData.splice(0, 1280);
  const params = {
    common: {
      app_id: config.appid,
    },
    business: {
      language: language,
      domain: 'iat',
      accent: accent,
      vad_eos: 3000,
      dwa: 'wpgs'
    },
    data: {
      status: 0,
      format: 'audio/L16;rate=16000',
      encoding: 'raw',
      audio: toBase64(_audioData)
    }
  };

  iatContext.iatWs.send(JSON.stringify(params));

  timer = setInterval(() => {
    if (iatContext.iatWs.readyState !== 1) {
      iatContext.audioData = [];
      clearInterval(timer);
      return false;
    }

    if (iatContext.audioData.length === 0) {
      iatContext.iatWs.send(JSON.stringify({
        data: {
          status: 2,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: ''
        }
      }));
      iatContext.audioData = [];
      clearInterval(timer);
      return false;
    }

    iatContext.iatWs.send(
      JSON.stringify({
        data: {
          status: 1,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: toBase64(iatContext.audioData.splice(0, 1280))
        }
      })
    );
  }, 40);
};


const webSocketRes = (data) => {
  let res = JSON.parse(data);

  if (res.code != 0) {
    console.log(`error code ${res.code}, reason ${res.message}`);
    iatContext.iatWs.close();
    return;
  }

  let str = "";
  if (res.data.status == 2) {
    iatContext.iatWs.close();
  }

  iatContext.iatResult[res.data.result.sn] = res.data.result;

  if (res.data.result.pgs == 'rpl') {
    res.data.result.rg.forEach(i => {
      iatContext.iatResult[i] = null;
    });
  }

  iatContext.iatResult.forEach(i => {
    if (i != null) {
      i.ws.forEach(j => {
        j.cw.forEach(k => {
          str += k.w;
        });
      });
    }
  });

  iatContext.onIATChangeCallback(str);
};

const connectWebSocket = () => {
  let url = getWebSocketUrl(config.hostUrl, config.apiKey, config.apiSecret);
  iatContext.iatWs = new WebSocket(url);

  iatContext.iatWs.onopen = (e) => {
    iatContext.onIATStartCallback();
    setTimeout(() => {
      webSocketSend();
    }, 500);
  };

  iatContext.iatWs.onmessage = e => {
    webSocketRes(e.data);
  };

  iatContext.iatWs.onerror = e => {
    console.log(e, "iat error");
  };

  iatContext.iatWs.onclose = e => {
    iatContext.onIATEndCallback();
    iatContext.iatResult = [];
    iatContext.iatWs.close();
  };
};

const getMediaSuccess = async () => {
  try {
    await registerWorkletProcessor();

    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioWorkletNode.port.onmessage = (event) => {
      // Process audio data from worklet
      const audioData = new Float32Array(event.data);
      // Convert and add to audioData buffer
      const processed = transAudioData(audioData);
      iatContext.audioData.push(...processed);
    };

    mediaSource = audioContext.createMediaStreamSource(iatContext.streamRef);
    mediaSource.connect(audioWorkletNode);
    audioWorkletNode.connect(audioContext.destination);

    connectWebSocket();
  } catch (error) {
    console.error('Error setting up audio worklet:', error);
    getMediaFail(error);
  }
};

const getMediaFail = (e) => {
  alert('Sorry: Failed to get recording permission!');
  audioContext && audioContext.close();
  audioContext = undefined;

  if (iatContext.iatWs && iatContext.iatWs.readyState === 1) {
    iatContext.iatWs.close();
  }
};

const transAudioData = (audioData) => {
  // Convert 44.1kHz to 16kHz
  const fitCount = Math.round(audioData.length * (16000 / 44100));
  const newData = new Float32Array(fitCount);
  const springFactor = (audioData.length - 1) / (fitCount - 1);

  newData[0] = audioData[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp);
    const after = Math.ceil(tmp);
    const atPoint = tmp - before;
    newData[i] = audioData[before] + (audioData[after] - audioData[before]) * atPoint;
  }
  newData[fitCount - 1] = audioData[audioData.length - 1];

  // Convert to 16-bit PCM
  const dataLength = newData.length * 2;
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);

  for (let i = 0, offset = 0; i < newData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, newData[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return Array.from(new Uint8Array(dataView.buffer));
};

const recorderInit = async () => {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    if (!audioContext) {
      alert("Browser doesn't support Web Audio API");
      return false;
    }
  } catch (error) {
    alert("Browser doesn't support Web Audio API");
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    iatContext.streamRef = stream;
    await getMediaSuccess();
  } catch (e) {
    if (navigator.userAgent.toLowerCase().match(/chrome/) && location.origin.indexOf('https://') < 0) {
      console.error('Recording requires HTTPS or localhost');
    } else {
      alert('Sorry: No recording device found!');
    }
    audioContext && audioContext.close();
    return false;
  }
};

const recorderStart = async () => {
  if (!audioContext) {
    await recorderInit();
  } else {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    connectWebSocket();
  }
};

export const start = (onIATStartCallback, onIATChangeCallback, onIATEndCallback) => {
  iatContext.audioData = [];
  iatContext.iatResult = [];

  if (iatContext.iatWs && iatContext.iatWs.readyState === WebSocket.OPEN) {
    iatContext.iatWs.close();
  }

  iatContext.onIATStartCallback = onIATStartCallback;
  iatContext.onIATChangeCallback = onIATChangeCallback;
  iatContext.onIATEndCallback = onIATEndCallback;

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      recorderStart();
    });
  } else {
    recorderStart();
  }
};
// const recorderStop = () => {
//   if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
//     audioContext && audioContext.suspend();
//   }

//   if (iatContext.streamRef) {
//     iatContext.streamRef.getTracks().forEach(track => track.stop());
//     iatContext.streamRef = null;
//   }

//   if (mediaSource && audioWorkletNode) {
//     mediaSource.disconnect();
//     audioWorkletNode.disconnect();
//   }
// };
const recorderStop = () => {
  // 更可靠的 Safari 检测
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // 安全暂停音频上下文
  if (!isSafari && audioContext && audioContext.state !== 'closed') {
    audioContext.suspend().catch(e => console.warn('Suspend failed:', e));
  }

  // 停止媒体流
  if (iatContext.streamRef) {
    iatContext.streamRef.getTracks().forEach(track => track.stop());
    iatContext.streamRef = null;
  }

  // 彻底清理音频节点
  if (mediaSource || audioWorkletNode) {
    mediaSource?.disconnect();
    audioWorkletNode?.disconnect();
    mediaSource = null;
    audioWorkletNode = null;
  }
};

export const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  recorderStop();
  if (iatContext.iatWs && iatContext.iatWs.readyState === WebSocket.OPEN) {
    iatContext.iatWs.close();
  }
};