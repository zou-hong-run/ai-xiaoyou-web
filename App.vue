<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';
window.PIXI = PIXI;

const liveCanvas = ref(null);
let app;
const models = ref([]);

// 模型路径和对应的名称
const modelConfigs = [
  { path: '../public/model/simple/simple.model3.json', name: 'Simple' }
  // { path: '../public/model/Haru/Haru.model3.json', name: 'Haru' },
  // { path: '../public/model/Hiyori/Hiyori.model3.json', name: 'Hiyori' },
  // { path: '../public/model/Mao/Mao.model3.json', name: 'Mao' },
  // { path: '../public/model/Mark/Mark.model3.json', name: 'Mark' },
  // { path: '../public/model/Natori/Natori.model3.json', name: 'Natori' },
  // { path: '../public/model/Rice/Rice.model3.json', name: 'Rice' },
  // { path: '../public/model/Wanko/Wanko.model3.json', name: 'Wanko' },
  // { path: '../public/model/nito/ni-j.model3.json', name: 'Ni-j' },
  // { path: '../public/model/nito/nico.model3.json', name: 'Nico' },
  // { path: '../public/model/nito/nietzsche.model3.json', name: 'Nietzsche' },
  // { path: '../public/model/nito/nipsilon.model3.json', name: 'Nipsilon' },
  // { path: '../public/model/nito/nito.model3.json', name: 'Nito' }
];
// 眼球跟随逻辑
const updateEyeTracking = (event, model) => {
  const coreModel = model.internalModel.coreModel;
  const rect = liveCanvas.value.getBoundingClientRect();

  // 计算鼠标在画布上的相对位置 (-1 ~ 1)
  const mouseX = (event.data.global.x - rect.width / 2) / (rect.width / 2);
  const mouseY = (event.data.global.y - rect.height / 2) / (rect.height / 2);

  // 1. 眼球跟随（X/Y轴）
  coreModel.setParameterValueById('PARAM_EYE_BALL_X', mouseX * 0.8); // 水平灵敏度80%
  coreModel.setParameterValueById('PARAM_EYE_BALL_Y', -mouseY * 0.5); // 垂直灵敏度50%（Y轴取反）

  // 2. 头部旋转（PARAM_ANGLE_Z）
  const headAngle = mouseX * 30; // 控制旋转幅度 (-15° ~ 15°)
  coreModel.setParameterValueById('PARAM_ANGLE_Z', headAngle);

  // 3. 嘴巴开合（可选）
  const mouthValue = 0.3 + Math.abs(mouseX) * 0.7; // 根据头部转动幅度控制嘴巴
  coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', mouthValue);
};
onMounted(async () => {
  // 设置画布大小为窗口的80%
  const canvasWidth = window.innerWidth * 0.8;
  const canvasHeight = window.innerHeight * 0.8;

  app = new PIXI.Application({
    view: liveCanvas.value,
    autoStart: true,
    width: canvasWidth,
    height: canvasHeight,
    backgroundAlpha: 0.1,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    antialias: true
  });

  // 加载所有模型
  for (const config of modelConfigs) {
    try {
      const model = await Live2DModel.from(config.path);
      models.value.push({ model, name: config.name });

      // 添加模型到舞台
      app.stage.addChild(model);

      // 创建名称标签
      const nameText = new PIXI.Text(config.name, {
        fontFamily: 'Arial',
        fontSize: 16,
        fill: 0xffffff,
        align: 'center',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 2
      });
      app.stage.addChild(nameText);

      // 设置模型和标签的位置
      const columns = 4;
      const index = models.value.length - 1;
      const row = Math.floor(index / columns);
      const col = index % columns;

      const spacingX = canvasWidth / columns;
      const spacingY = canvasHeight / Math.ceil(modelConfigs.length / columns);

      model.scale.set(0.5);
      model.x = spacingX * col + spacingX * 0.5;
      model.y = spacingY * row + spacingY * 0.3;

      nameText.anchor.set(0.5);
      nameText.x = model.x;
      nameText.y = model.y + 100; // 标签放在模型下方

      // 添加交互
      model.on('hit', hitAreas => {
        console.log(`${config.name}被点击:`, hitAreas);
        model.motion('Tap');
        model.expression();
      });
      model.on('pointermove', event => {
        updateEyeTracking(event, model);
      });
    } catch (error) {
      console.error(`加载模型${config.name}失败:`, error);
    }
  }

  // let index = 1;
  // setInterval(() => {
  //   let markModel = models.value.find(item => item.name == 'Mark');
  //   markModel.model.motion(`Idle6`);
  //   // markModel.model.motion(`Idle${index}`);
  //   // console.log(`Idle${index}`, 'Idle');
  //   // index++;
  //   // if (index == 7) index = 1;
  // }, 2000);

  // let targetMouthValue = 0; // 目标值
  // let currentMouthValue = 0; // 当前值

  // setInterval(() => {
  //   const markModel = models.value.find(item => item.name === 'Simple');
  //   if (!markModel?.model?.internalModel?.coreModel) return;

  //   // 生成目标值（0~1）
  //   targetMouthValue = Math.random();

  //   // 线性插值（每次向目标值靠近30%）
  //   currentMouthValue = currentMouthValue * 0.7 + targetMouthValue * 0.3;

  //   // 设置参数
  //   markModel.model.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', currentMouthValue);
  // }, 50); // 更短的间隔（50ms）让动画更流畅

  let time = 0;
  let headAngle = 0;
  let isTilting = false;
  const coreModel = models.value.find(item => item.name === 'Simple').model.internalModel.coreModel;
  const paramIds = coreModel.getModel().parameters.ids;
  // console.log('所有参数:', paramIds);

  // setInterval(() => {
  //   const markModel = models.value.find(item => item.name === 'Simple');
  //   if (!markModel?.model?.internalModel?.coreModel) return;

  //   const coreModel = markModel.model.internalModel.coreModel;

  //   // 1. 嘴巴动作（正弦波优化）
  //   time += 0.1; // 减慢时间增量使动作更自然
  //   const mouthValue = 0.3 + 0.3 * Math.sin(time * 2 * Math.PI * 0.2); // 幅度减小
  //   coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', mouthValue);

  //   // 2. 头部动作（平滑过渡）
  //   if (!isTilting && Math.random() < 0.02) {
  //     // 2%概率触发摇头
  //     isTilting = true;
  //     const targetAngle = headAngle > 0 ? -30 : 30; // 交替方向

  //     // 使用GSAP或自定义缓动函数
  //     const tiltDuration = 1000; // 摇头持续时间(ms)
  //     const startTime = Date.now();

  //     const animateTilt = () => {
  //       const elapsed = Date.now() - startTime;
  //       const progress = Math.min(elapsed / tiltDuration, 1);
  //       // 缓动函数（easeOutSine）
  //       headAngle = targetAngle * Math.sin((progress * Math.PI) / 2);
  //       coreModel.setParameterValueById('PARAM_ANGLE_Z', headAngle);

  //       if (progress < 1) {
  //         requestAnimationFrame(animateTilt);
  //       } else {
  //         isTilting = false;
  //       }
  //     };

  //     animateTilt();
  //   }
  // }, 50);
  // 设置舞台交互
  app.stage.interactive = true;
  app.stage.hitArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight);
});

onBeforeUnmount(() => {
  models.value.forEach(({ model }) => model?.destroy());
  app?.destroy();
});
</script>

<template>
  <div class="container">
    <canvas ref="liveCanvas" class="live2d-canvas"></canvas>
  </div>
</template>

<style scoped>
.container {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
}

.live2d-canvas {
  width: 80vw;
  height: 80vh;
  border: 2px solid #333;
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
}
</style>
