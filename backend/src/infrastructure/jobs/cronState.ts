export type CronHealthState = {
  lastTickAt: string | null;
  lastError: string | null;
  lastPromoted: number;
  lastAlerted: number;
};

export const cronHealth: CronHealthState = {
  lastTickAt: null,
  lastError: null,
  lastPromoted: 0,
  lastAlerted: 0,
};
