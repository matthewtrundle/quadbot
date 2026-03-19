import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    events: [
      {
        type: 'recommendation.created',
        description: 'A new recommendation has been generated',
        payload_example: {
          event: 'recommendation.created',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: {
            id: 'uuid',
            title: 'Optimize meta descriptions for top 10 pages',
            priority: 'high',
            confidence: 0.85,
            roi_score: 7.2,
          },
        },
      },
      {
        type: 'action_draft.created',
        description: 'A new action draft is ready for review',
        payload_example: {
          event: 'action_draft.created',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: { id: 'uuid', type: 'content_update', risk: 'low' },
        },
      },
      {
        type: 'action_draft.approved',
        description: 'An action draft has been approved',
        payload_example: {
          event: 'action_draft.approved',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: { id: 'uuid', type: 'content_update' },
        },
      },
      {
        type: 'action_draft.rejected',
        description: 'An action draft has been rejected',
        payload_example: {
          event: 'action_draft.rejected',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: { id: 'uuid', type: 'content_update' },
        },
      },
      {
        type: 'action.executed',
        description: 'An action has been executed',
        payload_example: {
          event: 'action.executed',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: { id: 'uuid', type: 'content_update', result: 'success' },
        },
      },
      {
        type: 'outcome.collected',
        description: 'An outcome measurement has been recorded',
        payload_example: {
          event: 'outcome.collected',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: { id: 'uuid', metric_name: 'ctr', delta: 0.15 },
        },
      },
      {
        type: 'report.generated',
        description: 'A client report has been generated',
        payload_example: {
          event: 'report.generated',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: {
            id: 'uuid',
            title: 'March Report',
            period_start: '2026-03-01',
            period_end: '2026-03-31',
          },
        },
      },
      {
        type: 'signal.created',
        description: 'A new cross-brand signal has been discovered',
        payload_example: {
          event: 'signal.created',
          brand_id: 'uuid',
          timestamp: '2026-03-19T12:00:00Z',
          data: {
            id: 'uuid',
            title: 'Rising trend in video content engagement',
            confidence: 0.78,
          },
        },
      },
    ],
    webhook_format: {
      description: 'All webhooks are sent as HTTP POST requests with JSON body',
      headers: {
        'Content-Type': 'application/json',
        'X-QuadBot-Signature': 'HMAC-SHA256 signature of the request body using your webhook secret',
        'X-QuadBot-Event': 'The event type (e.g., recommendation.created)',
      },
      verification:
        'Verify the X-QuadBot-Signature header by computing HMAC-SHA256 of the raw request body with your webhook secret',
    },
  });
}
