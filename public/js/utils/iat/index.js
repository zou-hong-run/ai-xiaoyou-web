import { getWebSocketUrl, toBase64 } from "../redrun.js";
// 配置
const config = {
  hostUrl: "wss://iat-api.xfyun.cn/v2/iat",
  appid: "7673eeaf",
  apiSecret: "OGEyZDJjZjY4YTkzNGEwZjRhYWY3MDI1",
  apiKey: "17d63998b8054d42c7d4ae46c5a27644",
  highWaterMark: 1280,
};
let language = 'zh_cn';
let accent = "mandarin";
// 帧定义
const FRAME = {
  STATUS_FIRST_FRAME: 0,
  STATUS_CONTINUE_FRAME: 1,
  STATUS_LAST_FRAME: 2,
};
// // 设置当前临时状态为初始化
// let status = FRAME.STATUS_FIRST_FRAME;


// 记录听写结果
let resultText = '';
// wpgs下的听写结果需要中间状态辅助记录
let resultTextTemp = '';
// 音频上下文
/**
 * @type {AudioContext}
 */
let audioContext = null;
/**
 * @type {ScriptProcessorNode}
 * 作用：创建一个 ​脚本处理节点​（ScriptProcessorNode），用于直接操作音频数据（例如实时编码或分析）。
 参数解释：
 **4096**：缓冲区大小（单位：采样帧）。数值越大，延迟越高，但处理压力越小（典型值为 256、1024、4096）。
 第一个 1：输入声道数（单声道）。
 第二个 1：输出声道数（单声道）。
 */
let scriptProcessor = null;
/**
 * @type {MediaStreamAudioSourceNode} ​音频源节点
 * @desc 
 * ​作用：将麦克风的 MediaStream 转换为 Web Audio API 可处理的 ​音频源节点​（MediaStreamAudioSourceNode）。
  流程：
  stream 中的音频轨道会被连接到 source 节点。
  此后可通过 source 将音频数据发送到其他处理节点（如滤波器、分析器或脚本处理器）。
 */
let mediaSource = null;
let iatContext = {
  /**
   * @type {WebSocket} 
   */
  iatWs: null,
  // 麦克风音频流
  streamRef: null,
  // 记录处理后的音频数据
  audioData: [],
  onIATStartCallback: null,
  onIATChangeCallback: null,
  onIATEndCallback: null,
  iatResult: [],
}
let timer = null;
/**
 * @type {Worker}
 */
let worker = null;
try {
  worker = new Worker('./js/utils/transcode.worker.js')
  worker.onmessage = (event) => {
    iatContext.audioData.push(...event.data)
  }
} catch (error) {
  console.log("worker:" + error);
}
// 向webSocket发送数据(音频二进制数据经过Base64处理)
const webSocketSend = () => {
  if (iatContext.iatWs.readyState !== 1) return false;
  const _audioData = iatContext.audioData.splice(0, 1280);
  const params = {
    common: {
      app_id: config.appid,
    },
    business: {
      language: language, //小语种可在控制台--语音听写（流式）--方言/语种处添加试用
      domain: 'iat',
      accent: accent, //中文方言可在控制台--语音听写（流式）--方言/语种处添加试用
      vad_eos: 3000,// 即静默多长时间后引擎认为音频结束。
      dwa: 'wpgs' //为使该功能生效，需到控制台开通动态修正功能（该功能免费）
    },
    data: {
      status: 0,
      format: 'audio/L16;rate=16000',
      encoding: 'raw',
      audio: toBase64(_audioData)
    }
  }
  iatContext.iatWs.send(JSON.stringify(params));
  timer = setInterval(() => {
    // 连接关闭
    if (iatContext.iatWs.readyState !== 1) {
      iatContext.audioData = [];
      clearInterval(timer)
      return false
    }
    // console.log(iatContext.audioData.length);
    // 音频结束
    if (iatContext.audioData.length == 0) {
      iatContext.iatWs.send(JSON.stringify({
        data: {
          status: 2,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: ''
        }
      }))
      iatContext.audioData = []
      clearInterval(timer)
      return false
    }
    // 中间帧
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
  }, 40)
}
const recorderStop = () => {
  if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
    // safari下suspend后再次resume录音内容将是空白，设置safari下不做suspend
    audioContext && audioContext.suspend();
  }
  try {
    iatContext.streamRef?.getTracks().map(track => track.stop()) || iatContext.streamRef?.getAudioTracks()[0].stop();
  } catch (error) {
    console.error('暂停失败!', error);
  }
};
// 识别结束 webSocket返回数据
const webSocketRes = (data) => {
  /**
   * 
   * sid	string	本次会话的id，只在握手成功后第一帧请求时返回
    code	int	返回码，0表示成功，其它表示异常，详情请参考错误码
    message	string	错误描述
    data	object	听写结果信息
    data.status	int	识别结果是否结束标识：
    0：识别的第一块结果
    1：识别中间结果
    2：识别最后一块结果
    data.result	object	听写识别结果
    data.result.sn	int	返回结果的序号
    data.result.ls	bool	是否是最后一片结果
    data.result.bg	int	保留字段，无需关心
    data.result.ed	int	保留字段，无需关心
    data.result.ws	array	听写结果
    data.result.ws.bg	int	起始的端点帧偏移值，单位：帧（1帧=10ms）
    注：以下两种情况下bg=0，无参考意义：
    1)返回结果为标点符号或者为空；2)本次返回结果过长。
    data.result.ws.cw	array	中文分词
    data.result.ws.cw.w	string	字词
    data.result.ws.cw.其他字段
    sc/wb/wc/we/wp	int/string	均为保留字段，无需关心。如果解析sc字段，建议float与int数据类型都做兼容
   */
  let res = JSON.parse(data)
  console.log(res);
  // 返回码，0表示成功，其它表示异常
  if (res.code != 0) {
    console.log(`error code ${res.code}, reason ${res.message}`)
    iatContext.iatWs.close();
    return
  }
  let str = ""
  if (res.data.status == 2) {
    iatContext.iatWs.close();
  }
  // data.result.sn	int	返回结果的序号
  iatContext.iatResult[res.data.result.sn] = res.data.result;
  /**
   *  开启wpgs会有此字段
      取值为 "apd"时表示该片结果是追加到前面的最终结果；
      取值为"rpl" 时表示替换前面的部分结果，替换范围为rg字段
   */
  if (res.data.result.pgs == 'rpl') {
    /**
     * data.result.rg
     * 替换范围，开启wpgs会有此字段
      假设值为[2,5]，则代表要替换的是第2次到第5次返回的结果
     */
    res.data.result.rg.forEach(i => {
      iatContext.iatResult[i] = null
    })
  }
  iatContext.iatResult.forEach(i => {
    if (i != null) {
      // data.result.ws 听写结果
      i.ws.forEach(j => {
        // data.result.ws.cw	array	中文分词
        j.cw.forEach(k => {
          // data.result.ws.cw.w	string	字词
          str += k.w
        })
      })
    }
  })
  iatContext.onIATChangeCallback(str)
}
const connectWebSocket = () => {
  let url = getWebSocketUrl(config.hostUrl, config.apiKey, config.apiSecret);
  iatContext.iatWs = new WebSocket(url);
  iatContext.iatWs.onopen = (e) => {
    iatContext.onIATStartCallback()
    setTimeout(() => {
      webSocketSend()
    }, 500)
  }
  iatContext.iatWs.onmessage = e => {
    webSocketRes(e.data)
  }
  iatContext.iatWs.onerror = e => {
    recorderStop();
  };
  iatContext.iatWs.onclose = e => {
    iatContext.onIATEndCallback()
    iatContext.iatResult = []
    recorderStop();
  };
}
// 获取浏览器录音权限成功时回调
const getMediaSuccess = () => {
  // 创建一个用于通过JavaScript直接处理音频
  scriptProcessor = audioContext.createScriptProcessor(0, 1, 1);
  scriptProcessor.onaudioprocess = e => {
    /**
     * 工作原理：
      每当音频流填充完指定大小的缓冲区时，触发 onaudioprocess 事件。
      在事件回调中，可通过 e.inputBuffer 获取输入的 PCM 数据，处理后通过 e.outputBuffer 输出。
     */
    // 多线程音频数据处理
    try {
      worker.postMessage(e.inputBuffer.getChannelData(0));
    } catch (error) { }
  }
  // 创建一个新的MediaStreamAudioSourceNode 对象，使来自MediaStream的音频可以被播放和操作
  mediaSource = audioContext.createMediaStreamSource(iatContext.streamRef);
  mediaSource.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  connectWebSocket();
};
// 获取浏览器录音权限失败时回调
const getMediaFail = (e) => {
  alert('对不起：录音权限获取失败!');
  audioContext && audioContext.close();
  audioContext = undefined;
  // 关闭websocket
  if (iatContext.iatWs && iatContext.iatWs.readyState === 1) {
    iatContext.iatWs.close();
  }
};
// 初始化麦克风
const recorderInit = () => {
  try {
    audioContext = new window.AudioContext();
    // 恢复之前暂停播放的音频
    audioContext.resume();
    if (!audioContext) {
      alert("浏览器不支持webAudioApi相关接口")
      return false
    }
  } catch (error) {
    if (!audioContext) {
      alert("浏览器不支持webAudioApi相关接口")
      return false
    }
  }
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  // 获取浏览器录音权限
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      audio: true
    }).then(stream => {
      iatContext.streamRef = stream;
      getMediaSuccess();
    }).catch(e => {
      getMediaFail(e);
    })
  } else if (navigator.getUserMedia) {
    navigator.getUserMedia({
      audio: true
    }, (stream) => {
      iatContext.streamRef = stream;
      getMediaSuccess();
    }, function (e) {
      getMediaFail(e);
    })
  } else {
    if (navigator.userAgent.toLowerCase().match(/chrome/) && location.origin.indexOf('https://') < 0) {
      console.error('获取浏览器录音功能，因安全性问题，需要在localhost 或 127.0.0.1 或 https 下才能获取权限！');
    } else {
      alert('对不起：未识别到录音设备!');
    } onIATStartCallback
    audioContext && audioContext.close();
    return false;
  };
}
const recorderStart = () => {
  if (!audioContext) {
    recorderInit()
  } else {
    audioContext.resume();
    connectWebSocket()
  }
}
export const start = (onIATStartCallback, onIATChangeCallback, onIATEndCallback) => {
  iatContext.onIATStartCallback = onIATStartCallback;
  iatContext.onIATChangeCallback = onIATChangeCallback;
  iatContext.onIATEndCallback = onIATEndCallback
  recorderStart()
}
export const stop = () => {
  recorderStop()
}