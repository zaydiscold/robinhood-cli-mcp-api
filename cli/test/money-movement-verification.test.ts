import {afterEach,describe,it,expect,vi} from 'vitest';
import {advanceMoneyMovementVerification} from '../src/money-movement-verification.js';
const workflowId='11111111-1111-4111-8111-111111111111';
const screen={route:{replace:{screen:{name:'DEVICE_APPROVAL_CHALLENGE',blockId:'block-a',deviceApprovalChallengeScreenParams:{identiFrameworkEnabled:false,sheriffChallenge:{id:'challenge-a'}}}}}};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(responses:unknown[]){vi.stubEnv('ROBINHOOD_BROKERAGE_TOKEN','synthetic-test-token');const f=vi.fn().mockImplementation(async()=>new Response(JSON.stringify(responses.shift()),{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',f);return f;}
describe('session-bound verification continuation',()=>{
 it('does not confuse an issued challenge with approval',async()=>{const f=setup([screen,{status:'issued'}]);const r=await advanceMoneyMovementVerification({workflowId});expect(r.approved).toBe(false);expect(r.status).toBe('issued');expect(f).toHaveBeenCalledTimes(2);});
 it('performs proceed only after the server validates the challenge',async()=>{const f=setup([screen,{status:'validated'},{route:{exit:{status:'WORKFLOW_STATUS_APPROVED'}}}]);const r=await advanceMoneyMovementVerification({workflowId});expect(r.approved).toBe(true);expect(r.submitted).toBe(false);expect(JSON.parse(f.mock.calls[2][1].body).deviceApprovalChallengeAction).toEqual({proceed:{}});});
 it('keeps expired challenges unapproved without automatic resends',async()=>{const f=setup([screen,{status:'expired'}]);expect((await advanceMoneyMovementVerification({workflowId})).approved).toBe(false);expect(f).toHaveBeenCalledTimes(2);});
 it('validates the identifier before touching the network',async()=>{const f=setup([]);await expect(advanceMoneyMovementVerification({workflowId:'bad/id'})).rejects.toThrow(/Invalid/);expect(f).not.toHaveBeenCalled();});
});
