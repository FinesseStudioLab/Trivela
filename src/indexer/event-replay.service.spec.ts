import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventReplayService } from './event-replay.service';
import { WebhookEvent } from '../common/entities';
import { GithubWebhooksService } from '../github/github-webhooks.service';

describe('EventReplayService', () => {
  let service: EventReplayService;

  const mockWebhookEventRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const mockGithubWebhooks = {
    handleEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventReplayService,
        {
          provide: getRepositoryToken(WebhookEvent),
          useValue: mockWebhookEventRepo,
        },
        {
          provide: GithubWebhooksService,
          useValue: mockGithubWebhooks,
        },
      ],
    }).compile();

    service = module.get<EventReplayService>(EventReplayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
