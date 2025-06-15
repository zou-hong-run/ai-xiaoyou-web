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

    this.port.onmessage = (event) => {
      if (event.data.type === 'audio-data') {
        this.bufferQueue.push(event.data.chunk);
        this.isPlaying = true;
        this.sentEndEvent = false;
        this.silenceCounter = 0;
        this.lastDataTime = Date.now(); // 更新最后数据时间
      } else if (event.data.type === 'stop') {
        this.bufferQueue = [];
        this.currentPos = 0;
        this.isPlaying = false;
      }
    };
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
      // console.log(channel.length);
      // console.log(this.silenceCounter);
      this.silenceCounter += channel.length;
    }

    // 检测播放结束（基于时间和静音样本双重条件）
    if (this.isPlaying && !hasData && this.bufferQueue.length === 0) {
      const timeSinceLastData = Date.now() - this.lastDataTime;

      // 必须同时满足：静音样本超过阈值 AND 距离最后数据时间超过5秒
      if (this.silenceCounter > this.silenceThreshold &&
        timeSinceLastData > 5000 &&
        !this.sentEndEvent) {
        console.log(this.silenceCounter);
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