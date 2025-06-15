/// <reference types="vite/client" />

// import * as tf from "@tensorflow/tfjs";
// import * as speechCommands from "@tensorflow-models/speech-commands";

// declare module "@tensorflow-models/speech-commands" {
//   interface SpeechCommandRecognizer {
//     /**
//      * 加载序列化的训练样本
//      * @param examples 二进制数据 (ArrayBuffer)
//      */
//     loadExamples(examples: ArrayBuffer): Promise<void>;
//     /**
//      * 序列化当前训练样本
//      */
//     serializeExamples(): ArrayBuffer;
//     /**
//      * Collect an example for transfer learning via WebAudio.
//      *
//      * @param {string} word Name of the word. Must not overlap with any of the
//      *   words the base model is trained to recognize.
//      * @returns {SpectrogramData} The spectrogram of the acquired the example.
//      * @throws Error, if word belongs to the set of words the base model is
//      *   trained to recognize.
//      */
//     collectExample(
//       word: string,
//       options?: ExampleCollectionOptions
//     ): Promise<SpectrogramData>;
//   }
// }
