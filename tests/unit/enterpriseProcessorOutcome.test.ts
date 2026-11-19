import {describe,it,expect} from 'vitest';
import {enterpriseProcessorReady} from '../../supabase/functions/_shared/enterpriseProcessorOutcome';
describe('verified enterprise processor outcome',()=>{
 it('does not confuse completed/unpaid checkout or a trial without saved payment with confirmation',()=>{const base={component:'monthly_patients',subscriptionStatus:'trialing',savedPaymentMethod:true,invoicePaid:false};expect(enterpriseProcessorReady({...base,checkoutPaymentStatus:'no_payment_required'})).toBe(true);expect(enterpriseProcessorReady({...base,savedPaymentMethod:false})).toBe(false);expect(enterpriseProcessorReady({...base,checkoutPaymentStatus:'unpaid'})).toBe(false);for(const status of ['incomplete','past_due','canceled','unpaid'])expect(enterpriseProcessorReady({...base,subscriptionStatus:status})).toBe(false);});
 it('requires an actual paid invoice for a chargeable annual component',()=>{const base={component:'annual_license',subscriptionStatus:'active',savedPaymentMethod:true,invoicePaid:false};expect(enterpriseProcessorReady(base)).toBe(false);expect(enterpriseProcessorReady({...base,invoicePaid:true,checkoutPaymentStatus:'paid'})).toBe(true);});
});
