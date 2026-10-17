import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
    } else {
      this.logger.warn('OPENAI_API_KEY is not set. AI features will be disabled.');
    }
  }

  async generateTitle(topic: string, transcript?: string): Promise<string> {
    if (!this.openai) return topic;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant that generates catchy and professional titles for meeting recordings.',
          },
          {
            role: 'user',
            content: `Based on the meeting topic "${topic}" ${transcript ? `and the following transcript: "${transcript.substring(0, 3000)}..."` : ''}, generate a concise and engaging title (max 100 characters). Output only the title.`,
          },
        ],
      });

      return response.choices[0]?.message?.content?.replace(/"/g, '').trim() || topic;
    } catch (error) {
      this.logger.error(`Error generating AI title: ${error.message}`);
      return topic;
    }
  }

  async generateSummary(topic: string, transcript: string): Promise<string> {
    if (!this.openai || !transcript || transcript.length < 50) return '';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant that summarizes meeting recordings. Provide clear, structured notes including Objective, Key Discussion Points, and Action Items.',
          },
          {
            role: 'user',
            content: `Summarize the meeting "${topic}" based on this transcript: "${transcript.substring(0, 4000)}...". 
            Please use the following structure (Markdown):
            - **Objective**
            - **Key Points**
            - **Action Items**
            `,
          },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      this.logger.error(`Error generating AI summary: ${error.message}`);
      return '';
    }
  }

  async generateChapters(topic: string, transcript: string): Promise<string> {
    if (!this.openai || !transcript || transcript.length < 100) return '';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a video editor that creates YouTube chapters with timestamps based on meeting transcripts. Chapters must start at 00:00. Format: "MM:SS Title" or "HH:MM:SS Title". One per line.',
          },
          {
            role: 'user',
            content: `Create YouTube chapters for the meeting "${topic}" using this transcript: "${transcript.substring(0, 5000)}...".
            Important:
            - The first chapter MUST start at 00:00.
            - Provide at least 3 chapters if possible.
            - Use the format: 00:00 Introduction
            `,
          },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      this.logger.error(`Error generating AI chapters: ${error.message}`);
      return '';
    }
  }
}
