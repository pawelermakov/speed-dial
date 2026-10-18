import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ contains: vi.fn(), get: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { permissions: { contains: state.contains }, identity: { getProfileUserInfo: state.get } } }));
import { syncStatus } from '../services/sync';
beforeEach(() => { state.contains.mockReset().mockResolvedValue(true); state.get.mockReset(); });
describe('general Chrome Sync status', () => {
 it('reports SYNC profile as enabled without persisting identity', async () => { state.get.mockResolvedValue({ id: 'private', email: 'private@example.com' }); expect(await syncStatus(undefined,false)).toEqual({status:'enabled',email:'private@example.com'}); expect(state.get).toHaveBeenCalledWith({accountStatus:'SYNC'}); });
 it('reports confirmed empty profile as disabled', async () => { state.get.mockResolvedValue({id:'',email:''}); expect(await syncStatus(undefined,false)).toEqual({status:'disabled',email:''}); });
 it('reports missing permission, malformed response, or rejection as unknown', async () => { state.contains.mockResolvedValueOnce(false); expect(await syncStatus(undefined,false)).toEqual({status:'unknown',email:''}); state.get.mockResolvedValueOnce({}); expect(await syncStatus(undefined,false)).toEqual({status:'unknown',email:''}); state.get.mockRejectedValueOnce(new Error('denied')); expect(await syncStatus(undefined,false)).toEqual({status:'unknown',email:''}); });
 it('omits absent email and discards email without a Sync account', async()=>{state.get.mockResolvedValueOnce({id:'private'});expect(await syncStatus(undefined,false)).toEqual({status:'enabled',email:''});state.get.mockResolvedValueOnce({id:'',email:'private@example.com'});expect(await syncStatus(undefined,false)).toEqual({status:'disabled',email:''});});
 it('Firefox never claims Sync is off', async () => { expect(await syncStatus(undefined,true)).toEqual({status:'unsupported',email:''}); expect(state.get).not.toHaveBeenCalled(); });
});
