import { isValidUpdateJobId } from './update-handoff.service';

describe('update handoff security', () => {
  it('only accepts UUID-shaped unit instance identifiers', () => {
    expect(isValidUpdateJobId('123e4567-e89b-42d3-a456-426614174000')).toBe(
      true,
    );
    expect(isValidUpdateJobId('../yeen.service')).toBe(false);
    expect(isValidUpdateJobId('job;systemctl stop yeen')).toBe(false);
  });
});
