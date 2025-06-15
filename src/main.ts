import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import { PixelateFilter } from "@pixi/filter-pixelate";
import { OutlineFilter } from "@pixi/filter-outline";
import { AsciiFilter } from "@pixi/filter-ascii";
import { AlphaFilter } from "@pixi/filter-alpha";
import { CRTFilter } from "@pixi/filter-crt";
import { NoiseFilter } from "@pixi/filter-noise";
import { easeOutBack, easeOutElastic, lerp } from "./utils/index";
// @ts-ignore
import * as IAT from "./utils/iat/index";
// @ts-ignore
import * as GPT from "./utils/gpt/index";
// @ts-ignore
import * as TTS from "./utils/tts/index";
// import * as TTS from "./utils/tts/index_super";
// ==================== 类型定义 ====================
type FilterType =
  | "none"
  | "pixelate"
  | "outline"
  | "ascii"
  | "alpha"
  | "crt"
  | "noise";

interface FilterConfig {
  name: string;
  type: FilterType;
  options?: any;
}

interface ModelOption {
  scale: number;
  name: string;
  path: string;
}

// ==================== 类型定义更新 ====================
interface HeadMotion {
  baseAngle: number;
  currentAngle: number;
  targetAngle: number;
  maxAngle: number;
  returnSpeed: number;
  isReturning: boolean;
  direction: number;
  beatInProgress: boolean;
  easeFunction: (t: number) => number; // 新增缓动函数
  animationStartTime: number; // 新增动画开始时间
  animationDuration: number; // 新增动画持续时间
}

interface MouthMotion {
  currentOpen: number;
  targetOpen: number;
  maxOpen: number;
  decayRate: number;
  easeFunction: (t: number) => number; // 新增缓动函数
}

// ==================== 全局变量 ====================
// 在全局变量部分添加
let currentTextIndex = 0;
let textQueue: string[] = [];
let isTyping = false;
// let typingSpeed = 6.78; // 字符/秒
let typingSpeed = 3.2; // 字符/秒
// let typingSpeed = 6.8; // 字符/秒

const availableFilters: FilterConfig[] = [
  { name: "无滤镜", type: "none" },
  { name: "像素化", type: "pixelate", options: { size: 4 } },
  { name: "描边", type: "outline", options: { thickness: 2, color: 0x000000 } },
  { name: "ASCII", type: "ascii", options: { size: 8 } },
  { name: "透明度", type: "alpha", options: { alpha: 0.8 } },
  { name: "CRT效果", type: "crt", options: { curvature: 0.5 } },
  { name: "噪点", type: "noise", options: { noise: 0.3 } },
];

const modelOptions: ModelOption[] = [
  {
    scale: 0.99,
    name: "简单模型",
    path: "../public/model/Simple/Simple.model3.json",
  },
  { scale: 0.18, name: "Haru", path: "../public/model/Haru/Haru.model3.json" },
  {
    scale: 0.18,
    name: "Hiyori",
    path: "../public/model/Hiyori/Hiyori.model3.json",
  },
  {
    scale: 0.6,
    name: "Kei",
    path: "../public/model/kei_zh/kei_basic_free.model3.json",
  },
  {
    scale: 0.7,
    name: "Wanko",
    path: "../public/model/Wanko/Wanko.model3.json",
  },
];
// ==================== 全局变量更新 ====================
const headMotion: HeadMotion = {
  baseAngle: 0,
  currentAngle: 0,
  targetAngle: 0,
  maxAngle: 10,
  returnSpeed: 0.25,
  isReturning: true,
  direction: -1,
  beatInProgress: false,
  easeFunction: easeOutElastic, // 使用弹性缓动函数
  animationStartTime: 0,
  animationDuration: 1000, // 1秒动画持续时间
};

const mouthMotion: MouthMotion = {
  currentOpen: 0,
  targetOpen: 0,
  maxOpen: 1.0,
  decayRate: 0.15,
  easeFunction: easeOutBack, // 使用回弹缓动函数
};

let currentFilter: FilterType = "none";
let activeFilters: PIXI.Filter[] = [];
let currentChooseModel: ModelOption = modelOptions[0];
let app: PIXI.Application;
let currentModel: Live2DModel;

const canvasEle = document.querySelector("canvas");

createModelSelector();
Live2DModel.registerTicker(PIXI.Ticker);

app = new PIXI.Application({
  view: canvasEle!,
  autoStart: true,
  // resizeTo: window,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundAlpha: 0,
  resolution: window.devicePixelRatio,
});
app.view.style.width = window.innerWidth * 0.99 + 'px';
app.view.style.height = window.innerHeight * 0.99 + 'px';
await loadModel(currentChooseModel);
initDialogSystem();
let audioContext: AudioContext;
let workletNode: AudioWorkletNode;
// 在全局变量中添加
function handleTTSStream(stream: Float32Array) {
  // 发送数据到AudioWorklet
  workletNode.port.postMessage(
    {
      type: "audio-data",
      chunk: stream,
    },
    [stream.buffer]
  );
}
// 定义任务类型
type Task = () => Promise<boolean>;
const taskQueue: Task[] = [];
let isQueueProcessing = false;
// Process task queue
async function processQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;
  while (taskQueue.length > 0) {
    try {
      const task = taskQueue.shift();
      if (task) {
        await task()!;
      }
    } catch (error) {
      console.error("Task execution failed:", error);
    }
  }
  isQueueProcessing = false;
}

// ==================== 核心功能 ====================
let timer: NodeJS.Timeout;
async function chat() {
  let iatStr: string;
  IAT.start(
    function onIATStart() {
      console.log("等待startIAT");
      // 显示用户对话框
      showUserDialog("正在聆听...");
    },
    function onIATChange(text: string) {
      console.log(text);
      // 更新用户对话框内容
      showUserDialog(text);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        iatStr = text;
        if (!iatStr) return;
        GPT.sendMsg(
          iatStr,
          function onGPTChange(tempResult: string) {
            console.log(tempResult, "tempResult");
            if (!tempResult) return;
            taskQueue.push(() => {
              return new Promise<boolean>((resolve, _reject) => {
                TTS.startTTS(
                  tempResult,
                  (stream: Float32Array, isEnd: boolean) => {
                    handleTTSStream(stream);
                    if (isEnd) {
                      resolve(isEnd);
                    }
                  }
                );
              });
            });
            processQueue();
            showAIDialog(tempResult); // 显示AI回复
          },
          function onGPTEnd(result: string) {
            if (!result) return;
            taskQueue.push(() => {
              return new Promise<boolean>((resolve, _reject) => {
                TTS.startTTS(result, (stream: Float32Array, isEnd: boolean) => {
                  handleTTSStream(stream);
                  if (isEnd) {
                    resolve(isEnd);
                  }
                });
              });
            });
            processQueue();
            showAIDialog(result); // 显示最终AI回复
            console.log(result, "result");
          }
        );
      }, 800);
    },
    function onIATEnd() {
      console.log("endIAT");
      audioContext.resume();
      // 隐藏用户对话框
      hideUserDialog(); // 隐藏用户对话框
    }
  );
}
/**
 * 初始化应用
 */
async function init() {
  if (!audioContext) {
    audioContext = new window.AudioContext({
      sampleRate: 16000,
    });
    await audioContext.resume();
    await audioContext.audioWorklet.addModule("./src/utils/audio-processor.js");
    if (!workletNode) {
      workletNode = new AudioWorkletNode(audioContext, "stream-processor");
      // 3. 获取用户媒体（麦克风输入）
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const sourceNode = audioContext.createMediaStreamSource(stream);

        // 4. 连接输入源到处理器
        sourceNode.connect(workletNode);

        // 5. 连接处理器到输出
        workletNode.connect(audioContext.destination);
      } catch (err) {
        console.error("无法获取麦克风:", err);
      }
      workletNode.connect(audioContext.destination);
      // 在AudioWorklet中处理播放完成通知
      // 修改消息处理部分
      workletNode.port.onmessage = (event) => {
        if (event.data.type === "ended") {
          // 使用 setTimeout 确保音频完全播放完毕
          setTimeout(() => {
            chat();
          }, 200); // 添加200ms延迟确保音频完全播放
        } else if (event.data.type === "interrupted") {
          console.log("说话打断");
          showUserDialog("说话打断");
          workletNode.port.postMessage({
            type: "stop",
          });
          textQueue = [];
          isTyping = true;
          // IAT.stop();
          setTimeout(() => {
            chat();
          }, 2000);
        }
      };
      workletNode.port.onmessageerror = (event) => {
        console.log(event, "onmessageerror");
      };
    }
    addDialogStyles();
    initDialogSystem();

  }

  chat();
}
function initDialogSystem() {
  // 创建AI对话框容器
  const aiDialogDiv = document.createElement("div");
  aiDialogDiv.id = "ai-dialog-container";
  aiDialogDiv.style.position = "fixed";
  aiDialogDiv.style.zIndex = "100";
  // aiDialogDiv.style.display = "none";
  aiDialogDiv.style.width = "80%";
  aiDialogDiv.style.maxWidth = "600px";

  // 创建用户对话框容器
  const userDialogDiv = document.createElement("div");
  userDialogDiv.id = "user-dialog-container";
  userDialogDiv.style.position = "fixed";
  userDialogDiv.style.zIndex = "100";
  // userDialogDiv.style.display = "none";
  userDialogDiv.style.width = "80%";
  userDialogDiv.style.maxWidth = "600px";

  // 创建AI对话框背景
  const aiDialogBackground = document.createElement("div");
  aiDialogBackground.id = "ai-dialog-background";
  aiDialogBackground.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
  aiDialogBackground.style.borderRadius = "15px";
  aiDialogBackground.style.padding = "15px 20px";
  aiDialogBackground.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  aiDialogBackground.style.border = "2px solid #ddd";

  // 创建用户对话框背景
  const userDialogBackground = document.createElement("div");
  userDialogBackground.id = "user-dialog-background";
  userDialogBackground.style.backgroundColor = "rgba(200, 230, 255, 0.9)";
  userDialogBackground.style.borderRadius = "15px";
  userDialogBackground.style.padding = "15px 20px";
  userDialogBackground.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  userDialogBackground.style.border = "2px solid #aad";

  // 创建AI对话框文本
  const aiDialogText = document.createElement("div");
  aiDialogText.id = "ai-dialog-text";
  aiDialogText.style.fontFamily = '"Microsoft YaHei", Arial, sans-serif';
  aiDialogText.style.fontSize = "20px";
  aiDialogText.style.color = "#333";
  aiDialogText.style.fontWeight = "500";
  aiDialogText.style.wordBreak = "break-word";
  aiDialogText.style.whiteSpace = "pre-wrap";
  aiDialogText.style.textShadow = "0 0 2px #fff";

  // 创建用户对话框文本
  const userDialogText = document.createElement("div");
  userDialogText.id = "user-dialog-text";
  userDialogText.style.fontFamily = '"Microsoft YaHei", Arial, sans-serif';
  userDialogText.style.fontSize = "20px";
  userDialogText.style.color = "#006";
  userDialogText.style.fontWeight = "500";
  userDialogText.style.wordBreak = "break-word";
  userDialogText.style.whiteSpace = "pre-wrap";
  userDialogText.style.textShadow = "0 0 2px #fff";

  // 组装元素
  aiDialogBackground.appendChild(aiDialogText);
  aiDialogDiv.appendChild(aiDialogBackground);

  userDialogBackground.appendChild(userDialogText);
  userDialogDiv.appendChild(userDialogBackground);

  document.body.appendChild(aiDialogDiv);
  document.body.appendChild(userDialogDiv);

  // 初始位置和大小
  updateDialogPosition();
}
/**
 * 更新对话框位置 (使用HTML div)
 */
function updateDialogPosition() {
  const aiDialogContainer = document.getElementById("ai-dialog-container");
  const userDialogContainer = document.getElementById("user-dialog-container");

  if (!aiDialogContainer || !userDialogContainer) return;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // AI对话框位置 (底部)
  aiDialogContainer.style.left = "50%";
  aiDialogContainer.style.bottom = isMobile ? "20%" : "20%";
  aiDialogContainer.style.transform = "translateX(-50%)";

  // 用户对话框位置 (顶部)
  userDialogContainer.style.left = "50%";
  userDialogContainer.style.top = isMobile ? "20%" : "20%";
  userDialogContainer.style.transform = "translateX(-50%)";
}

/**
 * 加载Live2D模型
 */
async function loadModel(modelOption: ModelOption) {
  try {
    if (currentModel) {
      app.stage.removeChild(currentModel);
    }

    currentModel = await Live2DModel.from(modelOption.path);
    app.stage.addChild(currentModel);

    applyCurrentFilter();
    setupModelPosition({ model: currentModel, scale: modelOption.scale }, app);
    app.stage.setChildIndex(currentModel, 0);

    (currentModel.internalModel as any).phyEnabled = false;
    currentModel.internalModel.motionManager.stopAllMotions();

    console.log(`模型加载成功: ${modelOption.path}`);
    setupEventListeners();
  } catch (error) {
    console.error(`模型加载失败: ${modelOption.path}`, error);
  }
}

/**
 * 应用当前选中的滤镜
 */
function applyCurrentFilter() {
  if (!currentModel) return;

  activeFilters = [];

  switch (currentFilter) {
    case "pixelate":
      activeFilters.push(
        new PixelateFilter(
          availableFilters.find((f) => f.type === "pixelate")?.options.size || 4
        )
      );
      break;
    case "outline":
      const outlineOptions = availableFilters.find(
        (f) => f.type === "outline"
      )?.options;
      activeFilters.push(
        new OutlineFilter(
          outlineOptions?.thickness || 2,
          outlineOptions?.color || 0x000000
        )
      );
      break;
    case "ascii":
      activeFilters.push(
        new AsciiFilter(
          availableFilters.find((f) => f.type === "ascii")?.options.size || 8
        )
      );
      break;
    case "alpha":
      activeFilters.push(
        new AlphaFilter(
          availableFilters.find((f) => f.type === "alpha")?.options.alpha || 0.8
        )
      );
      break;
    case "crt":
      activeFilters.push(
        new CRTFilter({
          curvature:
            availableFilters.find((f) => f.type === "crt")?.options.curvature ||
            0.5,
        })
      );
      break;
    case "noise":
      activeFilters.push(
        new NoiseFilter(
          availableFilters.find((f) => f.type === "noise")?.options.noise || 0.3
        )
      );
      break;
    case "none":
    default:
      activeFilters = [];
      break;
  }

  currentModel.filters = activeFilters;
}

// ==================== 模型控制 ====================

/**
 * 设置模型位置和大小
 */
function setupModelPosition(
  { model, scale }: { model: Live2DModel; scale: number },
  app: PIXI.Application
) {
  const { width, height } = app.screen;

  // const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let baseScale = scale;
  model.interactive = false;

  // if (isMobile) {
  //   baseScale = baseScale * 0.3;
  //   model.scale.set(baseScale);
  //   model.position.set(width / 6, height / 7);
  // } else {
  //   model.scale.set(baseScale);
  //   model.position.set(width / 2, height * (isMobile ? 0.6 : 0.55));
  // }
  model.scale.set(baseScale);
  model.position.set(width * 0.5, height * 0.5);
  model.anchor.set(0.5, 0.5);
}

/**
 * 创建模型和滤镜选择器
 */
function createModelSelector() {
  const container = document.createElement("div");
  container.className = "controls-container";

  // 模型选择器
  const modelContainer = document.createElement("div");
  modelContainer.className = "model-selector";

  const modelSelect = document.createElement("select");
  modelSelect.id = "model-select";

  const defaultModelOption = document.createElement("option");
  defaultModelOption.value = "";
  defaultModelOption.textContent = "选择模型";
  defaultModelOption.disabled = true;
  defaultModelOption.selected = true;
  modelSelect.appendChild(defaultModelOption);

  modelOptions.forEach((model, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.textContent = model.name;
    modelSelect.appendChild(option);
  });

  modelSelect.addEventListener("change", async (e) => {
    const selectedIndex = parseInt((e.target as HTMLSelectElement).value);
    if (
      !isNaN(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < modelOptions.length
    ) {
      currentChooseModel = modelOptions[selectedIndex];
      await loadModel(currentChooseModel);
    }
  });

  modelContainer.appendChild(modelSelect);

  // 滤镜选择器
  const filterContainer = document.createElement("div");
  filterContainer.className = "filter-selector";

  const filterSelect = document.createElement("select");
  filterSelect.id = "filter-select";

  availableFilters.forEach((filter) => {
    const option = document.createElement("option");
    option.value = filter.type;
    option.textContent = filter.name;
    filterSelect.appendChild(option);
  });

  filterSelect.addEventListener("change", (e) => {
    currentFilter = (e.target as HTMLSelectElement).value as FilterType;
    if (currentModel) {
      applyCurrentFilter();
    }
  });

  filterContainer.appendChild(filterSelect);

  container.appendChild(modelContainer);
  container.appendChild(filterContainer);
  document.body.appendChild(container);

  // 添加CSS样式
  const style = document.createElement("style");
  style.textContent = `
    .controls-container {
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .model-selector, .filter-selector {
      display: inline-block;
    }

    .model-selector select, .filter-selector select {
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background-color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      outline: none;
      cursor: pointer;
      min-width: 150px;
    }

    .model-selector select:hover, .filter-selector select:hover {
      border-color: #888;
    }

    .model-selector select:focus, .filter-selector select:focus {
      border-color: #555;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
    }
  `;
  document.head.appendChild(style);
}

// ==================== 事件监听 ====================

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 动画更新
  app.ticker.add(() => {
    if (currentModel) {
      updateHeadMotion(currentModel);
      updateMouthMotion(currentModel);
    }
  });

  // 窗口大小调整
  window.addEventListener("resize", () => {
    // app.renderer.resize(window.innerWidth, window.innerHeight);
    // console.log(app.renderer.width,app.renderer.height,"===========");
    const scale = window.devicePixelRatio || 1;
    app.renderer.resize(
      window.innerWidth * scale,
      window.innerHeight * scale
    );
    app.view.style.width = window.innerWidth * 0.99 + 'px';
    app.view.style.height = window.innerHeight * 0.99 + 'px';
    if (currentModel) {
      setupModelPosition(
        { model: currentModel, scale: currentChooseModel.scale },
        app
      );
    }
    updateDialogPosition();
  });
}

// ==================== 更新头部动作函数 ====================
function updateHeadMotion(model: Live2DModel) {
  const coreModel = model.internalModel.coreModel as any;
  const now = Date.now();

  // 计算动画进度 (0-1)
  const elapsed = now - headMotion.animationStartTime;
  const progress = Math.min(elapsed / headMotion.animationDuration, 1);

  // 应用缓动函数
  const easedProgress = headMotion.easeFunction(progress);

  if (headMotion.isReturning) {
    // 使用插值返回
    headMotion.currentAngle = lerp(
      headMotion.currentAngle,
      headMotion.targetAngle,
      headMotion.returnSpeed * 0.05 // 减慢返回速度
    );

    if (Math.abs(headMotion.currentAngle) < 0.5) {
      headMotion.currentAngle = headMotion.baseAngle;
    }
  } else {
    // 使用插值到达目标
    headMotion.currentAngle = lerp(
      headMotion.baseAngle,
      headMotion.targetAngle,
      easedProgress
    );
  }

  // 添加微小随机抖动使动画更自然
  const randomJitter = (Math.random() - 0.5) * 0.5;
  const finalAngle = headMotion.currentAngle + randomJitter;

  const headParams = ["PARAM_ANGLE_Z", "ParamAngleZ", "ParamHeadZ", "AngleZ"];
  for (let param of headParams) {
    coreModel?.setParameterValueById(param, finalAngle);
    model.angle = -finalAngle / 100;
  }
}

// ==================== 更新嘴巴动作函数 ====================
function updateMouthMotion(model: Live2DModel) {
  const coreModel = model.internalModel.coreModel as any;

  // 使用更平滑的插值
  mouthMotion.currentOpen = lerp(
    mouthMotion.currentOpen,
    mouthMotion.targetOpen,
    0.2 // 降低插值速度使动画更平滑
  );

  // 添加基于正弦波的周期性变化
  const time = Date.now() / 1000;
  const speechWave = Math.sin(time * 10) * 0.1; // 10Hz的说话频率

  // 组合目标开口度和周期性波动
  const finalOpen = Math.max(0, mouthMotion.currentOpen + speechWave);

  const mouthParams = ["PARAM_MOUTH_OPEN_Y", "ParamMouthOpenY", "MouthOpenY"];
  for (let param of mouthParams) {
    if (!isNaN(finalOpen)) {
      coreModel.setParameterValueById(param, finalOpen);
    }
  }

  // 更自然的衰减
  if (mouthMotion.targetOpen > 0) {
    mouthMotion.targetOpen *= 0.95;
  }
}

// ==================== 打字动画与嘴巴同步 ====================
function showAIDialog(text: string) {
  const aiDialogContainer = document.getElementById("ai-dialog-container");
  const aiDialogText = document.getElementById("ai-dialog-text");

  if (!aiDialogContainer || !aiDialogText) return;

  if (isTyping) {
    textQueue.push(text);
    return;
  }

  aiDialogContainer.style.display = "block";
  aiDialogText.textContent = "";
  currentTextIndex = 0;
  isTyping = true;

  if ((aiDialogText as any)._typeInterval) {
    clearInterval((aiDialogText as any)._typeInterval);
  }

  // 开始更自然的说话动画
  startNaturalTalking();

  const characters = Array.from(text);
  let lastCharTime = Date.now();

  const typeInterval = setInterval(() => {
    if (currentTextIndex < characters.length) {
      const nextChar = characters[currentTextIndex];
      aiDialogText.textContent += nextChar;
      currentTextIndex++;

      // 根据字符类型调整嘴巴动画
      const now = Date.now();
      const timeSinceLastChar = now - lastCharTime;
      lastCharTime = now;

      if (currentModel) {
        // 元音字母和某些辅音使嘴巴张得更大
        const isVowel = /[aeiouyAEIOUY]/.test(nextChar);
        const isConsonant = /[mnbpMNBP]/.test(nextChar);

        let mouthOpen = 0;
        if (isVowel) {
          mouthOpen = 0.7 + Math.random() * 0.5;
        } else if (isConsonant) {
          mouthOpen = 0.4 + Math.random() * 0.4;
        } else {
          mouthOpen = 0.3 + Math.random() * 0.4;
        }

        mouthMotion.targetOpen = mouthOpen;

        // 根据打字速度调整头部动作
        if (timeSinceLastChar < 200) {
          // 快速打字时
          if (Math.random() > 0.9) {
            // 10%几率触发头部动作
            headMotion.targetAngle =
              headMotion.maxAngle * (Math.random() > 0.5 ? 1 : -1);
            headMotion.animationStartTime = Date.now();
          }
        }
      }

      aiDialogContainer.scrollTop = aiDialogContainer.scrollHeight;
    } else {
      clearInterval(typeInterval);
      isTyping = false;

      // 打字结束后逐渐停止嘴巴动作
      setTimeout(() => {
        mouthMotion.targetOpen = 0;
      }, 500);

      if (textQueue.length > 0) {
        const nextText = textQueue.shift();
        if (nextText) {
          showAIDialog(nextText);
        } else {
          stopNaturalTalking();
          hideAIDialog();
        }
      } else {
        stopNaturalTalking();
        hideAIDialog();
      }
    }
  }, 1000 / typingSpeed);

  (aiDialogText as any)._typeInterval = typeInterval;
}

// ==================== 自然说话动画控制 ====================
function startNaturalTalking() {
  if (!currentModel) return;

  // 更自然的头部参数
  headMotion.maxAngle = 8; // 减小最大角度
  headMotion.returnSpeed = 0.08; // 更慢的返回速度
  headMotion.isReturning = false;
  headMotion.beatInProgress = false;
  headMotion.animationDuration = 1500; // 更长的动画持续时间

  // 更自然的嘴巴参数
  mouthMotion.maxOpen = 1.0;
  mouthMotion.decayRate = 0.15;

  // 启动周期性微小头部动作
  (currentModel as any)._headInterval = setInterval(
    () => {
      if (!headMotion.beatInProgress && Math.random() > 0.7) {
        headMotion.direction *= -1;
        headMotion.targetAngle =
          headMotion.maxAngle *
          headMotion.direction *
          (0.5 + Math.random() * 0.5);
        headMotion.animationStartTime = Date.now();
      }
    },
    1500 + Math.random() * 1000
  ); // 随机间隔
}

function stopNaturalTalking() {
  if (!currentModel) return;

  // 清除头部动画间隔
  const headInterval = (currentModel as any)._headInterval;
  if (headInterval) {
    clearInterval(headInterval);
    delete (currentModel as any)._headInterval;
  }

  // 平滑过渡到静止状态
  headMotion.isReturning = true;
  headMotion.targetAngle = headMotion.baseAngle;
  mouthMotion.targetOpen = 0;
}

/**
 * 隐藏AI对话框
 */
function hideAIDialog() {
  const aiDialogContainer = document.getElementById("ai-dialog-container");
  if (aiDialogContainer) {
    aiDialogContainer.style.display = "none";
  }
}

/**
 * 显示用户对话框
 */
function showUserDialog(text: string) {
  const userDialogContainer = document.getElementById("user-dialog-container");
  const userDialogText = document.getElementById("user-dialog-text");

  if (!userDialogContainer || !userDialogText) return;

  userDialogContainer.style.display = "block";
  userDialogText.textContent = text;
}

/**
 * 隐藏用户对话框
 */
function hideUserDialog() {
  const userDialogContainer = document.getElementById("user-dialog-container");
  if (userDialogContainer) {
    userDialogContainer.style.display = "none";
  }
}
// ==================== CSS样式 ====================
function addDialogStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #ai-dialog-container, #user-dialog-container {
      transition: all 0.3s ease;
      max-width: 90%;
      box-sizing: border-box;
      overflow: hidden;
      max-height: 200px;
      overflow-y: auto;
      padding: 10px;
    }
    
    #ai-dialog-background, #user-dialog-background {
      transition: all 0.3s ease;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    #ai-dialog-text, #user-dialog-text {
      transition: all 0.3s ease;
      white-space: pre-wrap; /* 保留换行和空格 */
  font-family: monospace; /* 等宽字体，打字效果更好 */
  line-height: 1.5; /* 更好的行间距 */
    }
    
    /* 自定义滚动条 */
    #ai-dialog-container::-webkit-scrollbar,
    #user-dialog-container::-webkit-scrollbar {
      width: 6px;
    }
    
    #ai-dialog-container::-webkit-scrollbar-track,
    #user-dialog-container::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
      border-radius: 3px;
    }
    
    #ai-dialog-container::-webkit-scrollbar-thumb,
    #user-dialog-container::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.2);
      border-radius: 3px;
    }
    #ai-dialog-text:after {
      content: "|";
      animation: blink 1s step-end infinite;
    }
    
    @keyframes blink {
      from, to { opacity: 1; }
      50% { opacity: 0; }
    }
    
    /* 移动设备适配 */
    @media (max-width: 768px) {
      #ai-dialog-container, #user-dialog-container {
        max-width: 95%;
        max-height: 150px;
      }
      
      #ai-dialog-text {
        font-size: 18px !important;
      }
      
      #user-dialog-text {
        font-size: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
}
// ==================== 启动应用 ====================
document.querySelector("#startBtn")?.addEventListener("click", () => {
  init();
});
