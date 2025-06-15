// document.onkeydown = function (e) {
//   if (e.keyCode == 123) {
//     alert("F12审查元素已被禁用！");
//     return false;
//   }
//   if (e.ctrlKey && e.shiftKey && e.keyCode == "I".charCodeAt(0)) {
//     alert("F12审查元素已被禁用！");
//     return false;
//   }
//   if (e.ctrlKey && e.shiftKey && e.keyCode == "C".charCodeAt(0)) {
//     alert("F12审查元素已被禁用！");
//     return false;
//   }
//   if (e.ctrlKey && e.shiftKey && e.keyCode == "J".charCodeAt(0)) {
//     alert("F12审查元素已被禁用！");
//     return false;
//   }
//   if (e.ctrlKey && e.keyCode == "U".charCodeAt(0)) {
//     alert("查看源代码已被禁用！");
//     return false;
//   }
// };
// document.addEventListener("contextmenu", function (event) {
//   event.preventDefault();
// });
// setInterval(function () {
//   if (
//     window.outerWidth - window.innerWidth > 160 ||
//     window.outerHeight - window.innerHeight > 160
//   ) {
//     alert("请不要打开开发者工具！");
//     window.location.href = "about:blank";
//   }
//   var startTime = performance.now();
//   // 设置断点
//   debugger;
//   var endTime = performance.now();
//   // 设置一个阈值，例如100毫秒
//   if (endTime - startTime > 100) {
//     window.location.href = "about:blank";
//   }
// }, 100);

console.log("red润");
import * as IAT from "./utils/iat/index.js";
import * as TTS from "./utils/tts/index.js";
import * as GPT from "./utils/gpt/index.js";

// 获取 DOM 元素
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const waveElement = document.getElementById("wave");
const statusText = document.getElementById("status-text"); // 状态显示元素
let audioContext = new window.AudioContext();;
// 对话状态变量
let isRecording = false;
let timer = null;
// 存储待处理的消息
let audioStream = [];
// 播放音频流，确保连续播放
function playAudioStream() {
  const buffer = audioStream.shift(); // 从音频流中获取一个音频片段
  const arrayBuffer = buffer.buffer; // 获取 ArrayBuffer
  audioContext.decodeAudioData(
    arrayBuffer,
    (decodedData) => {
      audioContext.resume();
      const source = audioContext.createBufferSource();
      source.buffer = decodedData;
      source.connect(audioContext.destination);
      source.start(); // 播放当前音频片段
      // 当前音频片段播放完毕后，自动播放下一个片段
      source.onended = function () {
        playAudioStream(); // 播放下一个音频片段
      };
    },
    (error) => {
      console.error("Audio decoding error:", error);
    }
  );
}
let isFirstStartTTS = false;
let isFirstPlayAudio = false;
// 开始对话函数
const startRecording = () => {
  audioStream = [];
  isRecording = true;
  isFirstStartTTS = false;
  isFirstPlayAudio = false;
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
  TTS.startTTS(`小明：问你，有一只鲨鱼吃下了一颗绿豆，结果它变成了什么？小红：不知道。小明：答案是“绿豆沙”啊，你很笨喔！`, function onTTSSteam(stream, isTTSEnd) {
    audioStream.push(stream);
    if (!isFirstPlayAudio) {
      isFirstPlayAudio = true;
      playAudioStream();
    }
    if (isTTSEnd) {
      console.log("isTTSEND");
      // startTTS();
    }
  });

  // 显示对话波纹动画
  waveElement.style.display = "block";

  // 禁用开始对话按钮并启用停止对话按钮
  startBtn.disabled = true;
  // stopBtn.disabled = false;
  // 更改按钮文本
  startBtn.textContent = "对话中...";
  // stopBtn.textContent = "停止对话";
}

// 停止对话函数
function stopRecording() {
  isRecording = false;
  IAT.stop();
  // 隐藏对话波纹动画
  // waveElement.style.display = "none";
  // 启用开始对话按钮并禁用停止对话按钮
  // stopBtn.disabled = true;
  // 更改按钮文本
  // startBtn.textContent = "开始对话";
  // stopBtn.textContent = "停止对话";
  // 更新状态为对话结束
  // updateStatus("对话结束，等待下一次开始...");
}

// 为按钮添加事件监听器
startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);