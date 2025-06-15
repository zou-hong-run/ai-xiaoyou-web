import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import { PixelateFilter } from "@pixi/filter-pixelate";
import { OutlineFilter } from "@pixi/filter-outline";
import { AsciiFilter } from "@pixi/filter-ascii";
import { AlphaFilter } from "@pixi/filter-alpha";
import { CRTFilter } from "@pixi/filter-crt";
import { NoiseFilter } from "@pixi/filter-noise";

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

interface HeadMotion {
  baseAngle: number;
  currentAngle: number;
  targetAngle: number;
  maxAngle: number;
  returnSpeed: number;
  isReturning: boolean;
  direction: number;
  beatInProgress: boolean;
}

interface MouthMotion {
  currentOpen: number;
  targetOpen: number;
  maxOpen: number;
  decayRate: number;
}

interface BeatConfig {
  threshold: number;
  frequencyRange: [number, number];
  lastBeatTime: number;
  beatCount: number;
  beatInterval: number;
  energyHistory: number[];
  historyLength: number;
  decayRate: number;
  energyPeak: number;
}

// ==================== 全局变量 ====================
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
    scale: 0.7,
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

const beatConfig: BeatConfig = {
  threshold: 0.35,
  frequencyRange: [60, 150],
  lastBeatTime: 0,
  beatCount: 0,
  beatInterval: 120,
  energyHistory: [],
  historyLength: 30,
  decayRate: 0.96,
  energyPeak: 0,
};

const headMotion: HeadMotion = {
  baseAngle: 0,
  currentAngle: 0,
  targetAngle: 0,
  maxAngle: 10,
  returnSpeed: 0.25,
  isReturning: true,
  direction: -1,
  beatInProgress: false,
};

const mouthMotion: MouthMotion = {
  currentOpen: 0,
  targetOpen: 0,
  maxOpen: 1.0,
  decayRate: 0.15,
};

let currentFilter: FilterType = "none";
let activeFilters: PIXI.Filter[] = [];
let currentChooseModel: ModelOption = modelOptions[1];
let app: PIXI.Application;
let currentModel: Live2DModel;
let audioContext: AudioContext;
let analyser: AnalyserNode;
let microphone: MediaStreamAudioSourceNode;
let frequencyData: Uint8Array;
let timeDomainData: Uint8Array;
let spectrumContainer: PIXI.Container;
let spectrumBars: PIXI.Graphics[] = [];
let waveformContainer: PIXI.Container;
let waveformGraphics: PIXI.Graphics;

// ==================== 核心功能 ====================

/**
 * 初始化应用
 */
async function init() {
  const canvasEle = document.querySelector("canvas");
  if (!canvasEle) return;

  createModelSelector();
  Live2DModel.registerTicker(PIXI.Ticker);

  app = new PIXI.Application({
    view: canvasEle,
    autoStart: true,
    resizeTo: window,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio,
  });

  await loadModel(currentChooseModel);
  initVisualization();
  setupAudioAnalysis();
  setupEventListeners();
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
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let baseScale = scale;
  model.interactive = false;

  if (isMobile) {
    baseScale = baseScale * 0.5;
    model.scale.set(baseScale);
    model.position.set(width / 4, height / 3.8);
  } else {
    model.scale.set(baseScale);
    model.position.set(width / 2, height * (isMobile ? 0.6 : 0.55));
  }
  model.anchor.set(0.5, 0.5);
}

/**
 * 更新头部动作
 */
function updateHeadMotion(model: Live2DModel) {
  const coreModel = model.internalModel.coreModel as any;
  if (headMotion.isReturning) {
    headMotion.currentAngle +=
      (headMotion.targetAngle - headMotion.currentAngle) *
      headMotion.returnSpeed;

    if (Math.abs(headMotion.currentAngle) < 0.5) {
      headMotion.currentAngle = headMotion.baseAngle;
    }
  } else {
    headMotion.currentAngle = headMotion.targetAngle;
  }

  const headParams = ["PARAM_ANGLE_Z", "ParamAngleZ", "ParamHeadZ", "AngleZ"];
  for (let param of headParams) {
    coreModel?.setParameterValueById(param, headMotion.currentAngle);
    model.angle = -headMotion.currentAngle / 8;
  }
}

/**
 * 更新嘴巴动作
 */
function updateMouthMotion(model: Live2DModel) {
  const coreModel = model.internalModel.coreModel as any;
  mouthMotion.currentOpen +=
    (mouthMotion.targetOpen - mouthMotion.currentOpen) * mouthMotion.decayRate;

  const mouthParams = ["PARAM_MOUTH_OPEN_Y", "ParamMouthOpenY", "MouthOpenY"];
  for (let param of mouthParams) {
    coreModel.setParameterValueById(param, mouthMotion.currentOpen);
  }

  mouthMotion.targetOpen *= 0.9;
}

// ==================== 音频分析 ====================

/**
 * 设置音频分析
 */
async function setupAudioAnalysis() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeDomainData = new Uint8Array(analyser.frequencyBinCount);

    function analyzeAudio() {
      analyser.getByteFrequencyData(frequencyData);
      analyser.getByteTimeDomainData(timeDomainData);
      detectBeat();
      updateSpectrumVisualization();
      updateWaveformVisualization();
      requestAnimationFrame(analyzeAudio);
    }
    analyzeAudio();
  } catch (error) {
    console.error("麦克风访问失败:", error);
    setInterval(() => simulateBeat(), 600 + Math.random() * 300);
  }
}

/**
 * 检测节拍
 */
function detectBeat() {
  const now = Date.now();
  const lowFreqRange = [60, 200];
  const minBin = Math.floor(
    lowFreqRange[0] / (audioContext.sampleRate / analyser.fftSize)
  );
  const maxBin = Math.floor(
    lowFreqRange[1] / (audioContext.sampleRate / analyser.fftSize)
  );

  let lowEnergy = 0;
  for (let i = minBin; i <= maxBin; i++) {
    lowEnergy += frequencyData[i] / 255;
  }
  lowEnergy /= maxBin - minBin + 1;

  if (beatConfig.energyHistory.length > 0) {
    const lastEnergy =
      beatConfig.energyHistory[beatConfig.energyHistory.length - 1];
    lowEnergy = Math.max(lowEnergy, lastEnergy * beatConfig.decayRate);
  }

  beatConfig.energyPeak = Math.max(beatConfig.energyPeak * 0.99, lowEnergy);
  beatConfig.energyHistory.push(lowEnergy);

  if (beatConfig.energyHistory.length > beatConfig.historyLength) {
    beatConfig.energyHistory.shift();
  }

  const dynamicThreshold = Math.max(
    beatConfig.threshold,
    beatConfig.energyPeak * 0.6
  );

  const energyChange = lowEnergy - (beatConfig.energyHistory[0] || 0);
  if (
    lowEnergy > dynamicThreshold &&
    energyChange > dynamicThreshold * 0.3 &&
    now - beatConfig.lastBeatTime > beatConfig.beatInterval
  ) {
    handleBeatDetection(now, lowEnergy);
  }
}

/**
 * 处理节拍检测
 */
function handleBeatDetection(timestamp: number, energy: number) {
  if (headMotion.beatInProgress) return;

  beatConfig.lastBeatTime = timestamp;
  beatConfig.beatCount++;
  const intensity = Math.min(1.5, energy / beatConfig.threshold);
  headMotion.direction *= -1;

  headMotion.beatInProgress = true;
  headMotion.targetAngle =
    headMotion.maxAngle * headMotion.direction * intensity;
  headMotion.isReturning = false;
  mouthMotion.targetOpen = mouthMotion.maxOpen * intensity;

  setTimeout(() => {
    headMotion.isReturning = true;
    setTimeout(() => {
      headMotion.beatInProgress = false;
    }, 100);
  }, 200);

  console.log(
    `节拍 ${beatConfig.beatCount}: ${
      headMotion.direction > 0 ? "右" : "左"
    } (强度: ${intensity.toFixed(2)})`
  );
}

/**
 * 模拟节拍（用于测试）
 */
function simulateBeat() {
  const now = Date.now();
  const simulatedEnergy = 0.5 + Math.random() * 0.3;
  handleBeatDetection(now, simulatedEnergy);
}

// ==================== 可视化 ====================

/**
 * 初始化可视化元素
 */
function initVisualization() {
  spectrumContainer = new PIXI.Container();
  waveformContainer = new PIXI.Container();
  app.stage.addChild(spectrumContainer);
  app.stage.addChild(waveformContainer);

  const barCount = 64;
  for (let i = 0; i < barCount; i++) {
    const bar = new PIXI.Graphics();
    spectrumBars.push(bar);
    spectrumContainer.addChild(bar);
  }

  waveformGraphics = new PIXI.Graphics();
  waveformContainer.addChild(waveformGraphics);
}

/**
 * 更新频谱可视化
 */
function updateSpectrumVisualization() {
  const barCount = spectrumBars.length;
  const barWidth = 8;
  const maxBarHeight = 100;
  const spacing = 2;

  for (let i = 0; i < barCount; i++) {
    const barIndex = Math.floor((i / barCount) * frequencyData.length);
    const value = frequencyData[barIndex] / 255;
    const barHeight = value * maxBarHeight;

    const bar = spectrumBars[i];
    bar.clear();

    const greenValue = Math.min(255, 100 + value * 155);
    bar.beginFill(PIXI.utils.rgb2hex([0, greenValue / 255, 0]));
    bar.drawRect(i * (barWidth + spacing), -barHeight, barWidth, barHeight);
    bar.endFill();
  }
}

/**
 * 更新波形可视化
 */
function updateWaveformVisualization() {
  const width = 500;
  const height = 100;

  waveformGraphics.clear();
  waveformGraphics.lineStyle(2, 0x00ff00);

  for (let i = 0; i < timeDomainData.length; i++) {
    const x = (i / timeDomainData.length) * width;
    const y = ((timeDomainData[i] / 128.0) * height) / 2;

    if (i === 0) {
      waveformGraphics.moveTo(x, y);
    } else {
      waveformGraphics.lineTo(x, y);
    }
  }
}

/**
 * 更新可视化元素位置
 */
function updateVisualizationPositions(width: number, height: number) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let spectrumScale = 0.8;
  let spectrumY = 0.9;
  let waveformScale = 1;
  let waveformY = 0.05;

  if (isMobile) {
    spectrumScale = spectrumScale * 0.5;
    spectrumY = spectrumY * 0.5;
    waveformScale = waveformScale * 0.5;
    waveformY = waveformY * 0.5;

    spectrumContainer.position.set(width / 40, height * spectrumY);
    spectrumContainer.scale.set(1);
    waveformContainer.position.set(width / 15, height * waveformY * 0.5);
    waveformContainer.scale.set(waveformScale);
  } else {
    spectrumContainer.position.set(0, height * spectrumY);
    spectrumContainer.scale.set(spectrumScale);
    waveformContainer.position.set(0, height * waveformY);
    waveformContainer.scale.set(waveformScale);
  }
}

// ==================== UI控制 ====================

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
    updateVisualizationPositions(app.screen.width, app.screen.height);
  });

  // 窗口大小调整
  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    if (currentModel) {
      setupModelPosition(
        { model: currentModel, scale: currentChooseModel.scale },
        app
      );
    }
    updateVisualizationPositions(app.screen.width, app.screen.height);
  });
}

// ==================== 启动应用 ====================
init();
