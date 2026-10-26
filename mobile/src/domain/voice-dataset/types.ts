/**
 * Recording prompts for the Personal Voice Studio.
 *
 * Every sentence is original and written for this app (no copyrighted text).
 * Numbers, dates and symbols are spelled out as words so that what the
 * speaker reads is exactly the transcript used for training.
 */

/** Each style becomes one speaker ID in the trained voice. */
export type StyleKey = 'natural' | 'friendly' | 'energetic' | 'professional' | 'calm' | 'storytelling';

export type PromptCategory =
  | 'bn' // everyday Bangla
  | 'bn_question' // Bangla questions
  | 'bn_numbers' // numbers, dates, money, time — written as words
  | 'en' // English
  | 'mixed' // Bangla with English words (Latin script)
  | 'style'; // style pack sentences

export type RecordingPrompt = {
  /** Stable forever: recordings and datasets refer to it. */
  id: string;
  style: StyleKey;
  category: PromptCategory;
  text: string;
};
