/**
 * 注：当前仅Spark Max/4.0 Ultra
      支持了该功能；需要请求参数payload.functions中申明大模型需要辨别的外部接口
 * 
 */

// 初始化默认的天气查询 function
const weatherFunction = {
  name: "天气查询",// 要触发的函数名
  // 描述越清晰越好，大模型会理解你需要的东西，然后传递参数
  description: "天气插件可以提供天气相关信息。你可以提供指定的地点信息、指定的时间点或者时间段信息，来精准检索到天气信息。",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "地点，比如北京。"
      },
      date: {
        type: "string",
        description: "日期。"
      }
    },
    required: ["location"]
  },
  // 自定义处理逻辑 可以做任何事 和其他软件，硬件通讯，执行爬虫，发送指令，操作其他软件
  handler: async (name, params) => {
    console.log(params);
    let location = params.location;
    if (location == "北京") { window.open("https://weather.cma.cn/web/weather/54511.html") }
    else if (location == "山东") {
      window.open("https://weather.cma.cn/web/weather/013462.html")
    }
    // return "需要的话可以将返回结果告诉用户"
    return `已为您处理任务：${name}，参数：${JSON.stringify(params)}`
  }
};
const baiduQuestions = {
  name: "百度搜索",
  description: "通过百度搜索获取与关键词相关的信息。例如，输入乔布斯可以查询乔布斯的名称。",
  parameters: {
    type: "object",
    properties: {
      username: {
        type: "string",
        description: "关键词，比如乔布斯"
      }
    },
    required: ["username"]
  },
  // 自定义处理逻辑 可以做任何事 和其他软件，硬件通讯，执行爬虫，发送指令，操作其他软件
  handler: async (name, params) => {
    let username = params.username;
    let url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(username);

    // 使用 confirm 让用户确认是否跳转
    const shouldOpen = confirm(`是否要搜索 "${username}"？`);

    if (shouldOpen) {
      // 用户确认后，再调用 window.open（通常不会被拦截）
      window.open(url, '_blank');
    } else {
      return "已取消搜索";
    }

    return `已为您处理任务：${name}，参数：${JSON.stringify(params)}`;
  }
};

// 获取所有的 function
const getFunctions = () => {
  return [
    weatherFunction,
    baiduQuestions,
    // 可以在这里添加其他的function
  ];
};

// 通过名称获取特定的function
const getFunctionByName = (name) => {
  const functions = getFunctions();
  return functions.find(func => func.name === name);
};

// 更新某个function的参数
const updateFunctionParams = (name, newParams) => {
  const func = getFunctionByName(name);
  if (func) {
    func.parameters.properties = { ...func.parameters.properties, ...newParams };
  }
};

// 添加新的function
const addFunction = (newFunction) => {
  const functions = getFunctions();
  functions.push(newFunction);
};

export default {
  getFunctions,
  getFunctionByName,
  updateFunctionParams,
  addFunction
};