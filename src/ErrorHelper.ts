type HandlerFunction = (error: Error, ctx: any) => Promise<boolean> | boolean;
type CatchOptions = {
  retry?: boolean,
  retryDelay?: number
}

class HWCError extends Error {
  constructor(
    public readonly code: number,
    public readonly description: string,
    public readonly error: Error
  ) {
    super(`HWC Error: ${description}`);
  }
}

function sleep(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

export const Catch = (errorType: any, handler: HandlerFunction, options?: CatchOptions): any => {
  async function handleError(ctx: any, errorType: any, handler: HandlerFunction, error: Error): Promise<boolean> {
    if (typeof handler === "function" && error instanceof errorType) {
      const result = handler.call(null, error, ctx);
      if (typeof result !== "undefined" && result instanceof Promise) {
        return await result;
      }
      return result;
    } else {
      switch ((error as any).code) {
        // @ts-ignore
        case 402: {
          throw new HWCError(402,"Signature rejected by user", error);
        }
        case 403:
        case 423: {
          throw new HWCError(403,"Wallet is closed or locked", error);
        }
        default: {
          throw new HWCError((error as any).code || 500,"WalletConnect error", error);
        }
      }
    }
  }

  function generateDescriptor(
    descriptor: PropertyDescriptor,
    errorType: any,
    handler: HandlerFunction
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      let isRetry = false;
      try {
        const result = originalMethod.apply(this, args);

        if (result && result instanceof Promise) {
          return result.catch(async (error: any) => {
            const canRetry = await handleError(this, errorType, handler, error);
            if (options?.retry && canRetry) {
              isRetry = true;
              if (options.retryDelay) {
                await sleep(options.retryDelay);
              }
              return originalMethod.apply(this, args);
            }
          });
        }

        return result;
      } catch (error: any) {
        if (!isRetry) {
          handleError(this, errorType, handler, error).then(async (canRetry) => {
            if (options?.retry && canRetry) {
              if (options.retryDelay) {
                await sleep(options.retryDelay);
              }
              return originalMethod.apply(this, args);
            }
          });
        } else {
          throw error;
        }
      }
    };

    return descriptor;
  }

  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    if (descriptor) {
      // Method descriptor
      return generateDescriptor(descriptor, errorType, handler);
    } else {
      // Iterate over class properties except constructor
      Reflect.ownKeys(target.prototype)
        .filter(prop => prop !== "constructor")
        .forEach((propertyName) => {
          const desc = Object.getOwnPropertyDescriptor(target.prototype, propertyName)!;
          if (desc.value instanceof Function) {
            Object.defineProperty(
              target.prototype,
              propertyName,
              generateDescriptor(desc, errorType, handler)
            );
          }
        });
    }
  };
};

export const CatchAll = (handler: HandlerFunction, options?: CatchOptions): any => Catch(Error, handler, options);