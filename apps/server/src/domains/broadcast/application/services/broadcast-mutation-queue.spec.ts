import { BroadcastMutationQueue } from './broadcast-mutation-queue';

describe('BroadcastMutationQueue', () => {
  it('commits source mutations in invocation order', async () => {
    const queue = new BroadcastMutationQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run('account-1', async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
      return 'first';
    });
    const second = queue.run('account-1', () => {
      order.push('second');
      return Promise.resolve('second');
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      'first',
      'second',
    ]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });
});
