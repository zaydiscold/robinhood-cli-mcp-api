import {describe,it,expect} from 'vitest';
import {applyBankTransferChoice} from '../src/bank-transfer-choice.js';
describe('bank pre-create choices',()=>{
 it('preserves original request identity and selects the requested rail',()=>{
 const b={id:'request-a',amount:'1.00',additional_data:{entry_point:5}};
 expect(applyBankTransferChoice(b,[{type:'rfp_upsell'}],'bank_standard')).toEqual({...b,additional_data:{entry_point:5,is_instant_transfer:false}});
 expect(applyBankTransferChoice(b,[{type:'rfp_upsell'}],'bank_instant')).toEqual({...b,additional_data:{entry_point:5,is_instant_transfer:true}});
 expect(b.additional_data).toEqual({entry_point:5});
 });
 it('does not bypass non-optional approvals or invent instant eligibility',()=>{
 expect(()=>applyBankTransferChoice({},[{type:'trust_transfer_guardrail'}],'bank_standard')).toThrow(/required/);
 expect(()=>applyBankTransferChoice({},[],'bank_instant')).toThrow(/did not offer/);
 expect(()=>applyBankTransferChoice({},[{type:'rtp_upsell'}],'bank_instant')).toThrow(/did not offer/);
 });
});
