import { Request, Response, NextFunction } from 'express';
import { UserLoader, UserByEmailLoader } from './user-loader';
import { ConversationLoader, UserConversationsLoader } from './conversation-loader';
import { SubscriptionLoader } from './subscription-loader';
import { AudioLoader, ConversationAudiosLoader } from './audio-loader';

export interface LoaderContext {
  userLoader: UserLoader;
  userByEmailLoader: UserByEmailLoader;
  conversationLoader: ConversationLoader;
  userConversationsLoader: UserConversationsLoader;
  audioLoader: AudioLoader;
  conversationAudiosLoader: ConversationAudiosLoader;
  subscriptionLoader: SubscriptionLoader;
}

export function createLoaderContext(): LoaderContext {
  return {
    userLoader: new UserLoader(),
    userByEmailLoader: new UserByEmailLoader(),
    conversationLoader: new ConversationLoader(),
    userConversationsLoader: new UserConversationsLoader(),
    audioLoader: new AudioLoader(),
    conversationAudiosLoader: new ConversationAudiosLoader(),
    subscriptionLoader: new SubscriptionLoader()
  };
}

// Extend Express Request type to include loaders
declare global {
  namespace Express {
    interface Request {
      loaders?: LoaderContext;
    }
  }
}

/**
 * Middleware to attach loaders to request
 */
export const loaderMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.loaders = createLoaderContext();
  next();
};