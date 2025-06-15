

console.log("red润");
import * as IAT from "./utils/iat/index.js";
import * as TTS from "./utils/tts/index.js";
import * as GPT from "./utils/gpt/index.js";
import * as PIXI from "./lib/live2d/pixi.js"
// import { Live2DModel } from "./lib/live2d/pixi-live2d-display.es.js"
// console.log(PIXI, Live2DModel);
// 获取 DOM 元素
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const waveElement = document.getElementById("wave");
const statusText = document.getElementById("status-text"); // 状态显示元素
const audioContext = new window.AudioContext({ sampleRate: 16000 });
const canvas = document.querySelector('canvas')

/**
  * @type { AudioWorkletNode}
  */
let workletNode;

const startRecording = () => {
  /**
   *整个会话时长最多持续60s，或者超过10s未发送数据，服务端会主动断开连接。
    数据上传完毕，客户端需要上传一次数据结束标识表示会话已结束，详见下方data参数说明。
    #请求参数
   */
  // IAT.start(
  //   function onIATStart() {
  //     console.log("startIAT");
  //   },
  //   function onIATChange(text) {
  //     console.log(text);
  //   },
  //   function onIATEnd() {
  //     console.log("endIAT");
  //   }
  // );
  // let fullResult = ""
  // GPT.sendMsg("你今天有想我吗，我又孤单了", function onGPTChange(tempResult) {
  //   console.log(tempResult, "tempResult");
  //   fullResult += tempResult
  // }, function onGPTEnd(result) {
  //   fullResult += result
  //   console.log(fullResult, "fullResult");
  // })


  // 初始化AudioWorklet
  async function initAudio() {
    await audioContext.resume();
    await audioContext.audioWorklet.addModule('./js/utils/audio-processor.js');
    workletNode = new AudioWorkletNode(audioContext, 'stream-processor');
    workletNode.connect(audioContext.destination);
    workletNode.port.onmessage = ((event) => {
      if (event.data.type == 'ended') {
        console.log("音频播放结束");
      }
    })
  }
  TTS.startTTS(`小明：问你，有一只鲨鱼吃下了一颗绿豆，结果它变成了什么？小红：不知道。小明：答案是“绿豆沙”啊，你很笨喔！`, function onTTSSteam(stream, isEnd) {
    // const pcmData = new Float32Array(stream); // 假设是PCM数据
    const pcmData = stream; // 假设是PCM数据
    // 主线程代码（发送数据到 AudioWorklet）
    workletNode.port.postMessage({
      type: 'audio-data',  // 自定义消息类型
      chunk: pcmData       // Float32Array 格式的 PCM 数据
    }, [pcmData.buffer]);  // 使用 Transferable 避免拷贝
    if (isEnd) console.log("tts合成音频结束");
  });
  // 立即初始化
  initAudio();
}

// 停止对话函数
function stopRecording() {
  IAT.stop();
  workletNode.port.postMessage({
    type: "stop"
  })
}

// 为按钮添加事件监听器
startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);