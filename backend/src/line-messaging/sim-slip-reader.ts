import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { Carrier } from './line-sim-parse';
import { platformSecret } from '../platform-secrets/platform-secrets';

/** What a screenshot of a carrier dealer app shows after a top-up or package sale. */
export interface SlipReading {
  carrier: Carrier | null;
  amount: number | null;
  balanceAfter: number | null;
  phone: string | null;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isSaleScreen', 'carrier', 'amount', 'balanceAfter', 'phone'],
  properties: {
    isSaleScreen: { type: 'boolean', description: 'True only for a dealer app screen confirming one top-up or package sale' },
    carrier: { type: ['string', 'null'], enum: ['AIS', 'TRUE', 'DTAC', 'NT', null] },
    amount: { type: ['number', 'null'], description: 'Price of the top-up / package sold, in baht' },
    balanceAfter: { type: ['number', 'null'], description: 'Dealer wallet balance left after this transaction, in baht' },
    phone: { type: ['string', 'null'], description: 'Customer mobile number, digits only' },
  },
} as const;

const PROMPT = [
  'This is a screenshot a phone-shop employee took in a Thai mobile carrier dealer app',
  '(AIS / One-2-Call, dtac, TrueMove H, or NT/my) right after selling a top-up or data package.',
  'Read the carrier, the amount sold, the dealer wallet balance left after the sale, and the',
  "customer's mobile number. Use null for anything the screen does not show clearly. Never guess.",
].join(' ');

/** Reads carrier dealer screenshots with Claude. Off until an AI key is set (Super Admin or ANTHROPIC_API_KEY). */
export class SimSlipReader {
  private readonly logger = new Logger(SimSlipReader.name);
  private client: Anthropic | null = null;
  private clientKey = '';

  get enabled(): boolean {
    return !!platformSecret('ANTHROPIC_API_KEY');
  }

  async read(image: Buffer, contentType: string): Promise<SlipReading | null> {
    if (!this.enabled) return null;
    const mediaType = (['image/png', 'image/webp', 'image/gif'].includes(contentType) ? contentType : 'image/jpeg') as
      'image/png' | 'image/webp' | 'image/gif' | 'image/jpeg';
    const apiKey = platformSecret('ANTHROPIC_API_KEY');
    if (!this.client || this.clientKey !== apiKey) {
      this.client = new Anthropic({ apiKey });
      this.clientKey = apiKey;
    }
    try {
      const response = await this.client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
            { type: 'text', text: PROMPT },
          ],
        }],
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') return null;
      const r = JSON.parse(text.text) as SlipReading & { isSaleScreen: boolean };
      if (!r.isSaleScreen) return null;
      const phone = r.phone?.replace(/\D/g, '') ?? null;
      return {
        carrier: r.carrier ?? null,
        amount: typeof r.amount === 'number' && r.amount > 0 ? r.amount : null,
        balanceAfter: typeof r.balanceAfter === 'number' && r.balanceAfter >= 0 ? r.balanceAfter : null,
        phone: phone && /^0[689]\d{8}$/.test(phone) ? phone : null,
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) this.logger.warn(`Slip reading failed: HTTP ${err.status} ${err.message}`);
      else this.logger.warn(`Slip reading failed: ${(err as Error).message}`);
      return null;
    }
  }
}
