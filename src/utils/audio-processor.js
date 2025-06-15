class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferQueue = [];
    this.currentPos = 0;
    this.isPlaying = false;
    this.sentEndEvent = false;
    this.silenceCounter = 0;
    this.sampleRate = 16000; // 默认值
    this.sampleRateUpdated = false;
    this.silenceThreshold = 0;
    this.lastDataTime = 0; // 记录最后收到数据的时间

    // VAD相关参数
    this.vadThreshold = 0.09; // 语音检测阈值，可能需要根据实际情况调整
    this.speechCounter = 0;
    this.speechThreshold = 1024; // 连续检测到语音的样本数阈值
    this.lastInputLevel = 0;
    this.inputHistory = new Array(5).fill(0); // 用于平滑输入电平

    this.port.onmessage = (event) => {
      if (event.data.type === 'audio-data') {
        this.bufferQueue.push(event.data.chunk);
        this.isPlaying = true;
        this.sentEndEvent = false;
        this.silenceCounter = 0;
        this.lastDataTime = Date.now(); // 更新最后数据时间
      } else if (event.data.type === 'stop') {
        console.log("audio stop------------");
        this.bufferQueue = [];
        this.currentPos = 0;
        this.isPlaying = false;
      } else if (event.data.type === 'set-vad-threshold') {
        this.vadThreshold = event.data.threshold;
      }
    };
  }

  // 简单的语音活动检测
  detectSpeech(inputs) {
    // inputs 的结构示例：
    // [
    //   [Float32Array(128)], // 输入通道 0（左声道）
    //   [Float32Array(128)]  // 输入通道 1（右声道，如果存在）
    // ]
    // 检查是否有输入数据
    if (!inputs || inputs.length === 0 || !inputs[0] || inputs[0].length === 0) {
      return false;
    }

    const input = inputs[0][0];

    let sum = 0;

    // 计算输入信号的能量
    for (let i = 0; i < input.length; i++) {
      sum += Math.abs(input[i]);
    }
    const avgLevel = sum / input.length;

    // 平滑输入电平
    this.inputHistory.shift();
    this.inputHistory.push(avgLevel);
    const smoothedLevel = this.inputHistory.reduce((a, b) => a + b, 0) / this.inputHistory.length;
    // 检测语音
    if (smoothedLevel > this.vadThreshold) {
      this.speechCounter += input.length;
      if (this.speechCounter > this.speechThreshold) {
        return true;
      }
    } else {
      this.speechCounter = Math.max(0, this.speechCounter - input.length);
    }

    return false;
  }


  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];
    let hasData = false;

    // 初始化采样率和静音阈值（仅第一次运行时）
    if (!this.sampleRateUpdated) {
      this.sampleRate = this.context?.sampleRate || this.sampleRate;
      this.silenceThreshold = Math.floor(this.sampleRate * 1); // 2秒静音阈值
      this.sampleRateUpdated = true;
    }

    // 检测语音活动
    const isSpeaking = this.detectSpeech(inputs);

    // 如果检测到语音且正在播放，则中断播放
    if (isSpeaking && this.isPlaying) {
      this.bufferQueue = [];
      this.currentPos = 0;
      this.isPlaying = false;
      this.port.postMessage({ type: "interrupted" });
      return true;
    }

    // 处理音频数据
    if (this.bufferQueue.length > 0) {
      const currentBuffer = this.bufferQueue[0];

      for (let i = 0; i < channel.length; i++) {
        if (this.currentPos < currentBuffer.length) {
          channel[i] = currentBuffer[this.currentPos++];
          hasData = true;
          this.silenceCounter = 0;
        } else {
          this.bufferQueue.shift();
          this.currentPos = 0;
          break;
        }
      }
    } else {
      // 没有数据时填充静音
      for (let i = 0; i < channel.length; i++) {
        channel[i] = 0;
      }
      this.silenceCounter += channel.length;
    }

    // 检测播放结束（基于时间和静音样本双重条件）
    if (this.isPlaying && !hasData && this.bufferQueue.length === 0) {
      const timeSinceLastData = Date.now() - this.lastDataTime;

      // 必须同时满足：静音样本超过阈值 AND 距离最后数据时间超过5秒
      if (this.silenceCounter > this.silenceThreshold &&
        timeSinceLastData > 5000 &&
        !this.sentEndEvent) {
        this.silenceCounter = 0
        this.port.postMessage({ type: "ended" });
        this.sentEndEvent = true;
        this.isPlaying = false;
      }
    }

    return true;
  }
}
registerProcessor('stream-processor', StreamProcessor);