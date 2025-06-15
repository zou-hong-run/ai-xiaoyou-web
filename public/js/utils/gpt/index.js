import { getParams, getWebSocketUrl } from "../redrun.js";

const config = {
  hostUrl: "wss://spark-api.xf-yun.com/v4.0/chat",
  appid: "7673eeaf",
  userId: "red润",
  domain: '4.0Ultra',
  apiSecret: "OGEyZDJjZjY4YTkzNGEwZjRhYWY3MDI1",
  apiKey: "17d63998b8054d42c7d4ae46c5a27644",

};
let chatHistoryList = [{
  "content": `现在你扮演角色是我的好朋友，你是一个情感大师，擅长撩人，你很可爱，幽默，你不能说你是机器人哦。`,
  "role": "system",
  "index": 0
}
]
/**
 * @type {WebSocket}
 */
let websocket = null;
export const sendMsg = async (content, onGPTChangeCallback, onGPTEndCallback) => {
  let answer = "";// 回答
  let tempAnswerLen = 0;
  chatHistoryList.push({ role: 'user', content });
  let params = getParams(config.appid, config.userId, config.domain, chatHistoryList);
  let url = getWebSocketUrl(config.hostUrl, config.apiKey, config.apiSecret);
  websocket = new WebSocket(url);
  websocket.addEventListener('open', (event) => {
    console.log('GPT 开启连接！！', event);
    websocket.send(JSON.stringify(params));
  });
  websocket.addEventListener('error', (error) => {
    console.log('GPT 连接发送错误！！', error);
  });
  websocket.addEventListener('message', (event) => {
    let data = JSON.parse(event.data)
    // console.log('收到消息！！',data);
    if (data.header.code !== 0) {
      console.log("GPT 出错了", data.header.code, ":", data.header.message);
      // 出错了"手动关闭连接"
      websocket.close()
    }
    if (data.header.code === 0) {
      // 对话已经完成
      if (data.payload.choices.text && data.header.status === 2) {
        answer += data.payload.choices.text[0].content;
        let tempAnswer = answer.slice(tempAnswerLen)
        chatHistoryList.push({
          role: 'assistant',
          content: answer,
        });
        onGPTEndCallback(tempAnswer);
        answer = '';
        tempAnswerLen = 0;
        setTimeout(() => {
          // "对话完成，手动关闭连接"
          websocket.close()
        }, 500)
      } else {
        answer += data.payload.choices.text[0].content
        if (answer.length > (15 + tempAnswerLen)) {
          // 发送这些元素
          let tempAnswer = answer.slice(tempAnswerLen);
          onGPTChangeCallback(tempAnswer);
          tempAnswerLen = answer.length;
        }
      }
    }
  })
  websocket.addEventListener('close', (event) => {
    console.log('GPT 聊天完成关闭', event);
    // 对话完成后socket会关闭，将聊天记录换行处理
  });
}
