export class BroadcastSourceEpochMismatchError extends Error {
  constructor() {
    super('Broadcast source epoch has changed.');
    this.name = 'BroadcastSourceEpochMismatchError';
  }
}
