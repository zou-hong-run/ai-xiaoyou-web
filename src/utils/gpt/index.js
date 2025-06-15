import { getParams, getWebSocketUrl } from "../redrun.js";
import Functions from "../functions/index.js";
const config = {
  hostUrl: "wss://spark-api.xf-yun.com/v4.0/chat",
  domain: '4.0Ultra',
  userId: "red润",
  appid: import.meta.env.VITE_SPARK_APPID,
  apiSecret: import.meta.env.VITE_SPARK_API_SECRET,
  apiKey: import.meta.env.VITE_SPARK_API_KEY,
};

// 从 localStorage 加载聊天记录，如果没有则使用默认
const loadChatHistory = () => {
  const savedHistory = localStorage.getItem('chatHistory');
  return savedHistory ? JSON.parse(savedHistory) : [{
    "content": `你是一个在校大学生`,
    "role": "system",
    "index": 0
  }];
};

// 保存聊天记录到 localStorage
const saveChatHistory = (history) => {
  localStorage.setItem('chatHistory', JSON.stringify(history));
};

let chatHistoryList = loadChatHistory();

/**
 * @type {WebSocket}
 */
let websocket = null;

export const sendMsg = async (content, onGPTChangeCallback, onGPTEndCallback) => {
  let answer = ""; // 回答
  let tempAnswerLen = 0;

  chatHistoryList.push({ role: 'user', content });
  saveChatHistory(chatHistoryList); // 保存用户消息

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

  websocket.addEventListener('message', async (event) => {
    let data = JSON.parse(event.data);

    if (data.header.code !== 0) {
      console.log("GPT 出错了", data.header.code, ":", data.header.message);
      websocket.close();
    }

    if (data.header.code === 0) {
      // 对话已经完成
      if (data.payload.choices.text && data.header.status === 2) {
        // 处理函数调用
        const function_call = data?.payload?.choices?.text[0]?.function_call;

        if (function_call) {
          console.log('触发Functioncall');
          const name = function_call.name;
          const params = JSON.parse(function_call.arguments);
          const target = Functions.getFunctionByName(name);
          if (target) {
            try {
              const res = await target.handler(name, params);
              answer += res;
            } catch (error) {
              answer += `处理 ${name} 请求时出错: ${error.message}`;
            }
          }
        } else {
          answer += data.payload.choices.text[0].content;
        }
        let tempAnswer = answer.slice(tempAnswerLen);

        chatHistoryList.push({
          role: 'assistant',
          content: answer,
        });
        saveChatHistory(chatHistoryList); // 保存完整的AI回复

        onGPTEndCallback(tempAnswer);
        answer = '';
        tempAnswerLen = 0;

        setTimeout(() => {
          websocket.close();
        }, 100);
      } else {
        answer += data.payload.choices.text[0].content;
        if (answer.length > (15 + tempAnswerLen)) {
          let tempAnswer = answer.slice(tempAnswerLen);
          onGPTChangeCallback(tempAnswer);
          tempAnswerLen = answer.length;
        }
      }
    }
  });

  websocket.addEventListener('close', (event) => {
    console.log('GPT 聊天完成关闭', event);
  });
};

// 清空聊天记录（可选）
export const clearChatHistory = () => {
  chatHistoryList = [{
    "content": `
    你是一个活泼可爱的AI小助手小左，年龄设定在8-12岁之间,说话简洁不拖拉，不喜欢粘人，话比较直爽，喜欢道歉，每次不超过三句话。
    `,
    "role": "system",
    "index": 0
  }];
  saveChatHistory(chatHistoryList);
};
clearChatHistory()