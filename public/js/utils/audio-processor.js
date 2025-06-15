// audio-processor.js (需单独文件)
class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferQueue = [];
    this.currentPos = 0;
    this.isPlaying = false;
    this.sentEndEvent = false; // 防止重复发送结束事件
    // 监听主线程发送的消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio-data') {
        this.bufferQueue.push(event.data.chunk);
        this.isPlaying = true;
        this.sentEndEvent = false;// 收到数据重置标记
        // console.log('AudioWorklet 收到数据块:', event.data.chunk.length);
      } else if (event.data.type === 'stop') {
        this.bufferQueue = []; // 清空队列
        this.currentPos = 0;
      }
    };
  }
  /**
   * 假设：
  
  音频回调大小（channel.length）为128样本
  接收到的数据块大小为1024样本
  处理流程：
  
  第一次回调：处理样本0-127
  第二次回调：处理样本128-255
  ...
  第八次回调：处理样本896-1023
  第九次回调：移除已完成的第一个数据块，开始处理下一个数据块
  这种设计有效地平衡了实时性和数据块处理的效率。
   * @param {*} _ 
   * @param {*} outputs 
   * @returns 
   */
  process(_, outputs) {
    const output = outputs[0];// outputs 是一个三维数组：[outputIndex][channelIndex][sampleIndex]
    const channel = output[0];// 这里获取第一个输出（outputs[0]）的第一个声道（output[0]）
    let hasData = false;
    // 对于单声道音频，通常只需要处理第一个声道
    // 从队列填充数据 bufferQueue 是在构造函数中初始化的数组，存储接收到的音频数据块
    if (this.bufferQueue.length > 0) {
      const currentBuffer = this.bufferQueue[0];
      // 循环：遍历输出缓冲区的每个样本位置（channel.length 通常是128或256，取决于音频系统）
      for (let i = 0; i < channel.length; i++) {
        /**
         * 如果当前数据块还有未播放的样本（this.currentPos < currentBuffer.length）：
          将数据块的当前样本复制到输出缓冲区
          递增位置计数器 (this.currentPos++)
         */
        if (this.currentPos < currentBuffer.length) {
          channel[i] = currentBuffer[this.currentPos++];
          hasData = true
        } else {
          this.bufferQueue.shift(); // 移除已播放片段
          this.currentPos = 0;
          break;
        }
      }
    }
    // 检测播放结束
    if (this.isPlaying && !hasData && this.bufferQueue.length === 0) {
      if (!this.sentEndEvent) {
        this.port.postMessage({ type: "ended" })
        this.sentEndEvent = true;
        this.isPlaying = false
      }
      return false;//可选；结束处理器
    }
    return true;
  }
}
registerProcessor('stream-processor', StreamProcessor);