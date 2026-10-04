export const sendTemplateEmail = (...args: unknown[]) => (globalThis as any).__sendEmail(...args);
