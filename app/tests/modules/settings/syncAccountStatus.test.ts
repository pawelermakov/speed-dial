import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ contains: vi.fn(), get: vi.fn() }));
const api = {
  permissions: { contains: state.contains },
  identity: { getProfileUserInfo: state.get },
};
import { syncStatus } from '../../../modules/settings/adapters/api/syncAccountStatus';
beforeEach(() => {
  state.contains.mockReset().mockResolvedValue(true);
  state.get.mockReset();
});
describe('browser account Sync status', () => {
  it('reports SYNC profile as enabled without persisting identity', async () => {
    state.get.mockResolvedValue({ id: 'private', email: 'private@example.com' });
    expect(await syncStatus(api, false)).toEqual({
      status: 'enabled',
      email: 'private@example.com',
    });
    expect(state.get).toHaveBeenCalledWith({ accountStatus: 'SYNC' });
  });
  it('reports confirmed empty profile as disabled', async () => {
    state.get.mockResolvedValue({ id: '', email: '' });
    expect(await syncStatus(api, false)).toEqual({ status: 'disabled', email: '' });
  });
  it('reports missing permission, malformed response, or rejection as unknown', async () => {
    state.contains.mockResolvedValueOnce(false);
    expect(await syncStatus(api, false)).toEqual({ status: 'unknown', email: '' });
    state.get.mockResolvedValueOnce({});
    expect(await syncStatus(api, false)).toEqual({ status: 'unknown', email: '' });
    state.get.mockRejectedValueOnce(new Error('denied'));
    expect(await syncStatus(api, false)).toEqual({ status: 'unknown', email: '' });
  });
  it('omits absent email and discards email without a Sync account', async () => {
    state.get.mockResolvedValueOnce({ id: 'private' });
    expect(await syncStatus(api, false)).toEqual({ status: 'enabled', email: '' });
    state.get.mockResolvedValueOnce({ id: '', email: 'private@example.com' });
    expect(await syncStatus(api, false)).toEqual({ status: 'disabled', email: '' });
  });
  it('Firefox never claims Sync is off', async () => {
    expect(await syncStatus(api, true)).toEqual({ status: 'unavailable', email: '' });
    expect(state.get).not.toHaveBeenCalled();
    expect(state.contains).not.toHaveBeenCalled();
  });
});
