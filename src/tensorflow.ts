import * as tf from "@tensorflow/tfjs";
import * as SpeechCommands from "@tensorflow-models/speech-commands";

// DOM元素
const startButton = document.querySelector("#startBtn") as HTMLButtonElement;
const stopButton = document.querySelector("#stopBtn") as HTMLButtonElement;
const trainButton = document.querySelector("#trainBtn") as HTMLButtonElement;
const statusDiv = document.querySelector("#status") as HTMLDivElement;
const commandSelect = document.querySelector(
  "#commandSelect"
) as HTMLSelectElement;
const recordButton = document.querySelector("#recordBtn") as HTMLButtonElement;
const resultDiv = document.querySelector("#result") as HTMLDivElement;
const saveModelButton = document.querySelector(
  "#saveModelBtn"
) as HTMLButtonElement;
const loadModelButton = document.querySelector(
  "#loadModelBtn"
) as HTMLButtonElement;
const modelFileInput = document.querySelector(
  "#modelFileInput"
) as HTMLInputElement;
const noiseButton = document.querySelector("#noiseBtn") as HTMLButtonElement;
const languageSelect = document.querySelector(
  "#languageSelect"
) as HTMLSelectElement;

// 自定义中文命令
const CHINESE_COMMANDS = [
  "打开",
  "关闭",
  "开始",
  "停止",
  "左转",
  "右转",
  "Oi",
  "小左",
  "_background_noise_",
];

let baseRecognizer: SpeechCommands.SpeechCommandRecognizer;
let transferRecognizer: SpeechCommands.TransferSpeechCommandRecognizer;
let isEnglishMode = false; // 默认使用英文模式

async function init() {
  try {
    // 设置TensorFlow.js后端
    await tf.setBackend("webgl");
    console.log("TensorFlow.js后端:", tf.getBackend());

    // 初始化基础识别器
    statusDiv.textContent = "正在初始化语音识别...";
    baseRecognizer = SpeechCommands.create("BROWSER_FFT");
    await baseRecognizer.ensureModelLoaded();

    console.log("基础模型加载完成，支持的命令:", baseRecognizer.wordLabels());

    // 创建迁移学习识别器
    transferRecognizer = baseRecognizer.createTransfer("chineseCommands");

    // 初始化UI
    initLanguageSelect();
    initCommandSelect();
    startButton.disabled = false;
    updateUIForCurrentMode();
    statusDiv.textContent = "准备就绪";
  } catch (error) {
    console.error("初始化失败:", error);
    statusDiv.textContent = `初始化失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
  }
}

// 根据当前模式更新UI状态
function updateUIForCurrentMode() {
  if (isEnglishMode) {
    // 英文模式 - 禁用训练相关功能
    trainButton.disabled = true;
    saveModelButton.disabled = true;
    loadModelButton.disabled = true;
    recordButton.disabled = true;
    noiseButton.disabled = true;
  } else {
    // 中文模式 - 启用训练相关功能
    trainButton.disabled = false;
    saveModelButton.disabled = false;
    loadModelButton.disabled = false;
    recordButton.disabled = false;
    noiseButton.disabled = false;
  }
}

function initLanguageSelect() {
  languageSelect.innerHTML = `
    <option value="chinese">中文命令</option>
    <option value="english">英文命令</option>
  `;

  languageSelect.addEventListener("change", () => {
    isEnglishMode = languageSelect.value === "english";
    initCommandSelect();
    updateUIForCurrentMode();
    statusDiv.textContent = `已切换到${isEnglishMode ? "英文" : "中文"}模式`;
  });
}

function initCommandSelect() {
  commandSelect.innerHTML = "";

  if (isEnglishMode) {
    // 英文模式 - 显示基础模型支持的命令
    const commands = baseRecognizer
      .wordLabels()
      .filter((cmd) => cmd !== "_background_noise_");
    commands.forEach((command) => {
      const option = document.createElement("option");
      option.value = command;
      option.textContent = command;
      commandSelect.appendChild(option);
    });
  } else {
    // 中文模式 - 显示自定义中文命令
    CHINESE_COMMANDS.filter((cmd) => cmd !== "_background_noise_").forEach(
      (command) => {
        const option = document.createElement("option");
        option.value = command;
        option.textContent = command;
        commandSelect.appendChild(option);
      }
    );
  }
}

// 保存模型 - 仅在中文模式下可用
saveModelButton.addEventListener("click", async () => {
  if (isEnglishMode) return;

  try {
    saveModelButton.disabled = true;
    statusDiv.textContent = "正在保存模型...";

    // 序列化模型和数据集
    const artifacts = transferRecognizer.serializeExamples();

    // 创建下载链接
    const blob = new Blob([artifacts], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chinese_commands_model_${new Date().toISOString().slice(0, 10)}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    statusDiv.textContent = "模型保存成功！";
    saveModelButton.disabled = false;
  } catch (error) {
    console.error("保存模型失败:", error);
    statusDiv.textContent = `保存模型失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
    saveModelButton.disabled = false;
  }
});

// 加载模型 - 仅在中文模式下可用
loadModelButton.addEventListener("click", () => {
  if (isEnglishMode) return;
  modelFileInput.click();
});

modelFileInput.addEventListener("change", async (event) => {
  if (isEnglishMode) return;

  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    loadModelButton.disabled = true;
    statusDiv.textContent = "正在加载模型...";

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) throw new Error("无法读取文件");

        // 加载序列化的模型数据
        transferRecognizer.loadExamples(arrayBuffer);
        // 更新UI状态
        const counts = transferRecognizer.countExamples();
        let statusMessage = "中文模型加载成功！\n样本数量统计:\n";
        for (const command of CHINESE_COMMANDS) {
          statusMessage += `${command}: ${counts[command] || 0}个\n`;
        }

        statusDiv.textContent = statusMessage;
        startButton.disabled = false;
        trainButton.disabled = false;
      } catch (error) {
        console.error("加载模型失败:", error);
        statusDiv.textContent = `加载模型失败: ${(error as Error).message}`;
        statusDiv.style.color = "red";
      } finally {
        loadModelButton.disabled = false;
      }
    };
    fileReader.onerror = () => {
      throw new Error("文件读取错误");
    };
    fileReader.readAsArrayBuffer(file);
  } catch (error) {
    console.error("加载模型失败:", error);
    statusDiv.textContent = `加载模型失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
    loadModelButton.disabled = false;
  }
});

// 录制语音样本 - 仅在中文模式下可用
recordButton.addEventListener("click", async () => {
  if (isEnglishMode) return;

  try {
    const selectedCommand = commandSelect.value;
    if (selectedCommand === "_background_noise_") {
      statusDiv.textContent = "请使用专门的背景噪音按钮收集噪音样本";
      return;
    }

    statusDiv.textContent = `正在录制: ${selectedCommand}...`;
    recordButton.disabled = true;

    // 中文模式 - 使用迁移学习识别器收集样本
    await transferRecognizer.collectExample(selectedCommand);

    // 显示当前样本统计
    const counts = transferRecognizer.countExamples();
    let statusMessage = `已录制: ${selectedCommand}\n当前样本统计:\n`;
    for (const command of CHINESE_COMMANDS) {
      statusMessage += `${command}: ${counts[command] || 0}个\n`;
    }
    statusDiv.textContent = statusMessage;
    statusDiv.style.color = "skyblue";
    recordButton.disabled = false;
  } catch (error) {
    console.error("录制失败:", error);
    statusDiv.textContent = `录制失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
    recordButton.disabled = false;
  }
});

// 添加收集背景噪音的功能 - 仅在中文模式下可用
noiseButton.addEventListener("click", async () => {
  if (isEnglishMode) return;

  try {
    noiseButton.disabled = true;
    statusDiv.textContent = "正在收集背景噪音(请保持环境安静)...";

    // 中文模式 - 使用迁移学习识别器收集噪音
    await transferRecognizer.collectExample("_background_noise_");

    // 更新样本统计
    const counts = transferRecognizer.countExamples();
    statusDiv.textContent = `已收集背景噪音样本，当前数量: ${counts["_background_noise_"] || 0}`;
  } catch (error) {
    console.error("收集背景噪音失败:", error);
    statusDiv.textContent = `收集背景噪音失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
  } finally {
    noiseButton.disabled = false;
  }
});

// 训练模型 - 仅在中文模式下可用
trainButton.addEventListener("click", async () => {
  if (isEnglishMode) return;

  try {
    trainButton.disabled = true;
    statusDiv.textContent = "正在训练中文模型...";

    // 检查每个命令是否有足够样本
    const counts = transferRecognizer.countExamples();
    for (const command of CHINESE_COMMANDS) {
      if (command !== "_background_noise_" && (counts[command] || 0) < 5) {
        throw new Error(
          `每个命令至少需要5个样本，${command}只有${counts[command] || 0}个`
        );
      }
    }

    // 训练参数
    await transferRecognizer.train({
      epochs: 25,
      callback: {
        onEpochEnd: async (epoch, logs) => {
          statusDiv.textContent = `训练中... 第${epoch + 1}轮, 准确率: ${logs?.acc?.toFixed(3)}, 损失: ${logs?.loss?.toFixed(3)}`;
        },
      },
    });

    statusDiv.textContent = "中文模型训练完成！";
    startButton.disabled = false;
    trainButton.disabled = false;
  } catch (error) {
    console.error("训练失败:", error);
    statusDiv.textContent = `训练失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
    trainButton.disabled = false;
  }
});

// 开始识别
startButton.addEventListener("click", async () => {
  try {
    startButton.disabled = true;
    stopButton.disabled = false;

    if (isEnglishMode) {
      statusDiv.textContent = "正在监听英文命令...";

      await baseRecognizer.listen(
        async (result) => {
          const scores = result.scores;
          const words = baseRecognizer.wordLabels();

          // 找到最高分的命令
          let maxScore = 0;
          let predictedCommand = "";
          for (let i = 0; i < words.length; i++) {
            const currentScore = Number(scores[i]);
            if (currentScore > maxScore) {
              maxScore = currentScore;
              predictedCommand = words[i];
            }
          }

          resultDiv.innerHTML = `
            <div>识别结果: <strong>${predictedCommand}</strong></div>
            <div>置信度: ${(maxScore * 100).toFixed(1)}%</div>
          `;

          // 执行对应命令（如果不是背景噪音）
          if (predictedCommand !== "_background_noise_") {
            executeCommand(predictedCommand);
          }
        },
        {
          probabilityThreshold: 0.75,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.5,
        }
      );
    } else {
      statusDiv.textContent = "正在监听中文命令...";

      await transferRecognizer.listen(
        async (result) => {
          const scores = result.scores;
          const words = transferRecognizer.wordLabels();

          // 找到最高分的命令
          let maxScore = 0;
          let predictedCommand = "";
          for (let i = 0; i < words.length; i++) {
            const currentScore = Number(scores[i]);
            if (currentScore > maxScore) {
              maxScore = currentScore;
              predictedCommand = words[i];
            }
          }

          resultDiv.innerHTML = `
            <div>识别结果: <strong>${predictedCommand}</strong></div>
            <div>置信度: ${(maxScore * 100).toFixed(1)}%</div>
          `;

          // 执行对应命令（如果不是背景噪音）
          if (predictedCommand !== "_background_noise_") {
            executeCommand(predictedCommand);
          }
        },
        {
          probabilityThreshold: 0.75,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.5,
        }
      );
    }
  } catch (error) {
    console.error("识别错误:", error);
    statusDiv.textContent = `识别错误: ${(error as Error).message}`;
    statusDiv.style.color = "red";
    startButton.disabled = false;
    stopButton.disabled = true;
  }
});

// 停止识别
stopButton.addEventListener("click", async () => {
  try {
    if (isEnglishMode) {
      await baseRecognizer.stopListening();
    } else {
      await transferRecognizer.stopListening();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = "已停止监听";
  } catch (error) {
    console.error("停止失败:", error);
    statusDiv.textContent = `停止失败: ${(error as Error).message}`;
    statusDiv.style.color = "red";
  }
});

// 执行识别到的命令
function executeCommand(command: string) {
  switch (command) {
    case "打开":
    case "open":
      console.log("执行打开操作");
      break;
    case "关闭":
    case "close":
      console.log("执行关闭操作");
      break;
    case "开始":
    case "start":
      console.log("执行开始操作");
      break;
    case "停止":
    case "stop":
      console.log("执行停止操作");
      break;
    case "左转":
    case "left":
      console.log("执行左转操作");
      break;
    case "右转":
    case "right":
      console.log("执行右转操作");
      break;
    default:
      console.log(`未知命令: ${command}`);
  }
}

// 初始化应用
init();
